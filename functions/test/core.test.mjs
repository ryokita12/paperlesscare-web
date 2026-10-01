// LINEスタッフ認証の純粋ロジックの単体テスト（npm test。ビルド済みの lib を読む）
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  ATTEMPT_WINDOW_MS,
  EMPTY_ATTEMPT_STATE,
  LOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  MAX_KEY_UPDATES_PER_WINDOW,
  KEY_UPDATE_WINDOW_MS,
  hashStaffAuthKey,
  isLineUserId,
  isLocked,
  lineFirebaseUid,
  nextKeyUpdateWindow,
  normalizeStaffAuthKey,
  normalizeStaffName,
  recordFailedAttempt,
  remainingAttempts,
  validateNewStaffAuthKey,
  verifyLineIdToken,
} from "../lib/line/core.js";

const SUB = "U" + "0123456789abcdef".repeat(2);
const CHANNEL = "2011820567";

test("認証キーは NFKC・trim・小文字化してからハッシュする", () => {
  const expected = createHash("sha256").update("hinayuri").digest("hex");
  assert.equal(hashStaffAuthKey("hinayuri"), expected);
  assert.equal(hashStaffAuthKey("  HINAYURI "), expected);
  assert.equal(hashStaffAuthKey("ｈｉｎａｙｕｒｉ"), expected);
  assert.equal(normalizeStaffAuthKey("ＨｉｎａＹＵＲＩ"), "hinayuri");
  assert.notEqual(hashStaffAuthKey("hinayuri2"), expected);
});

test("新しい認証キーの検証", () => {
  assert.equal(validateNewStaffAuthKey("hinayuri"), null);
  assert.match(validateNewStaffAuthKey("abc") ?? "", /6文字以上/);
  assert.match(validateNewStaffAuthKey("a".repeat(65)) ?? "", /64文字以内/);
  assert.match(validateNewStaffAuthKey("hina yuri") ?? "", /空白/);
  assert.match(validateNewStaffAuthKey(undefined) ?? "", /入力/);
});

test("氏名の整形", () => {
  assert.equal(normalizeStaffName("  山田　太郎 "), "山田 太郎");
  assert.equal(normalizeStaffName(""), null);
  assert.equal(normalizeStaffName("   "), null);
  assert.equal(normalizeStaffName(123), null);
  assert.equal(normalizeStaffName("あ".repeat(41)), null);
});

test("LINE userId と Firebase uid", () => {
  assert.ok(isLineUserId(SUB));
  assert.ok(!isLineUserId("U123"));
  assert.ok(!isLineUserId("../users/x"));
  assert.equal(lineFirebaseUid(SUB), `line_${SUB}`);
});

function fakeFetch(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

test("verifyLineIdToken: 正常な応答なら sub と表示名を返し、client_id を送る", async () => {
  const calls = [];
  const result = await verifyLineIdToken({
    idToken: "tok",
    channelId: CHANNEL,
    fetchImpl: fakeFetch(200, {
      iss: "https://access.line.me",
      sub: SUB,
      aud: CHANNEL,
      exp: Math.floor(Date.now() / 1000) + 600,
      name: "やまだ",
    }, calls),
  });
  assert.deepEqual(result, { sub: SUB, name: "やまだ" });
  assert.equal(calls[0].url, "https://api.line.me/oauth2/v2.1/verify");
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("id_token"), "tok");
  assert.equal(body.get("client_id"), CHANNEL);
});

test("verifyLineIdToken: LINEに拒否された・aud/iss/subが不正なら失敗する", async () => {
  const ok = {
    iss: "https://access.line.me",
    sub: SUB,
    aud: CHANNEL,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const cases = [
    fakeFetch(400, { error: "invalid_request" }),
    fakeFetch(200, { ...ok, aud: "9999999999" }),
    fakeFetch(200, { ...ok, iss: "https://evil.example" }),
    fakeFetch(200, { ...ok, sub: "attacker-chosen" }),
    fakeFetch(200, { ...ok, exp: Math.floor(Date.now() / 1000) - 10 }),
  ];
  for (const fetchImpl of cases) {
    await assert.rejects(
      verifyLineIdToken({ idToken: "tok", channelId: CHANNEL, fetchImpl }),
      { name: "Error" }
    );
  }
  await assert.rejects(verifyLineIdToken({ idToken: "", channelId: CHANNEL, fetchImpl: cases[1] }));
  await assert.rejects(verifyLineIdToken({ idToken: "tok", channelId: "", fetchImpl: cases[1] }));
});

test("認証キー入力の失敗回数：5回でロックし、時間経過で解除", () => {
  const now = 1_000_000_000;
  let state = EMPTY_ATTEMPT_STATE;
  for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
    state = recordFailedAttempt(state, now + i);
    assert.ok(!isLocked(state, now + i));
    assert.equal(remainingAttempts(state), MAX_FAILED_ATTEMPTS - i);
  }
  state = recordFailedAttempt(state, now + 10);
  assert.ok(isLocked(state, now + 10));
  assert.ok(!isLocked(state, now + 10 + LOCK_DURATION_MS + 1));

  // 窓の外の失敗は数え直し
  const old = recordFailedAttempt(EMPTY_ATTEMPT_STATE, now);
  const fresh = recordFailedAttempt(old, now + ATTEMPT_WINDOW_MS + 1);
  assert.equal(fresh.failedCount, 1);
});

test("認証キー変更の回数制限", () => {
  const now = 5_000_000;
  let w = nextKeyUpdateWindow(undefined, now);
  for (let i = 1; i < MAX_KEY_UPDATES_PER_WINDOW; i++) w = nextKeyUpdateWindow(w, now + i);
  assert.equal(w.count, MAX_KEY_UPDATES_PER_WINDOW);
  assert.equal(nextKeyUpdateWindow(w, now + 100), null);
  assert.deepEqual(nextKeyUpdateWindow(w, now + KEY_UPDATE_WINDOW_MS), {
    startMs: now + KEY_UPDATE_WINDOW_MS,
    count: 1,
  });
});
