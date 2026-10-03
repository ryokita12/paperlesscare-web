// Phase 1-B5：通所受給者証（tsusho）の保存モデル。
// 代表期間（validFrom / validTo）・summary・profile の扱いと、adult / child の互換を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCertificateContent,
  extractValidity,
  hasChartPersonal,
  mergeProfile,
  resolveProfileOnCertificateAdd,
  type SavedCertPage,
} from "./certificateModel.ts";
import { emptyFormData } from "../../constants/certPages.ts";
import { parseTsushoCertText } from "../../../../../lib/tsusho/parsers/index.ts";
import { FACE1_STANDARD } from "../../../../../lib/tsusho/parsers/fixtures.ts";

function page(pageNo: number, formData: Record<string, string> = {}): SavedCertPage {
  return { pageNo, title: `p${pageNo}`, formData: { ...emptyFormData(), ...formData }, ocrText: "", storagePath: "" };
}

/** tsusho の7ページ（指定したページだけ値を入れる） */
function tsushoPages(byPage: Record<number, Record<string, string>>): SavedCertPage[] {
  return Array.from({ length: 7 }, (_, i) => page(i + 1, byPage[i + 1] ?? {}));
}

const P_2025 = "令和7年4月1日から令和8年3月31日まで";
const P_2026 = "令和8年4月1日から令和9年3月31日まで";
const P_2026_LONG = "令和8年4月1日から令和10年3月31日まで";

// ---------- 代表期間 ----------

test("A：放課後等デイサービスが1件 → その給付決定期間", () => {
  const c = buildCertificateContent({
    certType: "tsusho",
    pages: tsushoPages({ 2: { serviceType1: "放課後等デイサービス", serviceAmount1: "23日/月", servicePeriod1: P_2026 } }),
  });
  assert.equal(c.validFrom, "2026-04-01");
  assert.equal(c.validTo, "2027-03-31");
});

test("B：放デイ＋他サービス → 終了日が遅い他サービスより放デイを代表にする", () => {
  const c = buildCertificateContent({
    certType: "tsusho",
    pages: tsushoPages({
      2: {
        serviceType1: "保育所等訪問支援", servicePeriod1: P_2026_LONG,
        serviceType2: "放課後等デイサービス", servicePeriod2: P_2026,
      },
    }),
  });
  assert.equal(c.validTo, "2027-03-31");
});

test("C：放デイが複数（旧期間＋新期間、三面にも放デイ） → 終了日が最も遅い放デイ", () => {
  const c = buildCertificateContent({
    certType: "tsusho",
    pages: tsushoPages({
      2: { serviceType1: "放課後等デイサービス", servicePeriod1: P_2025, serviceType2: "児童発達支援", servicePeriod2: P_2026_LONG },
      3: { serviceType3: "放課後等デイサービス", servicePeriod3: P_2026 },
    }),
  });
  assert.equal(c.validFrom, "2026-04-01");
  assert.equal(c.validTo, "2027-03-31");
});

test("D：放デイなし → 全サービスで終了日が最も遅い期間", () => {
  const c = buildCertificateContent({
    certType: "tsusho",
    pages: tsushoPages({
      2: { serviceType1: "児童発達支援", servicePeriod1: P_2026 },
      3: { serviceType3: "保育所等訪問支援", servicePeriod3: P_2026_LONG },
    }),
  });
  assert.equal(c.validTo, "2028-03-31");
});

test("E：利用者負担（五面）の期間しか無い → 代表期間にしない（null）", () => {
  const c = buildCertificateContent({
    certType: "tsusho",
    pages: tsushoPages({ 5: { burdenLimitAmount: "4,600円", burdenPeriod: P_2026, mealProvisionPeriod: P_2026 } }),
  });
  assert.equal(c.validFrom, null);
  assert.equal(c.validTo, null);
});

test("F：相談支援（四面）の期間しか無い → 代表期間にしない（null）", () => {
  const c = buildCertificateContent({
    certType: "tsusho",
    pages: tsushoPages({ 4: { supportPeriod: P_2026, monitoringPeriod: "6月ごと" } }),
  });
  assert.equal(c.validFrom, null);
  assert.equal(c.validTo, null);
});

test("G：期間が無い・読めない → null（一覧では「期限未入力」）", () => {
  for (const pages of [
    tsushoPages({}),
    tsushoPages({ 2: { serviceType1: "放課後等デイサービス", servicePeriod1: "不明" } }),
    [] as SavedCertPage[],
  ]) {
    const c = buildCertificateContent({ certType: "tsusho", pages });
    assert.equal(c.validFrom, null);
    assert.equal(c.validTo, null);
  }
});

test("tsusho では、adult 用の規則（二面1行目 → 七面の負担期間）を使わない", () => {
  // 1行目が児童発達支援、2行目が放デイ：adult の規則なら1行目を採るが、tsusho は放デイを採る
  const pages = tsushoPages({
    2: { serviceType1: "児童発達支援", servicePeriod1: P_2026_LONG, serviceType2: "放課後等デイサービス", servicePeriod2: P_2026 },
  });
  assert.equal(extractValidity(pages).validTo, "2028-03-31");
  assert.equal(buildCertificateContent({ certType: "tsusho", pages }).validTo, "2027-03-31");
});

// ---------- summary ----------

test("summary：tsusho の一面から、児童の氏名・受給者証番号・市町村・交付日を作る（保護者名は入らない）", () => {
  const face1 = parseTsushoCertText(FACE1_STANDARD, 0);
  const c = buildCertificateContent({ certType: "tsusho", pages: [page(1, face1), ...tsushoPages({}).slice(1)] });
  assert.equal(c.certType, "tsusho");
  assert.equal(c.summary.name, "架空 勇気");
  assert.notEqual(c.summary.name, "架空 太郎");
  assert.equal(c.summary.furigana, "カクウ ユーキ");
  assert.equal(c.summary.birthday, "平成28年5月10日");
  assert.equal(c.summary.number, "1234567890");
  assert.equal(c.summary.cityName, "架空市");
  assert.equal(c.issueDate, "令和8年3月15日");
  assert.equal(c.pages[0].formData.guardianName, "架空 太郎"); // 読み取り結果は証に残る
});

// ---------- adult / child の互換 ----------

test("adult / child：buildCertificateContent の期間は従来どおり（二面1行目 → 七面の負担期間）", () => {
  for (const certType of ["adult", "child"] as const) {
    const pages = Array.from({ length: 8 }, (_, i) => page(i + 1));
    pages[1] = page(2, { serviceType1: "短期入所", servicePeriod1: P_2025 });
    pages[6] = page(7, { burdenPeriod: P_2026 });
    const c = buildCertificateContent({ certType, pages });
    assert.deepEqual({ validFrom: c.validFrom, validTo: c.validTo }, extractValidity(pages), certType);
    assert.equal(c.validTo, "2026-03-31", certType);

    const onlyBurden = Array.from({ length: 8 }, (_, i) => page(i + 1));
    onlyBurden[6] = page(7, { burdenPeriod: P_2026 });
    assert.equal(buildCertificateContent({ certType, pages: onlyBurden }).validTo, "2027-03-31", certType);
  }
});

// ---------- profile ----------

test("profile：adult / child は従来どおり mergeProfile（personal の有無に関係なく、証の値を優先）", () => {
  const previousProfile = { name: "山田 太郎", furigana: "ヤマダ タロウ", birthday: "平成20年1月1日" };
  const certSummary = { name: "山田 太朗", furigana: "", number: "1", birthday: "平成20年1月2日", cityName: "" };
  for (const certType of ["adult", "child", "mobility"] as const) {
    for (const hasPersonal of [true, false]) {
      assert.deepEqual(
        resolveProfileOnCertificateAdd({ certType, certSummary, previousProfile, hasPersonal }),
        mergeProfile(certSummary, previousProfile),
        `${certType} / personal=${hasPersonal}`
      );
    }
  }
});

test("profile：tsusho で personal がある利用者は profile を更新しない（null）", () => {
  assert.equal(
    resolveProfileOnCertificateAdd({
      certType: "tsusho",
      certSummary: { name: "山田 太朗", furigana: "ヤマダ タロウ", number: "1", birthday: "平成20年1月2日", cityName: "" },
      previousProfile: { name: "山田 太郎", furigana: "ヤマダ タロウ", birthday: "平成20年1月1日" },
      hasPersonal: true,
    }),
    null
  );
});

test("profile：tsusho で personal が無い旧データは、従来の値を変えず空欄だけ証の値で補う", () => {
  const result = resolveProfileOnCertificateAdd({
    certType: "tsusho",
    certSummary: { name: "山田 太朗", furigana: "ヤマダ タロウ", number: "1", birthday: "平成20年1月2日", cityName: "" },
    previousProfile: { name: "山田 太郎", furigana: "", birthday: "平成20年1月1日" },
    hasPersonal: false,
  });
  assert.deepEqual(result, { name: "山田 太郎", furigana: "ヤマダ タロウ", birthday: "平成20年1月1日" });
});

test("profile：tsusho で personal が無く、OCR の氏名が空でも、従来の表示名は消えない", () => {
  const result = resolveProfileOnCertificateAdd({
    certType: "tsusho",
    certSummary: { name: "", furigana: "", number: "", birthday: "", cityName: "" },
    previousProfile: { name: "山田 太郎", furigana: "ヤマダ タロウ", birthday: "平成20年1月1日" },
    hasPersonal: false,
  });
  assert.deepEqual(result, { name: "山田 太郎", furigana: "ヤマダ タロウ", birthday: "平成20年1月1日" });
});

test("hasChartPersonal：personal のマップがあるときだけ true", () => {
  assert.equal(hasChartPersonal({ personal: { name: "" } }), true);
  assert.equal(hasChartPersonal({ personal: { name: "山田 太郎" } }), true);
  assert.equal(hasChartPersonal({}), false);
  assert.equal(hasChartPersonal({ personal: null }), false);
  assert.equal(hasChartPersonal({ personal: "山田" }), false);
  assert.equal(hasChartPersonal({ personal: [] }), false);
});
