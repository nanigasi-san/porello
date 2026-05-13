import { redirect } from "next/navigation";
import { Columns3, LogIn } from "lucide-react";
import { auth, signIn } from "@/auth";

async function signInWithDiscord() {
  "use server";
  await signIn("discord", { redirectTo: "/boards" });
}

export default async function SignInPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/boards");
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-md rounded-lg border border-[#d8dee9] bg-white p-6 shadow-xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f766e] text-white">
            <Columns3 size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#101828]">Porelloにログイン</h1>
            <p className="text-sm text-[#667085]">Discordアカウントを使います。</p>
          </div>
        </div>
        <form action={signInWithDiscord}>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0f766e] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#115e59]">
            <LogIn size={18} />
            Discordでログイン
          </button>
        </form>
      </section>
    </main>
  );
}
