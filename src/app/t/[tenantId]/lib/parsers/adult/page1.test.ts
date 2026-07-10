import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "../normalizeText.ts";
import { parseAdultPage1 } from "./page1.ts";

// 実機で取得した紫色受給者証（1ページ目）のOCR RAW TEXT。
// 「氏\n名」のようにラベルが改行で分断される、
// 「児童」見出しがOCRに出てこない、といった実際のOCR揺れを含む。
const RAW_OCR_TEXT = `2025年12月10日
13:47
障害福祉廿一個受給者証(I)
受給者証番号
0000570051
绿区鳴海町字詒山1番地の5 伍治山住
支給決定障害者等
支居住地宅2棟725号
フリガナ
等氏 名 岡田 碧
生年月日
昭和57年7月9日
フリガナ
氏
名 岡田 真叶
生年月日
平成26年11月1日
障害種別
3
交付年月日
令和7年10月21日
名古屋市中区三〇克三丁目1番1号
支給市町村名
名古屋市
及S 印
市町村番号231001)
古市
索
名屋`;

test("parseAdultPage1: 実機OCR RAW TEXTから本人・児童・交付年月日等を正しく抽出する", () => {
  const normalized = normalizeText(RAW_OCR_TEXT);
  const result = parseAdultPage1(normalized);

  assert.equal(result.number, "0000570051");
  assert.equal(result.name, "岡田 碧");
  assert.equal(result.birthday, "昭和57年7月9日");
  assert.equal(result.childName, "岡田 真叶");
  assert.equal(result.childBirthday, "平成26年11月1日");
  assert.equal(result.disabilityType, "3");
  assert.equal(result.issueDate, "令和7年10月21日");
  assert.equal(result.cityName, "名古屋市");
});

test("parseAdultPage1: 交付年月日はスペースを含む和暦表記でも抽出でき、数字だけの値は採用しない", () => {
  const text = normalizeText(`障害種別
23
交付年月日
令和 5 年 6 月 30 日
支給市町村名
名古屋市`);

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
名古屋市`);

  const result = parseAdultPage1(text);

  assert.equal(result.name, "山田 太郎");
  assert.equal(result.birthday, "平成1年1月1日");
  assert.equal(result.childName, "山田 花子");
  assert.equal(result.childBirthday, "平成20年2月2日");
  assert.equal(result.issueDate, "令和6年4月1日");
});
