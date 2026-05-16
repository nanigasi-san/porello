import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Columns3, LogIn } from "lucide-react";
import { hasDiscordOAuthConfig, signIn } from "@/auth";
import { getCurrentSession } from "@/lib/session";

async function signInWithDiscord() {
  "use server";
  if (!hasDiscordOAuthConfig()) {
    redirect("/demo");
  }

  await signIn("discord", { redirectTo: "/boards" });
}

export default async function SignInPage() {
  const session = await getCurrentSession();

  if (session?.user) {
    redirect("/boards");
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-md rounded-lg border border-[#d8dee9] bg-white p-6 shadow-xl">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-[#667085] hover:text-[#0f766e]">
          <ArrowLeft size={16} />
          トップへ戻る
        </Link>
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f766e] text-white">
            <Columns3 size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#101828]">Porelloにログイン</h1>
            <p className="text-sm text-[#667085]">Discord設定前はデモを開きます。</p>
          </div>
        </div>
        <form action={signInWithDiscord}>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0f766e] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#115e59]">
            <LogIn size={18} />
            Discordでログイン
          </button>
        </form>
        <Link
          href="/demo"
          className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-[#d8dee9] bg-white px-4 py-3 text-sm font-semibold text-[#344054] transition hover:border-[#a8b2c1] hover:bg-[#f8fafc]"
        >
          ログインせずにデモを触る
        </Link>
        {process.env.NODE_ENV !== "production" ? (
          <form action="/api/test-login" method="post">
            <button className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-[#b8ded9] bg-[#ecfdf9] px-4 py-3 text-sm font-semibold text-[#0f766e] transition hover:bg-[#d8f5ef]">
              テストログイン
            </button>
          </form>
        ) : null}
        <p className="mt-4 text-xs leading-5 text-[#667085]">
          本番利用にはDiscord OAuthとNeon Postgresの環境変数が必要です。デモでは保存されません。
        </p>
      </section>
    </main>
  );
}
