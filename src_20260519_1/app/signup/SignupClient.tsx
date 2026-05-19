// src/app/signup/SignupClient.tsx
"use client";

import { useMemo, useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, useSearchParams } from "next/navigation";

export default function SignupClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => sp.get("next") || "/", [sp]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const onSignup = async () => {
    setBusy(true);
    setMsg("");
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      router.replace(next);
    } catch (e: any) {
      setMsg(`❌ ${e.code || "auth_error"}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 flex justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border p-4 space-y-4">
        <h1 className="text-lg font-bold text-center">Sign up</h1>

        <input
          className="w-full border rounded-lg p-2 text-sm"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="w-full border rounded-lg p-2 text-sm"
          placeholder="password (6+ chars)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />

        <button
          disabled={busy || !email || password.length < 6}
          onClick={onSignup}
          className="w-full rounded-lg border p-2 text-sm"
        >
          {busy ? "Creating..." : "Create account"}
        </button>

        {msg && <div className="text-xs break-all">{msg}</div>}

        <button
          className="w-full text-sm underline"
          onClick={() => router.push(`/login?next=${encodeURIComponent(next)}`)}
          disabled={busy}
        >
          Back to login
        </button>
      </div>
    </main>
  );
}