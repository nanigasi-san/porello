import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { unstable_noStore as noStore } from "next/cache";
import { getDb } from "@/db";
import { boards, cards, lists } from "@/db/schema";
import { getSqliteBoardForUser, getSqliteBoardsForUser } from "@/lib/sqlite-store";

export type BoardSummary = typeof boards.$inferSelect & {
  listCount: number;
  cardCount: number;
};

export type CardView = typeof cards.$inferSelect;

export type ListView = typeof lists.$inferSelect & {
  cards: CardView[];
};

export type BoardView = typeof boards.$inferSelect & {
  lists: ListView[];
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

export async function getBoardForUser(boardId: string, userId: string): Promise<BoardView | null> {
  noStore();

  if (!process.env.DATABASE_URL) {
    return getSqliteBoardForUser(boardId, userId);
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

  return {
    ...board,
    lists: boardLists.map((list) => ({
      ...list,
      cards: boardCards.filter((card) => card.listId === list.id),
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
