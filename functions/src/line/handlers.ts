/**
 * LINEスタッフ版の認証まわりのCallable Functions。
 *
 * 方針：
 * - クライアントから届くLINE userIdは信用しない。受け取るのはLINE ID tokenだけで、
 *   サーバー側でLINEのverify APIにより本人のLINE userId（sub）を確定させる。
 * - 本人確認できた登録済みスタッフには Firebase Custom Token（uid = line_{sub}）を発行し、
 *   users/{uid}.tenantId をサーバー側で書き込む。以後は既存の Firestore / Storage Rules
 *   （users/{uid}.tenantId でテナントを判定）がそのまま適用される。
 * - スタッフ認証キーはハッシュ値のみ保存し、Admin SDK以外からは読み書きできない
 *   （Rulesの末尾の全拒否ルールにより、tenants/{tenantId} 本体・lineUsers・
 *    staffAuthKeys・lineAuthAttempts はクライアントから一切アクセスできない）。
 *
 * データ：
 *   tenants/{tenantId}            name, staffAuthKeyHash, staffAuthKeyEnabled, ...
 *   staffAuthKeys/{keyHash}       tenantId（キー → 事業所の逆引き。キーは全事業所で一意）
 *   lineUsers/{lineUserId}        tenantId, role, staffName, status, ...
 *   lineAuthAttempts/{lineUserId} 認証キー入力の失敗回数
 *   users/line_{lineUserId}       tenantId, role, authProvider: "line"（既存Rulesの判定元）
 */

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

import {
  EMPTY_ATTEMPT_STATE,
  LINE_VERIFY_ENDPOINT,
  LineIdTokenError,
  hashStaffAuthKey,
  isLocked,
  lineFirebaseUid,
  nextKeyUpdateWindow,
  normalizeStaffName,
  recordFailedAttempt,
  remainingAttempts,
  validateNewStaffAuthKey,
  verifyLineIdToken,
  type AttemptState,
  type KeyUpdateWindow,
  type VerifiedLineIdToken,
} from "./core";

// LINE Login チャネルID（functions/.env）。ID tokenの発行先（aud）の照合に使う。
const LINE_LOGIN_CHANNEL_ID = defineString("LINE_LOGIN_CHANNEL_ID");

type LineUserRole = "staff" | "guardian";
type LineUserStatus = "active" | "disabled";

type LineUserDoc = {
  lineUserId: string;
  firebaseUid: string;
  tenantId: string;
  role: LineUserRole;
  displayName: string;
  staffName: string;
  status: LineUserStatus;
};

type TenantDoc = {
  name?: string;
  staffAuthKeyHash?: string;
  staffAuthKeyEnabled?: boolean;
  staffAuthKeyUpdatedAt?: Timestamp;
  staffAuthKeyUpdateWindow?: KeyUpdateWindow;
};

export type LineSessionResult =
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

const db = () => getFirestore();

/**
 * LINE verify APIのURL。Functionsエミュレーター上でのみ差し替えを許可する
 * （本番では常にLINEの公式エンドポイントを使う）。
 * @return {string} verify APIのURL
 */
function verifyEndpoint(): string {
  const override = process.env.LINE_VERIFY_ENDPOINT;
  if (process.env.FUNCTIONS_EMULATOR === "true" && override) return override;
  return LINE_VERIFY_ENDPOINT;
}

/**
 * リクエストのLINE ID tokenを検証する。失敗時は unauthenticated。
 * @param {unknown} data リクエストデータ
 * @return {Promise<VerifiedLineIdToken>} 検証済みのLINEユーザー
 */
async function verifyRequestIdToken(data: unknown): Promise<VerifiedLineIdToken> {
  const idToken = (data as { idToken?: unknown } | undefined)?.idToken;
  try {
    return await verifyLineIdToken({
      idToken,
      channelId: LINE_LOGIN_CHANNEL_ID.value(),
      endpoint: verifyEndpoint(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("LINE ID token verification failed", { reason: message });
    if (err instanceof LineIdTokenError) {
      throw new HttpsError(
        "unauthenticated",
        "LINEの認証情報を確認できませんでした。LINEから開き直してください。"
      );
    }
    throw new HttpsError("internal", "LINEの認証に失敗しました。");
  }
}

/**
 * Firebase Authユーザーを用意し（表示名＝スタッフ氏名）、Custom Tokenを発行する。
 * @param {object} params 発行パラメータ
 * @return {Promise<string>} Custom Token
 */
async function issueCustomToken(params: {
  uid: string;
  tenantId: string;
  staffName: string;
}): Promise<string> {
  const { uid, tenantId, staffName } = params;
  const auth = getAuth();

  try {
    const existing = await auth.getUser(uid);
    if (existing.displayName !== staffName || existing.disabled) {
      await auth.updateUser(uid, { displayName: staffName, disabled: false });
    }
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    await auth.createUser({ uid, displayName: staffName });
  }

  // テナント判定は users/{uid}.tenantId（既存Rules）で行う。claimsは参照用。
  return auth.createCustomToken(uid, { tenantId, role: "staff", provider: "line" });
}

/**
 * 登録済みスタッフのサインイン処理（users/{uid} の同期とCustom Token発行）。
 * @param {LineUserDoc} lineUser 登録情報
 * @return {Promise<LineSessionResult>} 結果
 */
async function signInStaff(lineUser: LineUserDoc): Promise<LineSessionResult> {
  const tenantSnap = await db().doc(`tenants/${lineUser.tenantId}`).get();
  const tenant = (tenantSnap.data() ?? {}) as TenantDoc;

  // lineUsers を正とし、Rulesの判定元である users/{uid} を毎回揃える
  await db().doc(`users/${lineUser.firebaseUid}`).set(
    {
      tenantId: lineUser.tenantId,
      role: "staff",
      authProvider: "line",
      lineUserId: lineUser.lineUserId,
      displayName: lineUser.staffName,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db().doc(`lineUsers/${lineUser.lineUserId}`).update({
    lastSignInAt: FieldValue.serverTimestamp(),
  });

  const customToken = await issueCustomToken({
    uid: lineUser.firebaseUid,
    tenantId: lineUser.tenantId,
    staffName: lineUser.staffName,
  });

  return {
    status: "ok",
    customToken,
    tenantId: lineUser.tenantId,
    tenantName: tenant.name ?? "",
    staffName: lineUser.staffName,
  };
}

/**
 * 利用停止になったLINEユーザーの業務データへのアクセスを止める。
 * @param {LineUserDoc} lineUser 登録情報
 */
async function revokeStaffAccess(lineUser: LineUserDoc): Promise<void> {
  await db().doc(`users/${lineUser.firebaseUid}`).set(
    { tenantId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * 登録状況に応じた結果を返す（登録済みスタッフならサインイン）。
 * @param {LineUserDoc | undefined} lineUser 登録情報
 * @param {VerifiedLineIdToken} verified 検証済みLINEユーザー
 * @return {Promise<LineSessionResult>} 結果
 */
async function sessionFor(
  lineUser: LineUserDoc | undefined,
  verified: VerifiedLineIdToken
): Promise<LineSessionResult> {
  if (!lineUser) return { status: "unregistered", lineDisplayName: verified.name };
  if (lineUser.status !== "active") {
    await revokeStaffAccess(lineUser);
    return { status: "disabled" };
  }
  if (lineUser.role === "guardian") return { status: "guardian" };
  return signInStaff(lineUser);
}

/**
 * LIFF起動時に呼ぶ。LINE ID tokenを検証し、登録済みスタッフならCustom Tokenを返す。
 * 未登録なら初回登録画面へ進むための status を返す。
 */
export const lineSignIn = onCall(async (req): Promise<LineSessionResult> => {
  const verified = await verifyRequestIdToken(req.data);
  const snap = await db().doc(`lineUsers/${verified.sub}`).get();
  return sessionFor(snap.exists ? (snap.data() as LineUserDoc) : undefined, verified);
});

/**
 * 初回登録：LINE ID token＋スタッフ認証キー＋氏名で事業所スタッフとして登録する。
 */
export const lineRegisterStaff = onCall(async (req): Promise<LineSessionResult> => {
  const data = (req.data ?? {}) as { authKey?: unknown; staffName?: unknown };

  const staffName = normalizeStaffName(data.staffName);
  if (!staffName) {
    throw new HttpsError("invalid-argument", "氏名を入力してください。");
  }
  if (typeof data.authKey !== "string" || !data.authKey.trim() || data.authKey.length > 200) {
    throw new HttpsError("invalid-argument", "認証キーを入力してください。");
  }

  const verified = await verifyRequestIdToken(req.data);
  const lineUserRef = db().doc(`lineUsers/${verified.sub}`);
  const existingSnap = await lineUserRef.get();
  const existing = existingSnap.exists ? (existingSnap.data() as LineUserDoc) : undefined;

  if (existing?.status === "disabled") return sessionFor(existing, verified);
  // 既に登録済みのスタッフ（二重送信・戻る操作など）はそのままサインインさせる
  if (existing?.role === "staff") return sessionFor(existing, verified);

  const attemptRef = db().doc(`lineAuthAttempts/${verified.sub}`);
  const nowMs = Date.now();
  const attemptSnap = await attemptRef.get();
  const attempts: AttemptState = {
    ...EMPTY_ATTEMPT_STATE,
    ...((attemptSnap.data() as Partial<AttemptState> | undefined) ?? {}),
  };

  if (isLocked(attempts, nowMs)) {
    throw new HttpsError(
      "resource-exhausted",
      "認証キーの入力に続けて失敗したため、一時的に登録を停止しています。30分ほど待ってから再度お試しください。"
    );
  }

  const keyHash = hashStaffAuthKey(data.authKey);
  const keySnap = await db().doc(`staffAuthKeys/${keyHash}`).get();
  const tenantId = keySnap.exists ? String(keySnap.get("tenantId") ?? "") : "";
  let tenant: TenantDoc | undefined;
  if (tenantId) {
    tenant = (await db().doc(`tenants/${tenantId}`).get()).data() as TenantDoc | undefined;
  }

  const valid =
    !!tenantId &&
    tenant?.staffAuthKeyHash === keyHash &&
    tenant?.staffAuthKeyEnabled === true;

  if (!valid) {
    const next = recordFailedAttempt(attempts, nowMs);
    await attemptRef.set({ ...next, updatedAt: FieldValue.serverTimestamp() });
    logger.info("lineRegisterStaff: invalid auth key", { locked: isLocked(next, nowMs) });

    if (isLocked(next, nowMs)) {
      throw new HttpsError(
        "resource-exhausted",
        "認証キーの入力に続けて失敗したため、一時的に登録を停止しています。30分ほど待ってから再度お試しください。"
      );
    }
    throw new HttpsError(
      "permission-denied",
      `認証キーが正しくありません。事業所から案内された認証キーをご確認ください（残り${remainingAttempts(next)}回）。`
    );
  }

  const lineUser: LineUserDoc = {
    lineUserId: verified.sub,
    firebaseUid: lineFirebaseUid(verified.sub),
    tenantId,
    role: "staff",
    displayName: verified.name,
    staffName,
    status: "active",
  };

  const batch = db().batch();
  batch.set(lineUserRef, {
    ...lineUser,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(
    db().doc(`users/${lineUser.firebaseUid}`),
    {
      tenantId,
      role: "staff",
      authProvider: "line",
      lineUserId: verified.sub,
      displayName: staffName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  batch.delete(attemptRef);
  await batch.commit();

  logger.info("lineRegisterStaff: registered", { tenantId });
  return signInStaff(lineUser);
});

/**
 * 管理Web（メール/パスワードでログインした事業所の管理者）の呼び出しであることを確認し、
 * 所属テナントIDを返す。テナントは users/{uid}.tenantId（サーバー側で読む）で決める。
 * @param {CallableRequest} req リクエスト
 * @return {Promise<{ uid: string; email: string | null; tenantId: string }>} 呼び出し元
 */
async function requireTenantAdmin(
  req: CallableRequest
): Promise<{ uid: string; email: string | null; tenantId: string }> {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "ログインしてください。");
  }
  // LINEスタッフ（Custom Token）は管理者操作を行えない
  if (req.auth.token.firebase?.sign_in_provider === "custom") {
    throw new HttpsError("permission-denied", "この操作は管理画面からのみ行えます。");
  }

  const userSnap = await db().doc(`users/${req.auth.uid}`).get();
  const tenantId = userSnap.get("tenantId");
  if (typeof tenantId !== "string" || !tenantId || userSnap.get("authProvider") === "line") {
    throw new HttpsError("permission-denied", "事業所に所属していないアカウントです。");
  }

  return {
    uid: req.auth.uid,
    email: typeof req.auth.token.email === "string" ? req.auth.token.email : null,
    tenantId,
  };
}

export type StaffAuthKeyStatus = {
  tenantId: string;
  tenantName: string;
  configured: boolean;
  enabled: boolean;
  updatedAt: string | null;
  lineStaffCount: number;
};

/**
 * 管理Webの「LINEスタッフ設定」表示用。キーそのもの・ハッシュ値は返さない。
 */
export const getStaffAuthKeyStatus = onCall(async (req): Promise<StaffAuthKeyStatus> => {
  const { tenantId } = await requireTenantAdmin(req);

  const tenant = ((await db().doc(`tenants/${tenantId}`).get()).data() ?? {}) as TenantDoc;
  // 単一フィールドの条件だけで取得し（複合インデックス不要）、有効なスタッフを数える
  const lineUsersSnap = await db()
    .collection("lineUsers")
    .where("tenantId", "==", tenantId)
    .select("status", "role")
    .get();
  const lineStaffCount = lineUsersSnap.docs.filter(
    (d) => d.get("status") === "active" && d.get("role") === "staff"
  ).length;

  return {
    tenantId,
    tenantName: tenant.name ?? "",
    configured: !!tenant.staffAuthKeyHash,
    enabled: tenant.staffAuthKeyEnabled === true,
    updatedAt: tenant.staffAuthKeyUpdatedAt?.toDate().toISOString() ?? null,
    lineStaffCount,
  };
});

/**
 * 管理Webから事業所のスタッフ認証キーを設定・変更する。
 * 呼び出し元の所属テナント（users/{uid}.tenantId）のキーだけを変更でき、
 * クライアントが tenantId を指定することはできない。
 */
export const updateStaffAuthKey = onCall(async (req): Promise<{ ok: true }> => {
  const admin = await requireTenantAdmin(req);
  const authKey = (req.data as { authKey?: unknown } | undefined)?.authKey;

  const invalid = validateNewStaffAuthKey(authKey);
  if (invalid) throw new HttpsError("invalid-argument", invalid);

  const keyHash = hashStaffAuthKey(authKey as string);
  const tenantRef = db().doc(`tenants/${admin.tenantId}`);
  const keyRef = db().doc(`staffAuthKeys/${keyHash}`);
  const nowMs = Date.now();

  const outcome = await db().runTransaction(async (tx) => {
    const [tenantSnap, keySnap] = await Promise.all([tx.get(tenantRef), tx.get(keyRef)]);
    const tenant = (tenantSnap.data() ?? {}) as TenantDoc;

    const window = nextKeyUpdateWindow(tenant.staffAuthKeyUpdateWindow, nowMs);
    if (!window) return "rate-limited" as const;

    // 失敗（他事業所と重複）も回数に含め、キーの存在を総当たりで調べられないようにする
    tx.set(tenantRef, { staffAuthKeyUpdateWindow: window }, { merge: true });

    if (keySnap.exists && keySnap.get("tenantId") !== admin.tenantId) {
      return "conflict" as const;
    }

    const oldHash = tenant.staffAuthKeyHash;
    if (oldHash && oldHash !== keyHash) {
      tx.delete(db().doc(`staffAuthKeys/${oldHash}`));
    }

    tx.set(keyRef, { tenantId: admin.tenantId, createdAt: FieldValue.serverTimestamp() });
    tx.set(
      tenantRef,
      {
        staffAuthKeyHash: keyHash,
        staffAuthKeyEnabled: true,
        staffAuthKeyUpdatedAt: FieldValue.serverTimestamp(),
        staffAuthKeyUpdatedBy: { uid: admin.uid, email: admin.email },
      },
      { merge: true }
    );
    return "updated" as const;
  });

  if (outcome === "rate-limited") {
    throw new HttpsError(
      "resource-exhausted",
      "認証キーの変更回数が上限に達しました。1時間ほど待ってから再度お試しください。"
    );
  }
  if (outcome === "conflict") {
    throw new HttpsError(
      "already-exists",
      "この認証キーは使用できません。別の認証キーを指定してください。"
    );
  }

  logger.info("updateStaffAuthKey: updated", { tenantId: admin.tenantId });
  return { ok: true };
});
