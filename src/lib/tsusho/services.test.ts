import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractTsushoServices,
  normalizeTsushoServiceKind,
  parseDaysPerMonth,
} from "./services.ts";
import { findEraDate, parseTsushoDayPeriod } from "./period.ts";
import { parseTsushoCertText } from "./parsers/index.ts";
import {
  FACE2_HOUKAGO_ONLY,
  FACE2_JIDO_AND_HOUKAGO,
  FACE2_NOISY,
  FACE3_OTHER_SERVICES,
} from "./parsers/fixtures.ts";

// ---------- 支援の種類 ----------

test("支援の種類：4区分を判定する", () => {
  assert.equal(normalizeTsushoServiceKind("放課後等デイサービス"), "houkagoDay");
  assert.equal(normalizeTsushoServiceKind("児童発達支援"), "jidoHattatsu");
  assert.equal(normalizeTsushoServiceKind("居宅訪問型児童発達支援"), "kyotakuHoumon");
  assert.equal(normalizeTsushoServiceKind("保育所等訪問支援"), "hoikushoHoumon");
});

test("支援の種類：居宅訪問型児童発達支援を児童発達支援と二重に数えない", () => {
  assert.equal(normalizeTsushoServiceKind("居宅訪問型児童発達支援"), "kyotakuHoumon");
});

test("支援の種類：空白・全角・長音のハイフン化（OCR前処理）を正規化して判定する", () => {
  assert.equal(normalizeTsushoServiceKind(" 放課後等 デイサービス "), "houkagoDay");
  assert.equal(normalizeTsushoServiceKind("放課後等デイサ-ビス"), "houkagoDay");
  assert.equal(normalizeTsushoServiceKind("児童発達支援　"), "jidoHattatsu");
});

test("支援の種類：判定できないもの・複数該当・空は unknown", () => {
  assert.equal(normalizeTsushoServiceKind("生活介護"), "unknown");
  assert.equal(normalizeTsushoServiceKind(""), "unknown");
  assert.equal(normalizeTsushoServiceKind("児童発達支援・放課後等デイサービス"), "unknown");
  // 略記は実物で未確認のため対応しない
  assert.equal(normalizeTsushoServiceKind("放デイ"), "unknown");
});

// ---------- 支給量 ----------

test("支給量：23日／月・23日/月 から 23 を読む", () => {
  assert.equal(parseDaysPerMonth("23日／月"), 23);
  assert.equal(parseDaysPerMonth("23日/月"), 23);
  assert.equal(parseDaysPerMonth("２３日／月"), 23);
  assert.equal(parseDaysPerMonth("23 日 / 月"), 23);
  assert.equal(parseDaysPerMonth("23日/月\n個別サポート加算(I)"), 23);
});

test("支給量：読めない形式・複数の異なる値・範囲外は null", () => {
  assert.equal(parseDaysPerMonth("原則の日数"), null);
  assert.equal(parseDaysPerMonth(""), null);
  assert.equal(parseDaysPerMonth("23日"), null);
  assert.equal(parseDaysPerMonth("20日/月\n令和8年10月1日から 23日/月"), null);
  assert.equal(parseDaysPerMonth("0日/月"), null);
  assert.equal(parseDaysPerMonth("40日/月"), null);
});

// ---------- 期間 ----------

test("期間：和暦の「から…まで」「～」を ISO に変換する", () => {
  assert.deepEqual(parseTsushoDayPeriod("令和8年4月1日～令和9年3月31日"), {
    validFrom: "2026-04-01",
    validTo: "2027-03-31",
  });
  assert.deepEqual(parseTsushoDayPeriod("令和8年4月1日から令和9年3月31日まで"), {
    validFrom: "2026-04-01",
    validTo: "2027-03-31",
  });
  assert.deepEqual(parseTsushoDayPeriod("平成31年4月1日〜令和元年9月30日"), {
    validFrom: "2019-04-01",
    validTo: "2019-09-30",
  });
});

test("期間：不正値（読めない・実在しない日付・開始が終了より後）は両方 null", () => {
  const empty = { validFrom: null, validTo: null };
  assert.deepEqual(parseTsushoDayPeriod("不明"), empty);
  assert.deepEqual(parseTsushoDayPeriod(""), empty);
  assert.deepEqual(parseTsushoDayPeriod("令和 年 月 日から令和 年 月 日まで"), empty);
  assert.deepEqual(parseTsushoDayPeriod("令和8年2月30日から令和9年3月31日まで"), empty);
  assert.deepEqual(parseTsushoDayPeriod("令和9年4月1日から令和8年3月31日まで"), empty);
});

test("和暦日付：元年・全角数字・空白を含む表記を読む", () => {
  assert.equal(findEraDate("令和元年 6月 1日"), "令和元年6月1日");
  assert.equal(findEraDate("令和８年３月１５日"), "令和8年3月15日");
  assert.equal(findEraDate("令和 年 月 日"), "");
});

// ---------- extractTsushoServices ----------

function pagesOf(face2: string, face3?: string) {
  return [
    { pageNo: 1, formData: {} },
    { pageNo: 2, formData: parseTsushoCertText(face2, 1) },
    { pageNo: 3, formData: face3 ? parseTsushoCertText(face3, 2) : {} },
  ];
}

test("extractTsushoServices：空の行を除き、行番号・種類・日数・期間を構造化する", () => {
  const services = extractTsushoServices(pagesOf(FACE2_HOUKAGO_ONLY));
  assert.equal(services.length, 1);
  assert.deepEqual(services[0], {
    row: 1,
    kind: "houkagoDay",
    kindText: "放課後等デイサービス",
    amountText: "23日／月",
    daysPerMonth: 23,
    periodText: "令和8年4月1日から令和9年3月31日まで",
    validFrom: "2026-04-01",
    validTo: "2027-03-31",
  });
});

test("extractTsushoServices：二面・三面の4行を行番号どおりに並べる", () => {
  const services = extractTsushoServices(pagesOf(FACE2_JIDO_AND_HOUKAGO, FACE3_OTHER_SERVICES));
  assert.deepEqual(
    services.map((s) => [s.row, s.kind]),
    [
      [1, "jidoHattatsu"],
      [2, "houkagoDay"],
      [3, "hoikushoHoumon"],
      [4, "kyotakuHoumon"],
    ]
  );
  // 支給量等の原文（加算の記載を含む）は保持する
  assert.equal(services[1].amountText, "23日/月\n個別サポート加算(I)");
});

test("extractTsushoServices：unknown の種類・読めない支給量・実在しない日付は null で保持する", () => {
  const services = extractTsushoServices(pagesOf(FACE2_NOISY));
  assert.equal(services[1].kind, "unknown");
  assert.equal(services[1].kindText, "架空支援");
  assert.equal(services[1].daysPerMonth, null);
  assert.equal(services[1].validFrom, null);
  assert.equal(services[1].validTo, null);
  assert.equal(services[1].periodText, "令和8年2月30日から令和9年3月31日まで");
});

test("extractTsushoServices：pageNo が無い場合は配列の位置（index+1）でページを判断する", () => {
  const services = extractTsushoServices([
    { formData: {} },
    { formData: { serviceType1: "児童発達支援", servicePeriod1: "令和8年4月1日から令和9年3月31日まで" } },
  ]);
  assert.equal(services.length, 1);
  assert.equal(services[0].kind, "jidoHattatsu");
});

test("extractTsushoServices：二面以外のページにある serviceTypeN は読まない", () => {
  const services = extractTsushoServices([
    { pageNo: 1, formData: { serviceType1: "放課後等デイサービス" } },
    { pageNo: 4, formData: { serviceType1: "放課後等デイサービス" } },
  ]);
  assert.deepEqual(services, []);
});
