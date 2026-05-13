import Link from "next/link";
import { ArrowLeft, Columns3, LogIn } from "lucide-react";
import { DemoBoard } from "@/components/demo-board";

export default function DemoPage() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[#d8dee9]/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0f766e] text-white">
              <Columns3 size={20} />
            </span>
            <span className="text-lg font-semibold text-[#101828]">Porello</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden items-center gap-2 rounded-md border border-[#d8dee9] bg-white px-3 py-2 text-sm font-medium text-[#475467] shadow-sm transition hover:border-[#a8b2c1] hover:text-[#101828] sm:inline-flex"
            >
              <ArrowLeft size={16} />
              トップ
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 rounded-md bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59]"
            >
              <LogIn size={16} />
              ログイン
            </Link>
          </div>
        </div>
      </header>
      <DemoBoard />
    </main>
  );
}
