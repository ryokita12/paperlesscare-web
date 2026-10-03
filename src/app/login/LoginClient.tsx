"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onLogin = async () => {
    if (busy) return;
    setBusy(true);
    setMsg("");

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const next = sp.get("next");
      if (next) {
        router.replace(next);
        return;
      }

      const uid = cred.user.uid;
      const idToken = await cred.user.getIdToken();
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      const res = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );

      if (!res.ok) {
        throw new Error(`tenant fetch failed: ${res.status}`);
      }

      const data = await res.json();
      const tenantId = data.fields?.tenantId?.stringValue || "";

      router.replace(tenantId ? `/t/${tenantId}/today` : "/login");
    } catch (e: any) {
      console.error("[LOGIN] ERROR", e);

      if (e?.name === "AbortError") return;

      if (mountedRef.current) {
        setMsg(`❌ ${e?.code || "auth_error"}: ${e?.message || String(e)}`);
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white/90 backdrop-blur rounded-3xl shadow-xl border border-emerald-100 px-8 py-7 space-y-5">

          <div className="text-center space-y-3">
            <Image
              src="/PaperlessCare_Logo.png"
              alt="PaperlessCare"
              width={250}
              height={90}
              className="mx-auto"
              style={{ width: "auto", height: "auto" }}
              priority
            />

            <p className="mt-1 text-sm text-zinc-500">
              受給者証・支援情報を、もっとスマートに管理
            </p>
          </div>

          <div className="space-y-3">
            <input
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:bg-white"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <input
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:bg-white"
              placeholder="パスワード"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            disabled={busy || !email || !password}
            onClick={onLogin}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-white"
          >
            {busy ? "ログイン中..." : "ログイン"}
          </button>

          {msg && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-600 break-all">
              {msg}
            </div>
          )}

          <p className="text-center text-xs text-zinc-400">
            © LinkBook Inc.
          </p>
        </div>
      </div>
    </main>
  );
}