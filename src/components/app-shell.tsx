import Link from "next/link";
import { Columns3 } from "lucide-react";
import type { Session } from "next-auth";
import { AuthControls } from "@/components/auth-controls";

export function AppShell({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session;
}) {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[#d8dee9]/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/boards" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f766e] text-white">
              <Columns3 size={20} />
            </span>
            <span className="text-lg font-semibold text-[#101828]">Porello</span>
          </Link>
          <AuthControls session={session} />
        </div>
      </header>
      {children}
    </main>
  );
}
