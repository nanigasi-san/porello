import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LIST_TITLES } from "./board-defaults";
import {
  createSqliteBoard,
  createSqliteCard,
  createSqliteList,
  deleteSqliteCard,
  deleteSqliteList,
  deleteSqliteBoardDiscordWebhook,
  getSqliteBoardDiscordWebhook,
  getSqliteBoardForUser,
  getSqliteDueDiscordNotifications,
  hasSqliteBoardDiscordWebhook,
  recordSqliteDiscordDeadlineNotification,
  renameSqliteList,
  resetSqliteForTests,
  setSqliteBoardDiscordWebhook,
  updateSqliteCard,
} from "./sqlite-store";

const userId = "test-user";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "porello-sqlite-"));
  process.env.PORELLO_SQLITE_PATH = path.join(tempDir, "porello.sqlite");
  resetSqliteForTests();
});

afterEach(() => {
  resetSqliteForTests();
  delete process.env.PORELLO_SQLITE_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

async function board() {
  const boardId = await createSqliteBoard(userId, "Integration board");
  const view = await getSqliteBoardForUser(boardId, userId, { id: userId, name: "Test User", email: "test@example.local" });

  if (!view) {
    throw new Error("Missing board.");
  }

  return view;
}

describe("sqlite store integration", () => {
  it("creates the default lists with stable order and positions", async () => {
    const view = await board();

    expect(view.lists.map((list) => list.title)).toEqual(DEFAULT_LIST_TITLES);
    expect(view.lists.map((list) => list.position)).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it("creates, renames, and deletes lists within a board", async () => {
    const view = await board();
    const created = await createSqliteList(view.id, userId, "qa");

    await renameSqliteList(created.id, userId, "ready");
    let updated = await getSqliteBoardForUser(view.id, userId);
    expect(updated?.lists.map((list) => list.title)).toContain("ready");

    await deleteSqliteList(created.id, userId);
    updated = await getSqliteBoardForUser(view.id, userId);
    expect(updated?.lists.map((list) => list.title)).not.toContain("ready");
    expect(updated?.lists.map((list) => list.title)).toEqual(DEFAULT_LIST_TITLES);
  });

  it("creates, updates, and deletes cards within a list", async () => {
    const view = await board();
    const todo = view.lists.find((list) => list.title === "todo");

    if (!todo) {
      throw new Error("Missing todo list.");
    }

    const card = await createSqliteCard(todo.id, userId, "Task");
    await updateSqliteCard(card.id, userId, "Updated task", "Description", new Date("2026-05-20T00:00:00.000Z"), null);

    let updated = await getSqliteBoardForUser(view.id, userId);
    expect(updated?.lists.find((list) => list.id === todo.id)?.cards[0]).toMatchObject({
      title: "Updated task",
      description: "Description",
    });

    await deleteSqliteCard(card.id, userId);
    updated = await getSqliteBoardForUser(view.id, userId);
    expect(updated?.lists.flatMap((list) => list.cards)).toHaveLength(0);
  });

  it("refreshes local user display names when updating assignees", async () => {
    const view = await board();
    const todo = view.lists.find((list) => list.title === "todo");

    if (!todo) {
      throw new Error("Missing todo list.");
    }

    const card = await createSqliteCard(todo.id, userId, "Assigned task");
    await updateSqliteCard(card.id, userId, card.title, "", null, userId, {
      id: userId,
      name: "山田海音",
      email: "kaito@example.local",
    });

    const updated = await getSqliteBoardForUser(view.id, userId);
    const updatedCard = updated?.lists.flatMap((list) => list.cards).find((candidate) => candidate.id === card.id);
    expect(updatedCard?.assignee?.name).toBe("山田海音");
    expect(updatedCard?.assignee?.email).toBe("kaito@example.local");
  });

  it("stores, updates, and removes Discord webhooks per board", async () => {
    const first = await board();
    const secondBoardId = await createSqliteBoard(userId, "Second");

    await setSqliteBoardDiscordWebhook(first.id, userId, "https://discord.com/api/webhooks/123/first-token");
    await setSqliteBoardDiscordWebhook(secondBoardId, userId, "https://discord.com/api/webhooks/456/second-token");
    await setSqliteBoardDiscordWebhook(first.id, userId, "https://discord.com/api/webhooks/123/updated-token");

    expect(await getSqliteBoardDiscordWebhook(first.id, userId)).toBe("https://discord.com/api/webhooks/123/updated-token");
    expect(await getSqliteBoardDiscordWebhook(secondBoardId, userId)).toBe("https://discord.com/api/webhooks/456/second-token");
    expect(await hasSqliteBoardDiscordWebhook(first.id, userId)).toBe(true);

    await deleteSqliteBoardDiscordWebhook(first.id, userId);
    expect(await getSqliteBoardDiscordWebhook(first.id, userId)).toBeNull();
    expect(await hasSqliteBoardDiscordWebhook(first.id, userId)).toBe(false);
  });

  it("deduplicates due-soon notifications by card and due date", async () => {
    const view = await board();
    const todo = view.lists.find((list) => list.title === "todo");

    if (!todo) {
      throw new Error("Missing todo list.");
    }

    await setSqliteBoardDiscordWebhook(view.id, userId, "https://discord.com/api/webhooks/123/test-token");
    const card = await createSqliteCard(todo.id, userId, "Due task");
    const dueAt = new Date("2026-05-20T00:00:00.000Z");
    await updateSqliteCard(card.id, userId, card.title, "", dueAt, null);

    expect(getSqliteDueDiscordNotifications(new Date("2026-05-19T00:00:00.000Z"), dueAt)).toHaveLength(1);

    recordSqliteDiscordDeadlineNotification(card.id, dueAt);
    recordSqliteDiscordDeadlineNotification(card.id, dueAt);

    expect(getSqliteDueDiscordNotifications(new Date("2026-05-19T00:00:00.000Z"), dueAt)).toHaveLength(0);
  });
});
