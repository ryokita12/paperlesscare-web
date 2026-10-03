import { test } from "node:test";
import assert from "node:assert/strict";
import { actionTargetQuery, computeActionItems, type ActionItemsInput } from "./actionItems.ts";
import { toJapanIsoDate } from "./dates.ts";
import type { DocumentSubmissionInput } from "./documents.ts";

const ALL_SUBMITTED: DocumentSubmissionInput[] = [
  { type: "contract", status: "submitted" },
  { type: "importantMatters", status: "submitted" },
  { type: "privacyConsent", status: "submitted" },
];

function input(overrides: Partial<ActionItemsInput> = {}): ActionItemsInput {
  return {
    today: "2026-10-04",
    usageStatus: "active",
    certificate: { validTo: "2027-03-31" },
    documents: ALL_SUBMITTED,
    chartReview: { certificateId: "c1", pendingCount: 0 },
    ...overrides,
  };
}

const types = (items: ReturnType<typeof computeActionItems>) => items.map((i) => i.type);

test("要対応：すべて問題なければ 0 件", () => {
  assert.deepEqual(computeActionItems(input()), []);
});

test("要対応：受給者証の期限切れは至急（🔴）で、受給者証タブへ移動する", () => {
  const items = computeActionItems(input({ certificate: { validTo: "2026-10-03" } }));
  assert.deepEqual(types(items), ["certificateExpired"]);
  assert.equal(items[0].severity, "urgent");
  assert.equal(items[0].message, "受給者証の期限が切れています");
  assert.equal(items[0].detail, "有効期限：2026年10月3日（1日経過）");
  assert.deepEqual(items[0].target, { tab: "certificates" });
});

test("要対応：期限まで30日以内は要対応（🟠）。期限切れとは二重に数えない", () => {
  const soon = computeActionItems(input({ certificate: { validTo: "2026-10-20" } }));
  assert.deepEqual(types(soon), ["certificateExpiringSoon"]);
  assert.equal(soon[0].severity, "warning");
  assert.equal(soon[0].message, "受給者証の期限が30日以内です");
  assert.equal(soon[0].detail, "有効期限：2026年10月20日（あと16日）");

  const expired = computeActionItems(input({ certificate: { validTo: "2026-09-01" } }));
  assert.deepEqual(types(expired), ["certificateExpired"], "期限切れは30日以内として重ねて出さない");
});

test("要対応：日付の境界（当日まで有効・30日ちょうど・31日）", () => {
  // 有効期限の当日はまだ有効（期限切れではない）・残り0日
  const lastDay = computeActionItems(input({ certificate: { validTo: "2026-10-04" } }));
  assert.deepEqual(types(lastDay), ["certificateExpiringSoon"]);
  assert.match(lastDay[0].detail, /本日まで/);
  // 翌日から期限切れ
  assert.deepEqual(types(computeActionItems(input({ today: "2026-10-05", certificate: { validTo: "2026-10-04" } }))), ["certificateExpired"]);
  // 残り30日は対象、31日は対象外
  assert.deepEqual(types(computeActionItems(input({ certificate: { validTo: "2026-11-03" } }))), ["certificateExpiringSoon"]);
  assert.deepEqual(types(computeActionItems(input({ certificate: { validTo: "2026-11-04" } }))), []);
  // 月末・年またぎ
  assert.deepEqual(types(computeActionItems(input({ today: "2026-12-31", certificate: { validTo: "2027-01-30" } }))), ["certificateExpiringSoon"]);
  assert.deepEqual(types(computeActionItems(input({ today: "2026-12-31", certificate: { validTo: "2027-01-31" } }))), []);
});

test("要対応：今日の日付は日本時間で決める（UTC の前日・翌日にずれない）", () => {
  // 2026-10-03 15:30 UTC = 2026-10-04 00:30 JST
  assert.equal(toJapanIsoDate(new Date("2026-10-03T15:30:00Z")), "2026-10-04");
  // 2026-10-04 14:59 UTC = 2026-10-04 23:59 JST
  assert.equal(toJapanIsoDate(new Date("2026-10-04T14:59:00Z")), "2026-10-04");
});

test("要対応：受給者証の期限が未入力・受給者証が未登録", () => {
  const unknown = computeActionItems(input({ certificate: { validTo: null } }));
  assert.deepEqual(types(unknown), ["certificateExpiryUnknown"]);
  assert.equal(unknown[0].message, "受給者証の有効期限が未入力です");
  const missing = computeActionItems(input({ certificate: null, chartReview: null }));
  assert.deepEqual(types(missing), ["certificateMissing"]);
});

test("要対応：必要書類が未提出なら種別ごとに1件（書類タブの該当箇所へ移動）", () => {
  const items = computeActionItems(input({ documents: [] }));
  assert.deepEqual(types(items), ["documentMissing", "documentMissing", "documentMissing"]);
  assert.deepEqual(
    items.map((i) => i.message),
    ["利用契約書が未提出です", "重要事項説明書が未提出です", "個人情報同意書が未提出です"]
  );
  assert.deepEqual(items[0].target, { tab: "documents", focus: "contract" });
  assert.equal(items[0].id, "document:contract");
});

test("要対応：提出済みにすると減る。未提出の記録・その他の書類は提出済みに数えない", () => {
  const partial = computeActionItems(
    input({
      documents: [
        { type: "contract", status: "submitted" },
        { type: "importantMatters", status: "notSubmitted" },
        { type: "other", status: "submitted" },
      ],
    })
  );
  assert.deepEqual(partial.map((i) => i.id), ["document:importantMatters", "document:privacyConsent"]);
});

test("要対応：同じ種別が複数ある場合は1件でも提出済みなら提出済み", () => {
  const items = computeActionItems(
    input({
      documents: [
        ...ALL_SUBMITTED,
        { type: "contract", status: "notSubmitted" },
      ],
    })
  );
  assert.deepEqual(items, []);
});

test("要対応：書類を読み込めなかった場合（null）は書類の要対応を出さない", () => {
  assert.deepEqual(computeActionItems(input({ documents: null })), []);
});

test("要対応：カルテ反映候補（Phase 1-B7）が未確認なら要確認（🔵）で、確認カードへ移動する", () => {
  const items = computeActionItems(input({ chartReview: { certificateId: "c9", pendingCount: 2 } }));
  assert.deepEqual(types(items), ["chartReviewPending"]);
  assert.equal(items[0].severity, "review");
  assert.equal(items[0].message, "受給者証からのカルテ反映候補があります");
  assert.equal(items[0].detail, "未確認の項目が2件あります");
  assert.equal(items[0].id, "chartReview:c9");
  assert.deepEqual(items[0].target, { tab: "certificates", focus: "chartReview" });
  assert.equal(actionTargetQuery(items[0].target), "tab=certificates&focus=chartReview");
});

test("要対応：反映済み・反映しないと判断済み（未確認 0 件）なら出さない", () => {
  assert.deepEqual(computeActionItems(input({ chartReview: { certificateId: "c1", pendingCount: 0 } })), []);
  assert.deepEqual(computeActionItems(input({ chartReview: null })), []);
});

test("要対応：複数の要対応は件数どおり・重要度の高い順（至急 → 要対応 → 要確認）", () => {
  const items = computeActionItems(
    input({
      certificate: { validTo: "2026-09-30" },
      documents: [{ type: "importantMatters", status: "submitted" }, { type: "privacyConsent", status: "submitted" }],
      chartReview: { certificateId: "c1", pendingCount: 1 },
    })
  );
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.severity), ["urgent", "warning", "review"]);
  assert.deepEqual(types(items), ["certificateExpired", "documentMissing", "chartReviewPending"]);
  // id は利用者内で一意
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
});

test("要対応：利用終了の利用者は 0 件", () => {
  assert.deepEqual(
    computeActionItems(input({ usageStatus: "ended", certificate: { validTo: "2020-01-01" }, documents: [] })),
    []
  );
  // 休止中は対象のまま
  assert.equal(computeActionItems(input({ usageStatus: "suspended", documents: [] })).length, 3);
});

test("要対応：Phase 1-C 以前の利用者（利用状態・書類・反映候補なし）でも落ちずに判定できる", () => {
  const items = computeActionItems({
    today: "2026-10-04",
    usageStatus: "",
    certificate: { validTo: "2027-03-31" },
    documents: [],
    chartReview: { certificateId: "legacy", pendingCount: 0 },
  });
  assert.deepEqual(types(items), ["documentMissing", "documentMissing", "documentMissing"]);
});
