import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "../normalizeText.ts";
import { parseAdultPage1 } from "./page1.ts";

// 実機で取得した紫色受給者証（1ページ目）のOCR RAW TEXTを模したフィクスチャ。
// 「氏\n名」のようにラベルが改行で分断される、
// 「児童」見出しがOCRに出てこない、といった実際のOCR揺れは再現しつつ、
// 氏名・住所・受給者証番号・生年月日はすべて架空の値に置き換えてある
// （テストコードに実在の個人情報を持ち込まないため）。
const RAW_OCR_TEXT = `2025年12月10日
13:47
障害福祉廿一個受給者証(I)
受給者証番号
1234567890
架空県架空市架空町1番地の2 架空山住
支給決定障害者等
支居住地宅2棟725号
フリガナ
等氏 名 架空 太郎
生年月日
昭和50年1月2日
フリガナ
氏
名 架空 花子
生年月日
平成30年3月4日
障害種別
3
交付年月日
令和7年4月1日
架空市架空区架空町1丁目1番1号
支給市町村名
架空市
及S 印
市町村番号999999)
架市
索
名空`;

test("parseAdultPage1: 実機OCR RAW TEXTから本人・児童・交付年月日等を正しく抽出する", () => {
  const normalized = normalizeText(RAW_OCR_TEXT);
  const result = parseAdultPage1(normalized);

  assert.equal(result.number, "1234567890");
  assert.equal(result.name, "架空 太郎");
  assert.equal(result.birthday, "昭和50年1月2日");
  assert.equal(result.childName, "架空 花子");
  assert.equal(result.childBirthday, "平成30年3月4日");
  assert.equal(result.disabilityType, "3");
  assert.equal(result.issueDate, "令和7年4月1日");
  assert.equal(result.cityName, "架空市");
});

test("parseAdultPage1: 交付年月日はスペースを含む和暦表記でも抽出でき、数字だけの値は採用しない", () => {
  const text = normalizeText(`障害種別
23
交付年月日
令和 5 年 6 月 30 日
支給市町村名
架空市`);

  const result = parseAdultPage1(text);

  assert.equal(result.disabilityType, "23");
  assert.equal(result.issueDate, "令和5年6月30日");
});

test("parseAdultPage1: 氏名ラベルが「氏名」で連続表記の場合でも本人・児童を抽出できる", () => {
  const text = normalizeText(`受給者証番号
1111111111
フリガナ
氏名 山田 太郎
生年月日
平成1年1月1日
児童
フリガナ
氏名 山田 花子
生年月日
平成20年2月2日
障害種別
1
交付年月日
令和6年4月1日
支給市町村名
架空市`);

  const result = parseAdultPage1(text);

  assert.equal(result.name, "山田 太郎");
  assert.equal(result.birthday, "平成1年1月1日");
  assert.equal(result.childName, "山田 花子");
  assert.equal(result.childBirthday, "平成20年2月2日");
  assert.equal(result.issueDate, "令和6年4月1日");
});
