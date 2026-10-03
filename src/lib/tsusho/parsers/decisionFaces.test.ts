import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTsushoCertText } from "./index.ts";
import {
  FACE2_HOUKAGO_ONLY,
  FACE2_JIDO_AND_HOUKAGO,
  FACE2_NOISY,
  FACE2_OLD_AND_NEW,
  FACE2_THREE_ROWS,
  FACE3_OTHER_SERVICES,
} from "./fixtures.ts";

test("二面（ケースA）：放課後等デイサービスのみ。印字だけの2行目は空にする", () => {
  const r = parseTsushoCertText(FACE2_HOUKAGO_ONLY, 1);

  assert.equal(r.serviceType1, "放課後等デイサービス");
  assert.equal(r.serviceAmount1, "23日／月");
  assert.equal(r.servicePeriod1, "令和8年4月1日から令和9年3月31日まで");

  assert.equal(r.serviceType2, "");
  assert.equal(r.serviceAmount2, "");
  assert.equal(r.servicePeriod2, ""); // 「令和 年 月 日から…」の印字は値にしない

  assert.equal(r.decision2SpecialNotes, "");
  assert.equal(r.decision2Memo, "");
  assert.equal(r.decision2ExtraRows, "");
});

test("二面（ケースB）：児童発達支援＋放課後等デイサービス。複数行の支給量等を保持する", () => {
  const r = parseTsushoCertText(FACE2_JIDO_AND_HOUKAGO, 1);

  assert.equal(r.serviceType1, "児童発達支援");
  assert.equal(r.serviceAmount1, "15日/月");
  assert.equal(r.servicePeriod1, "令和7年10月1日から令和8年9月30日まで");

  assert.equal(r.serviceType2, "放課後等デイサービス");
  assert.equal(r.serviceAmount2, "23日/月\n個別サポート加算(I)");
  assert.equal(r.servicePeriod2, "令和8年4月1日から令和9年3月31日まで");

  assert.equal(r.decision2SpecialNotes, "架空の注記");
});

test("二面（ケースC）：同じ種類の旧期間と新期間を別々の行として保持する", () => {
  const r = parseTsushoCertText(FACE2_OLD_AND_NEW, 1);
  assert.equal(r.servicePeriod1, "令和7年4月1日から令和8年3月31日まで");
  assert.equal(r.servicePeriod2, "令和8年4月1日から令和9年3月31日まで");
});

test("三面：3・4行目のキーに入れ、二面のキーは使わない。予備欄は decision3Memo", () => {
  const r = parseTsushoCertText(FACE3_OTHER_SERVICES, 2);

  assert.equal(r.serviceType3, "保育所等訪問支援");
  assert.equal(r.servicePeriod3, "令和8年4月1日から令和10年3月31日まで");
  assert.equal(r.serviceType4, "居宅訪問型児童発達支援");
  assert.equal(r.serviceAmount4, "4日/月");

  assert.equal(r.serviceType1 ?? "", "");
  assert.equal(r.serviceType2 ?? "", "");
  assert.equal(r.decision3Memo, "架空の記載");
  assert.equal(r.decision2Memo, undefined);
});

test("二面（ケースF）：同じ行のラベル・全角数字・「～」区切りを読み、期間を「から…まで」に揃える", () => {
  const r = parseTsushoCertText(FACE2_NOISY, 1);

  assert.equal(r.serviceType1, "放課後等デイサービス");
  assert.equal(r.serviceAmount1, "２３日／月"); // 支給量等は原文のまま
  assert.equal(r.servicePeriod1, "令和8年4月1日から令和9年3月31日まで");

  assert.equal(r.serviceType2, "架空支援");
  assert.equal(r.serviceAmount2, "原則の日数");
  // 日付として実在しなくても、期間の形をしていれば記載は残す（ISO 変換時に null になる）
  assert.equal(r.servicePeriod2, "令和8年2月30日から令和9年3月31日まで");
});

test("二面：1面に3行ある場合、3行目は decision2ExtraRows に原文で残す（情報を捨てない）", () => {
  const r = parseTsushoCertText(FACE2_THREE_ROWS, 1);
  assert.equal(r.serviceType1, "児童発達支援");
  assert.equal(r.serviceType2, "放課後等デイサービス");
  assert.equal(r.serviceType3 ?? "", ""); // 三面のキーへはあふれさせない
  assert.match(r.decision2ExtraRows, /保育所等訪問支援/);
  assert.match(r.decision2ExtraRows, /1日\/月/);
});

test("二面：特記事項・予備欄のキーは面ごとに分かれ、既存の specialNotes / memo を使わない", () => {
  const r = parseTsushoCertText(FACE2_JIDO_AND_HOUKAGO, 1);
  assert.equal(r.specialNotes, "");
  assert.equal(r.memo, "");
});
