// LINEスタッフ版（LIFF）のレイアウト。
// 管理Web（AppShell・サイドメニュー）とは独立した、スマートフォン専用の1カラム画面。
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import LineSessionProvider from "./LineSessionProvider";

export const metadata: Metadata = {
  title: "PaperlessCare",
  description: "PaperlessCare LINEスタッフ版",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ecfdf5",
};

export default function LineLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-emerald-50 via-white to-white text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-emerald-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-center px-4 py-3">
          <Image
            src="/PaperlessCare_Logo.png"
            alt="PaperlessCare"
            width={160}
            height={48}
            style={{ width: "auto", height: "32px" }}
            priority
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-10 pt-4">
        <LineSessionProvider>{children}</LineSessionProvider>
      </main>
    </div>
  );
}
