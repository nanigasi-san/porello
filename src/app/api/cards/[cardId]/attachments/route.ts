import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { boards, cardAttachments } from "@/db/schema";
import { getOwnedCardOrThrow } from "@/lib/data";
import { getCurrentSession } from "@/lib/session";
import { createSqliteCardAttachment } from "@/lib/sqlite-store";

export const runtime = "nodejs";

function safeFilename(filename: string) {
  return filename.replace(/[^\w.\-()\s]/g, "_").replace(/\s+/g, " ").trim().slice(0, 240) || "attachment";
}

function localStorageKey(cardId: string, filename: string) {
  return path.join("uploads", cardId, `${crypto.randomUUID()}-${filename}`);
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ cardId: string }>;
  },
) {
  const session = await getCurrentSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cardId } = await params;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  const filename = safeFilename(file.name);
  const contentType = file.type || "application/octet-stream";
  const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const storagePath = `cards/${cardId}/${crypto.randomUUID()}-${filename}`;

  if (!process.env.DATABASE_URL) {
    let storageKey: string;
    let storageProvider: string;

    if (useBlob) {
      const blob = await put(storagePath, file, {
        access: "private",
        contentType,
      });
      storageKey = blob.url;
      storageProvider = "blob";
    } else {
      storageKey = localStorageKey(cardId, filename);
      const absolutePath = path.join(process.cwd(), ".porello-data", storageKey);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));
      storageProvider = "local";
    }

    const attachment = await createSqliteCardAttachment(cardId, userId, {
      filename,
      contentType,
      size: file.size,
      storageProvider,
      storageKey,
    });
    return NextResponse.json({ attachment });
  }

  const db = getDb();
  const { list } = await getOwnedCardOrThrow(cardId, userId);
  let storageKey: string;
  let storageProvider: string;

  if (useBlob) {
    const blob = await put(storagePath, file, {
      access: "private",
      contentType,
    });
    storageKey = blob.url;
    storageProvider = "blob";
  } else {
    storageKey = localStorageKey(cardId, filename);
    const absolutePath = path.join(process.cwd(), ".porello-data", storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));
    storageProvider = "local";
  }

  const [attachment] = await db
    .insert(cardAttachments)
    .values({
      cardId,
      uploaderId: userId,
      filename,
      contentType,
      size: file.size,
      storageProvider,
      storageKey,
    })
    .returning({
      id: cardAttachments.id,
      cardId: cardAttachments.cardId,
      uploaderId: cardAttachments.uploaderId,
      filename: cardAttachments.filename,
      contentType: cardAttachments.contentType,
      size: cardAttachments.size,
      storageProvider: cardAttachments.storageProvider,
      createdAt: cardAttachments.createdAt,
    });

  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, list.boardId));
  return NextResponse.json({ attachment });
}
