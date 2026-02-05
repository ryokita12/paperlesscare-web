"use client";

import { useEffect } from "react";

export default function UnhandledRejectionGuard() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;

      // ✅ Nextの遷移/HMR等で発生する AbortError は無視
      if (reason?.name === "AbortError") {
        event.preventDefault();
        return;
      }

      // "The user aborted a request." だけ文字列で来るケースも潰す
      const msg = typeof reason?.message === "string" ? reason.message : "";
      if (msg.includes("The user aborted a request")) {
        event.preventDefault();
        return;
      }
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return null;
}
