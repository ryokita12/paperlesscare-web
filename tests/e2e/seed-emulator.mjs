// ローカル確認用テストデータ（Firebase Emulator 専用）。
//
// 放課後等デイサービスの実利用者像に合わせ、利用者は18歳未満の児童（小学生〜高校生）を中心にしている。
// 氏名・学校名・番号はすべて架空。実在の人物・児童・学校とは関係ない。
//
// 実行（エミュレーター起動中に）：
//   firebase emulators:start --project demo-paperlesscare --only auth,firestore,storage,functions
//   node tests/e2e/seed-emulator.mjs [認証情報の出力先.json]
//
// 安全のため、接続先は 127.0.0.1 のエミュレーター・"demo-" プロジェクトに固定している（本番には接続できない）。
// 管理者のパスワードは実行ごとに生成し、引数のファイル（省略時は OS の一時フォルダ）にだけ書き出す。
//
// 生年月日は「2026年10月時点」で自然な年齢・学年になるよう固定している。
// 受給者証の有効期限は実行日からの相対日付で作るため、いつ実行しても状態（有効／期限間近／期限切れ）が変わらない。
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = "demo-paperlesscare";
if (!PROJECT.startsWith("demo-")) throw new Error("demo- プロジェクト以外には投入しない");
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const ST = `http://127.0.0.1:9199/v0/b/${PROJECT}.appspot.com/o`;
const T = "t-test";
const STAFF_KEY = "testkey123";

// ---- REST helpers（"Bearer owner" はエミュレーター専用の管理者トークン） ----
const val = (v) =>
  v === null ? { nullValue: null }
  : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "number" ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === "object" ? (v.__ts ? { timestampValue: v.__ts } : { mapValue: { fields: fields(v) } })
  : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));

async function set(path, obj) {
  const r = await fetch(`${FS}/${path}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields(obj) }),
  });
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
}

async function upload(path, buf, contentType) {
  const b = "seed-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: path, contentType })}\r\n--${b}\r\nContent-Type: ${contentType}\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${b}--`),
  ]);
  const r = await fetch(`${ST}?name=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { Authorization: "Bearer owner", "Content-Type": `multipart/related; boundary=${b}`, "X-Goog-Upload-Protocol": "multipart" },
    body,
  });
  if (!r.ok) throw new Error(`upload ${r.status}`);
}

// ---- 日付 ----
const ts = (iso) => ({ __ts: iso });
const pad = (n) => String(n).padStart(2, "0");
function isoFromToday(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function wareki(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const [era, base] = y >= 2019 ? ["令和", 2018] : ["平成", 1988];
  const ey = y - base;
  return `${era}${ey === 1 ? "元" : ey}年${m}月${d}日`;
}

const actor = { uid: "seed", email: "seed@example.test" };
const page = (no, formData = {}, storagePath = "") => ({ pageNo: no, title: `p${no}`, formData, ocrText: "", storagePath });
const pages = (p1, extra = {}, sp1 = "") =>
  [1, 2, 3, 4, 5, 6, 7, 8].map((n) => page(n, n === 1 ? p1 : extra[n] ?? {}, n === 1 ? sp1 : ""));
const summaryOf = (name, furigana, number, birthday, cityName) => ({ name, furigana, number, birthday, cityName });

const base = (id, o) =>
  set(`tenants/${T}/beneficiaries/${id}`, {
    tenantId: T,
    status: "active",
    createdBy: actor,
    updatedBy: actor,
    createdAt: ts("2026-09-01T00:00:00Z"),
    ...o,
  });

// 現在の受給者証（18歳未満＝child・黄緑色）を1件作る
async function currentCert(beneficiaryId, certId, { name, number, cityName, validFrom, validTo, issueDate, extraPages = {}, storagePath = "" }) {
  await set(`tenants/${T}/beneficiaries/${beneficiaryId}/certificates/${certId}`, {
    beneficiaryId,
    certType: "child",
    pages: pages({ name, number, cityName, issueDate }, extraPages, storagePath),
    summary: summaryOf(name, "", number, "", cityName),
    issueDate,
    validFrom,
    validTo,
    status: "current",
    supersededBy: null,
    source: "mobile",
    createdBy: actor,
    createdAt: ts("2026-04-01T00:00:00Z"),
    updatedBy: actor,
    updatedAt: ts("2026-04-01T00:00:00Z"),
  });
}

const serviceP2 = (from, to) => ({
  2: { serviceType1: "放課後等デイサービス", servicePeriod1: `${wareki(from)}から${wareki(to)}まで`, serviceAmount1: "23日/月" },
});
const burdenP7 = { 7: { burdenLimitAmount: "4,600円", managementTargetStatus: "対象者", managementOfficeName: "なないろ放課後等デイサービス" } };

// ===== 管理者・事業所・LINEスタッフ認証キー =====
const password = `E2e-${randomBytes(6).toString("hex")}`;
const su = await (await fetch(`${AUTH}/accounts:signUp?key=demo-key`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@example.test", password, returnSecureToken: true }),
})).json();
if (!su.localId) throw new Error(`管理者を作成できません（既に存在する場合はエミュレーターを再起動してください）: ${JSON.stringify(su.error ?? su)}`);
await set(`users/${su.localId}`, { tenantId: T });
const keyHash = createHash("sha256").update(STAFF_KEY.normalize("NFKC").trim().toLowerCase()).digest("hex");
await set(`tenants/${T}`, { name: "なないろ放課後等デイサービス（テスト）", staffAuthKeyHash: keyHash, staffAuthKeyEnabled: true });
await set(`staffAuthKeys/${keyHash}`, { tenantId: T });

// ===== 利用者（2026年10月時点の年齢・学年） =====

// 小学2年生・8歳（2018-06-12生）：現在＋過去の受給者証、期限間近、画像あり、和暦の生年月日、学校・保護者あり
{
  const id = "b-current";
  const name = "佐藤 ひなた";
  const number = "2222222222";
  const img = readFileSync(fileURLToPath(new URL("../../public/cert-samples/child/page-1.png", import.meta.url)));
  const sp = `tenants/${T}/recipients/${id}/certificates/c2/page1.jpg`;
  await upload(sp, img, "image/jpeg");
  await base(id, {
    profile: { name, furigana: "サトウ ヒナタ", birthday: wareki("2018-06-12") },
    summary: summaryOf(name, "サトウ ヒナタ", number, wareki("2018-06-12"), "なないろ市"),
    currentCertificateId: "c2",
    certificateCount: 2,
    certType: "child",
    school: { schoolName: "なないろ市立なないろ小学校", grade: "", className: "2年1組", teacherName: "" },
    guardian: { name: "佐藤 美咲", furigana: "サトウ ミサキ", relationship: "母", phone: "090-0000-1111", emergencyContact: "", email: "", sameAddressAsBeneficiary: true, postalCode: "", address: "" },
    updatedAt: ts("2026-09-20T00:00:00Z"),
  });
  await set(`tenants/${T}/beneficiaries/${id}/certificates/c1`, {
    beneficiaryId: id, certType: "child", pages: pages({ name, number }),
    summary: summaryOf(name, "", number, "", ""), issueDate: "令和7年3月1日",
    validFrom: isoFromToday(-560), validTo: isoFromToday(-200), status: "superseded", supersededBy: "c2", source: "web",
    createdBy: actor, createdAt: ts("2025-03-01T00:00:00Z"), updatedBy: actor, updatedAt: ts("2025-03-01T00:00:00Z"),
  });
  const from = isoFromToday(-185);
  const to = isoFromToday(17);
  await currentCert(id, "c2", {
    name, number, cityName: "なないろ市", validFrom: from, validTo: to, issueDate: "令和8年3月1日",
    extraPages: { ...serviceP2(from, to), ...burdenP7 }, storagePath: sp,
  });
}

// 小学5年生・11歳（2015-08-03生）：旧形式データ（currentCertificateId なし・直下に pages、ページ2の1組目が旧フィールド）、和暦の生年月日は summary のみ
await base("b-legacy", {
  summary: summaryOf("田中 太郎", "", "1111111111", "平成27年8月3日", "なないろ市"),
  pages: pages(
    { name: "田中 太郎", birthday: "平成27年8月3日", number: "1111111111", cityName: "なないろ市" },
    { 2: { name: "放課後等デイサービス", birthday: `${wareki(isoFromToday(-550))}から${wareki(isoFromToday(-10))}まで`, childName: "15日/月" } }
  ),
  updatedAt: ts("2026-09-10T00:00:00Z"),
});

// 中学1年生・13歳（2013-07-22生）：受給者証 期限切れ、学校情報あり
await base("b-expired", {
  profile: { name: "山田 花子", furigana: "ヤマダ ハナコ", birthday: "2013年7月22日" },
  summary: summaryOf("山田 花子", "ヤマダ ハナコ", "3333333301", "", "なないろ市"),
  currentCertificateId: "b-expired-c", certificateCount: 1, certType: "child",
  school: { schoolName: "なないろ市立なないろ中学校", grade: "", className: "1年3組", teacherName: "" },
  updatedAt: ts("2026-09-15T00:00:00Z"),
});
await currentCert("b-expired", "b-expired-c", { name: "山田 花子", number: "3333333301", cityName: "なないろ市", validFrom: isoFromToday(-400), validTo: isoFromToday(-2), issueDate: "令和7年3月1日" });

// 中学3年生・14歳（2012-02-10生、早生まれ）：受給者証 有効、カルテの本人情報（ISOの生年月日）あり
await base("b-valid", {
  profile: { name: "鈴木 大翔", furigana: "スズキ ヒロト", birthday: "2012年2月10日" },
  personal: { name: "鈴木 大翔", furigana: "スズキ ヒロト", birthDate: "2012-02-10", postalCode: "000-0001", address: "なないろ市みどり町1-2-3", phone: "", usageStatus: "active" },
  summary: summaryOf("鈴木 大翔", "スズキ ヒロト", "3333333302", "", "なないろ市"),
  currentCertificateId: "b-valid-c", certificateCount: 1, certType: "child",
  school: { schoolName: "なないろ市立なないろ中学校", grade: "", className: "3年2組", teacherName: "" },
  updatedAt: ts("2026-09-14T00:00:00Z"),
});
await currentCert("b-valid", "b-valid-c", { name: "鈴木 大翔", number: "3333333302", cityName: "なないろ市", validFrom: isoFromToday(-180), validTo: isoFromToday(180), issueDate: "令和8年3月1日", extraPages: burdenP7 });

// 高校1年生・16歳（2010-09-05生）：受給者証 期限未入力（有効期限が読み取れていない）、手動学年（特別支援学校 高等部）
await base("b-unknown", {
  profile: { name: "高橋 結衣", furigana: "タカハシ ユイ", birthday: "2010年9月5日" },
  summary: summaryOf("高橋 結衣", "タカハシ ユイ", "3333333303", "", "なないろ市"),
  currentCertificateId: "b-unknown-c", certificateCount: 1, certType: "child",
  school: { schoolName: "なないろ県立あおぞら特別支援学校", grade: "高等部1年", className: "", teacherName: "" },
  updatedAt: ts("2026-09-13T00:00:00Z"),
});
await currentCert("b-unknown", "b-unknown-c", { name: "高橋 結衣", number: "3333333303", cityName: "なないろ市", validFrom: null, validTo: null, issueDate: "" });

// 小学3年生・9歳（2017-05-30生）：受給者証 未登録（管理Webで枠だけ作成した利用者）
await base("b-nocert", {
  profile: { name: "伊藤 そら", furigana: "イトウ ソラ", birthday: "2017年5月30日" },
  summary: summaryOf("伊藤 そら", "イトウ ソラ", "", "", ""),
  currentCertificateId: null, certificateCount: 0, certType: null,
  updatedAt: ts("2026-09-12T00:00:00Z"),
});

// 不正・空データ（氏名なし、読めない生年月日、壊れたカルテ値）
await base("b-weird", {
  profile: { name: "", birthday: "不明" },
  personal: "壊れた値",
  guardian: { sameAddressAsBeneficiary: "yes", name: 123 },
  currentCertificateId: null,
  updatedAt: ts("2026-09-11T00:00:00Z"),
});

const out = process.argv[2] || join(tmpdir(), "paperlesscare-e2e-credentials.json");
writeFileSync(out, JSON.stringify({ email: "admin@example.test", password, staffKey: STAFF_KEY }), { mode: 0o600 });
console.log(`seeded（管理者のログイン情報: ${out}）`);
