/**
 * LINEスタッフ認証の純粋ロジック（Firebaseに依存しない）。
 * test/*.test.mjs から lib/line/core.js を直接テストできるよう、
 * firebase-admin / firebase-functions を import しない。
 */

import { createHash } from "node:crypto";

// ===== スタッフ認証キー =====

export const STAFF_AUTH_KEY_MIN_LENGTH = 6;
export const STAFF_AUTH_KEY_MAX_LENGTH = 64;

/**
 * 認証キーの正規化。全角/半角・大文字/小文字・前後の空白の違いで
 * 「同じキーなのに通らない」ことがないよう、NFKC → trim → 小文字化する。
 * @param {string} raw 入力されたキー
 * @return {string} 正規化後のキー
 */
export function normalizeStaffAuthKey(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

/**
 * 保存・照合に使うハッシュ値（SHA-256の16進文字列）。平文のキーは保存しない。
 * @param {string} raw 入力されたキー
 * @return {string} ハッシュ値
 */
export function hashStaffAuthKey(raw: string): string {
  return createHash("sha256").update(normalizeStaffAuthKey(raw), "utf8").digest("hex");
}

/**
 * 管理Webから新しく設定するキーの検証。問題があればエラーメッセージを返す。
 * @param {unknown} raw 入力値
 * @return {string | null} エラーメッセージ（問題なければnull）
 */
export function validateNewStaffAuthKey(raw: unknown): string | null {
  if (typeof raw !== "string") return "認証キーを入力してください。";
  const key = normalizeStaffAuthKey(raw);
  if (key.length < STAFF_AUTH_KEY_MIN_LENGTH) {
    return `認証キーは${STAFF_AUTH_KEY_MIN_LENGTH}文字以上で入力してください。`;
  }
  if (key.length > STAFF_AUTH_KEY_MAX_LENGTH) {
    return `認証キーは${STAFF_AUTH_KEY_MAX_LENGTH}文字以内で入力してください。`;
  }
  if (/\s/.test(key)) return "認証キーに空白は使用できません。";
  return null;
}

// ===== スタッフ氏名 =====

export const STAFF_NAME_MAX_LENGTH = 40;

/**
 * 氏名の検証と整形。不正ならnull。
 * @param {unknown} raw 入力値
 * @return {string | null} 整形後の氏名
 */
export function normalizeStaffName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name || name.length > STAFF_NAME_MAX_LENGTH) return null;
  return name;
}

// ===== LINE userId と Firebase uid =====

// LINEのuserId（ID tokenのsub）は "U" + 32桁の16進数
const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

/**
 * LINE userId の形式チェック。
 * @param {string} sub ID tokenのsub
 * @return {boolean} 形式が正しいか
 */
export function isLineUserId(sub: string): boolean {
  return LINE_USER_ID_PATTERN.test(sub);
}

/**
 * LINEスタッフのFirebase uid。メール/パスワードのuidと衝突しないよう接頭辞を付ける。
 * @param {string} lineUserId LINE userId
 * @return {string} Firebase uid
 */
export function lineFirebaseUid(lineUserId: string): string {
  return `line_${lineUserId}`;
}

// ===== LINE ID token 検証 =====

export const LINE_VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";
const LINE_ISSUER = "https://access.line.me";

export class LineIdTokenError extends Error {}

export type VerifiedLineIdToken = {
  sub: string;
  name: string;
};

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * LINE ID token をLINEのverify APIで検証し、本人のLINE userIdを返す。
 * 署名・有効期限・発行先（aud = 自チャネル）の検証はLINE側で行われるが、
 * 応答の iss / aud / sub もここで再確認する。
 * @param {object} params 検証パラメータ
 * @return {Promise<VerifiedLineIdToken>} 検証済みのsub・表示名
 */
export async function verifyLineIdToken(params: {
  idToken: unknown;
  channelId: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
}): Promise<VerifiedLineIdToken> {
  const { idToken, channelId } = params;
  const endpoint = params.endpoint ?? LINE_VERIFY_ENDPOINT;
  const fetchImpl = params.fetchImpl ?? (fetch as unknown as FetchLike);

  if (typeof idToken !== "string" || !idToken || idToken.length > 4096) {
    throw new LineIdTokenError("idToken is required");
  }
  if (!channelId) {
    throw new LineIdTokenError("LINE channel is not configured");
  }

  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString(),
  });

  if (!res.ok) {
    // 期限切れ・改ざん・別チャネルのtoken等。応答本文はログに出さない。
    throw new LineIdTokenError(`LINE verify rejected (${res.status})`);
  }

  const payload = (await res.json()) as {
    iss?: unknown;
    sub?: unknown;
    aud?: unknown;
    exp?: unknown;
    name?: unknown;
  };

  if (payload.iss !== LINE_ISSUER) throw new LineIdTokenError("unexpected issuer");
  if (payload.aud !== channelId) throw new LineIdTokenError("unexpected audience");
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    throw new LineIdTokenError("token expired");
  }
  if (typeof payload.sub !== "string" || !isLineUserId(payload.sub)) {
    throw new LineIdTokenError("unexpected subject");
  }

  return {
    sub: payload.sub,
    name: typeof payload.name === "string" ? payload.name.slice(0, 100) : "",
  };
}

// ===== 認証キー入力の失敗回数制限 =====

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 30 * 60 * 1000;
export const LOCK_DURATION_MS = 30 * 60 * 1000;

export type AttemptState = {
  failedCount: number;
  windowStartMs: number;
  lockedUntilMs: number;
};

export const EMPTY_ATTEMPT_STATE: AttemptState = {
  failedCount: 0,
  windowStartMs: 0,
  lockedUntilMs: 0,
};

/**
 * ロック中かどうか。
 * @param {AttemptState} state 現在の状態
 * @param {number} nowMs 現在時刻
 * @return {boolean} ロック中ならtrue
 */
export function isLocked(state: AttemptState, nowMs: number): boolean {
  return state.lockedUntilMs > nowMs;
}

/**
 * 認証キーの入力失敗を1回記録した後の状態。
 * 一定時間内に MAX_FAILED_ATTEMPTS 回失敗したらロックする。
 * @param {AttemptState} state 現在の状態
 * @param {number} nowMs 現在時刻
 * @return {AttemptState} 記録後の状態
 */
export function recordFailedAttempt(state: AttemptState, nowMs: number): AttemptState {
  const inWindow = nowMs - state.windowStartMs < ATTEMPT_WINDOW_MS;
  const failedCount = inWindow ? state.failedCount + 1 : 1;
  const windowStartMs = inWindow ? state.windowStartMs : nowMs;

  if (failedCount >= MAX_FAILED_ATTEMPTS) {
    return { failedCount: 0, windowStartMs: nowMs, lockedUntilMs: nowMs + LOCK_DURATION_MS };
  }
  return { failedCount, windowStartMs, lockedUntilMs: 0 };
}

/**
 * ロックまでに残っている入力回数。
 * @param {AttemptState} state 現在の状態
 * @return {number} 残り回数
 */
export function remainingAttempts(state: AttemptState): number {
  return Math.max(0, MAX_FAILED_ATTEMPTS - state.failedCount);
}

// ===== 管理Webからの認証キー変更回数制限 =====

export const KEY_UPDATE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_KEY_UPDATES_PER_WINDOW = 10;

export type KeyUpdateWindow = { startMs: number; count: number };

/**
 * 認証キー変更を1回行った後の回数枠。上限超過なら null。
 * （キーは全事業所で一意のため、変更の可否から他事業所のキーを推測されないよう回数を絞る）
 * @param {KeyUpdateWindow | undefined} prev 現在の回数枠
 * @param {number} nowMs 現在時刻
 * @return {KeyUpdateWindow | null} 更新後の回数枠
 */
export function nextKeyUpdateWindow(
  prev: KeyUpdateWindow | undefined,
  nowMs: number
): KeyUpdateWindow | null {
  if (!prev || nowMs - prev.startMs >= KEY_UPDATE_WINDOW_MS) {
    return { startMs: nowMs, count: 1 };
  }
  if (prev.count >= MAX_KEY_UPDATES_PER_WINDOW) return null;
  return { startMs: prev.startMs, count: prev.count + 1 };
}
