import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Porello",
  description: "Private kanban boards with Discord sign-in.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
