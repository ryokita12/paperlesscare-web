// Phase 2（予定 → 実績）の Firestore Rules 結合テスト。
// 実行：npm run test:rules（Auth / Firestore / Storage エミュレーター上で、リポジトリの rules をそのまま使う）
//
// 確認すること（tenants/{t}/usageRecords/{date}_{beneficiaryId}）：
//   - 同じ事業所のスタッフ（管理Web・LINE スタッフ）は読み書きできる。他の事業所・未認証・未所属は拒否
//   - docのID・date・yearMonth・beneficiaryId の整合、実在する利用者のみ
//   - status / origin の値域、予定時刻・実績時刻の "HH:mm" 形式、absence / note / actor の形
//   - updatedBy は本人・updatedAt はサーバー時刻、作成者・作成日時は変更不可（既存の記録の上書き防止）
//   - 削除できるのは予定・キャンセル・予定外の来所のみ
// phase1a / phase1c のテストと並行して動くため、事業所ID・アカウントは別のものを使う。
import { test, before } from "node:test";
import assert from "node:assert/strict";

const PROJECT = "demo-paperlesscare";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const DOC_ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";

const TA = "tenantD1";
const TB = "tenantD2";
const BEN = "benD1";
const BEN_B = "benD2"; // 事業所Bの利用者
const DATE = "2026-10-05";
const recordsPath = (tenant = TA) => `tenants/${tenant}/usageRecords`;
const recordPath = (id, tenant = TA) => `${recordsPath(tenant)}/${id}`;

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
    body: body ? JSON.stringify(body.structuredQuery ? body : { fields: toFields(body) }) : undefined,
  });
  return res.status;
}
const fsGet = (path, token) => fsReq("GET", path, token);
const fsSet = (path, token, body) => fsReq("PATCH", path, token, body);
const fsDelete = (path, token) => fsReq("DELETE", path, token);

async function ownerSet(path, body) {
  assert.equal(await fsSet(path, "owner", body), 200, `ownerSet ${path}`);
}

async function commit(token, writes) {
  const res = await fetch(`${FS}:commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ writes }),
  });
  return res.status;
}

/** 等価条件のクエリ（アプリの日次・月次の読み取りと同じ形） */
async function runQuery(token, tenant, filters) {
  const res = await fetch(`${FS}/tenants/${tenant}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "usageRecords" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: Object.entries(filters).map(([field, value]) => ({
              fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toValue(value) },
            })),
          },
        },
      },
    }),
  });
  return res.status;
}

function actorOf(user, name = "スタッフ") {
  return { uid: user.uid, email: user.email, name };
}

function recordBody(user, overrides = {}) {
  const date = overrides.date ?? DATE;
  return {
    schemaVersion: 1,
    beneficiaryId: BEN,
    date,
    yearMonth: date.slice(0, 7),
    status: "scheduled",
    origin: "manual",
    planned: { startTime: "14:07", endTime: "17:43" },
    actual: { startTime: "", endTime: "", pickup: null, dropoff: null },
    absence: { reason: "", contactedAt: "" },
    note: "",
    statusLog: [{ from: null, to: "scheduled", at: "2026-10-05T05:00:00.000Z", by: { uid: user.uid, name: "スタッフ" } }],
    createdBy: actorOf(user),
    updatedBy: actorOf(user),
    ...overrides,
  };
}

/** 作成（createdAt / updatedAt はサーバー時刻）。exists: false で「新規作成」として送る */
function createWrite(id, body, { tenant = TA, serverTime = true, mustNotExist = true } = {}) {
  return {
    update: { name: `${DOC_ROOT}/${recordPath(id, tenant)}`, fields: toFields(body) },
    updateTransforms: serverTime
      ? [
          { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
          { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
        ]
      : [],
    ...(mustNotExist ? { currentDocument: { exists: false } } : {}),
  };
}

/** 更新（作成日時は既存のまま、updatedAt はサーバー時刻） */
function updateWrite(id, body, { tenant = TA, serverTime = true } = {}) {
  const paths = Object.keys(body);
  return {
    update: { name: `${DOC_ROOT}/${recordPath(id, tenant)}`, fields: toFields(body) },
    updateMask: { fieldPaths: paths },
    updateTransforms: serverTime ? [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }] : [],
    currentDocument: { exists: true },
  };
}

const create = (user, id, body, opts) => commit(user.token, [createWrite(id, body, opts)]);
const update = (user, id, body, opts) => commit(user.token, [updateWrite(id, body, opts)]);

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

let adminA; // 事業所Aの管理Webスタッフ
let lineA; // 事業所Aの LINE スタッフ相当（メールアドレスなし・authProvider: line）
let userB; // 事業所B
let noTenant; // テナント未所属

before(async () => {
  adminA = await signUp("d-admin-a@example.com");
  lineA = await signUp(null);
  userB = await signUp("d-user-b@example.com");
  noTenant = await signUp("d-none@example.com");

  await ownerSet(`users/${adminA.uid}`, { tenantId: TA });
  await ownerSet(`users/${lineA.uid}`, { tenantId: TA, role: "staff", authProvider: "line" });
  await ownerSet(`users/${userB.uid}`, { tenantId: TB });
  await ownerSet(`users/${noTenant.uid}`, { role: "staff" });

  await ownerSet(`tenants/${TA}/beneficiaries/${BEN}`, { tenantId: TA, profile: { name: "北 太郎" }, status: "active" });
  await ownerSet(`tenants/${TB}/beneficiaries/${BEN_B}`, { tenantId: TB, profile: { name: "他事業所" }, status: "active" });
});

// ===== 正常系 =====

test("管理Webスタッフ：予定を作成（1分単位の予定時刻）・読み取り・日次/月次/利用者×月のクエリができる", async () => {
  const id = `${DATE}_${BEN}`;
  assert.ok(ok(await create(adminA, id, recordBody(adminA))));
  assert.ok(ok(await fsGet(recordPath(id), adminA.token)));
  assert.ok(ok(await runQuery(adminA.token, TA, { date: DATE })));
  assert.ok(ok(await runQuery(adminA.token, TA, { yearMonth: "2026-10" })));
  assert.ok(ok(await runQuery(adminA.token, TA, { yearMonth: "2026-10", beneficiaryId: BEN })));
});

test("LINE スタッフ：来所（実時刻）→ 退所 → 欠席に変更 → 予定に戻す、を記録できる（email: null）", async () => {
  const id = `2026-10-06_${BEN}`;
  assert.ok(ok(await create(adminA, id, recordBody(adminA, { date: "2026-10-06" }))));
  const by = actorOf(lineA, "山田");
  assert.ok(ok(await update(lineA, id, { status: "attended", actual: { startTime: "14:07", endTime: "", pickup: null, dropoff: null }, updatedBy: by })));
  assert.ok(ok(await update(lineA, id, { actual: { startTime: "14:07", endTime: "17:43", pickup: true, dropoff: true }, updatedBy: by })));
  assert.ok(ok(await update(lineA, id, { status: "absent", actual: { startTime: "", endTime: "", pickup: null, dropoff: null }, absence: { reason: "体調不良", contactedAt: "2026-10-06" }, updatedBy: by })));
  assert.ok(ok(await update(lineA, id, { status: "scheduled", absence: { reason: "", contactedAt: "" }, updatedBy: by })));
  assert.ok(ok(await fsGet(recordPath(id), lineA.token)));
  assert.ok(ok(await runQuery(lineA.token, TA, { date: "2026-10-06" })));
});

test("LINE スタッフ：予定外の来所（walkIn・予定時刻なし・attended）を作成でき、取り消し（削除）できる", async () => {
  const id = `2026-10-07_${BEN}`;
  const body = recordBody(lineA, {
    date: "2026-10-07",
    status: "attended",
    origin: "walkIn",
    planned: { startTime: "", endTime: "" },
    actual: { startTime: "15:02", endTime: "", pickup: null, dropoff: null },
  });
  assert.ok(ok(await create(lineA, id, body)));
  assert.ok(ok(await fsDelete(recordPath(id), lineA.token)));
});

test("キャンセル → 予定に戻す、予定・キャンセルは削除できる", async () => {
  const id = `2026-10-08_${BEN}`;
  assert.ok(ok(await create(adminA, id, recordBody(adminA, { date: "2026-10-08" }))));
  assert.ok(ok(await update(adminA, id, { status: "cancelled", updatedBy: actorOf(adminA) })));
  assert.ok(ok(await fsDelete(recordPath(id), adminA.token)));
});

// ===== 拒否 =====

test("他の事業所・未認証・未所属は読み書きできない", async () => {
  const id = `${DATE}_${BEN}`;
  assert.ok(denied(await fsGet(recordPath(id), userB.token)));
  assert.ok(denied(await fsGet(recordPath(id), null)));
  assert.ok(denied(await fsGet(recordPath(id), noTenant.token)));
  assert.ok(denied(await runQuery(userB.token, TA, { date: DATE })));
  assert.ok(denied(await runQuery(null, TA, { date: DATE })));
  assert.ok(denied(await update(userB, id, { note: "x", updatedBy: actorOf(userB) })));
  assert.ok(denied(await create(userB, `2026-10-09_${BEN}`, recordBody(userB, { date: "2026-10-09" }))));
  assert.ok(denied(await create(noTenant, `2026-10-09_${BEN}`, recordBody(noTenant, { date: "2026-10-09" }))));
  assert.ok(denied(await commit(null, [createWrite(`2026-10-09_${BEN}`, recordBody(adminA, { date: "2026-10-09" }))])));
  assert.ok(denied(await fsDelete(recordPath(id), userB.token)));
  // 自分の事業所に他の事業所の利用者の記録は作れない（実在チェック）
  assert.ok(denied(await create(adminA, `2026-10-09_${BEN_B}`, recordBody(adminA, { date: "2026-10-09", beneficiaryId: BEN_B }))));
  // 他の事業所のパスへも書けない
  assert.ok(denied(await create(adminA, `2026-10-09_${BEN_B}`, recordBody(adminA, { date: "2026-10-09", beneficiaryId: BEN_B }), { tenant: TB })));
});

test("不正な recordId（日付・利用者と不一致、形式違い）は拒否", async () => {
  const body = recordBody(adminA, { date: "2026-10-10" });
  assert.ok(denied(await create(adminA, `2026-10-11_${BEN}`, body)), "日付が違う");
  assert.ok(denied(await create(adminA, `2026-10-10_other`, body)), "利用者が違う");
  assert.ok(denied(await create(adminA, `abc`, body)), "形式違い");
  assert.ok(denied(await create(adminA, `2026-10-10_${BEN}`, { ...body, yearMonth: "2026-11" })), "yearMonth が date と不一致");
  assert.ok(denied(await create(adminA, `2026-13-10_${BEN}`, { ...body, date: "2026-13-10", yearMonth: "2026-13" })), "不正な日付");
  assert.ok(denied(await create(adminA, `2026-10-12_ghost`, recordBody(adminA, { date: "2026-10-12", beneficiaryId: "ghost" }))), "存在しない利用者");
});

test("不正な status / origin は拒否", async () => {
  const id = `2026-10-13_${BEN}`;
  const base = recordBody(adminA, { date: "2026-10-13" });
  assert.ok(denied(await create(adminA, id, { ...base, status: "confirmed" })));
  assert.ok(denied(await create(adminA, id, { ...base, status: "Attended" })));
  assert.ok(denied(await create(adminA, id, { ...base, origin: "import" })));
  assert.ok(ok(await create(adminA, id, base)));
  assert.ok(denied(await update(adminA, id, { status: "done", updatedBy: actorOf(adminA) })));
  assert.ok(denied(await update(adminA, id, { origin: "auto", updatedBy: actorOf(adminA) })));
});

test("不正な時刻形式（予定・実績）は拒否、予定外の来所以外は予定時刻が必須", async () => {
  const id = `2026-10-14_${BEN}`;
  const base = recordBody(adminA, { date: "2026-10-14" });
  for (const planned of [
    { startTime: "24:00", endTime: "17:00" },
    { startTime: "9:00", endTime: "17:00" },
    { startTime: "14:00", endTime: "17:60" },
    { startTime: "14:00:00", endTime: "17:00" },
    { startTime: "", endTime: "17:00" },
    { startTime: 1400, endTime: "17:00" },
    { startTime: "14:00", endTime: "17:00", extra: "x" },
  ]) {
    assert.ok(denied(await create(adminA, id, { ...base, planned })), JSON.stringify(planned));
  }
  assert.ok(denied(await create(adminA, id, { ...base, actual: { startTime: "25:00", endTime: "", pickup: null, dropoff: null } })));
  assert.ok(denied(await create(adminA, id, { ...base, actual: { startTime: "14:00", endTime: "", pickup: "yes", dropoff: null } })));
  assert.ok(denied(await create(adminA, id, { ...base, actual: { startTime: "14:00", endTime: "" } })), "actual の項目不足");
  // 境界：00:00〜23:59 は可
  assert.ok(ok(await create(adminA, id, { ...base, planned: { startTime: "00:00", endTime: "23:59" } })));
});

test("absence / note / statusLog / 想定外の項目の検証", async () => {
  const id = `2026-10-15_${BEN}`;
  const base = recordBody(adminA, { date: "2026-10-15" });
  assert.ok(denied(await create(adminA, id, { ...base, absence: { reason: "あ".repeat(201), contactedAt: "" } })));
  assert.ok(denied(await create(adminA, id, { ...base, absence: { reason: "", contactedAt: "10/15" } })));
  assert.ok(denied(await create(adminA, id, { ...base, note: "あ".repeat(501) })));
  assert.ok(denied(await create(adminA, id, { ...base, statusLog: Array.from({ length: 31 }, () => base.statusLog[0]) })));
  assert.ok(denied(await create(adminA, id, { ...base, confirmed: true })), "Phase 2 では確定フラグを持たない");
  assert.ok(denied(await create(adminA, id, { ...base, schemaVersion: 2 })));
  const { note: _omit, ...missing } = base;
  void _omit;
  assert.ok(denied(await create(adminA, id, missing)), "必須項目の欠落");
});

test("actor：本人以外の updatedBy / createdBy、他人のメールアドレスは拒否", async () => {
  const id = `2026-10-16_${BEN}`;
  const base = recordBody(adminA, { date: "2026-10-16" });
  assert.ok(denied(await create(lineA, id, base)), "LINE スタッフが管理者を名乗る");
  assert.ok(denied(await create(adminA, id, { ...base, updatedBy: { ...actorOf(adminA), email: "other@example.com" } })));
  assert.ok(denied(await create(adminA, id, { ...base, updatedBy: { uid: adminA.uid, email: adminA.email } })), "name が無い");
  assert.ok(ok(await create(adminA, id, base)));
  assert.ok(denied(await update(lineA, id, { note: "x", updatedBy: actorOf(adminA) })));
});

test("日時：クライアント指定の updatedAt / createdAt は拒否、作成者・作成日時は変更不可", async () => {
  const id = `2026-10-17_${BEN}`;
  const base = recordBody(adminA, { date: "2026-10-17" });
  const clientTime = { ...base, createdAt: { __ts: "2020-01-01T00:00:00Z" }, updatedAt: { __ts: "2020-01-01T00:00:00Z" } };
  assert.ok(denied(await create(adminA, id, clientTime, { serverTime: false })));
  assert.ok(ok(await create(adminA, id, base)));
  assert.ok(denied(await update(adminA, id, { note: "x", updatedBy: actorOf(adminA) }, { serverTime: false })));
  assert.ok(denied(await update(lineA, id, { createdBy: actorOf(lineA), updatedBy: actorOf(lineA) })));
  // 既存の記録を「作成」で丸ごと上書きする（作成日時が変わる）ことはできない ＝ 一括作成が既存の記録を潰さない
  assert.ok(denied(await create(adminA, id, base, { mustNotExist: false })));
});

test("来所・欠席の記録は削除できない", async () => {
  const id = `2026-10-19_${BEN}`;
  assert.ok(ok(await create(adminA, id, recordBody(adminA, { date: "2026-10-19" }))));
  assert.ok(ok(await update(adminA, id, { status: "attended", actual: { startTime: "14:00", endTime: "", pickup: null, dropoff: null }, updatedBy: actorOf(adminA) })));
  assert.ok(denied(await fsDelete(recordPath(id), adminA.token)));
  assert.ok(ok(await update(adminA, id, { status: "absent", actual: { startTime: "", endTime: "", pickup: null, dropoff: null }, updatedBy: actorOf(adminA) })));
  assert.ok(denied(await fsDelete(recordPath(id), adminA.token)));
});

// ===== 既存の権限が変わっていないこと =====

test("利用者doc（usagePlan の保存）は従来どおり同じ事業所だけが書ける", async () => {
  const path = `tenants/${TA}/beneficiaries/${BEN}`;
  const mask = "?updateMask.fieldPaths=usagePlan";
  const body = { usagePlan: { weekdays: [1, 3, 5], defaultStartTime: "14:07", defaultEndTime: "17:43" } };
  assert.ok(ok(await fsReq("PATCH", path, adminA.token, body, mask)));
  assert.ok(ok(await fsReq("PATCH", path, lineA.token, body, mask)));
  assert.ok(denied(await fsReq("PATCH", path, userB.token, body, mask)));
});
