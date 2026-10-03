// Phase 1-C（カルテ運用強化）の Firestore Rules 結合テスト。
// 実行：npm run test:rules（Auth / Firestore / Storage エミュレーター上で、リポジトリの rules をそのまま使う）
//
// 確認すること：
//   - 変更履歴 chartHistory：同じ事業所だけが読める・追記のみ（更新・削除不可）・本人／サーバー時刻／
//     利用者docとの同時書き込み（lastChartHistoryId）でなければ作れない
//   - 書類 documents：ファイルなしの記録・提出状態・提出日・メモ（Phase 1-C）と、既存の書類docの互換
//   - 利用者doc・受給者証への既存の権限が変わっていないこと
// phase1a.rules.test.mjs と並行して動くため、事業所ID・アカウントは別のものを使う。
import { test, before } from "node:test";
import assert from "node:assert/strict";

const PROJECT = "demo-paperlesscare";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const DOC_ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";

const TA = "tenantC1";
const TB = "tenantC2";
const BEN = "benC1";
const BEN_PATH = `tenants/${TA}/beneficiaries/${BEN}`;

// ---- helpers ----
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "object") return v.__ts ? { timestampValue: v.__ts } : { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
function toFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
}

async function fsReq(method, path, token, body, query = "") {
  const res = await fetch(`${FS}/${path}${query}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify({ fields: toFields(body) }) : undefined,
  });
  return res.status;
}
const fsGet = (path, token) => fsReq("GET", path, token);
const fsSet = (path, token, body) => fsReq("PATCH", path, token, body);
const fsDelete = (path, token) => fsReq("DELETE", path, token);
function fsUpdate(path, token, paths, body) {
  const mask = paths.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  return fsReq("PATCH", path, token, body, `?${mask}&currentDocument.exists=true`);
}

async function ownerSet(path, body) {
  assert.equal(await fsSet(path, "owner", body), 200, `ownerSet ${path}`);
}

// 複数docの書き込みを1回で行う（アプリのトランザクション・バッチと同じく、Rules は書き込み後の状態で評価される）
async function commit(token, writes) {
  const res = await fetch(`${FS}:commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ writes }),
  });
  return res.status;
}

/** 利用者doc の部分更新（updatedAt はサーバー時刻） */
function beneficiaryWrite(fields, { serverTime = true } = {}) {
  const paths = Object.keys(fields).flatMap((k) =>
    fields[k] && typeof fields[k] === "object" && !Array.isArray(fields[k]) ? Object.keys(fields[k]).map((c) => `${k}.${c}`) : [k]
  );
  return {
    update: { name: `${DOC_ROOT}/${BEN_PATH}`, fields: toFields(fields) },
    updateMask: { fieldPaths: [...paths, "updatedBy"].filter((p, i, a) => a.indexOf(p) === i) },
    updateTransforms: serverTime ? [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }] : [],
    currentDocument: { exists: true },
  };
}

/** 変更履歴docの作成（createdAt はサーバー時刻） */
function historyWrite(id, fields, { serverTime = true } = {}) {
  return {
    update: { name: `${DOC_ROOT}/${BEN_PATH}/chartHistory/${id}`, fields: toFields(fields) },
    updateTransforms: serverTime ? [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }] : [],
    currentDocument: { exists: false },
  };
}

function historyBody(actor, overrides = {}) {
  return {
    schemaVersion: 1,
    beneficiaryId: BEN,
    source: "chartEdit",
    sections: ["guardian"],
    changes: [{ path: "guardian.name", section: "guardian", label: "保護者氏名", before: "山田 花子", after: "山田 華子" }],
    certificateId: null,
    actor: { uid: actor.uid, email: actor.email, displayName: "" },
    ...overrides,
  };
}

/** カルテの保存と同じ形：利用者doc の更新＋変更履歴の作成 */
function chartSave(actor, id, { benFields, history, benOptions, historyOptions } = {}) {
  return [
    beneficiaryWrite(
      { guardian: { name: "山田 華子" }, lastChartHistoryId: id, updatedBy: { uid: actor.uid, email: actor.email }, ...benFields },
      benOptions
    ),
    historyWrite(id, history ?? historyBody(actor), historyOptions),
  ];
}

async function signUp(email) {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(email ? { email, password: "password123", returnSecureToken: true } : { returnSecureToken: true }),
  });
  const json = await res.json();
  assert.ok(json.idToken, `signUp ${email ?? "(no email)"}`);
  return { uid: json.localId, token: json.idToken, email: email ?? null };
}

const ok = (status) => status >= 200 && status < 300;
const denied = (status) => status === 403 || status === 401;

let staffA; // 事業所Aの管理Webスタッフ
let staffA2; // 事業所Aの別のスタッフ
let noEmailA; // 事業所Aのメールアドレスの無いスタッフ（LINE スタッフ相当：トークンに email が無い）
let userB; // 事業所B
let noTenant; // テナント未所属

before(async () => {
  staffA = await signUp("c-staff-a@example.com");
  staffA2 = await signUp("c-staff-a2@example.com");
  noEmailA = await signUp(null);
  userB = await signUp("c-user-b@example.com");
  noTenant = await signUp("c-none@example.com");

  await ownerSet(`users/${staffA.uid}`, { tenantId: TA });
  await ownerSet(`users/${staffA2.uid}`, { tenantId: TA });
  await ownerSet(`users/${noEmailA.uid}`, { tenantId: TA, role: "staff", authProvider: "line" });
  await ownerSet(`users/${userB.uid}`, { tenantId: TB });
  await ownerSet(`users/${noTenant.uid}`, { role: "staff" });

  await ownerSet(BEN_PATH, {
    tenantId: TA,
    profile: { name: "山田 太郎", furigana: "", birthday: "" },
    summary: { name: "山田 太郎", furigana: "", number: "1234567890", birthday: "", cityName: "" },
    currentCertificateId: "cert1",
    certificateCount: 1,
    status: "active",
    certType: "tsusho",
    guardian: { name: "山田 花子" },
  });
  await ownerSet(`${BEN_PATH}/certificates/cert1`, { beneficiaryId: BEN, certType: "tsusho", status: "current", validTo: "2027-03-31" });
  await ownerSet(`${BEN_PATH}/chartHistory/seeded`, { ...historyBody(staffA), createdAt: { __ts: "2026-10-01T00:00:00Z" } });
});

// ===== 変更履歴（chartHistory） =====

test("変更履歴：同じ事業所のスタッフは、カルテの保存と同時に自分の変更履歴を作成でき、事業所内で読める", async () => {
  assert.ok(ok(await commit(staffA.token, chartSave(staffA, "h-ok-1"))));
  assert.ok(ok(await fsGet(`${BEN_PATH}/chartHistory/h-ok-1`, staffA2.token)));
  assert.ok(ok(await fsGet(`${BEN_PATH}/chartHistory/h-ok-1`, noEmailA.token)));
  assert.ok(ok(await fsGet(`${BEN_PATH}/chartHistory`, staffA.token)));
});

test("変更履歴：受給者証からの反映（source: certificateReview・証ID つき）も同じ規則で作成できる", async () => {
  const history = historyBody(staffA, { source: "certificateReview", certificateId: "cert1" });
  assert.ok(ok(await commit(staffA.token, chartSave(staffA, "h-ok-2", { history }))));
});

test("変更履歴：メールアドレスの無いスタッフ（LINE 相当）は email: null で作成できる", async () => {
  assert.ok(ok(await commit(noEmailA.token, chartSave(noEmailA, "h-ok-3"))));
  // 他人のメールアドレスを名乗ることはできない
  const fake = { ...noEmailA, email: "c-staff-a@example.com" };
  assert.ok(denied(await commit(noEmailA.token, chartSave(fake, "h-ng-email"))));
});

test("変更履歴：カルテの更新を伴わない履歴だけの作成はできない（捏造防止）", async () => {
  assert.ok(denied(await commit(staffA.token, [historyWrite("h-ng-alone", historyBody(staffA))])));
  assert.ok(denied(await fsSet(`${BEN_PATH}/chartHistory/h-ng-alone2`, staffA.token, { ...historyBody(staffA), createdAt: { __ts: "2026-10-04T00:00:00Z" } })));
});

test("変更履歴：利用者doc の lastChartHistoryId がこの履歴と一致しない・updatedAt がサーバー時刻でない場合は作成できない", async () => {
  assert.ok(denied(await commit(staffA.token, chartSave(staffA, "h-ng-link", { benFields: { lastChartHistoryId: "other" } }))));
  assert.ok(denied(await commit(staffA.token, chartSave(staffA, "h-ng-time", { benOptions: { serverTime: false } }))));
});

test("変更履歴：他人になりすました actor・クライアント指定の作成時刻は拒否する", async () => {
  assert.ok(denied(await commit(staffA.token, chartSave(staffA, "h-ng-actor", { history: historyBody(staffA2) }))));
  const clientTime = { ...historyBody(staffA), createdAt: { __ts: "2020-01-01T00:00:00Z" } };
  assert.ok(denied(await commit(staffA.token, chartSave(staffA, "h-ng-ts", { history: clientTime, historyOptions: { serverTime: false } }))));
});

test("変更履歴：形が不正（変更なし・想定外の項目・他の利用者・不明な操作）は作成できない", async () => {
  assert.ok(denied(await commit(staffA.token, chartSave(staffA, "h-ng-empty", { history: historyBody(staffA, { changes: [] }) }))));
  assert.ok(denied(await commit(staffA.token, chartSave(staffA, "h-ng-extra", { history: historyBody(staffA, { note: "x" }) }))));
  assert.ok(denied(await commit(staffA.token, chartSave(staffA, "h-ng-ben", { history: historyBody(staffA, { beneficiaryId: "other" }) }))));
  assert.ok(denied(await commit(staffA.token, chartSave(staffA, "h-ng-src", { history: historyBody(staffA, { source: "import" }) }))));
});

test("変更履歴：作成後は同じ事業所でも変更・削除できない（追記のみ）", async () => {
  const path = `${BEN_PATH}/chartHistory/seeded`;
  assert.ok(denied(await fsUpdate(path, staffA.token, ["changes"], { changes: [] })));
  assert.ok(denied(await fsSet(path, staffA.token, historyBody(staffA))));
  assert.ok(denied(await fsDelete(path, staffA.token)));
  assert.ok(denied(await fsDelete(path, noEmailA.token)));
});

test("変更履歴：他の事業所・未所属・未ログインは読めず、作成もできない", async () => {
  for (const user of [userB, noTenant, { uid: "anon", token: undefined, email: null }]) {
    assert.ok(denied(await fsGet(`${BEN_PATH}/chartHistory/seeded`, user.token)));
    assert.ok(denied(await fsGet(`${BEN_PATH}/chartHistory`, user.token)));
    assert.ok(denied(await commit(user.token, chartSave(user, `h-ng-${user.uid}`))));
  }
});

// ===== 利用者doc（カルテ）・受給者証の既存の権限（回帰） =====

test("回帰：履歴なしの利用者doc・受給者証の更新は従来どおり（受給者証の保存・chartReview の記録は変更履歴を作らない）", async () => {
  assert.ok(ok(await fsUpdate(BEN_PATH, staffA.token, ["summary.name"], { summary: { name: "山田 太郎" } })));
  assert.ok(ok(await fsUpdate(`${BEN_PATH}/certificates/cert1`, staffA.token, ["chartReview.decisions.guardian_name"], {
    chartReview: { decisions: { guardian_name: { action: "dismissed", certValueNormalized: "x" } } },
  })));
  for (const token of [userB.token, noTenant.token, undefined]) {
    assert.ok(denied(await fsGet(BEN_PATH, token)));
    assert.ok(denied(await fsUpdate(BEN_PATH, token ?? "", ["guardian.name"], { guardian: { name: "x" } })));
  }
});

// ===== 書類（提出管理） =====

const DOCS = `${BEN_PATH}/documents`;

function fileDoc(id, overrides = {}) {
  return {
    beneficiaryId: BEN,
    type: "contract",
    name: "利用契約書",
    fileName: "contract.pdf",
    storagePath: `tenants/${TA}/recipients/${BEN}/documents/${id}/file.pdf`,
    contentType: "application/pdf",
    fileSize: 1024,
    ...overrides,
  };
}

function paperDoc(overrides = {}) {
  return {
    beneficiaryId: BEN,
    type: "importantMatters",
    name: "重要事項説明書",
    fileName: "",
    storagePath: "",
    contentType: "",
    fileSize: 0,
    status: "submitted",
    submittedAt: "2026-10-01",
    memo: "原本は書庫に保管",
    ...overrides,
  };
}

test("書類：ファイルなしの記録（紙で保管）と提出状態・提出日・メモを作成・更新できる", async () => {
  assert.ok(ok(await fsSet(`${DOCS}/paper1`, staffA.token, paperDoc())));
  assert.ok(ok(await fsSet(`${DOCS}/paper2`, noEmailA.token, paperDoc({ status: "notSubmitted", submittedAt: "" }))));
  assert.ok(ok(await fsUpdate(`${DOCS}/paper2`, staffA.token, ["status", "submittedAt", "memo"], { status: "submitted", submittedAt: "2026-10-04", memo: "" })));
  // ファイルを後から添付（同じ書類のパス）
  assert.ok(ok(await fsUpdate(`${DOCS}/paper2`, staffA.token, ["fileName", "storagePath", "contentType", "fileSize"], {
    fileName: "a.pdf",
    storagePath: `tenants/${TA}/recipients/${BEN}/documents/paper2/file.pdf`,
    contentType: "application/pdf",
    fileSize: 2048,
  })));
  // ファイルありの書類に提出情報を付ける
  assert.ok(ok(await fsSet(`${DOCS}/file1`, staffA.token, fileDoc("file1", { status: "submitted", submittedAt: "", memo: "" }))));
});

test("書類：Phase 1-C 以前の書類doc（提出状態の項目なし）も従来どおり作成・更新できる", async () => {
  await ownerSet(`${DOCS}/legacy1`, fileDoc("legacy1"));
  assert.ok(ok(await fsGet(`${DOCS}/legacy1`, staffA.token)));
  assert.ok(ok(await fsSet(`${DOCS}/legacy2`, staffA.token, fileDoc("legacy2"))));
  assert.ok(ok(await fsUpdate(`${DOCS}/legacy1`, staffA.token, ["status", "submittedAt", "memo"], { status: "submitted", submittedAt: "", memo: "メモ" })));
});

test("書類：不正な提出状態・提出日・メモ・ファイル情報は拒否する", async () => {
  assert.ok(denied(await fsSet(`${DOCS}/bad1`, staffA.token, paperDoc({ status: "done" }))));
  assert.ok(denied(await fsSet(`${DOCS}/bad2`, staffA.token, paperDoc({ submittedAt: "令和8年10月1日" }))));
  assert.ok(denied(await fsSet(`${DOCS}/bad3`, staffA.token, paperDoc({ submittedAt: 20261001 }))));
  assert.ok(denied(await fsSet(`${DOCS}/bad4`, staffA.token, paperDoc({ memo: "あ".repeat(501) }))));
  // ファイルなしなのにサイズがある・他の書類のファイルを指す
  assert.ok(denied(await fsSet(`${DOCS}/bad5`, staffA.token, paperDoc({ fileSize: 100 }))));
  assert.ok(denied(await fsSet(`${DOCS}/bad6`, staffA.token, paperDoc({ storagePath: `tenants/${TA}/recipients/${BEN}/documents/other/file.pdf`, fileSize: 100 }))));
  // 受給者証は documents に登録できない（従来どおり）
  assert.ok(denied(await fsSet(`${DOCS}/bad7`, staffA.token, paperDoc({ type: "certificate" }))));
  // 既存の書類を不正な状態へ更新することもできない
  assert.ok(denied(await fsUpdate(`${DOCS}/paper1`, staffA.token, ["status"], { status: "unknown" })));
});

test("書類：他の事業所・未所属・未ログインは提出状態を変更・閲覧できない", async () => {
  for (const token of [userB.token, noTenant.token, undefined]) {
    assert.ok(denied(await fsGet(`${DOCS}/paper1`, token)));
    assert.ok(denied(await fsSet(`${DOCS}/x-${token ? token.slice(-6) : "anon"}`, token, paperDoc())));
    assert.ok(denied(await fsUpdate(`${DOCS}/paper1`, token ?? "", ["status"], { status: "notSubmitted" })));
    assert.ok(denied(await fsDelete(`${DOCS}/paper1`, token)));
  }
});
