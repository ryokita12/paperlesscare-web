import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterBeneficiaries,
  isNameMismatch,
  matchesBeneficiary,
  normalizeForSearch,
} from "./beneficiarySearch.ts";

function b(name: string, furigana: string, number = "") {
  return {
    profile: { name, furigana },
    summary: { name, furigana, number },
  };
}

test("空白（全角含む）を無視し、ひらがなはカタカナとして扱う", () => {
  assert.equal(normalizeForSearch("やまだ　たろう"), "ヤマダタロウ");
  assert.equal(normalizeForSearch(" 山田 太郎 "), "山田太郎");
  assert.equal(normalizeForSearch("１２３ＡＢ"), "123ab");
});

test("氏名・フリガナ（ひらがな入力）・受給者番号で検索できる", () => {
  const taro = b("山田 太郎", "ヤマダ タロウ", "1234567890");
  assert.ok(matchesBeneficiary(taro, "山田"));
  assert.ok(matchesBeneficiary(taro, "山田太郎"));
  assert.ok(matchesBeneficiary(taro, "やまだ"));
  assert.ok(matchesBeneficiary(taro, "ﾔﾏﾀﾞ"));
  assert.ok(matchesBeneficiary(taro, "4567"));
  assert.ok(!matchesBeneficiary(taro, "佐藤"));
  assert.ok(matchesBeneficiary(taro, "　"));
});

test("profile が空でも summary の値で検索できる（旧データ）", () => {
  const legacy = { profile: { name: "", furigana: "" }, summary: { name: "佐藤 花子", furigana: "サトウ ハナコ", number: "" } };
  assert.ok(matchesBeneficiary(legacy, "さとう"));
});

test("filterBeneficiaries は順序を保ったまま絞り込む", () => {
  const list = [b("山田 太郎", "ヤマダ タロウ"), b("佐藤 花子", "サトウ ハナコ"), b("山本 一郎", "ヤマモト イチロウ")];
  assert.deepEqual(
    filterBeneficiaries(list, "やま").map((x) => x.profile.name),
    ["山田 太郎", "山本 一郎"]
  );
  assert.equal(filterBeneficiaries(list, "").length, 3);
});

test("氏名の不一致警告：空白の違いは一致扱い、どちらかが空なら判定しない", () => {
  assert.equal(isNameMismatch("山田 太郎", "山田太郎"), false);
  assert.equal(isNameMismatch("山田 太郎", "佐藤 花子"), true);
  assert.equal(isNameMismatch("山田 太郎", ""), false);
  assert.equal(isNameMismatch("", "山田 太郎"), false);
});
