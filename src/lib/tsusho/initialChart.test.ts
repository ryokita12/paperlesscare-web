import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTsushoInitialChart, initialChartForNewBeneficiary } from "./initialChart.ts";
import { parseTsushoCertText } from "./parsers/index.ts";
import { FACE1_ADULT_SELF, FACE1_SINGLE_NAME_BLOCK, FACE1_STANDARD } from "./parsers/fixtures.ts";
import { EMPTY_GUARDIAN, EMPTY_PERSONAL } from "../beneficiaryChart/model.ts";

const pagesFromFace1 = (face1Text: string) => [{ pageNo: 1, formData: parseTsushoCertText(face1Text, 0) }];

test("新規 tsusho：personal は児童（氏名・フリガナ・生年月日を ISO）、住所・郵便番号・電話は空", () => {
  const { personal } = buildTsushoInitialChart(pagesFromFace1(FACE1_STANDARD));
  assert.deepEqual(personal, {
    ...EMPTY_PERSONAL,
    name: "架空 勇気",
    furigana: "カクウ ユーキ",
    birthDate: "2016-05-10",
  });
});

test("新規 tsusho：guardian は通所給付決定保護者の氏名・フリガナ・居住地だけ（続柄・電話等は証に無いため空）", () => {
  const { guardian } = buildTsushoInitialChart(pagesFromFace1(FACE1_STANDARD));
  assert.deepEqual(guardian, {
    ...EMPTY_GUARDIAN,
    name: "架空 太郎",
    furigana: "カクウ タロウ",
    address: "架空県架空市架空町一丁目2番3号架空ハイツ101",
  });
});

test("新規 tsusho：保護者の氏名を personal に、居住地を personal.address に入れない", () => {
  const { personal } = buildTsushoInitialChart(pagesFromFace1(FACE1_STANDARD));
  assert.notEqual(personal?.name, "架空 太郎");
  assert.equal(personal?.address, "");
});

test("新規 tsusho：guardianBirthday の保存先は作らない（カルテに受け皿が無い）", () => {
  const result = buildTsushoInitialChart(pagesFromFace1(FACE1_STANDARD));
  assert.equal(JSON.stringify(result).includes("昭和60年1月2日"), false);
  assert.equal(JSON.stringify(result).includes("1985-01-02"), false);
  assert.deepEqual(Object.keys(result.guardian ?? {}).sort(), Object.keys(EMPTY_GUARDIAN).sort());
});

test("新規 tsusho：児童の氏名が読めていない（氏名ブロック1つ）なら personal を作らない", () => {
  const result = buildTsushoInitialChart(pagesFromFace1(FACE1_SINGLE_NAME_BLOCK));
  assert.equal(result.personal, undefined);
  // 保護者の氏名も割り当てられていない。居住地は保護者の欄として残る
  assert.equal(result.guardian?.name, "");
  assert.equal(result.guardian?.address, "架空県架空市架空町1-2-3");
});

test("新規 tsusho：保護者欄と児童欄が同一人物（18歳以上の通所者）なら guardian を作らない", () => {
  const result = buildTsushoInitialChart(pagesFromFace1(FACE1_ADULT_SELF));
  assert.equal(result.personal?.name, "架空 次郎");
  assert.equal(result.guardian, undefined);
});

test("新規 tsusho：生年月日が日付として読めない場合は birthDate を空にする", () => {
  const result = buildTsushoInitialChart([{ pageNo: 1, formData: { name: "架空 花子", birthday: "平成28年2月30日" } }]);
  assert.equal(result.personal?.birthDate, "");
});

test("新規：mobility / adult / child は従来どおりカルテの初期値を作らない（空オブジェクト）", () => {
  const pages = pagesFromFace1(FACE1_STANDARD);
  for (const certType of ["mobility", "adult", "child", null, undefined]) {
    assert.deepEqual(initialChartForNewBeneficiary(certType, pages), {}, String(certType));
  }
  assert.ok(initialChartForNewBeneficiary("tsusho", pages).personal);
});
