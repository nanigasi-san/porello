import { redirect } from "next/navigation";
import { ArrowRight, Columns3, LogIn } from "lucide-react";
import Link from "next/link";
import { hasDiscordOAuthConfig, signIn } from "@/auth";
import { getCurrentSession } from "@/lib/session";

async function signInWithDiscord() {
  "use server";
  if (!hasDiscordOAuthConfig()) {
    redirect("/demo");
  }

  await signIn("discord", { redirectTo: "/boards" });
}

export default async function Home() {
  const session = await getCurrentSession();

  if (session?.user) {
    redirect("/boards");
  }

  return (
    <main className="min-h-screen px-5 py-5 sm:py-6">
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-6xl flex-col">
        <nav className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f766e] text-white">
              <Columns3 size={22} />
            </div>
            <span className="text-lg font-semibold tracking-normal">Porello</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/demo"
              className="hidden rounded-md border border-[#d8dee9] bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:border-[#a8b2c1] hover:bg-[#f8fafc] sm:inline-flex"
            >
              デモ
            </Link>
            <form action={signInWithDiscord}>
              <button className="inline-flex items-center gap-2 rounded-md border border-[#d8dee9] bg-white px-3 py-2 text-sm font-medium shadow-sm transition hover:border-[#a8b2c1] hover:bg-[#f8fafc] sm:px-4">
                <LogIn size={16} />
                <span className="hidden sm:inline">Discordでログイン</span>
                <span className="sm:hidden">ログイン</span>
              </button>
            </form>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-8 py-10 sm:py-12 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="max-w-2xl">
            <p className="mb-4 inline-flex rounded-md border border-[#b8ded9] bg-[#ecfdf9] px-3 py-1 text-sm font-medium text-[#0f766e]">
              Private kanban for focused work
            </p>
            <h1 className="text-5xl font-semibold leading-tight tracking-normal text-[#101828] md:text-7xl">
              Porello
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#475467]">
              Discordアカウントで入り、担当者へのメンション通知までつなげられる軽量なカンバンアプリです。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <form action={signInWithDiscord}>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59] sm:w-auto">
                  <LogIn size={18} />
                  Discordで始める
                  <ArrowRight size={18} />
                </button>
              </form>
              <Link
                href="/demo"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#d8dee9] bg-white px-5 py-3 text-sm font-semibold text-[#344054] shadow-sm transition hover:border-[#a8b2c1] hover:bg-[#f8fafc] sm:w-auto"
              >
                ログインせずに試す
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#d8dee9] bg-[#eef3f8] shadow-xl">
            <div className="flex items-center gap-2 border-b border-[#d8dee9] bg-white px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
              <span className="ml-auto text-xs text-[#667085] sm:hidden">横にスクロール</span>
            </div>
            <div className="overflow-x-auto p-4">
              <div className="grid min-w-[34rem] grid-cols-3 gap-4 sm:min-w-0">
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
        </div>
      </section>
    </main>
  );
}
