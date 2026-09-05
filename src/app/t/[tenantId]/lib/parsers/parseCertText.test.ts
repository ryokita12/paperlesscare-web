import { test } from "node:test";
import assert from "node:assert/strict";
import { getCertPageParser, parseCertText } from "./parseCertText.ts";
import { parseAdultPage1 } from "./adult/page1.ts";
import { parseAdultPage2 } from "./adult/page2.ts";
import { parseAdultPage3 } from "./adult/page3.ts";
import { parseAdultPage4 } from "./adult/page4.ts";

test("getCertPageParser: adult のページ1〜4は専用パーサへ振り分けられる", () => {
  assert.equal(getCertPageParser("adult", 0), parseAdultPage1);
  assert.equal(getCertPageParser("adult", 1), parseAdultPage2);
  assert.equal(getCertPageParser("adult", 2), parseAdultPage3);
  assert.equal(getCertPageParser("adult", 3), parseAdultPage4);
});

test("getCertPageParser: adult のページ5〜8は専用パーサ未実装（null）", () => {
  for (const pageIndex of [4, 5, 6, 7]) {
    assert.equal(getCertPageParser("adult", pageIndex), null);
  }
});

test("getCertPageParser: child / mobility は専用パーサ未登録で adult のものを流用しない", () => {
  for (const certType of ["child", "mobility"] as const) {
    for (let pageIndex = 0; pageIndex < 8; pageIndex++) {
      assert.equal(
        getCertPageParser(certType, pageIndex),
        null,
        `${certType} / pageIndex=${pageIndex}`
      );
    }
  }
});

test("parseCertText: adult ページ2はサービス情報を serviceType1 系へ入れる", () => {
  const result = parseCertText(
    `サービス種別
短期入所
支給決定期間
令和7年4月1日から令和8年3月31日まで
支給量等
7日/月`,
    1,
    "adult"
  );

  assert.equal(result.serviceType1, "短期入所");
  assert.equal(result.name, "");
});

// 【挙動を意図的に変更したテスト】
// 以前は「専用パーサが無い場合もフォールバックで必須項目を返す」ことを固定していたが、
// その緩い抽出はページの意味を区別せず人物フィールドを埋めてしまうため、
// 「専用パーサが無ければ空のフォームを返す」挙動へ変更した。
// テストもその新しい契約に合わせて書き換えている。
test("parseCertText: 専用パーサが無い場合は空のフォームを返す（推測で埋めない）", () => {
  const result = parseCertText(
    `受給者証番号
1234567890
障害種別
3
交付年月日
令和7年4月1日
支給市町村名
架空市`,
    0,
    "child"
  );

  // child は専用パーサ未実装。抽出できそうな値があっても埋めない。
  assert.equal(result.number, "");
  assert.equal(result.disabilityType, "");
  assert.equal(result.cityName, "");
  assert.equal(result.name, "");

  // 例外を投げず、FormDataType の必須項目が文字列で揃っていることは維持する。
  assert.equal(typeof result.name, "string");
  assert.equal(typeof result.issuerAddress, "string");
});
