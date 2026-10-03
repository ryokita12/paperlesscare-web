import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTsushoChartCandidates,
  type TsushoChartCandidate,
  type TsushoChartSnapshot,
} from "./candidates.ts";
import {
  normalizeAddressForCompare,
  normalizeFuriganaForCompare,
  normalizeNameForCompare,
} from "./normalize.ts";
import { parseTsushoCertText } from "./parsers/index.ts";
import { FACE1_ADULT_SELF, FACE1_STANDARD, FACE4_STANDARD } from "./parsers/fixtures.ts";
import { EMPTY_SECTIONS } from "../beneficiaryChart/model.ts";

function emptyChart(): TsushoChartSnapshot {
  return {
    personal: { name: "", furigana: "", birthDate: "", address: "" },
    guardian: { name: "", furigana: "", address: "", sameAddressAsBeneficiary: false },
    consultationSupport: { officeName: "" },
  };
}

function pagesFrom(face1: Record<string, string>, face4: Record<string, string> = {}) {
  return [
    { pageNo: 1, formData: face1 },
    { pageNo: 4, formData: face4 },
  ];
}

function standardPages() {
  return [
    { pageNo: 1, formData: parseTsushoCertText(FACE1_STANDARD, 0) },
    { pageNo: 4, formData: parseTsushoCertText(FACE4_STANDARD, 3) },
  ];
}

function byTarget(candidates: TsushoChartCandidate[], target: string) {
  const found = candidates.find((c) => c.target === target);
  assert.ok(found, `${target} の候補があること`);
  return found;
}

// ---------- 正規化（比較専用） ----------

test("比較用正規化：氏名は NFKC＋空白除去", () => {
  assert.equal(normalizeNameForCompare("架空　太郎"), normalizeNameForCompare("架空 太郎"));
  assert.equal(normalizeNameForCompare(" 架空太郎 "), "架空太郎");
});

test("比較用正規化：フリガナはひらがな・カタカナ・長音の OCR 置換（-）を同一視する", () => {
  assert.equal(normalizeFuriganaForCompare("かくう ゆーき"), normalizeFuriganaForCompare("カクウ ユーキ"));
  assert.equal(normalizeFuriganaForCompare("カクウ ユ-キ"), normalizeFuriganaForCompare("カクウ ユーキ"));
});

test("比較用正規化：住所のハイフン類（‐ － ー − 等）と空白を同一視する", () => {
  const a = normalizeAddressForCompare("架空市架空町1-2-3");
  for (const v of ["架空市架空町1‐2‐3", "架空市架空町1－2－3", "架空市架空町1ー2ー3", "架空市架空町1−2−3", "架空市 架空町 1-2-3"]) {
    assert.equal(normalizeAddressForCompare(v), a, v);
  }
});

// ---------- 候補の状態 ----------

test("候補：カルテが空なら chartEmpty（表示・初期 ON）。児童は personal、保護者は guardian へ", () => {
  const { candidates } = buildTsushoChartCandidates(standardPages(), emptyChart());

  const name = byTarget(candidates, "personal.name");
  assert.equal(name.status, "chartEmpty");
  assert.equal(name.certValue, "架空 勇気");
  assert.equal(name.visible, true);
  assert.equal(name.initiallySelected, true);

  const birth = byTarget(candidates, "personal.birthDate");
  assert.equal(birth.certValue, "平成28年5月10日"); // 表示は原文
  assert.equal(birth.proposedValue, "2016-05-10"); // 書き込むなら ISO

  assert.equal(byTarget(candidates, "guardian.name").certValue, "架空 太郎");
  assert.equal(byTarget(candidates, "guardian.furigana").certValue, "カクウ タロウ");
  assert.equal(byTarget(candidates, "consultationSupport.officeName").certValue, "架空相談支援センター");
});

test("候補：保護者の氏名を personal.name の候補にしない", () => {
  const { candidates } = buildTsushoChartCandidates(standardPages(), emptyChart());
  const personalName = byTarget(candidates, "personal.name");
  assert.notEqual(personalName.certValue, "架空 太郎");
  assert.equal(candidates.filter((c) => c.target === "personal.name").length, 1);
});

test("候補：空白の差だけなら same（表示しない）", () => {
  const chart = emptyChart();
  chart.personal.name = "架空　勇気";
  const name = byTarget(buildTsushoChartCandidates(standardPages(), chart).candidates, "personal.name");
  assert.equal(name.status, "same");
  assert.equal(name.visible, false);
  assert.equal(name.initiallySelected, false);
});

test("候補：フリガナのひらがな／カタカナ差だけなら same", () => {
  const chart = emptyChart();
  chart.personal.furigana = "かくう ゆーき"; // 証は「カクウ ユーキ」
  chart.guardian.furigana = "かくうたろう";
  const { candidates } = buildTsushoChartCandidates(standardPages(), chart);
  assert.equal(byTarget(candidates, "personal.furigana").status, "same");
  assert.equal(byTarget(candidates, "guardian.furigana").status, "same");
});

test("候補：証のフリガナに長音の OCR 置換（-）が残っていても same", () => {
  const chart = emptyChart();
  chart.personal.furigana = "カクウ ユーキ";
  const { candidates } = buildTsushoChartCandidates(pagesFrom({ furigana: "カクウ ユ-キ" }), chart);
  assert.equal(byTarget(candidates, "personal.furigana").status, "same");
});

test("候補：値が違えば different（表示・初期 OFF）", () => {
  const chart = emptyChart();
  chart.personal.name = "架空 勇樹";
  const name = byTarget(buildTsushoChartCandidates(standardPages(), chart).candidates, "personal.name");
  assert.equal(name.status, "different");
  assert.equal(name.visible, true);
  assert.equal(name.initiallySelected, false);
  assert.equal(name.chartValue, "架空 勇樹");
});

test("候補：受給者証が空なら certEmpty（表示しない）", () => {
  const chart = emptyChart();
  chart.personal.name = "架空 勇気";
  const { candidates } = buildTsushoChartCandidates(pagesFrom({ name: "" }), chart);
  const name = byTarget(candidates, "personal.name");
  assert.equal(name.status, "certEmpty");
  assert.equal(name.visible, false);
  assert.equal(name.initiallySelected, false);
});

test("候補：生年月日は和暦と ISO を比較し、同じ日なら same。読めない日付は certEmpty（certUnreadable）", () => {
  const chart = emptyChart();
  chart.personal.birthDate = "2016-05-10";
  assert.equal(
    byTarget(buildTsushoChartCandidates(standardPages(), chart).candidates, "personal.birthDate").status,
    "same"
  );

  const unreadable = byTarget(
    buildTsushoChartCandidates(pagesFrom({ birthday: "平成28年2月30日" }), emptyChart()).candidates,
    "personal.birthDate"
  );
  assert.equal(unreadable.status, "certEmpty");
  assert.equal(unreadable.certUnreadable, true);
  assert.equal(unreadable.proposedValue, null);
});

test("候補：住所のハイフン差だけなら same。居住地は guardian.address の候補", () => {
  const chart = emptyChart();
  chart.guardian.address = "架空県架空市架空町1－2－3";
  const { candidates } = buildTsushoChartCandidates(
    pagesFrom({ guardianAddress: "架空県架空市架空町1-2-3" }),
    chart
  );
  const address = byTarget(candidates, "guardian.address");
  assert.equal(address.status, "same");
  assert.equal(address.source.formKey, "guardianAddress");
});

test("候補：居住地が違えば guardian.address に different", () => {
  const chart = emptyChart();
  chart.guardian.address = "架空市架空町1-2-3";
  const address = byTarget(
    buildTsushoChartCandidates(pagesFrom({ guardianAddress: "架空市架空町1-2-5" }), chart).candidates,
    "guardian.address"
  );
  assert.equal(address.status, "different");
  assert.equal(address.initiallySelected, false);
});

test("候補：personal.address の候補は既定では作らない（personal が空でも）", () => {
  const { candidates } = buildTsushoChartCandidates(standardPages(), emptyChart());
  assert.equal(candidates.some((c) => c.target === "personal.address"), false);
});

test("候補：personal.address の補助候補は指定したときだけ作り、カルテが空でも初期 OFF", () => {
  const { candidates } = buildTsushoChartCandidates(standardPages(), emptyChart(), {
    includeAuxiliaryPersonalAddress: true,
  });
  const aux = byTarget(candidates, "personal.address");
  assert.equal(aux.status, "chartEmpty");
  assert.equal(aux.auxiliary, true);
  assert.equal(aux.initiallySelected, false);
});

test("候補：guardianBirthday（保護者の生年月日）は候補にしない", () => {
  const { candidates } = buildTsushoChartCandidates(standardPages(), emptyChart());
  assert.equal(candidates.some((c) => c.source.formKey === "guardianBirthday"), false);
});

test("候補：保護者欄と児童欄が同一人物（18歳以上の通所者）なら guardian の候補を作らない", () => {
  const result = buildTsushoChartCandidates(
    [{ pageNo: 1, formData: parseTsushoCertText(FACE1_ADULT_SELF, 0) }],
    emptyChart()
  );
  assert.equal(result.guardianSameAsChild, true);
  assert.equal(result.candidates.some((c) => c.target.startsWith("guardian.")), false);
  assert.equal(byTarget(result.candidates, "personal.name").certValue, "架空 次郎");
});

test("候補：同姓同名でも生年月日が違えば別人として guardian の候補を作る", () => {
  const result = buildTsushoChartCandidates(
    pagesFrom({ name: "架空 次郎", birthday: "平成28年5月10日", guardianName: "架空 次郎", guardianBirthday: "昭和60年1月2日" }),
    emptyChart()
  );
  assert.equal(result.guardianSameAsChild, false);
  assert.equal(byTarget(result.candidates, "guardian.name").status, "chartEmpty");
});

test("候補：「保護者の住所は利用者と同じ」の指定を結果で知らせる", () => {
  const chart = emptyChart();
  chart.guardian.sameAddressAsBeneficiary = true;
  assert.equal(buildTsushoChartCandidates(standardPages(), chart).guardianUsesBeneficiaryAddress, true);
});

test("候補：入力の pages・カルテの値を書き換えない（原文を保持する）", () => {
  const pages = standardPages();
  const before = JSON.stringify(pages);
  const chart = emptyChart();
  chart.personal.furigana = "かくう ゆーき";
  const chartBefore = JSON.stringify(chart);

  const furigana = byTarget(buildTsushoChartCandidates(pages, chart).candidates, "personal.furigana");
  assert.equal(furigana.certValue, "カクウ ユーキ");
  assert.equal(furigana.chartValue, "かくう ゆーき");
  assert.equal(JSON.stringify(pages), before);
  assert.equal(JSON.stringify(chart), chartBefore);
});

test("候補：Phase 1-A のカルテのセクション（BeneficiaryChartSections）をそのまま渡せる", () => {
  const { candidates } = buildTsushoChartCandidates(standardPages(), EMPTY_SECTIONS);
  assert.equal(byTarget(candidates, "personal.name").status, "chartEmpty");
});
