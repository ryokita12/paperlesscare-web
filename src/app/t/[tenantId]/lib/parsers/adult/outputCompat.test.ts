import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "../normalizeText.ts";
import { parseAdultPage1 } from "./page1.ts";
import { parseAdultPage2 } from "./page2.ts";
import { parseAdultPage3 } from "./page3.ts";
import { parseAdultPage4 } from "./page4.ts";

// adult page1〜4 パーサの「現在の出力」をそのまま固定する回帰テスト。
//
// 共通ヘルパ（lib/parsers/common/helpers.ts）への切り出しが
// 純粋なリファクタリングであること＝出力が1文字も変わらないことを保証するために、
// 戻り値オブジェクト全体を deepEqual で比較する。
// これにより、値・空文字・キーの有無・オブジェクトの形すべてが対象になる。
//
// ★重要★
// ここに書かれた期待値は「あるべき仕様」ではなく「リファクタリング前の実際の挙動」である。
// 既知の不具合（page1のaddress抽出など）も、直さずにそのまま固定している。
// 抽出ロジックの改善は実サンプルを入手したあとの別フェーズで行う。
// そのため、このファイルの期待値を「望ましい値」へ書き換えてはいけない。

// テストデータはすべて架空値（実在の氏名・住所・受給者証番号・生年月日は使用しない）。

// 実機OCRの揺れ（ラベルが値と結合する、「氏\n名」で分断される、誤認識）を含む形
const PAGE1_JOINED_LABEL = `障害福祉廿一個受給者証(I)
受給者証番号
1234567890
架空県架空市架空町1番地の2 架空荘
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
市町村番号999999)`;

// ラベルが独立行になる形（「児童」見出しあり、和暦にスペースあり）
const PAGE1_SEPARATE_LABEL = `受給者証番号
1111111111
居住地
架空県架空市架空町1-2-3
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
令和 6 年 4 月 1 日
支給市町村名
架空市`;

const PAGE2 = `介護給付費の支給決定内容
障害支援区分
区分3
認定有効期間
令和7年4月1日から令和10年3月31日まで
サービス種別
短期入所
支給決定期間
令和7年4月1日から令和8年3月31日まで
支給量等
7日/月
(予備欄)`;

const PAGE3 = `サービス種別
行動援護
支給決定期間
令和7年4月1日から令和8年3月31日まで
支給量等
10時間/月
サービス種別
同行援護
支給決定期間
令和7年4月1日から令和9年3月31日まで
支給量等
5時間/月
(予備欄)`;

const PAGE4 = `訓練等給付費の支給決定内容
サービス種別
生活介護
支給決定期間
令和7年4月1日から令和8年3月31日まで
支給量等
週5日
サービス種別
就労継続支援B型
支給決定期間
令和7年4月1日から令和9年3月31日まで
支給量等
週3日
サービス種別
自立訓練
支給決定期間
令和7年5月1日から令和8年4月30日まで
支給量等
週2日
(予備欄)
問い合わせ先`;

test("出力互換: parseAdultPage1（ラベルが値と結合するOCR）", () => {
  assert.deepEqual(parseAdultPage1(normalizeText(PAGE1_JOINED_LABEL)), {
    number: "1234567890",
    // ★既知の不具合をそのまま固定：本来は住所だが縦書きラベルを拾っている。
    //   実サンプル入手後の別フェーズで修正する（今回は変更しない）。
    address: "支給決定障害者等",
    furigana: "",
    name: "架空 太郎",
    birthday: "昭和50年1月2日",
    childFurigana: "",
    childName: "架空 花子",
    childBirthday: "平成30年3月4日",
    disabilityType: "3",
    issueDate: "令和7年4月1日",
    cityName: "架空市",
    issuerAddress: "架空市架空区架空町1丁目1番1号",
  });
});

test("出力互換: parseAdultPage1（ラベルが独立行・和暦にスペースあり）", () => {
  assert.deepEqual(parseAdultPage1(normalizeText(PAGE1_SEPARATE_LABEL)), {
    number: "1111111111",
    // ★既知の不具合をそのまま固定：受給者証番号を住所として拾っている。
    address: "1111111111",
    furigana: "",
    name: "山田 太郎",
    birthday: "平成1年1月1日",
    childFurigana: "",
    childName: "山田 花子",
    childBirthday: "平成20年2月2日",
    disabilityType: "1",
    // 交付年月日は normalizeEraDate でスペースが除去される
    issueDate: "令和6年4月1日",
    cityName: "架空市",
    // ★既知の挙動をそのまま固定：issuerAddress は正規化されないため
    //   スペースを含んだままの文字列が入る。
    issuerAddress: "令和 6 年 4 月 1 日",
  });
});

test("出力互換: parseAdultPage2", () => {
  assert.deepEqual(parseAdultPage2(normalizeText(PAGE2)), {
    number: "",
    address: "",
    furigana: "",
    name: "",
    birthday: "",
    childFurigana: "",
    childName: "",
    childBirthday: "",
    disabilityType: "",
    issueDate: "",
    cityName: "",
    issuerAddress: "",
    serviceType1: "短期入所",
    // 「認定有効期間」ではなく「支給決定期間」側を採用する
    servicePeriod1: "令和7年4月1日から令和8年3月31日まで",
    serviceAmount1: "7日/月",
  });
});

test("出力互換: parseAdultPage3", () => {
  assert.deepEqual(parseAdultPage3(normalizeText(PAGE3)), {
    number: "",
    address: "",
    furigana: "",
    name: "",
    birthday: "",
    childFurigana: "",
    childName: "",
    childBirthday: "",
    disabilityType: "",
    issueDate: "",
    cityName: "",
    issuerAddress: "",
    serviceType4: "行動援護",
    servicePeriod4: "令和7年4月1日から令和8年3月31日まで",
    serviceAmount4: "10時間/月",
    serviceType5: "同行援護",
    servicePeriod5: "令和7年4月1日から令和9年3月31日まで",
    serviceAmount5: "5時間/月",
    memo: "",
  });
});

test("出力互換: parseAdultPage4", () => {
  assert.deepEqual(parseAdultPage4(normalizeText(PAGE4)), {
    number: "",
    address: "",
    furigana: "",
    name: "",
    birthday: "",
    childFurigana: "",
    childName: "",
    childBirthday: "",
    disabilityType: "",
    issueDate: "",
    cityName: "",
    issuerAddress: "",
    serviceType6: "生活介護",
    servicePeriod6: "令和7年4月1日から令和8年3月31日まで",
    serviceAmount6: "週5日",
    serviceType7: "就労継続支援B型",
    servicePeriod7: "令和7年4月1日から令和9年3月31日まで",
    serviceAmount7: "週3日",
    serviceType8: "自立訓練",
    servicePeriod8: "令和7年5月1日から令和8年4月30日まで",
    serviceAmount8: "週2日",
    memo: "",
    contactInfo: "",
  });
});

test("出力互換: 空文字入力でも例外を投げず、必須12項目が空文字で揃う", () => {
  for (const parse of [
    parseAdultPage1,
    parseAdultPage2,
    parseAdultPage3,
    parseAdultPage4,
  ]) {
    const result = parse(normalizeText(""));

    for (const key of [
      "number",
      "address",
      "furigana",
      "name",
      "birthday",
      "childFurigana",
      "childName",
      "childBirthday",
      "disabilityType",
      "issueDate",
      "cityName",
      "issuerAddress",
    ]) {
      assert.equal(result[key], "", `${parse.name} / ${key}`);
    }
  }
});
