"use client";

// LINEスタッフ版のセッション。
// 起動のたびに「LIFFでLINE ID token取得 → lineSignIn（サーバーで本人確認）→
// Firebase Custom Tokenでサインイン」を自動で行い、ユーザーには何も入力させない。
// 未登録のLINEユーザーは初回登録画面へ、登録済みスタッフはスタッフTOPへ振り分ける。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import { clearReloginFlag, getLineIdToken, reloginOnce } from "@/lib/line/liff";
import { friendlyErrorMessage, LineCenteredMessage, LineSpinner } from "./ui";

type LineSessionResult =
  | {
      status: "ok";
      customToken: string;
      tenantId: string;
      tenantName: string;
      staffName: string;
    }
  | { status: "unregistered"; lineDisplayName: string }
  | { status: "guardian" }
  | { status: "disabled" };

export type LineSession =
  | { phase: "loading" }
  | { phase: "redirecting" }
  | { phase: "error"; message: string }
  | { phase: "unregistered"; lineDisplayName: string }
  | { phase: "guardian" }
  | { phase: "disabled" }
  | { phase: "ready"; tenantId: string; tenantName: string; staffName: string };

type ContextValue = {
  session: LineSession;
  registerStaff: (params: { authKey: string; staffName: string }) => Promise<void>;
  retry: () => void;
};

const LineSessionContext = createContext<ContextValue | null>(null);

export function useLineSession(): ContextValue {
  const ctx = useContext(LineSessionContext);
  if (!ctx) throw new Error("useLineSession must be used inside LineSessionProvider");
  return ctx;
}

/** スタッフとしてサインイン済みのセッション（スタッフ用画面で使う） */
export function useLineStaff() {
  const { session } = useLineSession();
  if (session.phase !== "ready") {
    throw new Error("useLineStaff is only available after sign-in");
  }
  return session;
}

function errorCode(e: unknown): string {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const REGISTER_PATH = "/line/register";
const HOME_PATH = "/line/home";

export default function LineSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<LineSession>({ phase: "loading" });
  const startedRef = useRef(false);

  // サーバーの結果を画面の状態に反映する（スタッフならFirebaseへサインイン）
  const applyResult = useCallback(async (result: LineSessionResult) => {
    switch (result.status) {
      case "ok":
        await signInWithCustomToken(auth, result.customToken);
        clearReloginFlag();
        setSession({
          phase: "ready",
          tenantId: result.tenantId,
          tenantName: result.tenantName,
          staffName: result.staffName,
        });
        return;
      case "unregistered":
        clearReloginFlag();
        setSession({ phase: "unregistered", lineDisplayName: result.lineDisplayName });
        return;
      case "guardian":
        setSession({ phase: "guardian" });
        return;
      case "disabled":
        setSession({ phase: "disabled" });
        return;
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const idToken = await getLineIdToken();
      if (!idToken) {
        setSession({ phase: "redirecting" });
        return;
      }

      const lineSignIn = httpsCallable<{ idToken: string }, LineSessionResult>(functions, "lineSignIn");
      const res = await lineSignIn({ idToken });
      await applyResult(res.data);
    } catch (e) {
      // ID tokenの期限切れ等はLINEログインをやり直せば解消する
      if (errorCode(e) === "functions/unauthenticated" && (await reloginOnce())) {
        setSession({ phase: "redirecting" });
        return;
      }
      console.error("[line] sign-in failed", errorCode(e), errorMessage(e));
      setSession({
        phase: "error",
        message: friendlyErrorMessage(
          e,
          "通信状況を確認して、もう一度お試しください。\n解決しない場合は、LINEを閉じて開き直してください。"
        ),
      });
    }
  }, [applyResult]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // 状態の更新はすべて非同期処理の完了後（コールバック内）に行う
    void Promise.resolve().then(start);
  }, [start]);

  const registerStaff = useCallback(
    async (params: { authKey: string; staffName: string }) => {
      const idToken = await getLineIdToken();
      if (!idToken) return;

      const lineRegisterStaff = httpsCallable<
        { idToken: string; authKey: string; staffName: string },
        LineSessionResult
      >(functions, "lineRegisterStaff");
      // 認証キー誤り等のエラーは呼び出し元（登録画面）で表示する
      const res = await lineRegisterStaff({ idToken, ...params });
      await applyResult(res.data);
    },
    [applyResult]
  );

  // 状態に応じた画面への振り分け
  useEffect(() => {
    if (session.phase === "unregistered" && pathname !== REGISTER_PATH) {
      router.replace(REGISTER_PATH);
    }
    if (session.phase === "ready" && (pathname === "/line" || pathname === REGISTER_PATH)) {
      router.replace(HOME_PATH);
    }
  }, [session.phase, pathname, router]);

  const retry = useCallback(() => {
    setSession({ phase: "loading" });
    void start();
  }, [start]);

  const value: ContextValue = { session, registerStaff, retry };

  let content: ReactNode = children;
  if (session.phase === "loading" || session.phase === "redirecting") {
    content = <LineSpinner label="PaperlessCare を起動しています" />;
  } else if (session.phase === "error") {
    content = (
      <LineCenteredMessage
        title="うまく起動できませんでした"
        tone="error"
        body={session.message}
        action={{ label: "もう一度試す", onClick: retry }}
      />
    );
  } else if (session.phase === "guardian") {
    content = (
      <LineCenteredMessage title="PaperlessCare" body="利用者・保護者向け機能は現在準備中です。" />
    );
  } else if (session.phase === "disabled") {
    content = (
      <LineCenteredMessage
        title="ご利用いただけません"
        body="このLINEアカウントの利用は停止されています。事業所の管理者にお問い合わせください。"
      />
    );
  } else if (session.phase === "unregistered" && pathname !== REGISTER_PATH) {
    content = <LineSpinner />;
  } else if (session.phase === "ready" && (pathname === "/line" || pathname === REGISTER_PATH)) {
    content = <LineSpinner />;
  }

  return <LineSessionContext.Provider value={value}>{content}</LineSessionContext.Provider>;
}
