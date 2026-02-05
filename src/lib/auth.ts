// src/lib/auth.ts
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

export function useRequireAuth() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      // ✅ hook内では遷移しない（これが重要）
      // 匿名は未ログイン扱いに統一
      setUser(u && !u.isAnonymous ? u : null);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { user, loading };
}
