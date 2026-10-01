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
  // ノッチ・ホームバーのある端末でも、safe-area を自前で確保して全面に描画する
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function LineLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#f6faf8] text-zinc-900 [-webkit-tap-highlight-color:transparent]">
      <header className="sticky top-0 z-10 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-center px-4">
          <Image
            src="/PaperlessCare_Logo.png"
            alt="PaperlessCare"
            width={160}
            height={48}
            style={{ width: "auto", height: "28px" }}
            priority
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-5 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]">
        <LineSessionProvider>{children}</LineSessionProvider>
      </main>
    </div>
  );
}
