import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTsushoCertText } from "./index.ts";
import {
  FACE1_ADULT_SELF,
  FACE1_CHILD_HEADING_BEFORE_FIRST_NAME,
  FACE1_NOISY,
  FACE1_SINGLE_NAME_BLOCK,
  FACE1_STANDARD,
  FACE1_THREE_NAME_LABELS,
} from "./fixtures.ts";

const PERSON_KEYS = [
  "guardianName",
  "guardianFurigana",
  "guardianBirthday",
  "name",
  "furigana",
  "birthday",
] as const;

function assertNoPersonAssigned(result: Record<string, string>, label: string) {
  for (const key of PERSON_KEYS) {
    assert.equal(result[key], "", `${label}: ${key} は空であること`);
  }
}

test("一面（ケースD）：保護者と児童を分離し、児童を name / furigana / birthday に入れる", () => {
  const r = parseTsushoCertText(FACE1_STANDARD, 0);

  assert.equal(r.guardianName, "架空 太郎");
  assert.equal(r.guardianFurigana, "カクウ タロウ");
  assert.equal(r.guardianBirthday, "昭和60年1月2日");

  assert.equal(r.name, "架空 勇気");
  assert.equal(r.birthday, "平成28年5月10日");
  // 既存の OCR 前処理（normalizeText）は長音「ー」を "-" に置き換えるが、
  // カタカナに挟まれた "-" は parser で「ー」に戻す
  assert.equal(r.furigana, "カクウ ユーキ");
});

test("一面：長音の復元はカタカナの後ろだけ。数字の前のハイフン（住所の番地等）は戻さない", () => {
  const text = `受給者証番号
1234567890
居住地
架空県架空市架空町1-2-3
架空ハイツ-101
フリガナ
カクウ タロー
氏名
架空 太郎
フリガナ
カクウ ユーキ
氏名
架空 勇気`;
  const r = parseTsushoCertText(text, 0);
  assert.equal(r.guardianAddress, "架空県架空市架空町1-2-3架空ハイツ-101");
  assert.equal(r.guardianFurigana, "カクウ タロー");
  assert.equal(r.furigana, "カクウ ユーキ");
});

test("一面（ケースD）：保護者の氏名・生年月日が name / birthday に入らない", () => {
  const r = parseTsushoCertText(FACE1_STANDARD, 0);
  assert.notEqual(r.name, r.guardianName);
  assert.notEqual(r.birthday, r.guardianBirthday);
  assert.notEqual(r.name, "架空 太郎");
});

test("一面（ケースD）：証情報（受給者証番号・交付年月日・支給市町村）と居住地を取得する", () => {
  const r = parseTsushoCertText(FACE1_STANDARD, 0);

  assert.equal(r.number, "1234567890");
  assert.equal(r.issueDate, "令和8年3月15日");
  assert.equal(r.cityName, "架空市");
  // 居住地は保護者の欄。2行に分かれた住所はつなげる
  assert.equal(r.guardianAddress, "架空県架空市架空町一丁目2番3号架空ハイツ101");
});

test("一面：市町村の電話番号（10桁）を受給者証番号として拾わない", () => {
  const r = parseTsushoCertText(FACE1_STANDARD, 0);
  assert.equal(r.number, "1234567890");
  assert.notEqual(r.number, "0000000000");
});

test("一面：既存のキーの意味（address = 支給決定障害者等の居住地）を tsusho では使わない", () => {
  const r = parseTsushoCertText(FACE1_STANDARD, 0);
  assert.equal(r.address, "");
  assert.equal(r.childName, "");
  assert.equal(r.childBirthday, "");
});

test("一面（ケースE）：氏名ブロックが1つしか取れない場合は、保護者にも児童にも割り当てない", () => {
  const r = parseTsushoCertText(FACE1_SINGLE_NAME_BLOCK, 0);

  assertNoPersonAssigned(r, "氏名1つ");
  // 人物以外の項目は取得する
  assert.equal(r.number, "1234567890");
  assert.equal(r.issueDate, "令和8年3月15日");
  assert.equal(r.guardianAddress, "架空県架空市架空町1-2-3");
});

test("一面：氏名ラベルが3つある場合も割り当てない（どれが誰か確定できない）", () => {
  assertNoPersonAssigned(parseTsushoCertText(FACE1_THREE_NAME_LABELS, 0), "氏名3つ");
});

test("一面：「児童」見出しが最初の氏名より前にある（様式と矛盾）場合は割り当てない", () => {
  assertNoPersonAssigned(
    parseTsushoCertText(FACE1_CHILD_HEADING_BEFORE_FIRST_NAME, 0),
    "見出しの位置が矛盾"
  );
});

test("一面：居住地ラベルが最初の氏名より後にある（様式と矛盾）場合は割り当てない", () => {
  const text = `受給者証番号
1234567890
フリガナ
カクウ タロウ
氏名
架空 太郎
居住地
架空県架空市
フリガナ
カクウ ハナコ
氏名
架空 花子`;
  const r = parseTsushoCertText(text, 0);
  assertNoPersonAssigned(r, "居住地の位置が矛盾");
  assert.equal(r.guardianAddress, "");
});

test("一面（ケースF）：OCR 崩れ（縦書き見出しの分解・氏/名の分割・全角数字・元年・空欄）でも正しく分離する", () => {
  const r = parseTsushoCertText(FACE1_NOISY, 0);

  assert.equal(r.guardianName, "架空 一郎");
  assert.equal(r.guardianFurigana, ""); // 空欄は空のまま
  assert.equal(r.guardianBirthday, "昭和58年7月8日");

  assert.equal(r.name, "架空 花子");
  assert.equal(r.furigana, "かくう はなこ"); // ひらがなは原文のまま（比較時だけ正規化する）
  assert.equal(r.birthday, "令和元年6月1日");

  assert.equal(r.number, "1234567890");
  assert.equal(r.issueDate, "令和8年3月15日");
  assert.equal(r.cityName, "架空町");
  assert.equal(r.guardianAddress, "架空県架空市架空町4-5-6");
});

test("一面：18歳以上の通所者（両欄とも本人）は両方に同じ値が入る", () => {
  const r = parseTsushoCertText(FACE1_ADULT_SELF, 0);
  assert.equal(r.guardianName, "架空 次郎");
  assert.equal(r.name, "架空 次郎");
  assert.equal(r.birthday, "平成19年4月5日");
});

test("一面：空のテキストでは何も入れない（例外を投げない）", () => {
  const r = parseTsushoCertText("", 0);
  assertNoPersonAssigned(r, "空");
  assert.equal(r.number, "");
  assert.equal(r.guardianAddress, "");
});

test("一面：数字だけ・日付だけの値は氏名として採用しない", () => {
  const text = `受給者証番号
1234567890
居住地
架空県架空市
フリガナ
氏名
1234567890
生年月日
昭和60年1月2日
フリガナ
氏名
平成28年5月10日
生年月日`;
  const r = parseTsushoCertText(text, 0);
  assert.equal(r.guardianName, "");
  assert.equal(r.name, "");
});
