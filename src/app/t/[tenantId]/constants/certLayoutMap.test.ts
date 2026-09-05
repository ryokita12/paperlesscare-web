import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_COUNT, CERT_TYPES } from "./certPages.ts";
import { getCertLayoutId } from "./certLayoutMap.ts";

test("getCertLayoutId: adult の8ページが想定どおりのレイアウトへ割り当てられる", () => {
  assert.deepEqual(
    Array.from({ length: PAGE_COUNT }, (_, i) => getCertLayoutId("adult", i)),
    [
      "certificate1",
      "careBenefit1",
      "careBenefit2",
      "trainingBenefit",
      "certificate2",
      "planSupport",
      "userBurden",
      "userBurden",
    ]
  );
});

// 【挙動を意図的に変更したテスト】
// 以前は「child は現時点では adult と同じレイアウトを参照する」ことを固定していたが、
// 様式画像の比較で page6 に構造差（child のみ問い合わせ先あり）が確認できたため、
// page6 だけが異なるという新しい仕様へ書き換えている。
test("getCertLayoutId: child は page6 のみ adult と異なり、他のページは共通", () => {
  for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
    if (pageIndex === 5) continue;

    assert.equal(
      getCertLayoutId("child", pageIndex),
      getCertLayoutId("adult", pageIndex),
      `pageIndex=${pageIndex} は adult と共通のはず`
    );
  }

  assert.equal(getCertLayoutId("adult", 5), "planSupport");
  assert.equal(getCertLayoutId("child", 5), "planSupportWithContact");
});

test("getCertLayoutId: 定義済みの全種別が全ページ分のレイアウトを解決できる", () => {
  for (const certType of CERT_TYPES) {
    for (let pageIndex = 0; pageIndex < PAGE_COUNT; pageIndex++) {
      assert.ok(
        getCertLayoutId(certType.id, pageIndex),
        `${certType.id} / pageIndex=${pageIndex}`
      );
    }
  }
});

test("getCertLayoutId: 範囲外のページはフォールバックする（例外を投げない）", () => {
  assert.equal(getCertLayoutId("adult", PAGE_COUNT), "userBurden");
  assert.equal(getCertLayoutId("adult", -1), "userBurden");
});
