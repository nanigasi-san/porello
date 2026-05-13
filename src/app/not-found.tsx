import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-[#101828]">ページが見つかりません</h1>
        <p className="mt-2 text-sm text-[#667085]">ボードが削除されたか、アクセスできない可能性があります。</p>
        <Link
          href="/boards"
          className="mt-6 inline-flex rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]"
        >
          ボードへ戻る
        </Link>
      </div>
    </main>
  );
}
