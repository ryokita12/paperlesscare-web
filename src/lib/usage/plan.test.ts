import { test } from "node:test";
import assert from "node:assert/strict";
import { usageRecordId, weekdayOf } from "./model.ts";
import {
  buildMonthPlan,
  formatWeekdays,
  readUsagePlan,
  sanitizeUsagePlan,
  validateUsagePlan,
  type PlanTarget,
} from "./plan.ts";

const plan = { weekdays: [1, 3, 5], defaultStartTime: "14:07", defaultEndTime: "17:43" };
const target = (overrides: Partial<PlanTarget> = {}): PlanTarget => ({
  beneficiaryId: "ben1",
  plan,
  usageStatus: "",
  legacyStatus: "active",
  ...overrides,
});

test("readUsagePlan：無い・不正な値は空、曜日は昇順・重複なし", () => {
  assert.deepEqual(readUsagePlan({}), { weekdays: [], defaultStartTime: "", defaultEndTime: "" });
  assert.deepEqual(readUsagePlan({ usagePlan: { weekdays: [5, 1, 1, 9, "3", 3.5], defaultStartTime: "14:07", defaultEndTime: "x" } }), {
    weekdays: [1, 5],
    defaultStartTime: "14:07",
    defaultEndTime: "",
  });
});

test("validateUsagePlan：曜日を選んだら標準時刻（1分単位、開始 < 終了）が必要", () => {
  assert.equal(validateUsagePlan(plan), null);
  assert.equal(validateUsagePlan({ weekdays: [], defaultStartTime: "", defaultEndTime: "" }), null, "未設定のままは可");
  assert.ok(validateUsagePlan({ weekdays: [1], defaultStartTime: "", defaultEndTime: "" }));
  assert.ok(validateUsagePlan({ weekdays: [1], defaultStartTime: "17:00", defaultEndTime: "14:00" }));
  assert.ok(validateUsagePlan({ weekdays: [7], defaultStartTime: "14:00", defaultEndTime: "17:00" }));
  assert.deepEqual(sanitizeUsagePlan({ weekdays: [5, 1, 5], defaultStartTime: "14:00", defaultEndTime: "17:00" }).weekdays, [1, 5]);
  assert.equal(formatWeekdays([0, 1, 3, 5]), "月・水・金・日");
});

test("曜日固定：月・水・金だけ、標準時刻（14:07〜17:43）をそのままコピー", () => {
  const result = buildMonthPlan({ yearMonth: "2026-10", targets: [target()], existingIds: new Set() });
  // 2026年10月の月・水・金 = 5,12,19,26 / 7,14,21,28 / 2,9,16,23,30 → 13日
  assert.equal(result.records.length, 13);
  for (const r of result.records) {
    assert.ok([1, 3, 5].includes(weekdayOf(r.date)));
    assert.deepEqual(r.planned, { startTime: "14:07", endTime: "17:43" });
    assert.equal(r.id, usageRecordId(r.date, "ben1"));
  }
  assert.equal(result.records[0].date, "2026-10-02");
});

test("月境界：前後の月の日を含まない", () => {
  const result = buildMonthPlan({ yearMonth: "2026-11", targets: [target({ plan: { ...plan, weekdays: [0, 1, 2, 3, 4, 5, 6] } })], existingIds: new Set() });
  assert.equal(result.records.length, 30);
  assert.equal(result.records[0].date, "2026-11-01");
  assert.equal(result.records.at(-1)?.date, "2026-11-30");
});

test("うるう年：2028年2月29日を含む", () => {
  const all = { ...plan, weekdays: [0, 1, 2, 3, 4, 5, 6] };
  assert.equal(buildMonthPlan({ yearMonth: "2028-02", targets: [target({ plan: all })], existingIds: new Set() }).records.length, 29);
  assert.equal(buildMonthPlan({ yearMonth: "2027-02", targets: [target({ plan: all })], existingIds: new Set() }).records.length, 28);
  const tue = buildMonthPlan({ yearMonth: "2028-02", targets: [target({ plan: { ...plan, weekdays: [2] } })], existingIds: new Set() });
  assert.equal(tue.records.at(-1)?.date, "2028-02-29");
});

test("除外：休止・利用終了・利用停止（inactive）・曜日未設定・標準時刻未設定", () => {
  const result = buildMonthPlan({
    yearMonth: "2026-10",
    targets: [
      target({ beneficiaryId: "s", usageStatus: "suspended" }),
      target({ beneficiaryId: "e", usageStatus: "ended" }),
      target({ beneficiaryId: "i", legacyStatus: "inactive" }),
      target({ beneficiaryId: "n", plan: { ...plan, weekdays: [] } }),
      target({ beneficiaryId: "t", plan: { ...plan, defaultEndTime: "" } }),
      target({ beneficiaryId: "ok", usageStatus: "active" }),
    ],
    existingIds: new Set(),
  });
  assert.deepEqual(
    result.skipped.map((s) => `${s.beneficiaryId}:${s.reason}`),
    ["s:suspended", "e:ended", "i:inactive", "n:noWeekdays", "t:invalidTime"]
  );
  assert.ok(result.records.every((r) => r.beneficiaryId === "ok"));
});

test("既存の記録（予定・来所・欠席・キャンセル）を上書きしない", () => {
  const existing = new Set([usageRecordId("2026-10-05", "ben1"), usageRecordId("2026-10-07", "ben1")]);
  const result = buildMonthPlan({ yearMonth: "2026-10", targets: [target()], existingIds: existing });
  assert.equal(result.records.length, 11);
  assert.equal(result.existingCount, 2);
  assert.ok(!result.records.some((r) => existing.has(r.id)));
});

test("再実行しても重複しない（1回目の結果を既存として渡すと0件）", () => {
  const first = buildMonthPlan({ yearMonth: "2026-10", targets: [target(), target()], existingIds: new Set() });
  assert.equal(new Set(first.records.map((r) => r.id)).size, first.records.length, "同じ利用者が2回渡されても重複しない");
  const second = buildMonthPlan({ yearMonth: "2026-10", targets: [target()], existingIds: new Set(first.records.map((r) => r.id)) });
  assert.equal(second.records.length, 0);
  assert.equal(second.existingCount, first.records.length);
});

test("fromDate：今日以降だけ作る", () => {
  const result = buildMonthPlan({ yearMonth: "2026-10", targets: [target()], existingIds: new Set(), fromDate: "2026-10-20" });
  assert.ok(result.records.every((r) => r.date >= "2026-10-20"));
  assert.equal(result.records.length, 5); // 21,23,26,28,30
});
