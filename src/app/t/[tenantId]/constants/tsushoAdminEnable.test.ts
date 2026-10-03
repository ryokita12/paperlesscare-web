// Phase 1-B6：通所受給者証（tsusho）を管理Webにだけ公開したことの固定。
//   - 管理Web：選択肢に出て、選択できる。7ページ。見本画像は無いので画像を参照しない（404 にしない）
//   - LINE：出さない（lineEnabled = false）
//   - B3〜B5 で準備した parser・保存・summary の仕様はそのまま
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  adminCertTypeOptions,
  CERT_TYPES,
  createEmptyPages,
  getPageCount,
  getSampleImagePath,
  isCertTypeSelectable,
  lineCertTypeOptions,
  shouldResetPagesOnCertTypeChange,
} from "./certPages.ts";
import { getCertPageParser } from "../lib/parsers/parseCertText.ts";
import { TSUSHO_PAGE_PARSERS } from "../../../../lib/tsusho/parsers/index.ts";
import { FACE1_STANDARD } from "../../../../lib/tsusho/parsers/fixtures.ts";
import { parseTsushoCertText } from "../../../../lib/tsusho/parsers/index.ts";
import { buildCertificateContent, mergeSummary } from "../lib/firestore/certificateModel.ts";
import { matchesBeneficiary, beneficiaryDisplayName } from "../../../line/lib/beneficiarySearch.ts";
import { extractCertificateHighlights } from "../../../../lib/beneficiaryChart/certificateHighlights.ts";
import {
  EMPTY_PERSONAL,
  matchesChartSearch,
  readChartSections,
  resolveChartIdentity,
} from "../../../../lib/beneficiaryChart/model.ts";

const REPO_DIR = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (pathFromRepo: string) => readFileSync(`${REPO_DIR}${pathFromRepo}`, "utf8");
// コメント行（// … ／ * …）は説明文のため除いて、コードだけを確認する
const codeOnly = (src: string) =>
  src
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

// ---------- 公開範囲 ----------

test("管理Web：adminCertTypeOptions に tsusho が出て、選択できる（enabled / adminVisible = true）", () => {
  const tsusho = adminCertTypeOptions().find((t) => t.id === "tsusho");
  assert.ok(tsusho);
  assert.equal(tsusho.enabled, true);
  assert.equal(tsusho.adminVisible, true);
  assert.equal(isCertTypeSelectable("tsusho", "admin"), true);
});

test("管理Web：表示名は既存の定義（通所受給者証）のまま。独自の別名を作っていない", () => {
  const tsusho = CERT_TYPES.find((t) => t.id === "tsusho");
  assert.equal(tsusho?.label, "通所受給者証");
  assert.equal(tsusho?.shortLabel, "通所受給者証");
  assert.equal(tsusho?.colorName, "通所受給者証");
});

test("LINE：tsusho は lineEnabled = false で、lineCertTypeOptions に出ない（adult / child のみ）", () => {
  const tsusho = CERT_TYPES.find((t) => t.id === "tsusho");
  assert.equal(tsusho?.lineEnabled, false);
  assert.deepEqual(lineCertTypeOptions().map((t) => t.id), ["adult", "child"]);
  assert.equal(isCertTypeSelectable("tsusho", "line"), false);
});

test("LINE：取込画面は lineCertTypeOptions だけを使い、tsusho を直接参照していない", () => {
  const line = codeOnly(read("src/app/line/import/LineCertImportView.tsx"));
  assert.match(line, /lineCertTypeOptions\(\)/);
  assert.equal(/tsusho/.test(line), false);
});

test("テーマ：tsusho の themeClass（cert-type-tsusho）が globals.css に定義されている（進捗バーが無色にならない）", () => {
  const tsusho = CERT_TYPES.find((t) => t.id === "tsusho");
  assert.equal(tsusho?.themeClass, "cert-type-tsusho");
  assert.match(read("src/app/globals.css"), /\.cert-type-tsusho\s*\{/);
});

// ---------- ページ数 ----------

test("ページ数：tsusho = 7、adult / child / mobility = 8（B4 の getPageCount のまま）", () => {
  assert.equal(getPageCount("tsusho"), 7);
  assert.equal(createEmptyPages("tsusho").length, 7);
  for (const certType of ["adult", "child", "mobility"]) {
    assert.equal(getPageCount(certType), 8, certType);
  }
});

test("種別切替：8ページ系 ⇔ tsusho は取込内容を作り直す、adult ⇔ child は保持（B4 の仕様のまま）", () => {
  assert.equal(shouldResetPagesOnCertTypeChange("adult", "tsusho"), true);
  assert.equal(shouldResetPagesOnCertTypeChange("child", "tsusho"), true);
  assert.equal(shouldResetPagesOnCertTypeChange("tsusho", "adult"), true);
  assert.equal(shouldResetPagesOnCertTypeChange("tsusho", "child"), true);
  assert.equal(shouldResetPagesOnCertTypeChange("adult", "child"), false);
  assert.equal(shouldResetPagesOnCertTypeChange("child", "adult"), false);
});

// ---------- 見本画像（404 対策） ----------

test("見本画像：tsusho は見本画像が無いため、全ページ null（画像を参照しない）", () => {
  for (let i = 0; i < 7; i++) assert.equal(getSampleImagePath("tsusho", i), null, `page ${i + 1}`);
  assert.equal(existsSync(`${REPO_DIR}public/cert-samples/tsusho`), false);
});

test("見本画像：adult / child / mobility は従来どおりのパスで、8ページ分のファイルが実在する", () => {
  for (const certType of ["adult", "child", "mobility"]) {
    for (let i = 0; i < 8; i++) {
      const path = getSampleImagePath(certType, i);
      assert.equal(path, `/cert-samples/${certType}/page-${i + 1}.png`);
      assert.ok(existsSync(`${REPO_DIR}public${path}`), path!);
    }
    assert.equal(getSampleImagePath(certType, 8), null, `${certType} 9ページ目`);
  }
  assert.equal(getSampleImagePath(null, 0), null);
  assert.equal(getSampleImagePath("unknown", 0), null);
});

test("見本画像：ページタブは getSampleImagePath を通し、/cert-samples/ のパスを直接組み立てない", () => {
  const tabs = read("src/app/t/[tenantId]/components/PageTabs.tsx");
  assert.match(tabs, /getSampleImagePath\(selectedCertType, index\)/);
  assert.equal(/\/cert-samples\//.test(tabs), false);
});

// ---------- parser ----------

test("parser：tsusho の一〜五面は B2 の parser がそのまま登録され、六・七面は parser なし", () => {
  for (let i = 0; i < 5; i++) {
    assert.equal(getCertPageParser("tsusho", i), TSUSHO_PAGE_PARSERS[i], `page ${i + 1}`);
    assert.ok(getCertPageParser("tsusho", i));
  }
  assert.equal(getCertPageParser("tsusho", 5), null);
  assert.equal(getCertPageParser("tsusho", 6), null);
  // adult の parser 登録・child の未登録は変わっていない
  for (let i = 0; i < 4; i++) assert.ok(getCertPageParser("adult", i), `adult ${i + 1}`);
  for (let i = 0; i < 8; i++) assert.equal(getCertPageParser("child", i), null, `child ${i + 1}`);
});

test("candidates（OCR → カルテ反映候補）は、まだアプリから使っていない（Phase 1-B7）", () => {
  for (const file of [
    "src/app/t/[tenantId]/CertImportFlow.tsx",
    "src/app/t/[tenantId]/lib/firestore/beneficiaries.ts",
    "src/app/t/[tenantId]/lib/firestore/certificateModel.ts",
    "src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx",
  ]) {
    assert.equal(/lib\/tsusho\/candidates/.test(read(file)), false, file);
  }
});

// ---------- summary（B5 で確定した仕様） ----------

const face1 = parseTsushoCertText(FACE1_STANDARD, 0);
const tsushoSummary = buildCertificateContent({
  certType: "tsusho",
  pages: [{ pageNo: 1, title: "", formData: face1, ocrText: "", storagePath: "" }],
}).summary;

test("summary：現在の受給者証の代表情報（証の一面＝児童・番号・市町村）として、新しい証の値を保持する", () => {
  const previous = { name: "既存 太郎", furigana: "キソン タロウ", number: "9999999999", birthday: "", cityName: "旧市" };
  const merged = mergeSummary(tsushoSummary, previous);
  assert.equal(merged.name, "架空 勇気");
  assert.equal(merged.number, "1234567890");
  assert.equal(merged.cityName, "架空市");
});

test("summary：表示名はカルテ（personal）→ profile が優先され、summary.name では検索もヒットする（現在の仕様）", () => {
  const record = {
    profile: { name: "既存 太郎", furigana: "キソン タロウ", birthday: "" },
    summary: mergeSummary(tsushoSummary, undefined),
  };
  const sections = readChartSections({ personal: { ...EMPTY_PERSONAL, name: "既存 太郎" } });
  const identity = resolveChartIdentity(record, sections, new Date("2026-10-03"));
  assert.equal(identity.name, "既存 太郎");
  assert.equal(beneficiaryDisplayName(record), "既存 太郎");

  assert.equal(matchesChartSearch({ identity, record }, "架空勇気"), true);
  assert.equal(matchesChartSearch({ identity, record }, "既存"), true);
  assert.equal(matchesBeneficiary(record, "架空 勇気"), true);
  assert.equal(matchesBeneficiary(record, "1234567890"), true);
});

// ---------- 受給者証タブの「主な内容」 ----------

test("主な内容：tsusho はサービスを二・三面、利用者負担を五面から読む（8ページ様式の7・8ページを見ない）", () => {
  const pages = [
    { pageNo: 1, formData: { number: "1100000001", cityName: "架空市" } },
    { pageNo: 2, formData: { serviceType1: "児童発達支援", servicePeriod1: "P1", serviceType2: "放課後等デイサービス", servicePeriod2: "P2" } },
    { pageNo: 3, formData: { serviceType3: "保育所等訪問支援", servicePeriod3: "P3" } },
    { pageNo: 4, formData: { supportPeriod: "P4" } },
    { pageNo: 5, formData: { burdenLimitAmount: "4,600円", burdenPeriod: "P5", managementTargetStatus: "対象者" } },
    { pageNo: 6, formData: {} },
    { pageNo: 7, formData: { burdenLimitAmount: "事業者記入欄の値" } },
  ];
  const h = extractCertificateHighlights(pages, "tsusho");
  assert.equal(h.number, "1100000001");
  assert.deepEqual(h.services.map((s) => s.type), ["児童発達支援", "放課後等デイサービス", "保育所等訪問支援"]);
  assert.equal(h.burdenLimitAmount, "4,600円");
  assert.equal(h.burdenPeriod, "P5");
  assert.equal(h.managementTargetStatus, "対象者");
});

test("主な内容：adult / child / 種別なしは従来どおり（サービス＝2〜4ページ、利用者負担＝7・8ページ）", () => {
  const pages = [
    { pageNo: 2, formData: { serviceType1: "居宅介護" } },
    { pageNo: 4, formData: { serviceType5: "就労継続支援B型" } },
    { pageNo: 5, formData: { burdenLimitAmount: "ページ5の値" } },
    { pageNo: 7, formData: { burdenLimitAmount: "9,300円" } },
  ];
  for (const certType of ["adult", "child", undefined, null]) {
    const h = extractCertificateHighlights(pages, certType);
    assert.equal(h.burdenLimitAmount, "9,300円", String(certType));
    assert.deepEqual(h.services.map((s) => s.type), ["居宅介護", "就労継続支援B型"], String(certType));
  }
});
