import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BoardClient } from "@/components/board-client";
import { getBoardForUser } from "@/lib/data";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const [{ boardId }, session] = await Promise.all([params, auth()]);

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const board = await getBoardForUser(boardId, session.user.id);

  if (!board) {
    notFound();
  }

  return (
    <AppShell session={session}>
      <BoardClient board={board} />
    </AppShell>
  );
}
