import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Columns3, Plus, SquareKanban, Trash2 } from "lucide-react";
import { createBoard, deleteBoard } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { getBoardsForUser } from "@/lib/data";
import { getCurrentSession } from "@/lib/session";

export default async function BoardsPage() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const boards = await getBoardsForUser(userId);

  return (
    <AppShell session={session}>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-[#b8ded9] bg-[#ecfdf9] px-3 py-1 text-sm font-medium text-[#0f766e]">
              <Columns3 size={15} />
              Private workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-[#101828]">ボード</h1>
            <p className="mt-2 text-sm text-[#667085]">
              作業単位ごとにボードを分け、リストとカードで進行状況を管理します。
            </p>
          </div>
          <form action={createBoard} className="flex w-full max-w-xl gap-2 rounded-lg border border-[#d8dee9] bg-white p-2 shadow-sm">
            <input
              name="title"
              required
              autoFocus
              aria-label="新しいボード名"
              className="min-w-0 flex-1 rounded-md border border-transparent bg-[#f8fafc] px-3 py-2 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#0f766e] focus:bg-white"
              placeholder="新しいボード名"
              maxLength={120}
            />
            <SubmitButton className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]" title="ボードを作成">
              <Plus size={17} />
              作成
            </SubmitButton>
          </form>
        </div>

        {boards.length === 0 ? (
          <div className="grid min-h-96 place-items-center rounded-lg border border-dashed border-[#cbd5e1] bg-white/70 p-8 text-center">
            <div>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#eef6f5] text-[#0f766e]">
                <SquareKanban size={24} />
              </div>
              <h2 className="text-lg font-semibold text-[#101828]">最初のボードを作成</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#667085]">
                右上の入力欄にボード名を入れると、すぐにリストとカードを追加できます。
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board) => (
              <article
                key={board.id}
                className="group rounded-lg border border-[#d8dee9] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#99c7c2] hover:shadow-md focus-within:border-[#99c7c2] focus-within:shadow-md"
              >
                <div className="mb-8 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#eef6f5] text-[#0f766e]">
                      <SquareKanban size={22} />
                    </div>
                    <div className="flex items-center gap-1 rounded-md bg-[#f2f4f7] px-2 py-1 text-xs text-[#667085]">
                      <CalendarDays size={13} />
                      {new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(board.updatedAt)}
                    </div>
                  </div>
                  <form action={deleteBoard.bind(null, board.id)}>
                    <button
                      type="submit"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#98a2b3] transition hover:bg-[#fff1f1] hover:text-[#b42318] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b42318]"
                      aria-label={`${board.title}を削除`}
                      title="ボードを削除"
                    >
                      <Trash2 size={15} />
                    </button>
                  </form>
                </div>
                <Link
                  href={`/boards/${board.id}`}
                  className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f766e]"
                  title={`${board.title}を開く`}
                >
                  <h2 className="line-clamp-2 text-lg font-semibold text-[#101828] group-hover:text-[#0f766e]">
                    {board.title}
                  </h2>
                  <div className="mt-3 text-sm text-[#667085]">
                    {board.listCount} リスト / {board.cardCount} カード
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
