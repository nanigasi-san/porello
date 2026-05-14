import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";
import { getDb } from "@/db";
import {
  boardDiscordWebhooks,
  boards,
  cardAttachments,
  cardChecklistItems,
  cardComments,
  cardLabels,
  cards,
  labels,
  lists,
  users,
} from "@/db/schema";
import { getSqliteBoardForUser, getSqliteBoardsForUser, hasSqliteBoardDiscordWebhook } from "@/lib/sqlite-store";

export type BoardSummary = typeof boards.$inferSelect & {
  listCount: number;
  cardCount: number;
};

export type UserSummary = Pick<typeof users.$inferSelect, "id" | "name" | "email" | "image">;

export type LabelView = typeof labels.$inferSelect;

export type ChecklistItemView = typeof cardChecklistItems.$inferSelect;

export type CardCommentView = typeof cardComments.$inferSelect & {
  author: UserSummary | null;
};

export type CardAttachmentView = Omit<typeof cardAttachments.$inferSelect, "storageKey">;

export type CardView = typeof cards.$inferSelect & {
  assignee: UserSummary | null;
  labels: LabelView[];
  checklistItems: ChecklistItemView[];
  comments: CardCommentView[];
  attachments: CardAttachmentView[];
};

export type ListView = typeof lists.$inferSelect & {
  cards: CardView[];
};

export type BoardView = typeof boards.$inferSelect & {
  lists: ListView[];
  labels: LabelView[];
  members: UserSummary[];
  discordWebhookConfigured: boolean;
};

export type BoardUserIdentity = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export async function getBoardsForUser(userId: string): Promise<BoardSummary[]> {
  noStore();

  if (!process.env.DATABASE_URL) {
    return getSqliteBoardsForUser(userId);
  }

  const db = getDb();

  const rows = await db
    .select({
      id: boards.id,
      ownerId: boards.ownerId,
      title: boards.title,
      createdAt: boards.createdAt,
      updatedAt: boards.updatedAt,
      listCount: sql<number>`count(distinct ${lists.id})::int`,
      cardCount: sql<number>`count(${cards.id})::int`,
    })
    .from(boards)
    .leftJoin(lists, eq(lists.boardId, boards.id))
    .leftJoin(cards, eq(cards.listId, lists.id))
    .where(eq(boards.ownerId, userId))
    .groupBy(boards.id)
    .orderBy(desc(boards.updatedAt));

  return rows;
}

export async function getBoardForUser(
  boardId: string,
  userId: string,
  user?: BoardUserIdentity,
): Promise<BoardView | null> {
  noStore();

  if (!process.env.DATABASE_URL) {
    const board = await getSqliteBoardForUser(boardId, userId, user);
    return board
      ? {
          ...board,
          discordWebhookConfigured: await hasSqliteBoardDiscordWebhook(boardId, userId),
        }
      : null;
  }

  const db = getDb();

  const [board] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!board) {
    return null;
  }

  const boardLists = await db
    .select()
    .from(lists)
    .where(eq(lists.boardId, boardId))
    .orderBy(lists.position, lists.createdAt);

  const listIds = boardLists.map((list) => list.id);
  const boardCards =
    listIds.length > 0
      ? await db
          .select()
          .from(cards)
          .where(inArray(cards.listId, listIds))
          .orderBy(cards.position, cards.createdAt)
      : [];
  const cardIds = boardCards.map((card) => card.id);

  const [boardLabels, labelLinks, checklistRows, commentRows, attachmentRows, memberRows, discordWebhookRows] =
    await Promise.all([
    db.select().from(labels).where(eq(labels.boardId, boardId)).orderBy(labels.name, labels.createdAt),
    cardIds.length > 0
      ? db
          .select({
            cardId: cardLabels.cardId,
            label: labels,
          })
          .from(cardLabels)
          .innerJoin(labels, eq(labels.id, cardLabels.labelId))
          .where(inArray(cardLabels.cardId, cardIds))
          .orderBy(labels.name)
      : [],
    cardIds.length > 0
      ? db
          .select()
          .from(cardChecklistItems)
          .where(inArray(cardChecklistItems.cardId, cardIds))
          .orderBy(cardChecklistItems.position, cardChecklistItems.createdAt)
      : [],
    cardIds.length > 0
      ? db
          .select()
          .from(cardComments)
          .where(inArray(cardComments.cardId, cardIds))
          .orderBy(cardComments.createdAt)
      : [],
    cardIds.length > 0
      ? db
          .select({
            id: cardAttachments.id,
            cardId: cardAttachments.cardId,
            uploaderId: cardAttachments.uploaderId,
            filename: cardAttachments.filename,
            contentType: cardAttachments.contentType,
            size: cardAttachments.size,
            storageProvider: cardAttachments.storageProvider,
            createdAt: cardAttachments.createdAt,
          })
          .from(cardAttachments)
          .where(inArray(cardAttachments.cardId, cardIds))
          .orderBy(cardAttachments.createdAt)
      : [],
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .orderBy(users.name, users.email),
    db
      .select({ id: boardDiscordWebhooks.id })
      .from(boardDiscordWebhooks)
      .where(eq(boardDiscordWebhooks.boardId, boardId))
      .limit(1),
  ]);

  const memberById = new Map(memberRows.map((member) => [member.id, member]));
  const commentAuthorIds = Array.from(
    new Set(commentRows.map((comment) => comment.authorId).filter((authorId): authorId is string => Boolean(authorId))),
  );
  const missingAuthorIds = commentAuthorIds.filter((authorId) => !memberById.has(authorId));

  if (missingAuthorIds.length > 0) {
    const missingAuthors = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(inArray(users.id, missingAuthorIds));
    missingAuthors.forEach((author) => memberById.set(author.id, author));
  }

  const assigneeIds = Array.from(
    new Set(boardCards.map((card) => card.assigneeId).filter((assigneeId): assigneeId is string => Boolean(assigneeId))),
  );
  const missingAssigneeIds = assigneeIds.filter((assigneeId) => !memberById.has(assigneeId));

  if (missingAssigneeIds.length > 0) {
    const missingAssignees = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(inArray(users.id, missingAssigneeIds));
    missingAssignees.forEach((assignee) => memberById.set(assignee.id, assignee));
  }

  const hydrateCard = (card: (typeof boardCards)[number]): CardView => ({
    ...card,
    assignee: card.assigneeId ? (memberById.get(card.assigneeId) ?? null) : null,
    labels: labelLinks.filter((link) => link.cardId === card.id).map((link) => link.label),
    checklistItems: checklistRows.filter((item) => item.cardId === card.id),
    comments: commentRows
      .filter((comment) => comment.cardId === card.id)
      .map((comment) => ({
        ...comment,
        author: comment.authorId ? (memberById.get(comment.authorId) ?? null) : null,
      })),
    attachments: attachmentRows.filter((attachment) => attachment.cardId === card.id),
  });

  return {
    ...board,
    labels: boardLabels,
    members: memberRows,
    discordWebhookConfigured: discordWebhookRows.length > 0,
    lists: boardLists.map((list) => ({
      ...list,
      cards: boardCards.filter((card) => card.listId === list.id).map(hydrateCard),
    })),
  };
}

export async function getOwnedBoardOrThrow(boardId: string, userId: string) {
  const db = getDb();
  const [board] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!board) {
    throw new Error("Board not found.");
  }

  return board;
}

export async function getOwnedListOrThrow(listId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      list: lists,
      board: boards,
    })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(lists.id, listId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!row) {
    throw new Error("List not found.");
  }

  return row;
}

export async function getOwnedCardOrThrow(cardId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      card: cards,
      list: lists,
      board: boards,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(cards.id, cardId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!row) {
    throw new Error("Card not found.");
  }

  return row;
}
