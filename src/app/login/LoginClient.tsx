"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";

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
      const snap = await getDoc(doc(db, "users", uid));
      const tenantId = snap.exists() ? (snap.data() as any).tenantId : "";

      router.replace(tenantId ? `/t/${tenantId}` : "/login");
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (mountedRef.current) {
        setMsg(`❌ ${e?.code || "auth_error"}: ${e?.message || String(e)}`);
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 flex justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border p-4 space-y-4">
        <h1 className="text-lg font-bold text-center">Login</h1>

        <input
          className="w-full border rounded-lg p-2 text-sm"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="w-full border rounded-lg p-2 text-sm"
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button
          disabled={busy || !email || !password}
          onClick={onLogin}
          className="w-full rounded-lg border p-2 text-sm"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>

        {msg && <div className="text-xs break-all">{msg}</div>}
      </div>
    </main>
  );
}