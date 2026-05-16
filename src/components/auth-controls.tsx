import { LogOut, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { signOut } from "@/auth";
import { clearTestLoginCookie } from "@/lib/session";

async function signOutAction() {
  "use server";
  if (process.env.NODE_ENV !== "production") {
    await clearTestLoginCookie();
    redirect("/");
  }

  await signOut({ redirectTo: "/" });
}

export function AuthControls({ session }: { session: Session }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden items-center gap-2 rounded-md border border-[#d8dee9] bg-white px-3 py-2 text-sm text-[#475467] shadow-sm sm:flex">
        <UserRound size={16} />
        <span className="max-w-40 truncate">{session.user?.name ?? "Discord user"}</span>
      </div>
      <form action={signOutAction}>
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d8dee9] bg-white text-[#475467] shadow-sm transition hover:border-[#a8b2c1] hover:text-[#101828]"
          title="ログアウト"
          aria-label="ログアウト"
        >
          <LogOut size={17} />
        </button>
      </form>
    </div>
  );
}
