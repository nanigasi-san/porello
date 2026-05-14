import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { BoardSummary, BoardView, CardView, ListView } from "@/lib/data";
import { hasSameMembers, toPosition } from "@/lib/reorder";

type BoardRow = {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ListRow = {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type CardRow = {
  id: string;
  list_id: string;
  title: string;
  description: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type CardOrderUpdate = {
  listId: string;
  cardIds: string[];
};

let sqlite: Database.Database | null = null;

function getSqlite() {
  if (!sqlite) {
    const dataDir = path.join(process.cwd(), ".porello-data");
    mkdirSync(dataDir, { recursive: true });
    sqlite = new Database(path.join(dataDir, "porello.sqlite"));
    sqlite.pragma("journal_mode = WAL");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS boards_owner_idx ON boards(owner_id);
      CREATE INDEX IF NOT EXISTS lists_board_position_idx ON lists(board_id, position);
      CREATE INDEX IF NOT EXISTS cards_list_position_idx ON cards(list_id, position);
    `);
  }

  return sqlite;
}

function timestamp() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function boardFromRow(row: BoardRow): Omit<BoardView, "lists"> {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function listFromRow(row: ListRow): Omit<ListView, "cards"> {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    position: row.position,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function cardFromRow(row: CardRow): CardView {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    position: row.position,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function ownedBoard(boardId: string, userId: string) {
  const db = getSqlite();
  const board = db
    .prepare("SELECT * FROM boards WHERE id = ? AND owner_id = ?")
    .get(boardId, userId) as BoardRow | undefined;

  if (board) {
    return board;
  }

  const localBoard = db.prepare("SELECT * FROM boards WHERE id = ?").get(boardId) as BoardRow | undefined;

  if (!localBoard) {
    throw new Error("Board not found.");
  }

  db.prepare("UPDATE boards SET owner_id = ?, updated_at = ? WHERE id = ?").run(userId, timestamp(), boardId);
  return { ...localBoard, owner_id: userId };
}

function ownedList(listId: string, userId: string) {
  const db = getSqlite();
  const row = db
    .prepare(
      `SELECT lists.*, boards.id AS owner_board_id
       FROM lists
       INNER JOIN boards ON boards.id = lists.board_id
       WHERE lists.id = ? AND boards.owner_id = ?`,
    )
    .get(listId, userId) as (ListRow & { owner_board_id: string }) | undefined;

  if (row) {
    return row;
  }

  const localRow = db
    .prepare(
      `SELECT lists.*, boards.id AS owner_board_id
       FROM lists
       INNER JOIN boards ON boards.id = lists.board_id
       WHERE lists.id = ?`,
    )
    .get(listId) as (ListRow & { owner_board_id: string }) | undefined;

  if (!localRow) {
    throw new Error("List not found.");
  }

  db.prepare("UPDATE boards SET owner_id = ?, updated_at = ? WHERE id = ?").run(userId, timestamp(), localRow.board_id);
  return localRow;
}

function ownedCard(cardId: string, userId: string) {
  const db = getSqlite();
  const row = db
    .prepare(
      `SELECT cards.*, lists.board_id
       FROM cards
       INNER JOIN lists ON lists.id = cards.list_id
       INNER JOIN boards ON boards.id = lists.board_id
       WHERE cards.id = ? AND boards.owner_id = ?`,
    )
    .get(cardId, userId) as (CardRow & { board_id: string }) | undefined;

  if (row) {
    return row;
  }

  const localRow = db
    .prepare(
      `SELECT cards.*, lists.board_id
       FROM cards
       INNER JOIN lists ON lists.id = cards.list_id
       WHERE cards.id = ?`,
    )
    .get(cardId) as (CardRow & { board_id: string }) | undefined;

  if (!localRow) {
    throw new Error("Card not found.");
  }

  db.prepare("UPDATE boards SET owner_id = ?, updated_at = ? WHERE id = ?").run(userId, timestamp(), localRow.board_id);
  return localRow;
}

export async function getSqliteBoardsForUser(userId: string): Promise<BoardSummary[]> {
  const db = getSqlite();
  db.prepare("UPDATE boards SET owner_id = ? WHERE owner_id <> ?").run(userId, userId);
  const rows = db
    .prepare(
      `SELECT
        boards.*,
        COUNT(DISTINCT lists.id) AS list_count,
        COUNT(cards.id) AS card_count
       FROM boards
       LEFT JOIN lists ON lists.board_id = boards.id
       LEFT JOIN cards ON cards.list_id = lists.id
       WHERE boards.owner_id = ?
       GROUP BY boards.id
       ORDER BY boards.updated_at DESC`,
    )
    .all(userId) as (BoardRow & { list_count: number; card_count: number })[];

  return rows.map((row) => ({
    ...boardFromRow(row),
    listCount: row.list_count,
    cardCount: row.card_count,
  }));
}

export async function getSqliteBoardForUser(boardId: string, userId: string): Promise<BoardView | null> {
  const db = getSqlite();
  const boardRow = db
    .prepare("SELECT * FROM boards WHERE id = ? AND owner_id = ?")
    .get(boardId, userId) as BoardRow | undefined;

  if (!boardRow) {
    return null;
  }

  const listRows = db
    .prepare("SELECT * FROM lists WHERE board_id = ? ORDER BY position ASC, created_at ASC")
    .all(boardId) as ListRow[];
  const cardRows = db
    .prepare(
      `SELECT cards.*
       FROM cards
       INNER JOIN lists ON lists.id = cards.list_id
       WHERE lists.board_id = ?
       ORDER BY cards.position ASC, cards.created_at ASC`,
    )
    .all(boardId) as CardRow[];

  return {
    ...boardFromRow(boardRow),
    lists: listRows.map((listRow) => ({
      ...listFromRow(listRow),
      cards: cardRows.filter((card) => card.list_id === listRow.id).map(cardFromRow),
    })),
  };
}

export async function createSqliteBoard(userId: string, title: string) {
  const db = getSqlite();
  const boardId = id("board");
  const time = timestamp();
  db.prepare("INSERT INTO boards (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    boardId,
    userId,
    title,
    time,
    time,
  );
  return boardId;
}

export async function renameSqliteBoard(boardId: string, userId: string, title: string) {
  ownedBoard(boardId, userId);
  getSqlite().prepare("UPDATE boards SET title = ?, updated_at = ? WHERE id = ?").run(title, timestamp(), boardId);
}

export async function deleteSqliteBoard(boardId: string, userId: string) {
  ownedBoard(boardId, userId);
  getSqlite().prepare("DELETE FROM boards WHERE id = ?").run(boardId);
}

export async function createSqliteList(boardId: string, userId: string, title: string) {
  ownedBoard(boardId, userId);
  const db = getSqlite();
  const position = ((db.prepare("SELECT MAX(position) AS value FROM lists WHERE board_id = ?").get(boardId) as { value: number | null }).value ?? 0) + 1000;
  const time = timestamp();
  const listId = id("list");
  db.prepare("INSERT INTO lists (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    listId,
    boardId,
    title,
    position,
    time,
    time,
  );
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, boardId);
  return {
    id: listId,
    boardId,
    title,
    position,
    createdAt: new Date(time),
    updatedAt: new Date(time),
    cards: [],
  };
}

export async function renameSqliteList(listId: string, userId: string, title: string) {
  const list = ownedList(listId, userId);
  const time = timestamp();
  const db = getSqlite();
  db.prepare("UPDATE lists SET title = ?, updated_at = ? WHERE id = ?").run(title, time, listId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, list.board_id);
}

export async function deleteSqliteList(listId: string, userId: string) {
  const list = ownedList(listId, userId);
  const db = getSqlite();
  const time = timestamp();
  db.prepare("DELETE FROM lists WHERE id = ?").run(listId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, list.board_id);
}

export async function createSqliteCard(listId: string, userId: string, title: string) {
  const list = ownedList(listId, userId);
  const db = getSqlite();
  const position = ((db.prepare("SELECT MAX(position) AS value FROM cards WHERE list_id = ?").get(listId) as { value: number | null }).value ?? 0) + 1000;
  const time = timestamp();
  const cardId = id("card");
  db.prepare("INSERT INTO cards (id, list_id, title, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    cardId,
    listId,
    title,
    "",
    position,
    time,
    time,
  );
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, list.board_id);
  return {
    id: cardId,
    listId,
    title,
    description: "",
    position,
    createdAt: new Date(time),
    updatedAt: new Date(time),
  };
}

export async function updateSqliteCard(cardId: string, userId: string, title: string, description: string) {
  const card = ownedCard(cardId, userId);
  const time = timestamp();
  const db = getSqlite();
  db.prepare("UPDATE cards SET title = ?, description = ?, updated_at = ? WHERE id = ?").run(title, description, time, cardId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, card.board_id);
}

export async function deleteSqliteCard(cardId: string, userId: string) {
  const card = ownedCard(cardId, userId);
  const time = timestamp();
  const db = getSqlite();
  db.prepare("DELETE FROM cards WHERE id = ?").run(cardId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, card.board_id);
}

export async function reorderSqliteLists(boardId: string, userId: string, listIds: string[]) {
  ownedBoard(boardId, userId);
  const db = getSqlite();
  const existing = db.prepare("SELECT id FROM lists WHERE board_id = ?").all(boardId) as { id: string }[];
  if (!hasSameMembers(existing.map((list) => list.id), listIds)) {
    throw new Error("List order does not match this board.");
  }

  const time = timestamp();
  const updateList = db.prepare("UPDATE lists SET position = ?, updated_at = ? WHERE id = ?");
  const updateBoard = db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?");
  db.transaction(() => {
    listIds.forEach((listId, index) => updateList.run(toPosition(index), time, listId));
    updateBoard.run(time, boardId);
  })();
}

export async function reorderSqliteCards(boardId: string, userId: string, updates: CardOrderUpdate[]) {
  ownedBoard(boardId, userId);
  const db = getSqlite();
  const existingLists = db.prepare("SELECT id FROM lists WHERE board_id = ?").all(boardId) as { id: string }[];
  const existingCards = db
    .prepare("SELECT cards.id FROM cards INNER JOIN lists ON lists.id = cards.list_id WHERE lists.board_id = ?")
    .all(boardId) as { id: string }[];

  if (!hasSameMembers(existingLists.map((list) => list.id), updates.map((update) => update.listId))) {
    throw new Error("Card order does not include every list.");
  }

  if (!hasSameMembers(existingCards.map((card) => card.id), updates.flatMap((update) => update.cardIds))) {
    throw new Error("Card order does not match this board.");
  }

  const time = timestamp();
  const updateCard = db.prepare("UPDATE cards SET list_id = ?, position = ?, updated_at = ? WHERE id = ?");
  const updateBoard = db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?");
  db.transaction(() => {
    updates.forEach((update) => {
      update.cardIds.forEach((cardId, index) => updateCard.run(update.listId, toPosition(index), time, cardId));
    });
    updateBoard.run(time, boardId);
  })();
}
