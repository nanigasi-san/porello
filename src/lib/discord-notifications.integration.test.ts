import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyCardAssigned,
  prepareCardMoveNotifications,
  sendCardMoveNotifications,
  sendDueSoonDiscordNotifications,
} from "./discord-notifications";
import {
  createSqliteBoard,
  createSqliteCard,
  getSqliteBoardForUser,
  resetSqliteForTests,
  setSqliteBoardDiscordWebhook,
  updateSqliteCard,
} from "./sqlite-store";

const userId = "test-user";
const webhookUrl = "https://discord.com/api/webhooks/123/test-token";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "porello-discord-"));
  process.env.PORELLO_SQLITE_PATH = path.join(tempDir, "porello.sqlite");
  process.env.AUTH_URL = "http://localhost:3100";
  resetSqliteForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSqliteForTests();
  delete process.env.PORELLO_SQLITE_PATH;
  delete process.env.AUTH_URL;
  rmSync(tempDir, { recursive: true, force: true });
});

async function createBoardFixture({ webhook = true } = {}) {
  const boardId = await createSqliteBoard(userId, "Notification board");
  const board = await getSqliteBoardForUser(boardId, userId, { id: userId, name: "山田海音", email: "kaito@example.local" });

  if (!board) {
    throw new Error("Missing board.");
  }

  if (webhook) {
    await setSqliteBoardDiscordWebhook(board.id, userId, webhookUrl);
  }

  const listByTitle = new Map(board.lists.map((list) => [list.title, list]));
  return { board, listByTitle };
}

function fetchMock(status = 204) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function firstEmbed(fetch: ReturnType<typeof fetchMock>) {
  const init = fetch.mock.calls[0]?.[1];

  if (!init?.body) {
    throw new Error("Missing Discord webhook payload.");
  }

  const body = JSON.parse(String(init.body));
  return body.embeds[0] as { title: string; description?: string; url?: string; fields?: { name: string; value: string }[] };
}

describe("discord notification integration", () => {
  it("prepares move notifications only when cards move to doing or done", async () => {
    const { board, listByTitle } = await createBoardFixture();
    const todo = listByTitle.get("todo");
    const doing = listByTitle.get("doing");
    const done = listByTitle.get("done");
    const review = listByTitle.get("in review");

    if (!todo || !doing || !done || !review) {
      throw new Error("Missing default lists.");
    }

    const first = await createSqliteCard(todo.id, userId, "Doing task");
    const second = await createSqliteCard(todo.id, userId, "Done task");
    const third = await createSqliteCard(todo.id, userId, "Review task");
    const notifications = await prepareCardMoveNotifications(board.id, userId, [
      { listId: doing.id, cardIds: [first.id] },
      { listId: done.id, cardIds: [second.id] },
      { listId: review.id, cardIds: [third.id] },
    ]);

    expect(notifications.map((notification) => notification.status)).toEqual(["doing", "done"]);
    expect(notifications.map((notification) => notification.toListTitle)).toEqual(["doing", "done"]);
  });

  it("does not prepare move notifications for same-list reorders or webhook-less boards", async () => {
    const withWebhook = await createBoardFixture();
    const todo = withWebhook.listByTitle.get("todo");

    if (!todo) {
      throw new Error("Missing todo list.");
    }

    const card = await createSqliteCard(todo.id, userId, "Same list task");
    await expect(prepareCardMoveNotifications(withWebhook.board.id, userId, [{ listId: todo.id, cardIds: [card.id] }])).resolves.toEqual([]);

    const withoutWebhook = await createBoardFixture({ webhook: false });
    const source = withoutWebhook.listByTitle.get("todo");
    const target = withoutWebhook.listByTitle.get("doing");

    if (!source || !target) {
      throw new Error("Missing default lists.");
    }

    const silentCard = await createSqliteCard(source.id, userId, "Silent task");
    await expect(
      prepareCardMoveNotifications(withoutWebhook.board.id, userId, [{ listId: target.id, cardIds: [silentCard.id] }]),
    ).resolves.toEqual([]);
  });

  it("sends assignment and move embeds without descriptions", async () => {
    const fetch = fetchMock();
    const { board, listByTitle } = await createBoardFixture();
    const todo = listByTitle.get("todo");
    const doing = listByTitle.get("doing");

    if (!todo || !doing) {
      throw new Error("Missing default lists.");
    }

    const card = await createSqliteCard(todo.id, userId, "task2");
    await updateSqliteCard(card.id, userId, card.title, "", null, userId, {
      id: userId,
      name: "山田海音",
      email: "kaito@example.local",
    });
    await notifyCardAssigned(card.id, userId, null, userId);

    let embed = firstEmbed(fetch);
    expect(embed.title).toBe("[task2] に [山田海音] がアサインされました");
    expect(embed.description).toBeUndefined();
    expect(embed.url).toBe(`http://localhost:3100/boards/${board.id}?card=${card.id}`);
    expect(embed.fields?.some((field) => field.name === "カードURL" && field.value.includes(`card=${card.id}`))).toBe(true);

    fetch.mockClear();
    const notifications = await prepareCardMoveNotifications(board.id, userId, [{ listId: doing.id, cardIds: [card.id] }]);
    await sendCardMoveNotifications(notifications);

    embed = firstEmbed(fetch);
    expect(embed.title).toBe("[task2] が [doing] に移動されました");
    expect(embed.description).toBeUndefined();
  });

  it("sends due-soon notifications once, excluding done and out-of-window cards", async () => {
    const fetch = fetchMock();
    const { board, listByTitle } = await createBoardFixture();
    const todo = listByTitle.get("todo");
    const done = listByTitle.get("done");

    if (!todo || !done) {
      throw new Error("Missing default lists.");
    }

    const now = new Date("2026-05-19T00:00:00.000Z");
    const due = await createSqliteCard(todo.id, userId, "Due task");
    const doneCard = await createSqliteCard(done.id, userId, "Done task");
    const later = await createSqliteCard(todo.id, userId, "Later task");
    await updateSqliteCard(due.id, userId, due.title, "", new Date("2026-05-19T12:00:00.000Z"), null);
    await updateSqliteCard(doneCard.id, userId, doneCard.title, "", new Date("2026-05-19T12:00:00.000Z"), null);
    await updateSqliteCard(later.id, userId, later.title, "", new Date("2026-05-21T00:00:00.000Z"), null);

    await expect(sendDueSoonDiscordNotifications(now)).resolves.toEqual({ checked: 1, sent: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(firstEmbed(fetch).title).toBe("[Due task] の締め切りが近づいています");
    expect(firstEmbed(fetch).url).toBe(`http://localhost:3100/boards/${board.id}?card=${due.id}`);

    await expect(sendDueSoonDiscordNotifications(now)).resolves.toEqual({ checked: 0, sent: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not record due-soon notifications when Discord delivery fails", async () => {
    const fetch = fetchMock(500);
    const { listByTitle } = await createBoardFixture();
    const todo = listByTitle.get("todo");

    if (!todo) {
      throw new Error("Missing todo list.");
    }

    const now = new Date("2026-05-19T00:00:00.000Z");
    const due = await createSqliteCard(todo.id, userId, "Retry task");
    await updateSqliteCard(due.id, userId, due.title, "", new Date("2026-05-19T12:00:00.000Z"), null);

    await expect(sendDueSoonDiscordNotifications(now)).resolves.toEqual({ checked: 1, sent: 0 });

    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(sendDueSoonDiscordNotifications(now)).resolves.toEqual({ checked: 1, sent: 1 });
  });
});
