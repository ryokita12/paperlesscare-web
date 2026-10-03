// Phase 1-B6：管理Webで既存利用者の「受給者証を更新」を開いたときの、受給者証の種別の初期選択。
//   新規利用者 … adult（従来どおり。この関数は使わない）
//   既存利用者 … 現在の受給者証の種別（tsusho / adult / child）。無い・未知・取得できない場合は adult
//   取込セッションの復元・ユーザーの選び直し・取込内容がある場合は、勝手に切り替えない
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createEmptyPages,
  getPageCount,
  hasImportWork,
  resolveInitialCertTypeForUpdate,
  type CertTypeId,
} from "./certPages.ts";

const REPO_DIR = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (pathFromRepo: string) => readFileSync(`${REPO_DIR}${pathFromRepo}`, "utf8");

// 管理Webの取込画面の初期状態（新規に開いた直後：adult・8ページ・取込なし）から判定する
function decide(
  beneficiaryCertType: string | null | undefined,
  overrides: Partial<Parameters<typeof resolveInitialCertTypeForUpdate>[0]> = {}
) {
  return resolveInitialCertTypeForUpdate({
    beneficiaryCertType,
    selectedCertType: "adult",
    restoredSessionForSameBeneficiary: false,
    userChangedCertType: false,
    hasImportWork: false,
    ...overrides,
  });
}

/** 判定を適用した後の種別とページ数（null なら今のまま） */
function after(selected: CertTypeId, decision: ReturnType<typeof decide>) {
  const certType = decision?.certType ?? selected;
  return { certType, pageCount: getPageCount(certType) };
}

test("現在の証が tsusho → tsusho・7ページ（8ページ系から作り直す）", () => {
  const d = decide("tsusho");
  assert.deepEqual(d, { certType: "tsusho", resetPages: true });
  assert.deepEqual(after("adult", d), { certType: "tsusho", pageCount: 7 });
});

test("現在の証が adult → adult・8ページ（初期状態のまま）", () => {
  const d = decide("adult");
  assert.equal(d, null);
  assert.deepEqual(after("adult", d), { certType: "adult", pageCount: 8 });
});

test("現在の証が child → child・8ページ（ページは作り直さない）", () => {
  const d = decide("child");
  assert.deepEqual(d, { certType: "child", resetPages: false });
  assert.deepEqual(after("adult", d), { certType: "child", pageCount: 8 });
});

test("種別が無い・未知・管理Webで選べない種別（mobility）・取得できない → adult・8ページ", () => {
  for (const certType of [null, undefined, "", "unknown", "mobility"]) {
    const d = decide(certType);
    assert.equal(d, null, String(certType));
    assert.deepEqual(after("adult", d), { certType: "adult", pageCount: 8 }, String(certType));
  }
  // 別の種別（tsusho）が選ばれた状態からでも、未知の種別なら adult に戻す（取込内容が無い場合）
  assert.deepEqual(decide(null, { selectedCertType: "tsusho" }), { certType: "adult", resetPages: true });
});

test("同じ利用者の取込セッションを復元した場合は、現在の証の種別で上書きしない（復元を優先）", () => {
  assert.equal(decide("tsusho", { restoredSessionForSameBeneficiary: true }), null);
  assert.equal(
    decide("adult", { selectedCertType: "tsusho", restoredSessionForSameBeneficiary: true }),
    null
  );
});

test("利用者の取得を待つ間にユーザーが種別を選び直した場合は、上書きしない", () => {
  assert.equal(decide("tsusho", { selectedCertType: "child", userChangedCertType: true }), null);
});

test("様式の系統が変わる（8ページ系 ⇔ tsusho）のに取込内容がある場合は、取込を消さない（切り替えない）", () => {
  assert.equal(decide("tsusho", { hasImportWork: true }), null);
  assert.equal(decide("adult", { selectedCertType: "tsusho", hasImportWork: true }), null);
});

test("adult ⇔ child は取込内容があっても切り替える（B4 どおりページは作り直さず保持）", () => {
  assert.deepEqual(decide("child", { hasImportWork: true }), { certType: "child", resetPages: false });
});

test("hasImportWork：画像・OCR結果・入力のいずれかがあれば true", () => {
  assert.equal(hasImportWork(createEmptyPages("tsusho")), false);
  const withInput = createEmptyPages("adult");
  withInput[2] = { ...withInput[2], formData: { ...withInput[2].formData, name: "架空 太郎" } };
  assert.equal(hasImportWork(withInput), true);
  const withOcr = createEmptyPages("adult");
  withOcr[0] = { ...withOcr[0], ocrText: "text" };
  assert.equal(hasImportWork(withOcr), true);
  assert.equal(hasImportWork([{ selectedFile: {}, ocrText: "", formData: {} }]), true);
});

test("取込画面：管理Webだけが resolveInitialCertTypeForUpdate を使い、LINE は従来の分岐（tsusho は選べない）のまま", () => {
  const flow = read("src/app/t/[tenantId]/CertImportFlow.tsx");
  const adminBranch = flow.indexOf('if (variant === "admin") {');
  const decisionCall = flow.indexOf("resolveInitialCertTypeForUpdate({");
  const lineBranch = flow.indexOf("isCertTypeSelectable(sameType.id, variant)");
  assert.ok(adminBranch > 0 && decisionCall > adminBranch, "管理Webの分岐の中で判定している");
  assert.ok(lineBranch > decisionCall, "LINE の従来の分岐が残っている");
  // 新規利用者の初期値は従来どおり adult（復元した取込があればその種別）
  assert.match(flow, /restoredSession\?\.selectedCertType \?\? "adult"/);
  // LINE の画面コードは変更していない（種別の決め方は lineCertTypeOptions のまま）
  assert.equal(/resolveInitialCertTypeForUpdate/.test(read("src/app/line/import/LineCertImportView.tsx")), false);
});
