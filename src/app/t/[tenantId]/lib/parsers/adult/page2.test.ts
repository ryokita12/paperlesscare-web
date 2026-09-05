import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "../normalizeText.ts";
import { parseAdultPage2 } from "./page2.ts";

// 紫色受給者証（2ページ目＝介護給付費の支給決定内容）のOCR RAW TEXTを模したフィクスチャ。
// 実在の個人情報は含めない（サービス種別・期間・支給量は個人を特定しないが、
// 事業所名等が混ざらないよう最小限の内容にしてある）。
const RAW_OCR_TEXT = `介護給付費の支給決定内容
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

test("parseAdultPage2: 1組目を serviceType1 / servicePeriod1 / serviceAmount1 へ格納する", () => {
  const result = parseAdultPage2(normalizeText(RAW_OCR_TEXT));

  assert.equal(result.serviceType1, "短期入所");
  assert.equal(
    result.servicePeriod1,
    "令和7年4月1日から令和8年3月31日まで"
  );
  assert.equal(result.serviceAmount1, "7日/月");
});

test("parseAdultPage2: 人物情報用フィールドへサービス情報を混入させない", () => {
  const result = parseAdultPage2(normalizeText(RAW_OCR_TEXT));

  // 以前は name / birthday / childName を1組目の格納先として流用していた。
  // ページ1の氏名・生年月日と同じキーであり、意味が重複するため空のままにする。
  assert.equal(result.name, "");
  assert.equal(result.birthday, "");
  assert.equal(result.childName, "");
});

test("parseAdultPage2: 該当行が無いOCR結果では1組目を空文字で返す", () => {
  const result = parseAdultPage2(normalizeText("介護給付費の支給決定内容"));

  assert.equal(result.serviceType1, "");
  assert.equal(result.servicePeriod1, "");
  assert.equal(result.serviceAmount1, "");
});
