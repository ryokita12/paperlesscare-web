// src/app/page.tsx
"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      // 未ログイン or 匿名はログインへ
      if (!u || u.isAnonymous) {
        router.replace("/login");
        return;
      }

      // ログイン済みは users/{uid}.tenantId を見て /t/{tenantId} へ
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const tenantId = snap.exists() ? (snap.data() as any).tenantId : "";

        router.replace(tenantId ? `/t/${tenantId}` : "/login");
      } catch {
        router.replace("/login");
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <main className="min-h-screen bg-zinc-50 flex justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border p-4">
        Redirecting...
      </div>
    </main>
  );
}
