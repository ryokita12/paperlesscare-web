// src/app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <main className="min-h-screen bg-zinc-50 flex justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border p-4">
        Redirecting...
      </div>
    </main>
  );
}