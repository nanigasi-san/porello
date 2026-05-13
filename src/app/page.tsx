import { redirect } from "next/navigation";
import { ArrowRight, Columns3, LogIn } from "lucide-react";
import { auth, signIn } from "@/auth";

async function signInWithDiscord() {
  "use server";
  await signIn("discord", { redirectTo: "/boards" });
}

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/boards");
  }

  return (
    <main className="min-h-screen px-5 py-6">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-between">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f766e] text-white">
              <Columns3 size={22} />
            </div>
            <span className="text-lg font-semibold tracking-normal">Porello</span>
          </div>
          <form action={signInWithDiscord}>
            <button className="inline-flex items-center gap-2 rounded-md border border-[#d8dee9] bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:border-[#a8b2c1] hover:bg-[#f8fafc]">
              <LogIn size={16} />
              Discordでログイン
            </button>
          </form>
        </nav>

        <div className="grid items-end gap-10 py-14 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="max-w-2xl">
            <p className="mb-4 inline-flex rounded-md border border-[#b8ded9] bg-[#ecfdf9] px-3 py-1 text-sm font-medium text-[#0f766e]">
              Private kanban for focused work
            </p>
            <h1 className="text-5xl font-semibold leading-tight tracking-normal text-[#101828] md:text-7xl">
              Porello
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#475467]">
              Discordアカウントで入り、ボード、リスト、カードをすぐに整理できる軽量なカンバンアプリです。
            </p>
            <form action={signInWithDiscord} className="mt-8">
              <button className="inline-flex items-center gap-2 rounded-md bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59]">
                <LogIn size={18} />
                Discordで始める
                <ArrowRight size={18} />
              </button>
            </form>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#d8dee9] bg-[#eef3f8] shadow-xl">
            <div className="flex items-center gap-2 border-b border-[#d8dee9] bg-white px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
            </div>
            <div className="grid grid-cols-3 gap-4 p-4">
              {["Backlog", "Doing", "Done"].map((title, columnIndex) => (
                <div key={title} className="min-h-80 rounded-md bg-[#f8fafc] p-3">
                  <div className="mb-3 text-sm font-semibold text-[#344054]">{title}</div>
                  {Array.from({ length: columnIndex === 2 ? 2 : 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="mb-3 rounded-md border border-[#e4e7ec] bg-white p-3 text-sm text-[#475467] shadow-sm"
                    >
                      <div className="mb-3 h-3 w-3/4 rounded bg-[#cbd5e1]" />
                      <div className="h-2 w-1/2 rounded bg-[#e2e8f0]" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
