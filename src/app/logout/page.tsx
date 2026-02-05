"use client";

import { useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // ログアウト後の遷移先（任意）
        const next = sp.get("next") || "/login";

        await signOut(auth);

        // useEffect の中で await 後に遷移するので、unmount/中断ケア
        if (cancelled || !mountedRef.current) return;

        router.replace(next);
      } catch (e: any) {
        // ✅ 遷移/HMR等で中断された AbortError は無視
        if (e?.name === "AbortError") return;

        // ここに来るのは本当のエラー
        console.error("Logout failed:", e);
        if (cancelled || !mountedRef.current) return;
        router.replace("/login");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [router, sp]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-sm text-zinc-600">Signing out...</div>
    </main>
  );
}
