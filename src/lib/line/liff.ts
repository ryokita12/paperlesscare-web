"use client";

// LIFF（LINE内で開くPaperlessCare）の初期化とLINE ID tokenの取得。
// LINE userId はクライアントでは扱わない。サーバー（Functions）へは ID token だけを渡し、
// 本人確認はサーバー側で LINE の verify API により行う。

import type { Liff } from "@line/liff";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";

// ローカル検証用：NEXT_PUBLIC_USE_EMULATORS=1 のときだけ、LIFFを使わずに
// エミュレーター用の偽ID token（Functionsエミュレーターの偽LINE verify APIだけが受け付ける）を使う。
// 本番ビルドでは NEXT_PUBLIC_USE_EMULATORS が未設定のため常にLIFFを使う。
const USE_MOCK = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
const MOCK_STORAGE_KEY = "paperlesscare_line_mock_user";

let liffPromise: Promise<Liff> | null = null;

function initLiff(): Promise<Liff> {
  if (!liffPromise) {
    liffPromise = (async () => {
      if (!LIFF_ID) throw new Error("LIFF ID が設定されていません（NEXT_PUBLIC_LIFF_ID）");
      const liff = (await import("@line/liff")).default;
      // LINEアプリ外（PCブラウザ等）で開かれた場合もLINEログインへ誘導する
      await liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: true });
      return liff;
    })();
    liffPromise.catch(() => {
      liffPromise = null;
    });
  }
  return liffPromise;
}

function mockIdToken(): string {
  // ?mockLineUser=U{32桁hex}:表示名 で切り替え。一度指定すると同じタブでは保持する
  const fromUrl = new URLSearchParams(window.location.search).get("mockLineUser");
  if (fromUrl) sessionStorage.setItem(MOCK_STORAGE_KEY, fromUrl);
  const user = sessionStorage.getItem(MOCK_STORAGE_KEY) || `U${"0".repeat(31)}1:テストスタッフ`;
  return `valid:${user}`;
}

/**
 * LINE ID token を返す。LINE未ログインの場合はLINEログインへリダイレクトし null を返す。
 */
export async function getLineIdToken(): Promise<string | null> {
  if (USE_MOCK) return mockIdToken();

  const liff = await initLiff();
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return null;
  }

  const idToken = liff.getIDToken();
  if (!idToken) {
    throw new Error("LINEの認証情報を取得できませんでした。LIFFのScopeに openid が含まれているか確認してください。");
  }
  return idToken;
}

/**
 * ID tokenの期限切れ等でサーバー検証に失敗した場合に、LINEログインをやり直す。
 * 無限ループを避けるため、同じタブでは1回だけ行う。
 * @return やり直しを開始した場合 true
 */
export async function reloginOnce(): Promise<boolean> {
  if (USE_MOCK) return false;

  const key = "paperlesscare_line_relogin";
  if (sessionStorage.getItem(key)) return false;
  sessionStorage.setItem(key, "1");

  const liff = await initLiff();
  if (liff.isLoggedIn()) liff.logout();
  liff.login({ redirectUri: window.location.href });
  return true;
}

export function clearReloginFlag() {
  try {
    sessionStorage.removeItem("paperlesscare_line_relogin");
  } catch {
    // sessionStorageが使えない環境では何もしない
  }
}
