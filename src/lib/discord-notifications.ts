import { and, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, boardDiscordWebhooks, boards, cards, discordDeadlineNotifications, lists, users } from "@/db/schema";
import {
  deleteSqliteBoardDiscordWebhook,
  getSqliteBoardDiscordWebhook,
  getSqliteCardForDiscordNotification,
  getSqliteCardsForDiscordMoveNotifications,
  getSqliteDueDiscordNotifications,
  getSqliteListTitlesForDiscordMoveNotifications,
  recordSqliteDiscordDeadlineNotification,
  setSqliteBoardDiscordWebhook,
  type SqliteNotificationCardRow,
} from "@/lib/sqlite-store";

const DISCORD_WEBHOOK_PATTERN = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const DUE_SOON_NOTIFICATION_TYPE = "due_soon";

type DiscordWebhookEmbed = {
  title: string;
  description?: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  url?: string;
  timestamp?: string;
};

type DiscordWebhookOptions = {
  content?: string;
  allowedMentions?: {
    users: string[];
  };
};

type NotificationCard = {
  id: string;
  title: string;
  dueAt: Date | null;
  boardId: string;
  boardTitle: string;
  listId: string;
  listTitle: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneeDiscordUserId: string | null;
  webhookUrl: string;
};

export type CardMoveNotification = {
  card: NotificationCard;
  fromListTitle: string;
  toListTitle: string;
  status: "doing" | "done";
};

export function validateDiscordWebhookUrl(value: string) {
  const webhookUrl = value.trim();

  if (!DISCORD_WEBHOOK_PATTERN.test(webhookUrl)) {
    throw new Error("Invalid Discord webhook URL.");
  }

  return webhookUrl;
}

export function notificationListStatus(title: string) {
  const normalized = title.trim().toLowerCase();
  return normalized === "doing" || normalized === "done" ? normalized : null;
}

export async function getBoardDiscordWebhook(boardId: string, userId: string) {
  if (!process.env.DATABASE_URL) {
    return getSqliteBoardDiscordWebhook(boardId, userId);
  }

  const db = getDb();
  const [row] = await db
    .select({ webhookUrl: boardDiscordWebhooks.webhookUrl })
    .from(boardDiscordWebhooks)
    .innerJoin(boards, eq(boards.id, boardDiscordWebhooks.boardId))
    .where(and(eq(boardDiscordWebhooks.boardId, boardId), eq(boards.ownerId, userId)))
    .limit(1);

  return row?.webhookUrl ?? null;
}

export async function setBoardDiscordWebhook(boardId: string, userId: string, webhookUrl: string) {
  const validatedWebhookUrl = validateDiscordWebhookUrl(webhookUrl);

  if (!process.env.DATABASE_URL) {
    await setSqliteBoardDiscordWebhook(boardId, userId, validatedWebhookUrl);
    return;
  }

  const db = getDb();
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!board) {
    throw new Error("Board not found.");
  }

  await db
    .insert(boardDiscordWebhooks)
    .values({ boardId, webhookUrl: validatedWebhookUrl, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: boardDiscordWebhooks.boardId,
      set: { webhookUrl: validatedWebhookUrl, updatedAt: new Date() },
    });
}

export async function deleteBoardDiscordWebhook(boardId: string, userId: string) {
  if (!process.env.DATABASE_URL) {
    await deleteSqliteBoardDiscordWebhook(boardId, userId);
    return;
  }

  const db = getDb();
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)))
    .limit(1);

  if (!board) {
    throw new Error("Board not found.");
  }

  await db.delete(boardDiscordWebhooks).where(eq(boardDiscordWebhooks.boardId, boardId));
}

export async function notifyCardAssigned(cardId: string, userId: string, previousAssigneeId: string | null, nextAssigneeId: string | null) {
  if (!nextAssigneeId || previousAssigneeId === nextAssigneeId) {
    return;
  }

  const card = await getNotificationCard(cardId, userId);

  if (!card) {
    return;
  }

  const assigneeLabel = card.assigneeName ?? card.assigneeEmail ?? "担当者";
  const title = assignedNotificationTitle(card.title, assigneeLabel);
  await sendDiscordWebhook(
    card.webhookUrl,
    {
      title,
      color: 0x0f766e,
      url: cardUrl(card),
      fields: notificationFields(card),
      timestamp: new Date().toISOString(),
    },
    buildDiscordAssigneeMentionOptions(title, card.assigneeDiscordUserId),
  );
}

export async function prepareCardMoveNotifications(boardId: string, userId: string, updates: { listId: string; cardIds: string[] }[]) {
  const beforeCards = await getNotificationCardsForBoard(boardId, userId);
  const beforeByCardId = new Map(beforeCards.map((card) => [card.id, card]));
  const targetListById = new Map((await getNotificationListsForBoard(boardId, userId)).map((list) => [list.id, list.title]));
  const notifications: CardMoveNotification[] = [];

  for (const update of updates) {
    const toListTitle = targetListById.get(update.listId);
    const status = toListTitle ? notificationListStatus(toListTitle) : null;

    if (!toListTitle || !status) {
      continue;
    }

    for (const cardId of update.cardIds) {
      const card = beforeByCardId.get(cardId);

      if (!card || card.listId === update.listId) {
        continue;
      }

      notifications.push({
        card: { ...card, listId: update.listId, listTitle: toListTitle },
        fromListTitle: card.listTitle,
        toListTitle,
        status,
      });
    }
  }

  return notifications;
}

export async function sendCardMoveNotifications(notifications: CardMoveNotification[]) {
  await Promise.all(
    notifications.map((notification) => {
      const title = movedNotificationTitle(notification.card.title, notification.toListTitle);
      return sendDiscordWebhook(
        notification.card.webhookUrl,
        {
          title,
          color: notification.status === "done" ? 0x16a34a : 0x2563eb,
          url: cardUrl(notification.card),
          fields: [
            ...notificationFields(notification.card),
            { name: "移動元", value: notification.fromListTitle, inline: true },
            { name: "移動先", value: notification.toListTitle, inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
        buildDiscordAssigneeMentionOptions(title, notification.card.assigneeDiscordUserId),
      );
    }),
  );
}

export async function sendDueSoonDiscordNotifications(now = new Date()) {
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dueCards = await getDueNotificationCards(now, until);
  let sent = 0;

  for (const card of dueCards) {
    const title = dueSoonNotificationTitle(card.title);
    const didSend = await sendDiscordWebhook(
      card.webhookUrl,
      {
        title,
        description: "締め切りが24時間以内です。",
        color: 0xf59e0b,
        url: cardUrl(card),
        fields: [
          ...notificationFields(card),
          { name: "締め切り", value: card.dueAt ? formatDateTime(card.dueAt) : "未設定", inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
      buildDiscordAssigneeMentionOptions(title, card.assigneeDiscordUserId),
    );

    if (didSend && card.dueAt) {
      await recordDeadlineNotification(card.id, card.dueAt);
      sent += 1;
    }
  }

  return { checked: dueCards.length, sent };
}

async function getNotificationCard(cardId: string, userId: string): Promise<NotificationCard | null> {
  if (!process.env.DATABASE_URL) {
    const row = getSqliteCardForDiscordNotification(cardId, userId);
    return row ? sqliteNotificationCard(row) : null;
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: cards.id,
      title: cards.title,
      dueAt: cards.dueAt,
      boardId: boards.id,
      boardTitle: boards.title,
      listId: lists.id,
      listTitle: lists.title,
      assigneeName: users.name,
      assigneeEmail: users.email,
      assigneeDiscordUserId: accounts.providerAccountId,
      webhookUrl: boardDiscordWebhooks.webhookUrl,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .innerJoin(boardDiscordWebhooks, eq(boardDiscordWebhooks.boardId, boards.id))
    .leftJoin(users, eq(users.id, cards.assigneeId))
    .leftJoin(accounts, and(eq(accounts.userId, cards.assigneeId), eq(accounts.provider, "discord")))
    .where(and(eq(cards.id, cardId), eq(boards.ownerId, userId)))
    .limit(1);

  return row ?? null;
}

async function getNotificationCardsForBoard(boardId: string, userId: string): Promise<NotificationCard[]> {
  if (!process.env.DATABASE_URL) {
    return getSqliteCardsForDiscordMoveNotifications(boardId, userId).map(sqliteNotificationCard);
  }

  const db = getDb();
  return db
    .select({
      id: cards.id,
      title: cards.title,
      dueAt: cards.dueAt,
      boardId: boards.id,
      boardTitle: boards.title,
      listId: lists.id,
      listTitle: lists.title,
      assigneeName: users.name,
      assigneeEmail: users.email,
      assigneeDiscordUserId: accounts.providerAccountId,
      webhookUrl: boardDiscordWebhooks.webhookUrl,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .innerJoin(boardDiscordWebhooks, eq(boardDiscordWebhooks.boardId, boards.id))
    .leftJoin(users, eq(users.id, cards.assigneeId))
    .leftJoin(accounts, and(eq(accounts.userId, cards.assigneeId), eq(accounts.provider, "discord")))
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)));
}

async function getNotificationListsForBoard(boardId: string, userId: string) {
  if (!process.env.DATABASE_URL) {
    return getSqliteListTitlesForDiscordMoveNotifications(boardId, userId);
  }

  return getDb()
    .select({ id: lists.id, title: lists.title })
    .from(lists)
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, userId)));
}

async function getDueNotificationCards(now: Date, until: Date): Promise<NotificationCard[]> {
  if (!process.env.DATABASE_URL) {
    return getSqliteDueDiscordNotifications(now, until).map(sqliteNotificationCard);
  }

  const db = getDb();
  return db
    .select({
      id: cards.id,
      title: cards.title,
      dueAt: cards.dueAt,
      boardId: boards.id,
      boardTitle: boards.title,
      listId: lists.id,
      listTitle: lists.title,
      assigneeName: users.name,
      assigneeEmail: users.email,
      assigneeDiscordUserId: accounts.providerAccountId,
      webhookUrl: boardDiscordWebhooks.webhookUrl,
    })
    .from(cards)
    .innerJoin(lists, eq(lists.id, cards.listId))
    .innerJoin(boards, eq(boards.id, lists.boardId))
    .innerJoin(boardDiscordWebhooks, eq(boardDiscordWebhooks.boardId, boards.id))
    .leftJoin(users, eq(users.id, cards.assigneeId))
    .leftJoin(accounts, and(eq(accounts.userId, cards.assigneeId), eq(accounts.provider, "discord")))
    .leftJoin(
      discordDeadlineNotifications,
      and(
        eq(discordDeadlineNotifications.cardId, cards.id),
        eq(discordDeadlineNotifications.dueAt, cards.dueAt),
        eq(discordDeadlineNotifications.notificationType, DUE_SOON_NOTIFICATION_TYPE),
      ),
    )
    .where(
      and(
        gt(cards.dueAt, now),
        lte(cards.dueAt, until),
        ne(sql`lower(trim(${lists.title}))`, "done"),
        sql`${discordDeadlineNotifications.id} IS NULL`,
      ),
    );
}

async function recordDeadlineNotification(cardId: string, dueAt: Date) {
  if (!process.env.DATABASE_URL) {
    recordSqliteDiscordDeadlineNotification(cardId, dueAt);
    return;
  }

  await getDb()
    .insert(discordDeadlineNotifications)
    .values({ cardId, dueAt, notificationType: DUE_SOON_NOTIFICATION_TYPE })
    .onConflictDoNothing();
}

async function sendDiscordWebhook(webhookUrl: string, embed: DiscordWebhookEmbed, options: DiscordWebhookOptions = {}) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: options.content,
        embeds: [embed],
        allowed_mentions: options.allowedMentions,
      }),
    });

    if (!response.ok) {
      console.error(`Discord webhook failed: ${response.status} ${response.statusText}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Discord webhook failed:", error);
    return false;
  }
}

function sqliteNotificationCard(row: SqliteNotificationCardRow): NotificationCard {
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    boardId: row.board_id,
    boardTitle: row.board_title,
    listId: row.list_id,
    listTitle: row.list_title,
    assigneeName: row.assignee_name,
    assigneeEmail: row.assignee_email,
    assigneeDiscordUserId: row.assignee_discord_user_id,
    webhookUrl: row.webhook_url,
  };
}

function notificationFields(card: NotificationCard) {
  return [
    { name: "ボード", value: card.boardTitle, inline: true },
    { name: "リスト", value: card.listTitle, inline: true },
    { name: "カードURL", value: cardUrl(card) ?? "未設定", inline: false },
  ];
}

export function buildDiscordCardUrl(baseUrl: string, boardId: string, cardId: string) {
  return `${baseUrl.replace(/\/$/, "")}/boards/${boardId}?card=${cardId}`;
}

export function assignedNotificationTitle(cardTitle: string, assigneeLabel: string) {
  return `${notificationVariable(cardTitle)} に ${notificationVariable(assigneeLabel)} がアサインされました`;
}

export function buildAssignedDiscordWebhookOptions(cardTitle: string, assigneeLabel: string, discordUserId: string | null): DiscordWebhookOptions {
  return buildDiscordAssigneeMentionOptions(assignedNotificationTitle(cardTitle, assigneeLabel), discordUserId);
}

export function buildDiscordAssigneeMentionOptions(notificationTitle: string, discordUserId: string | null): DiscordWebhookOptions {
  if (!discordUserId) {
    return {};
  }

  return {
    content: `<@${discordUserId}> ${notificationTitle}`,
    allowedMentions: { users: [discordUserId] },
  };
}

export function movedNotificationTitle(cardTitle: string, listTitle: string) {
  return `${notificationVariable(cardTitle)} が ${notificationVariable(listTitle)} に移動されました`;
}

export function dueSoonNotificationTitle(cardTitle: string) {
  return `${notificationVariable(cardTitle)} の締め切りが近づいています`;
}

function notificationVariable(value: string) {
  return `[${value.trim()}]`;
}

function cardUrl(card: NotificationCard) {
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  return baseUrl ? buildDiscordCardUrl(baseUrl, card.boardId, card.id) : undefined;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
