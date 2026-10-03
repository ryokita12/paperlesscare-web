// Phase 1-A（利用者カルテ）の Firestore / Storage Rules 結合テスト。
// 実行：npm run test:rules（Auth / Firestore / Storage エミュレーター上で、リポジトリの rules をそのまま使う）
//
// 確認すること：
//   - 追加した documents（Firestore）・recipients/{id}/documents/...（Storage）の権限と制約
//   - 既存の beneficiaries / certificates / 受給者証画像パスの権限が変わっていないこと（回帰）
import { test, before } from "node:test";
import assert from "node:assert/strict";

const PROJECT = "demo-paperlesscare";
const BUCKET = `${PROJECT}.appspot.com`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const ST = `http://127.0.0.1:9199/v0/b/${BUCKET}/o`;

const TA = "tenantA";
const TB = "tenantB";
const BEN = "benA1";
const MB = 1024 * 1024;

// ---- helpers ----
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
function toFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
}

async function fsReq(method, path, token, body) {
  const res = await fetch(`${FS}/${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify({ fields: toFields(body) }) : undefined,
  });
  return res.status;
}
const fsGet = (path, token) => fsReq("GET", path, token);
const fsSet = (path, token, body) => fsReq("PATCH", path, token, body);
const fsDelete = (path, token) => fsReq("DELETE", path, token);

// updateMask を付けた部分更新（アプリの updateDoc 相当）
async function fsUpdate(path, token, body) {
  const mask = Object.keys(body).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const res = await fetch(`${FS}/${path}?${mask}&currentDocument.exists=true`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: toFields(body) }),
  });
  return res.status;
}

async function ownerSet(path, body) {
  assert.equal(await fsSet(path, "owner", body), 200, `ownerSet ${path}`);
}

// Firebase JS SDK（uploadBytes）と同じ multipart 形式でアップロードする。
// contentType はメタデータとして送る（単純なPOSTではエミュレーターが Content-Type ヘッダーを使わないため）。
async function stUpload(path, token, { size = 1024, contentType = "application/pdf" } = {}) {
  const boundary = "phase1a-boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n` +
        `${JSON.stringify({ name: path, contentType })}\r\n` +
        `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
    ),
    Buffer.alloc(size),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch(`${ST}?name=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "X-Goog-Upload-Protocol": "multipart",
      ...(token ? { Authorization: `Firebase ${token}` } : {}),
    },
    body,
  });
  return res.status;
}
async function stGet(path, token) {
  const res = await fetch(`${ST}/${encodeURIComponent(path)}?alt=media`, {
    headers: token ? { Authorization: `Firebase ${token}` } : {},
  });
  return res.status;
}
async function stDelete(path, token) {
  const res = await fetch(`${ST}/${encodeURIComponent(path)}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Firebase ${token}` } : {},
  });
  return res.status;
}

async function signUp(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
  });
  const json = await res.json();
  assert.ok(json.idToken, `signUp ${email}`);
  return { uid: json.localId, token: json.idToken };
}

const ok = (status) => status >= 200 && status < 300;
const denied = (status) => status === 403 || status === 401;

function documentBody(overrides = {}) {
  const id = overrides.__id ?? "doc1";
  return {
    beneficiaryId: BEN,
    type: "contract",
    name: "利用契約書",
    fileName: "contract.pdf",
    storagePath: `tenants/${TA}/recipients/${BEN}/documents/${id}/file.pdf`,
    contentType: "application/pdf",
    fileSize: 1024,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "__id")),
  };
}

let adminA; // 管理Web（メール/パスワード）の事業所A
let lineA; // LINEスタッフ相当（users/{uid}.tenantId = A, authProvider = line）
let userB; // 事業所B
let noTenant; // テナント未所属

before(async () => {
  adminA = await signUp("admin-a@example.com");
  lineA = await signUp("line-a@example.com");
  userB = await signUp("user-b@example.com");
  noTenant = await signUp("none@example.com");

  await ownerSet(`users/${adminA.uid}`, { tenantId: TA });
  await ownerSet(`users/${lineA.uid}`, { tenantId: TA, role: "staff", authProvider: "line" });
  await ownerSet(`users/${userB.uid}`, { tenantId: TB });
  await ownerSet(`users/${noTenant.uid}`, { role: "staff" });

  await ownerSet(`tenants/${TA}/beneficiaries/${BEN}`, {
    tenantId: TA,
    profile: { name: "山田 太郎", furigana: "", birthday: "平成27年5月10日" },
    summary: { name: "山田 太郎", furigana: "", number: "1234567890", birthday: "", cityName: "" },
    currentCertificateId: "cert1",
    certificateCount: 1,
    status: "active",
    certType: "child",
  });
  await ownerSet(`tenants/${TA}/beneficiaries/${BEN}/certificates/cert1`, {
    beneficiaryId: BEN,
    certType: "child",
    status: "current",
    validTo: "2026-03-31",
  });
});

// ===== 回帰：既存の利用者・受給者証の権限 =====

test("回帰：同じ事業所のスタッフ（管理Web・LINE）は利用者・受給者証を読み書きできる", async () => {
  for (const actor of [adminA, lineA]) {
    assert.ok(ok(await fsGet(`tenants/${TA}/beneficiaries/${BEN}`, actor.token)));
    assert.ok(ok(await fsGet(`tenants/${TA}/beneficiaries/${BEN}/certificates/cert1`, actor.token)));
  }
  assert.ok(ok(await fsSet(`tenants/${TA}/beneficiaries/${BEN}/certificates/cert2`, adminA.token, { beneficiaryId: BEN, status: "superseded" })));
  assert.ok(ok(await fsSet(`tenants/${TA}/beneficiaries/new1`, lineA.token, { tenantId: TA, currentCertificateId: null })));
});

test("回帰：他の事業所・未所属・未ログインは利用者・受給者証にアクセスできない", async () => {
  for (const token of [userB.token, noTenant.token, undefined]) {
    assert.ok(denied(await fsGet(`tenants/${TA}/beneficiaries/${BEN}`, token)));
    assert.ok(denied(await fsGet(`tenants/${TA}/beneficiaries/${BEN}/certificates/cert1`, token)));
    assert.ok(denied(await fsSet(`tenants/${TA}/beneficiaries/${BEN}/certificates/x`, token, { status: "current" })));
  }
});

test("回帰：users・tenants本体・想定外のサブコレクションは引き続き書き込み不可", async () => {
  assert.ok(denied(await fsSet(`users/${adminA.uid}`, adminA.token, { tenantId: TB })));
  assert.ok(denied(await fsGet(`tenants/${TA}`, adminA.token)));
  assert.ok(denied(await fsSet(`tenants/${TA}/beneficiaries/${BEN}/notes/n1`, adminA.token, { text: "x" })));
});

// ===== Phase 1-A：カルテの各マップ（利用者docへの追加フィールド） =====

test("カルテ：同じ事業所は利用者docへカルテ情報（personal 等）を部分更新できる", async () => {
  const status = await fsUpdate(`tenants/${TA}/beneficiaries/${BEN}`, adminA.token, {
    personal: { name: "山田 太郎", birthDate: "2015-05-10", usageStatus: "active" },
    guardian: { name: "山田 花子", sameAddressAsBeneficiary: true },
  });
  assert.ok(ok(status), `status ${status}`);
  assert.ok(denied(await fsUpdate(`tenants/${TA}/beneficiaries/${BEN}`, userB.token, { guardian: { name: "x" } })));
});

// ===== Phase 1-A：書類（Firestore） =====

test("書類：同じ事業所のスタッフは正しい内容で作成・閲覧・削除できる", async () => {
  const path = `tenants/${TA}/beneficiaries/${BEN}/documents/doc1`;
  assert.ok(ok(await fsSet(path, adminA.token, documentBody())));
  assert.ok(ok(await fsGet(path, lineA.token)));
  assert.ok(ok(await fsGet(`tenants/${TA}/beneficiaries/${BEN}/documents`, adminA.token)));
  assert.ok(ok(await fsDelete(path, lineA.token)));
});

test("書類：他の事業所・未所属・未ログインは作成・閲覧・削除できない", async () => {
  const path = `tenants/${TA}/beneficiaries/${BEN}/documents/doc2`;
  await ownerSet(path, documentBody({ __id: "doc2" }));
  for (const token of [userB.token, noTenant.token, undefined]) {
    assert.ok(denied(await fsGet(path, token)));
    assert.ok(denied(await fsDelete(path, token)));
    assert.ok(denied(await fsSet(`tenants/${TA}/beneficiaries/${BEN}/documents/doc3`, token, documentBody({ __id: "doc3" }))));
  }
});

test("書類：種別・保存先・サイズが不正な記録は作成できない", async () => {
  const base = `tenants/${TA}/beneficiaries/${BEN}/documents`;
  // 受給者証は certificates を使うため documents には登録できない
  assert.ok(denied(await fsSet(`${base}/d4`, adminA.token, documentBody({ __id: "d4", type: "certificate" }))));
  // 他の事業所・他の利用者・他の書類のファイルを指す保存先
  assert.ok(denied(await fsSet(`${base}/d5`, adminA.token, documentBody({ __id: "d5", storagePath: `tenants/${TB}/recipients/${BEN}/documents/d5/file.pdf` }))));
  assert.ok(denied(await fsSet(`${base}/d6`, adminA.token, documentBody({ __id: "d6", storagePath: `tenants/${TA}/recipients/other/documents/d6/file.pdf` }))));
  assert.ok(denied(await fsSet(`${base}/d7`, adminA.token, documentBody({ __id: "d7", storagePath: `tenants/${TA}/recipients/${BEN}/documents/zzz/file.pdf` }))));
  assert.ok(denied(await fsSet(`${base}/d8`, adminA.token, documentBody({ __id: "d8", storagePath: `tenants/${TA}/recipients/${BEN}/certificates/cert1/page1.jpg` }))));
  // 10MB超・数値でないサイズ
  assert.ok(denied(await fsSet(`${base}/d9`, adminA.token, documentBody({ __id: "d9", fileSize: 10 * MB + 1 }))));
  assert.ok(denied(await fsSet(`${base}/d10`, adminA.token, documentBody({ __id: "d10", fileSize: "1024" }))));
  // 上限ちょうどは可
  assert.ok(ok(await fsSet(`${base}/d11`, adminA.token, documentBody({ __id: "d11", fileSize: 10 * MB }))));
});

// ===== 回帰：既存の受給者証画像（Storage） =====

test("回帰：受給者証画像のパスは同じ事業所だけが読み書きできる", async () => {
  const certPath = `tenants/${TA}/recipients/${BEN}/certificates/cert1/page1.jpg`;
  assert.ok(ok(await stUpload(certPath, lineA.token, { contentType: "image/jpeg" })));
  assert.ok(ok(await stGet(certPath, adminA.token)));
  assert.ok(denied(await stGet(certPath, userB.token)));
  assert.ok(denied(await stUpload(`tenants/${TA}/recipients/${BEN}/certificates/cert1/page2.jpg`, userB.token, { contentType: "image/jpeg" })));

  const flatPath = `tenants/${TA}/recipients/${BEN}/page1.jpg`;
  assert.ok(ok(await stUpload(flatPath, adminA.token, { contentType: "image/jpeg" })));
  assert.ok(ok(await stGet(flatPath, lineA.token)));
});

// ===== Phase 1-A：書類（Storage） =====

test("書類ファイル：同じ事業所は PDF / JPEG / PNG（10MBまで）をアップロード・取得・削除できる", async () => {
  const dir = `tenants/${TA}/recipients/${BEN}/documents`;
  assert.ok(ok(await stUpload(`${dir}/s1/file.pdf`, adminA.token)));
  assert.ok(ok(await stUpload(`${dir}/s2/file.jpg`, lineA.token, { contentType: "image/jpeg" })));
  assert.ok(ok(await stUpload(`${dir}/s3/file.png`, adminA.token, { contentType: "image/png", size: 10 * MB })));
  assert.ok(ok(await stGet(`${dir}/s1/file.pdf`, lineA.token)));
  assert.ok(ok(await stDelete(`${dir}/s1/file.pdf`, adminA.token)));
});

test("書類ファイル：形式・サイズ・上書き・他の事業所は拒否する", async () => {
  const dir = `tenants/${TA}/recipients/${BEN}/documents`;
  assert.ok(denied(await stUpload(`${dir}/x1/file.txt`, adminA.token, { contentType: "text/plain" })));
  assert.ok(denied(await stUpload(`${dir}/x2/file.gif`, adminA.token, { contentType: "image/gif" })));
  assert.ok(denied(await stUpload(`${dir}/x3/file.pdf`, adminA.token, { size: 10 * MB + 1 })));
  // 既存ファイルへの上書きは不可（削除して再登録する）
  assert.ok(denied(await stUpload(`${dir}/s2/file.jpg`, adminA.token, { contentType: "image/jpeg" })));
  // 想定より深い階層は不可
  assert.ok(denied(await stUpload(`${dir}/x4/sub/file.pdf`, adminA.token)));
  // 他の事業所
  assert.ok(denied(await stUpload(`${dir}/x5/file.pdf`, userB.token)));
  assert.ok(denied(await stGet(`${dir}/s2/file.jpg`, userB.token)));
  assert.ok(denied(await stDelete(`${dir}/s2/file.jpg`, userB.token)));
  assert.ok(denied(await stGet(`${dir}/s2/file.jpg`, undefined)));
});
