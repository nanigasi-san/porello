"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { boards, cards, lists } from "@/db/schema";
import {
  getOwnedBoardOrThrow,
  getOwnedCardOrThrow,
  getOwnedListOrThrow,
} from "@/lib/data";
import { hasSameMembers, normalizeTitle, toPosition } from "@/lib/reorder";

type CardOrderUpdate = {
  listId: string;
  cardIds: string[];
};

async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  return userId;
}

export async function createBoard(formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "New board");
  const db = getDb();

  const [board] = await db
    .insert(boards)
    .values({
      ownerId: userId,
      title,
      updatedAt: new Date(),
    })
    .returning({ id: boards.id });

  redirect(`/boards/${board.id}`);
}

export async function renameBoard(boardId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "Untitled board");
  const db = getDb();

  await getOwnedBoardOrThrow(boardId, userId);
  await db
    .update(boards)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)));

  revalidatePath("/boards");
  revalidatePath(`/boards/${boardId}`);
}

export async function deleteBoard(boardId: string) {
  const userId = await requireUserId();
  const db = getDb();

  await db.delete(boards).where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)));

  revalidatePath("/boards");
  redirect("/boards");
}

export async function createList(boardId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "New list");
  const db = getDb();

  await getOwnedBoardOrThrow(boardId, userId);

  const [lastList] = await db
    .select({ position: lists.position })
    .from(lists)
    .where(eq(lists.boardId, boardId))
    .orderBy(desc(lists.position))
    .limit(1);

  await db.insert(lists).values({
    boardId,
    title,
    position: (lastList?.position ?? 0) + 1000,
    updatedAt: new Date(),
  });

  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, boardId));
  revalidatePath(`/boards/${boardId}`);
}

export async function renameList(listId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "Untitled list");
  const db = getDb();
  const { list } = await getOwnedListOrThrow(listId, userId);

  await db.update(lists).set({ title, updatedAt: new Date() }).where(eq(lists.id, listId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function deleteList(listId: string) {
  const userId = await requireUserId();
  const db = getDb();
  const { list } = await getOwnedListOrThrow(listId, userId);

  await db.delete(lists).where(eq(lists.id, listId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function createCard(listId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "New card");
  const db = getDb();
  const { list } = await getOwnedListOrThrow(listId, userId);

  const [lastCard] = await db
    .select({ position: cards.position })
    .from(cards)
    .where(eq(cards.listId, listId))
    .orderBy(desc(cards.position))
    .limit(1);

  await db.insert(cards).values({
    listId,
    title,
    position: (lastCard?.position ?? 0) + 1000,
    updatedAt: new Date(),
  });

  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function updateCard(cardId: string, formData: FormData) {
  const userId = await requireUserId();
  const title = normalizeTitle(formData.get("title"), "Untitled card");
  const description = String(formData.get("description") ?? "").trim();
  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);

  await db
    .update(cards)
    .set({ title, description, updatedAt: new Date() })
    .where(eq(cards.id, cardId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function deleteCard(cardId: string) {
  const userId = await requireUserId();
  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);

  await db.delete(cards).where(eq(cards.id, cardId));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  revalidatePath(`/boards/${list.boardId}`);
}

export async function reorderLists(boardId: string, listIds: string[]) {
  const userId = await requireUserId();
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

  revalidatePath(`/boards/${boardId}`);
}
