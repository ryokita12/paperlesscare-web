// Phase 1-B4：受給者証のページ数の種別化（getPageCount）と、それに伴う
// ページ範囲・レイアウト・parser・種別切替・既存の受給者証表示の扱いを固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CERT_TYPES,
  createEmptyPages,
  emptyFormData,
  getPageCount,
  getPageDefinitions,
  isValidPageIndex,
  padPagesForCertType,
  PAGE_COUNT,
  PAGE_DEFINITIONS,
  pagesAfterCertTypeChange,
  shouldResetPagesOnCertTypeChange,
} from "./certPages.ts";
import { getCertLayoutId } from "./certLayoutMap.ts";
import { getCertPageParser } from "../lib/parsers/parseCertText.ts";
import { TSUSHO_PAGE_COUNT } from "../../../../lib/tsusho/constants.ts";
import type { CertPage } from "../types/cert";

// ---------- A. getPageCount ----------

test("A：getPageCount は mobility / adult / child = 8、tsusho = 7", () => {
  assert.equal(getPageCount("mobility"), 8);
  assert.equal(getPageCount("adult"), 8);
  assert.equal(getPageCount("child"), 8);
  assert.equal(getPageCount("tsusho"), 7);
});

test("A：ページ数はページ定義の件数を正本にしている（7・8 を別に持たない）", () => {
  for (const type of CERT_TYPES) {
    assert.equal(getPageCount(type.id), getPageDefinitions(type.id).length, type.id);
  }
  // Phase 1-B1 の定数とも一致する
  assert.equal(TSUSHO_PAGE_COUNT, getPageCount("tsusho"));
});

test("A：種別が無い・未知の場合は従来どおり 8 ページ（PAGE_COUNT）", () => {
  for (const certType of [null, undefined, "", "unknown", "constructor", "toString"]) {
    assert.equal(getPageCount(certType), PAGE_COUNT, String(certType));
  }
  assert.equal(PAGE_COUNT, 8);
});

// ---------- B. 既存互換 ----------

test("B：adult / child / mobility のページ定義は従来の8ページのまま", () => {
  for (const certType of ["mobility", "adult", "child"] as const) {
    assert.equal(getPageDefinitions(certType), PAGE_DEFINITIONS, certType);
    assert.equal(createEmptyPages(certType).length, 8, certType);
  }
});

// ---------- C. tsusho の有効ページ ----------

test("C：tsusho の有効なページ番号は 0〜6 だけで、8ページ目（index 7）は無い", () => {
  for (let i = 0; i < 7; i++) assert.equal(isValidPageIndex("tsusho", i), true, `index ${i}`);
  for (const i of [7, 8, -1, 1.5, Number.NaN]) {
    assert.equal(isValidPageIndex("tsusho", i), false, `index ${i}`);
  }
  assert.equal(createEmptyPages("tsusho").length, 7);
  assert.equal(getPageDefinitions("tsusho")[7], undefined);
});

test("C：adult の有効なページ番号は 0〜7（従来どおり）", () => {
  for (let i = 0; i < 8; i++) assert.equal(isValidPageIndex("adult", i), true, `index ${i}`);
  assert.equal(isValidPageIndex("adult", 8), false);
});

// ---------- D. レイアウト ----------

test("D：tsusho の一〜七面は専用レイアウト、8ページ目相当は adult の userBurden ではなく unavailablePage", () => {
  assert.deepEqual(
    Array.from({ length: getPageCount("tsusho") }, (_, i) => getCertLayoutId("tsusho", i)),
    [
      "tsushoBasic",
      "tsushoDecision2",
      "tsushoDecision3",
      "tsushoConsultation",
      "tsushoBurden",
      "tsushoProvider6",
      "tsushoProvider7",
    ]
  );
  for (const i of [7, 8, -1, 99]) {
    assert.equal(getCertLayoutId("tsusho", i), "unavailablePage", `index ${i}`);
    assert.notEqual(getCertLayoutId("tsusho", i), "userBurden", `index ${i}`);
  }
});

test("D：adult / child の8ページのレイアウトと範囲外の扱いは従来どおり", () => {
  assert.equal(getCertLayoutId("adult", 7), "userBurden");
  assert.equal(getCertLayoutId("child", 5), "planSupportWithContact");
  assert.equal(getCertLayoutId("adult", 8), "userBurden");
  assert.equal(getCertLayoutId("child", 8), "userBurden");
});

// ---------- E. parser ----------

test("E：tsusho は一〜五面だけ parser あり、六・七面と8ページ目は parser なし", () => {
  for (let i = 0; i < 5; i++) assert.ok(getCertPageParser("tsusho", i), `index ${i}`);
  for (const i of [5, 6, 7]) assert.equal(getCertPageParser("tsusho", i), null, `index ${i}`);
});

// ---------- H. 種別の切り替え ----------

function pagesWithWork(count: number, name: string): CertPage[] {
  return Array.from({ length: count }, (_, i) => ({
    selectedFile: null,
    previewUrl: "",
    ocrText: `OCR ${i + 1}`,
    formData: { ...emptyFormData(), name, guardianName: "架空 保護者" },
    storagePath: "",
  }));
}

test("H：作り直しが必要なのは様式の系統が変わるときだけ（adult ⇔ child は保持）", () => {
  assert.equal(shouldResetPagesOnCertTypeChange("adult", "tsusho"), true);
  assert.equal(shouldResetPagesOnCertTypeChange("child", "tsusho"), true);
  assert.equal(shouldResetPagesOnCertTypeChange("tsusho", "adult"), true);
  assert.equal(shouldResetPagesOnCertTypeChange("tsusho", "child"), true);

  assert.equal(shouldResetPagesOnCertTypeChange("adult", "child"), false);
  assert.equal(shouldResetPagesOnCertTypeChange("child", "adult"), false);
  assert.equal(shouldResetPagesOnCertTypeChange("mobility", "adult"), false);
  assert.equal(shouldResetPagesOnCertTypeChange("adult", "adult"), false);
  assert.equal(shouldResetPagesOnCertTypeChange("tsusho", "tsusho"), false);
});

test("H：8ページの種別 → tsusho（7ページ）で、8ページ目と前の様式の読み取り結果が残らない", () => {
  const before = pagesWithWork(8, "架空 支給決定障害者");
  const after = pagesAfterCertTypeChange(before, "adult", "tsusho");

  assert.equal(after.length, 7);
  for (const page of after) {
    assert.equal(page.ocrText, "");
    assert.equal(page.formData.name, "");
    assert.equal(page.formData.guardianName ?? "", "");
    assert.equal(page.selectedFile, null);
  }
});

test("H：tsusho（7ページ）→ 8ページの種別で、8ページ分の新しい空の状態になる（児童名・保護者名を引き継がない）", () => {
  const before = pagesWithWork(7, "架空 児童");
  const after = pagesAfterCertTypeChange(before, "tsusho", "child");

  assert.equal(after.length, 8);
  for (const page of after) {
    assert.equal(page.ocrText, "");
    assert.equal(page.formData.name, "");
    assert.equal(page.formData.guardianName ?? "", "");
  }
});

test("H：adult ⇔ child の切り替えは従来どおり取込内容を保持する（同じ配列を返す）", () => {
  const before = pagesWithWork(8, "架空 太郎");
  assert.equal(pagesAfterCertTypeChange(before, "adult", "child"), before);
  assert.equal(pagesAfterCertTypeChange(before, "child", "adult"), before);
});

// ---------- I. 既存の受給者証の表示 ----------

test("I：保存済みの受給者証は種別のページ数にそろえる（adult / child = 8、tsusho = 7）", () => {
  const make = (index: number) => ({ pageNo: index + 1, empty: true });
  const stored = [{ pageNo: 1 }, { pageNo: 2 }, { pageNo: 3 }];

  const adult = padPagesForCertType(stored, "adult", make);
  assert.equal(adult.length, 8);
  assert.deepEqual(adult.slice(0, 3), stored);
  assert.deepEqual(adult[7], { pageNo: 8, empty: true });

  assert.equal(padPagesForCertType(stored, "child", make).length, 8);
  assert.equal(padPagesForCertType(stored, "tsusho", make).length, 7);
});

test("I：種別が無い・未知の受給者証は従来どおり 8 ページとして表示する", () => {
  const make = (index: number) => ({ pageNo: index + 1 });
  for (const certType of [null, undefined, "", "unknown"]) {
    assert.equal(padPagesForCertType([], certType, make).length, 8, String(certType));
  }
});

test("I：8ページ全部ある adult の受給者証は、そのまま同じ8ページを返す（既存データの表示は不変）", () => {
  const stored = Array.from({ length: 8 }, (_, i) => ({ pageNo: i + 1, data: `p${i + 1}` }));
  const result = padPagesForCertType(stored, "adult", () => ({ pageNo: 0, data: "" }));
  assert.deepEqual(result, stored);
  result.forEach((page, i) => assert.equal(page, stored[i]));
});
