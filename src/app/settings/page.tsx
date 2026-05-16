import { redirect } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { resetLocalDatabase } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "@/components/profile-form";
import { getCurrentSession } from "@/lib/session";

export default async function SettingsPage() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const displayName = session.user.name ?? session.user.email ?? "";

  return (
    <AppShell session={session}>
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#101828]">設定</h1>
          <p className="mt-2 text-sm leading-6 text-[#667085]">
            カードの担当者、コメント、Discord通知に表示する名前を変更できます。
          </p>
        </div>
        <div className="rounded-lg border border-[#d8dee9] bg-white p-5 shadow-sm">
          <ProfileForm displayName={displayName} />
        </div>
        {process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL ? (
          <div className="mt-6 rounded-lg border border-[#fecdca] bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-[#b42318]">ローカルDBリセット</h2>
              <p className="mt-1 text-sm leading-6 text-[#667085]">
                開発用SQLiteのボード、カード、Webhook設定を削除します。
              </p>
            </div>
            <form action={resetLocalDatabase}>
              <button className="inline-flex items-center justify-center gap-2 rounded-md border border-[#fda29b] bg-white px-4 py-2 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff1f0]">
                <DatabaseZap size={16} />
                DBをリセット
              </button>
            </form>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
