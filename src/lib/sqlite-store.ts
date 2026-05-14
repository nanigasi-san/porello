import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  BoardSummary,
  BoardView,
  BoardUserIdentity,
  CardAttachmentView,
  CardCommentView,
  CardView,
  ChecklistItemView,
  LabelView,
  ListView,
  UserSummary,
} from "@/lib/data";
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
  due_at: string | null;
  assignee_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type LabelRow = {
  id: string;
  board_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

type CardLabelRow = {
  card_id: string;
  label_id: string;
};

type ChecklistItemRow = {
  id: string;
  card_id: string;
  title: string;
  completed: number;
  position: number;
  created_at: string;
  updated_at: string;
};

type CardCommentRow = {
  id: string;
  card_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

type CardAttachmentRow = {
  id: string;
  card_id: string;
  uploader_id: string | null;
  filename: string;
  content_type: string;
  size: number;
  storage_provider: string;
  storage_key: string;
  created_at: string;
};

type BoardDiscordWebhookRow = {
  id: string;
  board_id: string;
  webhook_url: string;
  created_at: string;
  updated_at: string;
};

type CardOrderUpdate = {
  listId: string;
  cardIds: string[];
};

let sqlite: Database.Database | null = null;

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((candidate) => candidate.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

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
        due_at TEXT,
        assignee_id TEXT,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        image TEXT
      );

      CREATE TABLE IF NOT EXISTS labels (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#0f766e',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS card_labels (
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
        PRIMARY KEY (card_id, label_id)
      );

      CREATE TABLE IF NOT EXISTS card_checklist_items (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS card_comments (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        author_id TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS card_attachments (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        uploader_id TEXT,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        size INTEGER NOT NULL,
        storage_provider TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS board_discord_webhooks (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        webhook_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS discord_deadline_notifications (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        due_at TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        sent_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS boards_owner_idx ON boards(owner_id);
      CREATE INDEX IF NOT EXISTS lists_board_position_idx ON lists(board_id, position);
      CREATE INDEX IF NOT EXISTS cards_list_position_idx ON cards(list_id, position);
      CREATE INDEX IF NOT EXISTS labels_board_idx ON labels(board_id);
      CREATE INDEX IF NOT EXISTS checklist_card_position_idx ON card_checklist_items(card_id, position);
      CREATE INDEX IF NOT EXISTS comments_card_created_idx ON card_comments(card_id, created_at);
      CREATE INDEX IF NOT EXISTS attachments_card_created_idx ON card_attachments(card_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS board_discord_webhooks_board_unique ON board_discord_webhooks(board_id);
      CREATE UNIQUE INDEX IF NOT EXISTS discord_deadline_notifications_card_due_type_unique
        ON discord_deadline_notifications(card_id, due_at, notification_type);
    `);
    addColumnIfMissing(sqlite, "cards", "due_at", "TEXT");
    addColumnIfMissing(sqlite, "cards", "assignee_id", "TEXT");
  }

  return sqlite;
}

function timestamp() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function boardFromRow(row: BoardRow): Omit<BoardView, "lists" | "labels" | "members" | "discordWebhookConfigured"> {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function userFromRow(row: UserRow): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
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
    dueAt: row.due_at ? new Date(row.due_at) : null,
    assigneeId: row.assignee_id,
    position: row.position,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    assignee: null,
    labels: [],
    checklistItems: [],
    comments: [],
    attachments: [],
  };
}

function labelFromRow(row: LabelRow): LabelView {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    color: row.color,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function checklistItemFromRow(row: ChecklistItemRow): ChecklistItemView {
  return {
    id: row.id,
    cardId: row.card_id,
    title: row.title,
    completed: row.completed === 1,
    position: row.position,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function commentFromRow(row: CardCommentRow, author: UserSummary | null): CardCommentView {
  return {
    id: row.id,
    cardId: row.card_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    author,
  };
}

function attachmentFromRow(row: CardAttachmentRow): CardAttachmentView {
  return {
    id: row.id,
    cardId: row.card_id,
    uploaderId: row.uploader_id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    storageProvider: row.storage_provider,
    createdAt: new Date(row.created_at),
  };
}

function ensureSqliteUser(userId: string, user?: BoardUserIdentity) {
  const db = getSqlite();
  const name = user?.name ?? (userId === "local-test-user" ? "Test User" : userId);
  const email = user?.email ?? (userId === "local-test-user" ? "test@example.local" : null);
  const image = user?.image ?? null;
  db.prepare(
    `INSERT INTO users (id, name, email, image)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = COALESCE(excluded.name, users.name),
       email = COALESCE(excluded.email, users.email),
       image = COALESCE(excluded.image, users.image)`,
  ).run(userId, name, email, image);
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
  ensureSqliteUser(userId);
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

export async function getSqliteBoardForUser(
  boardId: string,
  userId: string,
  user?: BoardUserIdentity,
): Promise<BoardView | null> {
  ensureSqliteUser(userId, user);
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
  const cardIds = cardRows.map((card) => card.id);
  const labelsRows = db.prepare("SELECT * FROM labels WHERE board_id = ? ORDER BY name ASC, created_at ASC").all(boardId) as LabelRow[];
  const cardLabelRows =
    cardIds.length > 0
      ? (db
          .prepare(
            `SELECT card_labels.*
             FROM card_labels
             INNER JOIN cards ON cards.id = card_labels.card_id
             INNER JOIN lists ON lists.id = cards.list_id
             WHERE lists.board_id = ?`,
          )
          .all(boardId) as CardLabelRow[])
      : [];
  const checklistRows =
    cardIds.length > 0
      ? (db
          .prepare(
            `SELECT card_checklist_items.*
             FROM card_checklist_items
             INNER JOIN cards ON cards.id = card_checklist_items.card_id
             INNER JOIN lists ON lists.id = cards.list_id
             WHERE lists.board_id = ?
             ORDER BY card_checklist_items.position ASC, card_checklist_items.created_at ASC`,
          )
          .all(boardId) as ChecklistItemRow[])
      : [];
  const commentRows =
    cardIds.length > 0
      ? (db
          .prepare(
            `SELECT card_comments.*
             FROM card_comments
             INNER JOIN cards ON cards.id = card_comments.card_id
             INNER JOIN lists ON lists.id = cards.list_id
             WHERE lists.board_id = ?
             ORDER BY card_comments.created_at ASC`,
          )
          .all(boardId) as CardCommentRow[])
      : [];
  const attachmentRows =
    cardIds.length > 0
      ? (db
          .prepare(
            `SELECT card_attachments.*
             FROM card_attachments
             INNER JOIN cards ON cards.id = card_attachments.card_id
             INNER JOIN lists ON lists.id = cards.list_id
             WHERE lists.board_id = ?
             ORDER BY card_attachments.created_at ASC`,
          )
          .all(boardId) as CardAttachmentRow[])
      : [];
  const userRows = db.prepare("SELECT * FROM users ORDER BY name ASC, email ASC").all() as UserRow[];
  const usersById = new Map(userRows.map((candidate) => [candidate.id, userFromRow(candidate)]));
  const boardLabels = labelsRows.map(labelFromRow);
  const labelsById = new Map(boardLabels.map((label) => [label.id, label]));

  const hydrateCard = (row: CardRow): CardView => {
    const card = cardFromRow(row);
    return {
      ...card,
      assignee: card.assigneeId ? (usersById.get(card.assigneeId) ?? null) : null,
      labels: cardLabelRows
        .filter((link) => link.card_id === card.id)
        .map((link) => labelsById.get(link.label_id))
        .filter((label): label is LabelView => Boolean(label)),
      checklistItems: checklistRows.filter((item) => item.card_id === card.id).map(checklistItemFromRow),
      comments: commentRows
        .filter((comment) => comment.card_id === card.id)
        .map((comment) => commentFromRow(comment, comment.author_id ? (usersById.get(comment.author_id) ?? null) : null)),
      attachments: attachmentRows.filter((attachment) => attachment.card_id === card.id).map(attachmentFromRow),
    };
  };

  return {
    ...boardFromRow(boardRow),
    labels: boardLabels,
    members: userRows.map(userFromRow),
    discordWebhookConfigured: false,
    lists: listRows.map((listRow) => ({
      ...listFromRow(listRow),
      cards: cardRows.filter((card) => card.list_id === listRow.id).map(hydrateCard),
    })),
  };
}

export async function createSqliteBoard(userId: string, title: string) {
  ensureSqliteUser(userId);
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

export async function getSqliteBoardDiscordWebhook(boardId: string, userId: string) {
  ownedBoard(boardId, userId);
  const row = getSqlite()
    .prepare("SELECT * FROM board_discord_webhooks WHERE board_id = ?")
    .get(boardId) as BoardDiscordWebhookRow | undefined;

  return row?.webhook_url ?? null;
}

export async function hasSqliteBoardDiscordWebhook(boardId: string, userId: string) {
  return Boolean(await getSqliteBoardDiscordWebhook(boardId, userId));
}

export async function setSqliteBoardDiscordWebhook(boardId: string, userId: string, webhookUrl: string) {
  ownedBoard(boardId, userId);
  const db = getSqlite();
  const time = timestamp();
  db.prepare(
    `INSERT INTO board_discord_webhooks (id, board_id, webhook_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(board_id) DO UPDATE SET webhook_url = excluded.webhook_url, updated_at = excluded.updated_at`,
  ).run(id("discord_webhook"), boardId, webhookUrl, time, time);
}

export async function deleteSqliteBoardDiscordWebhook(boardId: string, userId: string) {
  ownedBoard(boardId, userId);
  getSqlite().prepare("DELETE FROM board_discord_webhooks WHERE board_id = ?").run(boardId);
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
  ensureSqliteUser(userId);
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
    dueAt: null,
    assigneeId: null,
    position,
    createdAt: new Date(time),
    updatedAt: new Date(time),
    assignee: null,
    labels: [],
    checklistItems: [],
    comments: [],
    attachments: [],
  };
}

export async function updateSqliteCard(
  cardId: string,
  userId: string,
  title: string,
  description: string,
  dueAt: Date | null,
  assigneeId: string | null,
) {
  ensureSqliteUser(userId);
  const card = ownedCard(cardId, userId);
  const time = timestamp();
  const db = getSqlite();
  db.prepare("UPDATE cards SET title = ?, description = ?, due_at = ?, assignee_id = ?, updated_at = ? WHERE id = ?").run(
    title,
    description,
    dueAt?.toISOString() ?? null,
    assigneeId,
    time,
    cardId,
  );
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, card.board_id);
  return { previousAssigneeId: card.assignee_id };
}

export async function deleteSqliteCard(cardId: string, userId: string) {
  const card = ownedCard(cardId, userId);
  const time = timestamp();
  const db = getSqlite();
  db.prepare("DELETE FROM cards WHERE id = ?").run(cardId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, card.board_id);
}

export async function getSqliteUser(userId: string): Promise<UserSummary | null> {
  const row = getSqlite().prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  return row ? userFromRow(row) : null;
}

export async function createSqliteLabel(boardId: string, userId: string, name: string, color: string): Promise<LabelView> {
  ownedBoard(boardId, userId);
  const db = getSqlite();
  const time = timestamp();
  const labelId = id("label");
  db.prepare("INSERT INTO labels (id, board_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    labelId,
    boardId,
    name,
    color,
    time,
    time,
  );
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, boardId);
  return {
    id: labelId,
    boardId,
    name,
    color,
    createdAt: new Date(time),
    updatedAt: new Date(time),
  };
}

function ownedLabel(labelId: string, userId: string) {
  const row = getSqlite()
    .prepare(
      `SELECT labels.*, boards.id AS owner_board_id
       FROM labels
       INNER JOIN boards ON boards.id = labels.board_id
       WHERE labels.id = ? AND boards.owner_id = ?`,
    )
    .get(labelId, userId) as (LabelRow & { owner_board_id: string }) | undefined;

  if (!row) {
    throw new Error("Label not found.");
  }

  return row;
}

export async function attachSqliteLabelToCard(cardId: string, userId: string, labelId: string): Promise<LabelView> {
  const card = ownedCard(cardId, userId);
  const label = ownedLabel(labelId, userId);

  if (label.board_id !== card.board_id) {
    throw new Error("Label does not belong to this board.");
  }

  const db = getSqlite();
  db.prepare("INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)").run(cardId, labelId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(timestamp(), card.board_id);
  return labelFromRow(label);
}

export async function detachSqliteLabelFromCard(cardId: string, userId: string, labelId: string) {
  const card = ownedCard(cardId, userId);
  ownedLabel(labelId, userId);
  const db = getSqlite();
  db.prepare("DELETE FROM card_labels WHERE card_id = ? AND label_id = ?").run(cardId, labelId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(timestamp(), card.board_id);
}

export async function addSqliteChecklistItem(cardId: string, userId: string, title: string): Promise<ChecklistItemView> {
  const card = ownedCard(cardId, userId);
  const db = getSqlite();
  const position =
    ((db.prepare("SELECT MAX(position) AS value FROM card_checklist_items WHERE card_id = ?").get(cardId) as { value: number | null })
      .value ?? 0) + 1000;
  const time = timestamp();
  const itemId = id("check");
  db.prepare(
    "INSERT INTO card_checklist_items (id, card_id, title, completed, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(itemId, cardId, title, 0, position, time, time);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, card.board_id);
  return {
    id: itemId,
    cardId,
    title,
    completed: false,
    position,
    createdAt: new Date(time),
    updatedAt: new Date(time),
  };
}

function ownedChecklistItem(itemId: string, userId: string) {
  const row = getSqlite()
    .prepare(
      `SELECT card_checklist_items.*, lists.board_id
       FROM card_checklist_items
       INNER JOIN cards ON cards.id = card_checklist_items.card_id
       INNER JOIN lists ON lists.id = cards.list_id
       INNER JOIN boards ON boards.id = lists.board_id
       WHERE card_checklist_items.id = ? AND boards.owner_id = ?`,
    )
    .get(itemId, userId) as (ChecklistItemRow & { board_id: string }) | undefined;

  if (!row) {
    throw new Error("Checklist item not found.");
  }

  return row;
}

export async function updateSqliteChecklistItem(
  itemId: string,
  userId: string,
  title: string,
  completed: boolean,
): Promise<ChecklistItemView> {
  const item = ownedChecklistItem(itemId, userId);
  const time = timestamp();
  const db = getSqlite();
  db.prepare("UPDATE card_checklist_items SET title = ?, completed = ?, updated_at = ? WHERE id = ?").run(
    title,
    completed ? 1 : 0,
    time,
    itemId,
  );
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, item.board_id);
  return checklistItemFromRow({ ...item, title, completed: completed ? 1 : 0, updated_at: time });
}

export async function deleteSqliteChecklistItem(itemId: string, userId: string) {
  const item = ownedChecklistItem(itemId, userId);
  const db = getSqlite();
  const time = timestamp();
  db.prepare("DELETE FROM card_checklist_items WHERE id = ?").run(itemId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, item.board_id);
}

export async function addSqliteComment(cardId: string, userId: string, body: string): Promise<CardCommentView> {
  ensureSqliteUser(userId);
  const card = ownedCard(cardId, userId);
  const db = getSqlite();
  const time = timestamp();
  const commentId = id("comment");
  db.prepare("INSERT INTO card_comments (id, card_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    commentId,
    cardId,
    userId,
    body,
    time,
    time,
  );
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, card.board_id);
  return {
    id: commentId,
    cardId,
    authorId: userId,
    body,
    createdAt: new Date(time),
    updatedAt: new Date(time),
    author: await getSqliteUser(userId),
  };
}

function ownedComment(commentId: string, userId: string) {
  const row = getSqlite()
    .prepare(
      `SELECT card_comments.*, lists.board_id
       FROM card_comments
       INNER JOIN cards ON cards.id = card_comments.card_id
       INNER JOIN lists ON lists.id = cards.list_id
       INNER JOIN boards ON boards.id = lists.board_id
       WHERE card_comments.id = ? AND boards.owner_id = ?`,
    )
    .get(commentId, userId) as (CardCommentRow & { board_id: string }) | undefined;

  if (!row) {
    throw new Error("Comment not found.");
  }

  return row;
}

export async function deleteSqliteComment(commentId: string, userId: string) {
  const comment = ownedComment(commentId, userId);
  const db = getSqlite();
  const time = timestamp();
  db.prepare("DELETE FROM card_comments WHERE id = ?").run(commentId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, comment.board_id);
}

export type SqliteAttachmentRecord = CardAttachmentView & {
  storageKey: string;
};

export async function createSqliteCardAttachment(
  cardId: string,
  userId: string,
  attachment: {
    filename: string;
    contentType: string;
    size: number;
    storageProvider: string;
    storageKey: string;
  },
): Promise<CardAttachmentView> {
  const card = ownedCard(cardId, userId);
  const db = getSqlite();
  const time = timestamp();
  const attachmentId = id("attachment");
  db.prepare(
    `INSERT INTO card_attachments
     (id, card_id, uploader_id, filename, content_type, size, storage_provider, storage_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    attachmentId,
    cardId,
    userId,
    attachment.filename,
    attachment.contentType,
    attachment.size,
    attachment.storageProvider,
    attachment.storageKey,
    time,
  );
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, card.board_id);
  return {
    id: attachmentId,
    cardId,
    uploaderId: userId,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.size,
    storageProvider: attachment.storageProvider,
    createdAt: new Date(time),
  };
}

export async function getSqliteCardAttachmentForUser(
  cardId: string,
  attachmentId: string,
  userId: string,
): Promise<SqliteAttachmentRecord> {
  ownedCard(cardId, userId);
  const row = getSqlite()
    .prepare("SELECT * FROM card_attachments WHERE id = ? AND card_id = ?")
    .get(attachmentId, cardId) as CardAttachmentRow | undefined;

  if (!row) {
    throw new Error("Attachment not found.");
  }

  return { ...attachmentFromRow(row), storageKey: row.storage_key };
}

export async function deleteSqliteCardAttachment(cardId: string, attachmentId: string, userId: string) {
  const attachment = await getSqliteCardAttachmentForUser(cardId, attachmentId, userId);
  const card = ownedCard(cardId, userId);
  const db = getSqlite();
  const time = timestamp();
  db.prepare("DELETE FROM card_attachments WHERE id = ? AND card_id = ?").run(attachmentId, cardId);
  db.prepare("UPDATE boards SET updated_at = ? WHERE id = ?").run(time, card.board_id);
  return attachment;
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

export type SqliteNotificationCardRow = CardRow & {
  board_id: string;
  board_title: string;
  list_title: string;
  assignee_name: string | null;
  assignee_email: string | null;
  webhook_url: string;
};

export function getSqliteCardForDiscordNotification(cardId: string, userId: string) {
  ownedCard(cardId, userId);
  return getSqlite()
    .prepare(
      `SELECT
        cards.*,
        lists.board_id,
        lists.title AS list_title,
        boards.title AS board_title,
        users.name AS assignee_name,
        users.email AS assignee_email,
        board_discord_webhooks.webhook_url
       FROM cards
       INNER JOIN lists ON lists.id = cards.list_id
       INNER JOIN boards ON boards.id = lists.board_id
       INNER JOIN board_discord_webhooks ON board_discord_webhooks.board_id = boards.id
       LEFT JOIN users ON users.id = cards.assignee_id
       WHERE cards.id = ? AND boards.owner_id = ?`,
    )
    .get(cardId, userId) as SqliteNotificationCardRow | undefined;
}

export function getSqliteCardsForDiscordMoveNotifications(boardId: string, userId: string) {
  ownedBoard(boardId, userId);
  return getSqlite()
    .prepare(
      `SELECT
        cards.*,
        lists.board_id,
        lists.title AS list_title,
        boards.title AS board_title,
        users.name AS assignee_name,
        users.email AS assignee_email,
        board_discord_webhooks.webhook_url
       FROM cards
       INNER JOIN lists ON lists.id = cards.list_id
       INNER JOIN boards ON boards.id = lists.board_id
       INNER JOIN board_discord_webhooks ON board_discord_webhooks.board_id = boards.id
       LEFT JOIN users ON users.id = cards.assignee_id
       WHERE boards.id = ? AND boards.owner_id = ?`,
    )
    .all(boardId, userId) as SqliteNotificationCardRow[];
}

export function getSqliteListTitlesForDiscordMoveNotifications(boardId: string, userId: string) {
  ownedBoard(boardId, userId);
  return getSqlite()
    .prepare(
      `SELECT lists.id, lists.title
       FROM lists
       INNER JOIN boards ON boards.id = lists.board_id
       WHERE boards.id = ? AND boards.owner_id = ?`,
    )
    .all(boardId, userId) as { id: string; title: string }[];
}

export type SqliteDeadlineNotificationRow = SqliteNotificationCardRow & {
  due_at: string;
};

export function getSqliteDueDiscordNotifications(now: Date, until: Date) {
  return getSqlite()
    .prepare(
      `SELECT
        cards.*,
        lists.board_id,
        lists.title AS list_title,
        boards.title AS board_title,
        users.name AS assignee_name,
        users.email AS assignee_email,
        board_discord_webhooks.webhook_url
       FROM cards
       INNER JOIN lists ON lists.id = cards.list_id
       INNER JOIN boards ON boards.id = lists.board_id
       INNER JOIN board_discord_webhooks ON board_discord_webhooks.board_id = boards.id
       LEFT JOIN users ON users.id = cards.assignee_id
       LEFT JOIN discord_deadline_notifications
         ON discord_deadline_notifications.card_id = cards.id
        AND discord_deadline_notifications.due_at = cards.due_at
        AND discord_deadline_notifications.notification_type = 'due_soon'
       WHERE cards.due_at IS NOT NULL
         AND cards.due_at > ?
         AND cards.due_at <= ?
         AND lower(trim(lists.title)) <> 'done'
         AND discord_deadline_notifications.id IS NULL`,
    )
    .all(now.toISOString(), until.toISOString()) as SqliteDeadlineNotificationRow[];
}

export function recordSqliteDiscordDeadlineNotification(cardId: string, dueAt: Date) {
  getSqlite()
    .prepare(
      `INSERT OR IGNORE INTO discord_deadline_notifications (id, card_id, due_at, notification_type, sent_at)
       VALUES (?, ?, ?, 'due_soon', ?)`,
    )
    .run(id("discord_deadline"), cardId, dueAt.toISOString(), timestamp());
}
