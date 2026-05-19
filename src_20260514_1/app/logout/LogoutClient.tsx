"use client";

import { useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";

export default function LogoutClient() {
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
        const next = sp.get("next") || "/login";
        await signOut(auth);

        if (cancelled || !mountedRef.current) return;
        router.replace(next);
      } catch (e: any) {
        if (e?.name === "AbortError") return;

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