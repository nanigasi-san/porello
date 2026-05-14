"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { boards, cardChecklistItems, cardComments, cardLabels, cards, labels, lists, users } from "@/db/schema";
import { DEFAULT_LIST_TITLES } from "@/lib/board-defaults";
import {
  getOwnedBoardOrThrow,
  getOwnedCardOrThrow,
  getOwnedListOrThrow,
} from "@/lib/data";
import type { CardCommentView, ChecklistItemView, LabelView, UserSummary } from "@/lib/data";
import {
  deleteBoardDiscordWebhook,
  notifyCardAssigned,
  prepareCardMoveNotifications,
  sendCardMoveNotifications,
  setBoardDiscordWebhook,
} from "@/lib/discord-notifications";
import { hasSameMembers, normalizeTitle, toPosition } from "@/lib/reorder";
import { getCurrentSession } from "@/lib/session";
import {
  addSqliteChecklistItem,
  addSqliteComment,
  attachSqliteLabelToCard,
  createSqliteBoard,
  createSqliteCard,
  createSqliteLabel,
  createSqliteList,
  deleteSqliteBoard,
  deleteSqliteCard,
  deleteSqliteChecklistItem,
  deleteSqliteComment,
  deleteSqliteList,
  detachSqliteLabelFromCard,
  getSqliteUser,
  renameSqliteBoard,
  renameSqliteList,
  reorderSqliteCards,
  reorderSqliteLists,
  updateSqliteChecklistItem,
  updateSqliteCard,
} from "@/lib/sqlite-store";

type CardOrderUpdate = {
  listId: string;
  cardIds: string[];
};

export type BoardDiscordWebhookFormState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

async function requireUserId() {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  return userId;
}

async function requireSessionUser() {
  const session = await getCurrentSession();
  const user = session?.user;

  if (!user?.id) {
    throw new Error("You must be signed in.");
  }

  return user;
}

function normalizeDateTime(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOptionalUserId(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeLabelColor(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "#0f766e";
}

function userSummaryFromRow(row: typeof users.$inferSelect): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
  };
}

export async function createBoard(formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "New board");

  if (!process.env.DATABASE_URL) {
    const boardId = await createSqliteBoard(userId, title);
    redirect(`/boards/${boardId}`);
  }

  const db = getDb();

  const [board] = await db.transaction(async (tx) => {
    const timestamp = new Date();
    const createdBoards = await tx
      .insert(boards)
      .values({
        ownerId: userId,
        title,
        updatedAt: timestamp,
      })
      .returning({ id: boards.id });
    const [createdBoard] = createdBoards;

    await tx.insert(lists).values(
      DEFAULT_LIST_TITLES.map((listTitle, index) => ({
        boardId: createdBoard.id,
        title: listTitle,
        position: toPosition(index),
        updatedAt: timestamp,
      })),
    );

    return createdBoards;
  });

  redirect(`/boards/${board.id}`);
}

export async function renameBoard(boardId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "Untitled board");

  if (!process.env.DATABASE_URL) {
    await renameSqliteBoard(boardId, userId, title);
    revalidatePath("/boards");
    revalidatePath(`/boards/${boardId}`);
    return;
  }

  const db = getDb();

  await getOwnedBoardOrThrow(boardId, userId);
  await db
    .update(boards)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)));

  revalidatePath("/boards");
  revalidatePath(`/boards/${boardId}`);
}

export async function saveBoardDiscordWebhook(
  boardId: string,
  _previousState: BoardDiscordWebhookFormState,
  formData: FormData,
): Promise<BoardDiscordWebhookFormState> {
  const userId = await requireUserId();
  const webhookUrl = String(formData.get("webhookUrl") ?? "");

  try {
    await setBoardDiscordWebhook(boardId, userId, webhookUrl);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid Discord webhook URL.") {
      return {
        status: "error",
        message: "Discord Webhook URL が不正です。DiscordのWebhook URLを入力してください。",
      };
    }

    throw error;
  }

  revalidatePath(`/boards/${boardId}`);
  return { status: "success", message: "Discord通知を保存しました。" };
}

export async function removeBoardDiscordWebhook(boardId: string) {
  const userId = await requireUserId();

  await deleteBoardDiscordWebhook(boardId, userId);
  revalidatePath(`/boards/${boardId}`);
}

export async function deleteBoard(boardId: string) {
  const userId = await requireUserId();

  if (!process.env.DATABASE_URL) {
    await deleteSqliteBoard(boardId, userId);
    revalidatePath("/boards");
    redirect("/boards");
  }

  const db = getDb();

  await db.delete(boards).where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)));

  revalidatePath("/boards");
  redirect("/boards");
}

export async function createList(boardId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "New list");

  if (!process.env.DATABASE_URL) {
    const list = await createSqliteList(boardId, userId, title);
    revalidatePath(`/boards/${boardId}`);
    return list;
  }

  const db = getDb();

  await getOwnedBoardOrThrow(boardId, userId);

  const [lastList] = await db
    .select({ position: lists.position })
    .from(lists)
    .where(eq(lists.boardId, boardId))
    .orderBy(desc(lists.position))
    .limit(1);

  const timestamp = new Date();
  const [list] = await db
    .insert(lists)
    .values({
      boardId,
      title,
      position: (lastList?.position ?? 0) + 1000,
      updatedAt: timestamp,
    })
    .returning();

  await db.update(boards).set({ updatedAt: timestamp }).where(eq(boards.id, boardId));
  revalidatePath(`/boards/${boardId}`);
  return { ...list, cards: [] };
}

export async function renameList(listId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "Untitled list");

  if (!process.env.DATABASE_URL) {
    await renameSqliteList(listId, userId, title);
    revalidatePath("/boards");
    return;
  }

  const db = getDb();
  const { list } = await getOwnedListOrThrow(listId, userId);

  await db.update(lists).set({ title, updatedAt: new Date() }).where(eq(lists.id, listId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function deleteList(listId: string) {
  const userId = await requireUserId();

  if (!process.env.DATABASE_URL) {
    await deleteSqliteList(listId, userId);
    revalidatePath("/boards");
    return;
  }

  const db = getDb();
  const { list } = await getOwnedListOrThrow(listId, userId);

  await db.delete(lists).where(eq(lists.id, listId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function createCard(listId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "New card");

  if (!process.env.DATABASE_URL) {
    const card = await createSqliteCard(listId, userId, title);
    revalidatePath("/boards");
    return card;
  }

  const db = getDb();
  const { list } = await getOwnedListOrThrow(listId, userId);

  const [lastCard] = await db
    .select({ position: cards.position })
    .from(cards)
    .where(eq(cards.listId, listId))
    .orderBy(desc(cards.position))
    .limit(1);

  const timestamp = new Date();
  const [card] = await db
    .insert(cards)
    .values({
      listId,
      title,
      position: (lastCard?.position ?? 0) + 1000,
      updatedAt: timestamp,
    })
    .returning();

  await db.update(boards).set({ updatedAt: timestamp }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
  return {
    ...card,
    assignee: null,
    labels: [],
    checklistItems: [],
    comments: [],
    attachments: [],
  };
}

export async function updateCard(cardId: string, formData: FormData) {
  const user = await requireSessionUser();
  const userId = user.id;
  const title = normalizeTitle(formData.get("title"), "Untitled card");
  const description = String(formData.get("description") ?? "").trim();
  const dueAt = normalizeDateTime(formData.get("dueAt"));
  const assigneeId = normalizeOptionalUserId(formData.get("assigneeId"));
  let previousAssigneeId: string | null = null;

  if (!process.env.DATABASE_URL) {
    const result = await updateSqliteCard(cardId, userId, title, description, dueAt, assigneeId, user);
    previousAssigneeId = result.previousAssigneeId;
    await notifyCardAssigned(cardId, userId, previousAssigneeId, assigneeId);
    revalidatePath("/boards");
    return {
      title,
      description,
      dueAt,
      assigneeId,
      assignee: assigneeId ? await getSqliteUser(assigneeId) : null,
      updatedAt: new Date(),
    };
  }

  const db = getDb();
  const { card, list } = await getOwnedCardOrThrow(cardId, userId);
  previousAssigneeId = card.assigneeId;
  let assignee: UserSummary | null = null;

  if (assigneeId) {
    const [assigneeRow] = await db.select().from(users).where(eq(users.id, assigneeId)).limit(1);
    assignee = assigneeRow ? userSummaryFromRow(assigneeRow) : null;
  }

  await db
    .update(cards)
    .set({ title, description, dueAt, assigneeId: assignee ? assignee.id : null, updatedAt: new Date() })
    .where(eq(cards.id, cardId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  await notifyCardAssigned(cardId, userId, previousAssigneeId, assignee?.id ?? null);
  revalidatePath(`/boards/${list.boardId}`);
  return {
    title,
    description,
    dueAt,
    assigneeId: assignee?.id ?? null,
    assignee,
    updatedAt: new Date(),
  };
}

export async function deleteCard(cardId: string) {
  const userId = await requireUserId();

  if (!process.env.DATABASE_URL) {
    await deleteSqliteCard(cardId, userId);
    revalidatePath("/boards");
    return;
  }

  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);

  await db.delete(cards).where(eq(cards.id, cardId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function createCardLabel(boardId: string, cardId: string, formData: FormData): Promise<LabelView> {
  const userId = await requireUserId();
  const name = normalizeTitle(formData.get("name"), "Label").slice(0, 40);
  const color = normalizeLabelColor(formData.get("color"));

  if (!process.env.DATABASE_URL) {
    const label = await createSqliteLabel(boardId, userId, name, color);
    await attachSqliteLabelToCard(cardId, userId, label.id);
    revalidatePath(`/boards/${boardId}`);
    return label;
  }

  const db = getDb();
  await getOwnedBoardOrThrow(boardId, userId);
  const { list } = await getOwnedCardOrThrow(cardId, userId);

  if (list.boardId !== boardId) {
    throw new Error("Card does not belong to this board.");
  }

  const timestamp = new Date();
  const [label] = await db
    .insert(labels)
    .values({
      boardId,
      name,
      color,
      updatedAt: timestamp,
    })
    .returning();
  await db.insert(cardLabels).values({ cardId, labelId: label.id }).onConflictDoNothing();
  await db.update(boards).set({ updatedAt: timestamp }).where(eq(boards.id, boardId));
  revalidatePath(`/boards/${boardId}`);
  return label;
}

export async function attachLabelToCard(cardId: string, labelId: string): Promise<LabelView> {
  const userId = await requireUserId();

  if (!process.env.DATABASE_URL) {
    const label = await attachSqliteLabelToCard(cardId, userId, labelId);
    revalidatePath("/boards");
    return label;
  }

  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);
  const [label] = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);

  if (!label || label.boardId !== list.boardId) {
    throw new Error("Label not found.");
  }

  await db.insert(cardLabels).values({ cardId, labelId }).onConflictDoNothing();
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
  return label;
}

export async function detachLabelFromCard(cardId: string, labelId: string) {
  const userId = await requireUserId();

  if (!process.env.DATABASE_URL) {
    await detachSqliteLabelFromCard(cardId, userId, labelId);
    revalidatePath("/boards");
    return;
  }

  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);
  await db.delete(cardLabels).where(and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, labelId)));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function addChecklistItem(cardId: string, formData: FormData): Promise<ChecklistItemView | null> {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "").slice(0, 200);

  if (!title) {
    return null;
  }

  if (!process.env.DATABASE_URL) {
    const item = await addSqliteChecklistItem(cardId, userId, title);
    revalidatePath("/boards");
    return item;
  }

  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);
  const [lastItem] = await db
    .select({ position: cardChecklistItems.position })
    .from(cardChecklistItems)
    .where(eq(cardChecklistItems.cardId, cardId))
    .orderBy(desc(cardChecklistItems.position))
    .limit(1);
  const timestamp = new Date();
  const [item] = await db
    .insert(cardChecklistItems)
    .values({
      cardId,
      title,
      position: (lastItem?.position ?? 0) + 1000,
      updatedAt: timestamp,
    })
    .returning();
  await db.update(boards).set({ updatedAt: timestamp }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
  return item;
}

export async function updateChecklistItem(itemId: string, formData: FormData): Promise<ChecklistItemView> {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "Checklist item").slice(0, 200);
  const completed = formData.get("completed") === "on";

  if (!process.env.DATABASE_URL) {
    const item = await updateSqliteChecklistItem(itemId, userId, title, completed);
    revalidatePath("/boards");
    return item;
  }

  const db = getDb();
  const [row] = await db
    .select({
      item: cardChecklistItems,
      list: lists,
      board: boards,
    })
    .from(cardChecklistItems)
    .innerJoin(cards, eq(cards.id, cardChecklistItems.cardId))
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(cardChecklistItems.id, itemId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!row) {
    throw new Error("Checklist item not found.");
  }

  const timestamp = new Date();
  const [item] = await db
    .update(cardChecklistItems)
    .set({ title, completed, updatedAt: timestamp })
    .where(eq(cardChecklistItems.id, itemId))
    .returning();
  await db.update(boards).set({ updatedAt: timestamp }).where(eq(boards.id, row.list.boardId));
  revalidatePath(`/boards/${row.list.boardId}`);
  return item;
}

export async function deleteChecklistItem(itemId: string) {
  const userId = await requireUserId();

  if (!process.env.DATABASE_URL) {
    await deleteSqliteChecklistItem(itemId, userId);
    revalidatePath("/boards");
    return;
  }

  const db = getDb();
  const [row] = await db
    .select({ list: lists })
    .from(cardChecklistItems)
    .innerJoin(cards, eq(cards.id, cardChecklistItems.cardId))
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(cardChecklistItems.id, itemId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!row) {
    throw new Error("Checklist item not found.");
  }

  await db.delete(cardChecklistItems).where(eq(cardChecklistItems.id, itemId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, row.list.boardId));
  revalidatePath(`/boards/${row.list.boardId}`);
}

export async function addCardComment(cardId: string, formData: FormData): Promise<CardCommentView | null> {
  const userId = await requireUserId();
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return null;
  }

  if (!process.env.DATABASE_URL) {
    const comment = await addSqliteComment(cardId, userId, body);
    revalidatePath("/boards");
    return comment;
  }

  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);
  const [authorRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const timestamp = new Date();
  const [comment] = await db
    .insert(cardComments)
    .values({
      cardId,
      authorId: userId,
      body,
      updatedAt: timestamp,
    })
    .returning();
  await db.update(boards).set({ updatedAt: timestamp }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
  return {
    ...comment,
    author: authorRow ? userSummaryFromRow(authorRow) : null,
  };
}

export async function deleteCardComment(commentId: string) {
  const userId = await requireUserId();

  if (!process.env.DATABASE_URL) {
    await deleteSqliteComment(commentId, userId);
    revalidatePath("/boards");
    return;
  }

  const db = getDb();
  const [row] = await db
    .select({ list: lists })
    .from(cardComments)
    .innerJoin(cards, eq(cards.id, cardComments.cardId))
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(cardComments.id, commentId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!row) {
    throw new Error("Comment not found.");
  }

  await db.delete(cardComments).where(eq(cardComments.id, commentId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, row.list.boardId));
  revalidatePath(`/boards/${row.list.boardId}`);
}

export async function reorderLists(boardId: string, listIds: string[]) {
  const userId = await requireUserId();

  if (!process.env.DATABASE_URL) {
    await reorderSqliteLists(boardId, userId, listIds);
    revalidatePath(`/boards/${boardId}`);
    return;
  }

  const db = getDb();

  await getOwnedBoardOrThrow(boardId, userId);

  const existingLists = await db
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.boardId, boardId));

  if (!hasSameMembers(existingLists.map((list) => list.id), listIds)) {
    throw new Error("List order does not match this board.");
  }

  await db.transaction(async (tx) => {
    await Promise.all(
      listIds.map((id, index) =>
        tx.update(lists).set({ position: toPosition(index), updatedAt: new Date() }).where(eq(lists.id, id)),
      ),
    );
    await tx.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, boardId));
  });

  revalidatePath(`/boards/${boardId}`);
}

export async function reorderCards(boardId: string, updates: CardOrderUpdate[]) {
  const userId = await requireUserId();
  const moveNotifications = await prepareCardMoveNotifications(boardId, userId, updates);

  if (!process.env.DATABASE_URL) {
    await reorderSqliteCards(boardId, userId, updates);
    await sendCardMoveNotifications(moveNotifications);
    revalidatePath(`/boards/${boardId}`);
    return;
  }

  const db = getDb();

  await getOwnedBoardOrThrow(boardId, userId);

  const listIds = updates.map((update) => update.listId);
  const existingLists = await db
    .select({ id: lists.id })
    .from(lists)
    .where(eq(lists.boardId, boardId));

  if (!hasSameMembers(existingLists.map((list) => list.id), listIds)) {
    throw new Error("Card order does not include every list.");
  }

  const proposedCardIds = updates.flatMap((update) => update.cardIds);
  const existingCards =
    listIds.length > 0
      ? await db
          .select({ id: cards.id })
          .from(cards)
          .where(inArray(cards.listId, listIds))
      : [];

  if (!hasSameMembers(existingCards.map((card) => card.id), proposedCardIds)) {
    throw new Error("Card order does not match this board.");
  }

  await db.transaction(async (tx) => {
    await Promise.all(
      updates.flatMap((update) =>
        update.cardIds.map((cardId, index) =>
          tx
            .update(cards)
            .set({
              listId: update.listId,
              position: toPosition(index),
              updatedAt: new Date(),
            })
            .where(eq(cards.id, cardId)),
        ),
      ),
    );
    await tx.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, boardId));
  });

  await sendCardMoveNotifications(moveNotifications);
  revalidatePath(`/boards/${boardId}`);
}
