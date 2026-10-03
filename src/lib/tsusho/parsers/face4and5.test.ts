import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTsushoCertText, TSUSHO_PAGE_PARSERS } from "./index.ts";
import { FACE4_STANDARD, FACE5_BLANK, FACE5_STANDARD } from "./fixtures.ts";

test("四面：支給期間（年月）・指定相談支援事業所名・モニタリング期間・予備欄", () => {
  const r = parseTsushoCertText(FACE4_STANDARD, 3);

  assert.equal(r.supportPeriod, "令和8年4月から令和9年3月まで");
  assert.equal(r.planOfficeName, "架空相談支援センター");
  assert.equal(r.monitoringPeriod, "6月ごと（令和8年9月～令和9年3月）");
  assert.equal(r.consultationMemo, "架空の記載");
  assert.equal(r.memo, ""); // 既存の memo は使わない
});

test("五面：負担上限月額と食事提供加算の2つの「適用期間」を取り違えない", () => {
  const r = parseTsushoCertText(FACE5_STANDARD, 4);

  assert.equal(r.burdenLimitAmount, "4,600円");
  assert.equal(r.burdenPeriod, "令和8年7月1日から令和9年6月30日まで");
  assert.equal(r.mealProvisionStatus, "該当");
  assert.equal(r.mealProvisionPeriod, "令和8年7月1日から令和9年6月30日まで");
  assert.equal(r.managementTargetStatus, "該当");
  assert.equal(r.managementOfficeName, "架空放課後等デイサービス");
});

test("五面：特記事項欄は原文のまま burdenSpecialNotes に残す", () => {
  const r = parseTsushoCertText(FACE5_STANDARD, 4);
  assert.match(r.burdenSpecialNotes, /第2子|第２子/);
  assert.match(r.burdenSpecialNotes, /無償化対象児童/);
  assert.equal(r.burdenMemo, "");
  assert.equal(r.specialNotes, ""); // 既存の specialNotes は使わない
});

test("五面：印字だけの空欄（「円」「令和 年 月 日」）を値にしない", () => {
  const r = parseTsushoCertText(FACE5_BLANK, 4);
  for (const key of [
    "burdenLimitAmount",
    "burdenPeriod",
    "mealProvisionStatus",
    "mealProvisionPeriod",
    "managementTargetStatus",
    "managementOfficeName",
    "burdenSpecialNotes",
    "burdenMemo",
  ]) {
    assert.equal(r[key], "", key);
  }
});

test("parser の登録：一〜五面（index 0〜4）だけ。六・七面（事業者記入欄）は OCR 対象外", () => {
  assert.deepEqual(
    Object.keys(TSUSHO_PAGE_PARSERS).map(Number).sort(),
    [0, 1, 2, 3, 4]
  );
  for (const pageIndex of [5, 6, 7, -1, 99]) {
    const r = parseTsushoCertText(FACE5_STANDARD, pageIndex);
    assert.equal(r.burdenLimitAmount ?? "", "", `pageIndex=${pageIndex}`);
    assert.equal(r.name, "", `pageIndex=${pageIndex}`);
  }
});

test("parser の戻り値は既存の FormDataType の既定キーをすべて持つ（将来の登録時の互換）", () => {
  const r = parseTsushoCertText(FACE4_STANDARD, 3);
  for (const key of ["number", "address", "furigana", "name", "birthday", "childName", "issueDate", "cityName"]) {
    assert.equal(typeof r[key], "string", key);
  }
});
