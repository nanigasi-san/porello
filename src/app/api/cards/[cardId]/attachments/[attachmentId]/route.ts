import { del, get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { boards, cardAttachments } from "@/db/schema";
import { getOwnedCardOrThrow } from "@/lib/data";
import { getCurrentSession } from "@/lib/session";
import { deleteSqliteCardAttachment, getSqliteCardAttachmentForUser } from "@/lib/sqlite-store";

export const runtime = "nodejs";

function localAttachmentPath(storageKey: string) {
  const dataDir = path.join(process.cwd(), ".porello-data");
  const absolutePath = path.resolve(dataDir, storageKey);

  if (!absolutePath.startsWith(path.resolve(dataDir))) {
    throw new Error("Invalid attachment path.");
  }

  return absolutePath;
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ cardId: string; attachmentId: string }>;
  },
) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId, attachmentId } = await params;
  const attachment = !process.env.DATABASE_URL
    ? await getSqliteCardAttachmentForUser(cardId, attachmentId, userId)
    : await getPostgresAttachmentForUser(cardId, attachmentId, userId);

  if (attachment.storageProvider === "blob") {
    const blob = await get(attachment.storageKey, { access: "private" });

    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return new Response(null, { status: 304 });
    }

    return new Response(blob.stream, {
      headers: attachmentHeaders(attachment.filename, attachment.contentType),
    });
  }

  const file = await readFile(localAttachmentPath(attachment.storageKey));
  return new Response(file, {
    headers: attachmentHeaders(attachment.filename, attachment.contentType),
  });
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ cardId: string; attachmentId: string }>;
  },
) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId, attachmentId } = await params;
  const attachment = !process.env.DATABASE_URL
    ? await deleteSqliteCardAttachment(cardId, attachmentId, userId)
    : await deletePostgresAttachmentForUser(cardId, attachmentId, userId);

  if (attachment.storageProvider === "blob") {
    await del(attachment.storageKey);
  } else {
    await unlink(localAttachmentPath(attachment.storageKey)).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, attachmentId });
}

function attachmentHeaders(filename: string, contentType: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
  };
}

async function getPostgresAttachmentForUser(cardId: string, attachmentId: string, userId: string) {
  const db = getDb();
  await getOwnedCardOrThrow(cardId, userId);
  const [attachment] = await db
    .select()
    .from(cardAttachments)
    .where(and(eq(cardAttachments.id, attachmentId), eq(cardAttachments.cardId, cardId)))
    .limit(1);

  if (!attachment) {
    throw new Error("Attachment not found.");
  }

  return attachment;
}

async function deletePostgresAttachmentForUser(cardId: string, attachmentId: string, userId: string) {
  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);
  const attachment = await getPostgresAttachmentForUser(cardId, attachmentId, userId);
  await db
    .delete(cardAttachments)
    .where(and(eq(cardAttachments.id, attachmentId), eq(cardAttachments.cardId, cardId)));
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  return attachment;
}
