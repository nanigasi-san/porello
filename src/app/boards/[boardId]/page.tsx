import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BoardClient } from "@/components/board-client";
import { getBoardForUser } from "@/lib/data";
import { getCurrentSession } from "@/lib/session";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const [{ boardId }, session] = await Promise.all([params, getCurrentSession()]);

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
