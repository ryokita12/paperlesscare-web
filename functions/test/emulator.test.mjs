// LINEスタッフ認証のエミュレーター結合テスト（npm run test:emulator）。
// Auth / Firestore（本番と同じ firestore.rules）/ Functions エミュレーター上で、
// LINE verify API だけを偽サーバーに差し替えて一連の流れを確認する。
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const PROJECT = "demo-paperlesscare";
const CHANNEL = "2011820567";
const FN = `http://127.0.0.1:5001/${PROJECT}/asia-northeast1`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";

const SUB_A = "U" + "a".repeat(32);
const SUB_B = "U" + "b".repeat(32);
const SUB_C = "U" + "c".repeat(32);
const SUB_D = "U" + "d".repeat(32);

// ---- 偽 LINE verify API（functions/.env.local の LINE_VERIFY_ENDPOINT が指す） ----
// id_token "valid:{sub}:{name}" だけを正しいtokenとして扱う
let lineServer;
before(async () => {
  lineServer = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const [kind, sub, name] = (params.get("id_token") ?? "").split(":");
      if (params.get("client_id") !== CHANNEL || kind !== "valid") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_request", error_description: "Invalid IdToken." }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        iss: "https://access.line.me",
        sub,
        aud: CHANNEL,
        exp: Math.floor(Date.now() / 1000) + 600,
        iat: Math.floor(Date.now() / 1000),
        name: name ?? "",
      }));
    });
  });
  await new Promise((r) => lineServer.listen(9876, "127.0.0.1", r));
});
after(() => lineServer?.close());

// ---- helpers ----
async function callFn(name, data, idToken) {
  const res = await fetch(`${FN}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const json = await res.json();
  return json.error ? { error: json.error } : { result: json.result };
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "boolean") fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  return { fields };
}

// rulesを無視する管理者アクセス（テストデータの投入・確認用）
async function ownerSet(path, obj) {
  const res = await fetch(`${FS}/${path}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify(toFields(obj)),
  });
  assert.equal(res.status, 200, `ownerSet ${path}`);
}

async function ownerGet(path) {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: "Bearer owner" } });
  return res.status === 200 ? res.json() : null;
}

// rules を適用したクライアントとしてのアクセス
async function clientGet(path, idToken) {
  const res = await fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${idToken}` } });
  return res.status;
}

async function clientPatch(path, idToken, obj) {
  const res = await fetch(`${FS}/${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(toFields(obj)),
  });
  return res.status;
}

async function emailUser(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
  });
  const json = await res.json();
  return { uid: json.localId, idToken: json.idToken };
}

async function signInWithCustomToken(token) {
  const res = await fetch(`${AUTH}/accounts:signInWithCustomToken?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, returnSecureToken: true }),
  });
  const json = await res.json();
  assert.ok(json.idToken, "custom token sign-in");
  return json.idToken;
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// ---- テスト ----
let admin1;
let admin2;
let staffAToken;

test("準備：2事業所と管理者（メール/パスワード）", async () => {
  admin1 = await emailUser("admin1@example.com");
  admin2 = await emailUser("admin2@example.com");
  await ownerSet(`users/${admin1.uid}`, { tenantId: "t-hinayuri" });
  await ownerSet(`users/${admin2.uid}`, { tenantId: "t-other" });
  await ownerSet("tenants/t-hinayuri", { name: "みどり児童支援センターひなゆり" });
  await ownerSet("tenants/t-hinayuri/beneficiaries/b1", { tenantId: "t-hinayuri" });
  await ownerSet("tenants/t-other/beneficiaries/b2", { tenantId: "t-other" });
});

test("updateStaffAuthKey：未ログイン・短すぎるキーは拒否", async () => {
  assert.equal((await callFn("updateStaffAuthKey", { authKey: "hinayuri" })).error.status, "UNAUTHENTICATED");
  assert.equal(
    (await callFn("updateStaffAuthKey", { authKey: "abc" }, admin1.idToken)).error.status,
    "INVALID_ARGUMENT"
  );
});

test("管理者が認証キー hinayuri を設定：ハッシュのみ保存され、平文は残らない", async () => {
  const before = await callFn("getStaffAuthKeyStatus", {}, admin1.idToken);
  assert.equal(before.result.configured, false);

  const res = await callFn("updateStaffAuthKey", { authKey: "hinayuri" }, admin1.idToken);
  assert.deepEqual(res.result, { ok: true });

  const tenant = await ownerGet("tenants/t-hinayuri");
  assert.equal(tenant.fields.staffAuthKeyHash.stringValue, sha256("hinayuri"));
  assert.equal(tenant.fields.staffAuthKeyEnabled.booleanValue, true);
  assert.equal(tenant.fields.name.stringValue, "みどり児童支援センターひなゆり");
  assert.ok(!JSON.stringify(tenant).includes("\"hinayuri\""));
  const index = await ownerGet(`staffAuthKeys/${sha256("hinayuri")}`);
  assert.equal(index.fields.tenantId.stringValue, "t-hinayuri");

  const status = await callFn("getStaffAuthKeyStatus", {}, admin1.idToken);
  assert.equal(status.result.configured, true);
  assert.equal(status.result.tenantName, "みどり児童支援センターひなゆり");
  assert.ok(!JSON.stringify(status.result).includes(sha256("hinayuri")));
});

test("他事業所は同じキーを設定できない", async () => {
  const res = await callFn("updateStaffAuthKey", { authKey: "HINAYURI" }, admin2.idToken);
  assert.equal(res.error.status, "ALREADY_EXISTS");
});

test("クライアントは tenants 本体・staffAuthKeys・lineUsers を読めない（Rules未変更）", async () => {
  assert.equal(await clientGet("tenants/t-hinayuri", admin1.idToken), 403);
  assert.equal(await clientGet(`staffAuthKeys/${sha256("hinayuri")}`, admin1.idToken), 403);
  assert.equal(await clientGet(`lineUsers/${SUB_A}`, admin1.idToken), 403);
});

test("lineSignIn：不正なID tokenは拒否、未登録なら unregistered", async () => {
  assert.equal((await callFn("lineSignIn", { idToken: "forged" })).error.status, "UNAUTHENTICATED");
  // userIdだけ送っても本人確認にはならない
  assert.equal((await callFn("lineSignIn", { lineUserId: SUB_A })).error.status, "UNAUTHENTICATED");

  const res = await callFn("lineSignIn", { idToken: `valid:${SUB_A}:やまだ` });
  assert.deepEqual(res.result, { status: "unregistered", lineDisplayName: "やまだ" });
});

test("lineRegisterStaff：誤ったキーは拒否（残り回数を表示）", async () => {
  const res = await callFn("lineRegisterStaff", {
    idToken: `valid:${SUB_A}:やまだ`,
    authKey: "wrong-key",
    staffName: "山田 花子",
  });
  assert.equal(res.error.status, "PERMISSION_DENIED");
  assert.match(res.error.message, /残り4回/);
});

test("lineRegisterStaff：正しいキー（大文字・前後空白あり）で登録 → Custom Token", async () => {
  const res = await callFn("lineRegisterStaff", {
    idToken: `valid:${SUB_A}:やまだ`,
    authKey: " Hinayuri ",
    staffName: "山田　花子",
  });
  assert.equal(res.result.status, "ok");
  assert.equal(res.result.tenantId, "t-hinayuri");
  assert.equal(res.result.tenantName, "みどり児童支援センターひなゆり");
  assert.equal(res.result.staffName, "山田 花子");

  const lineUser = await ownerGet(`lineUsers/${SUB_A}`);
  assert.equal(lineUser.fields.tenantId.stringValue, "t-hinayuri");
  assert.equal(lineUser.fields.role.stringValue, "staff");
  assert.equal(lineUser.fields.status.stringValue, "active");
  const user = await ownerGet(`users/line_${SUB_A}`);
  assert.equal(user.fields.tenantId.stringValue, "t-hinayuri");
  assert.equal(await ownerGet(`lineAuthAttempts/${SUB_A}`), null);

  staffAToken = await signInWithCustomToken(res.result.customToken);
});

test("LINEスタッフは既存Rulesで自事業所のみ読める（他事業所・users書込は不可）", async () => {
  assert.equal(await clientGet("tenants/t-hinayuri/beneficiaries/b1", staffAToken), 200);
  assert.equal(await clientGet("tenants/t-other/beneficiaries/b2", staffAToken), 403);
  assert.equal(await clientGet(`users/line_${SUB_A}`, staffAToken), 200);
  assert.equal(await clientPatch(`users/line_${SUB_A}`, staffAToken, { tenantId: "t-other" }), 403);
  assert.equal(await clientGet("tenants/t-hinayuri", staffAToken), 403);
});

test("LINEスタッフはOCR Functionを利用でき、認証キーの変更・参照はできない", async () => {
  // 画像なし → 認証は通過して引数エラーになる（未認証なら UNAUTHENTICATED）
  assert.equal((await callFn("ocrFromImageData", {}, staffAToken)).error.status, "INVALID_ARGUMENT");
  assert.equal(
    (await callFn("updateStaffAuthKey", { authKey: "takeover-key" }, staffAToken)).error.status,
    "PERMISSION_DENIED"
  );
  assert.equal((await callFn("getStaffAuthKeyStatus", {}, staffAToken)).error.status, "PERMISSION_DENIED");
});

test("2回目以降：lineSignIn だけでスタッフとしてサインイン（キー再入力なし）", async () => {
  const res = await callFn("lineSignIn", { idToken: `valid:${SUB_A}:やまだ` });
  assert.equal(res.result.status, "ok");
  assert.equal(res.result.staffName, "山田 花子");
  const token = await signInWithCustomToken(res.result.customToken);
  assert.equal(await clientGet("tenants/t-hinayuri/beneficiaries/b1", token), 200);

  const status = await callFn("getStaffAuthKeyStatus", {}, admin1.idToken);
  assert.equal(status.result.lineStaffCount, 1);
});

test("総当たり対策：5回失敗でロックされ、正しいキーでも一時的に登録できない", async () => {
  for (let i = 1; i <= 4; i++) {
    const res = await callFn("lineRegisterStaff", {
      idToken: `valid:${SUB_B}:b`, authKey: `guess-${i}`, staffName: "B",
    });
    assert.equal(res.error.status, "PERMISSION_DENIED");
  }
  const fifth = await callFn("lineRegisterStaff", {
    idToken: `valid:${SUB_B}:b`, authKey: "guess-5", staffName: "B",
  });
  assert.equal(fifth.error.status, "RESOURCE_EXHAUSTED");
  const correct = await callFn("lineRegisterStaff", {
    idToken: `valid:${SUB_B}:b`, authKey: "hinayuri", staffName: "B",
  });
  assert.equal(correct.error.status, "RESOURCE_EXHAUSTED");
});

test("キー変更：旧キーは無効になり新キーで登録でき、旧キーは他事業所で使えるようになる", async () => {
  assert.deepEqual(
    (await callFn("updateStaffAuthKey", { authKey: "hinayuri-2026" }, admin1.idToken)).result,
    { ok: true }
  );
  assert.equal(await ownerGet(`staffAuthKeys/${sha256("hinayuri")}`), null);

  const old = await callFn("lineRegisterStaff", {
    idToken: `valid:${SUB_C}:c`, authKey: "hinayuri", staffName: "C",
  });
  assert.equal(old.error.status, "PERMISSION_DENIED");
  const fresh = await callFn("lineRegisterStaff", {
    idToken: `valid:${SUB_C}:c`, authKey: "hinayuri-2026", staffName: "C",
  });
  assert.equal(fresh.result.status, "ok");

  assert.deepEqual(
    (await callFn("updateStaffAuthKey", { authKey: "hinayuri" }, admin2.idToken)).result,
    { ok: true }
  );
  const other = await callFn("lineRegisterStaff", {
    idToken: `valid:${SUB_D}:d`, authKey: "hinayuri", staffName: "D",
  });
  assert.equal(other.result.tenantId, "t-other");
});

test("利用停止したLINEユーザーはサインインできず、業務データにもアクセスできない", async () => {
  await ownerSet(`lineUsers/${SUB_A}`, {
    lineUserId: SUB_A,
    firebaseUid: `line_${SUB_A}`,
    tenantId: "t-hinayuri",
    role: "staff",
    staffName: "山田 花子",
    displayName: "やまだ",
    status: "disabled",
  });
  const res = await callFn("lineSignIn", { idToken: `valid:${SUB_A}:やまだ` });
  assert.deepEqual(res.result, { status: "disabled" });
  assert.equal(await clientGet("tenants/t-hinayuri/beneficiaries/b1", staffAToken), 403);
});
