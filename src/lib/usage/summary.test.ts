import { test } from "node:test";
import assert from "node:assert/strict";
import { readUsageRecord, usageRecordId, type UsageRecord } from "./model.ts";
import {
  compareWithSupply,
  countUsage,
  countUsageByBeneficiary,
  daysPerMonthFromCertificate,
} from "./summary.ts";
import { gridLines, layoutCalendarItems, placementToBox } from "./calendarLayout.ts";

function rec(date: string, ben: string, data: Record<string, unknown>): UsageRecord {
  const r = readUsageRecord(usageRecordId(date, ben), { origin: "pattern", ...data });
  assert.ok(r);
  return r;
}

const TODAY = "2026-10-05";

test("日次集計：予定・来所・退所・欠席・キャンセル・未処理・予定外", () => {
  const records = [
    rec(TODAY, "a", { status: "scheduled", planned: { startTime: "14:00", endTime: "17:00" } }),
    rec(TODAY, "b", { status: "attended", planned: { startTime: "14:00", endTime: "17:00" }, actual: { startTime: "14:08" } }),
    rec(TODAY, "c", { status: "attended", planned: { startTime: "14:00", endTime: "17:00" }, actual: { startTime: "14:08", endTime: "17:12" } }),
    rec(TODAY, "d", { status: "absent", planned: { startTime: "14:00", endTime: "17:00" } }),
    rec(TODAY, "e", { status: "cancelled", planned: { startTime: "14:00", endTime: "17:00" } }),
    rec(TODAY, "f", { status: "attended", origin: "walkIn", actual: { startTime: "15:00" } }),
  ];
  const c = countUsage(records, TODAY);
  assert.equal(c.planned, 4, "予定外・キャンセルは予定に数えない");
  assert.equal(c.attended, 3);
  assert.equal(c.departed, 1);
  assert.equal(c.absent, 1);
  assert.equal(c.cancelled, 1);
  assert.equal(c.pending, 1);
  assert.equal(c.walkIn, 1);
  assert.equal(c.usageDays, 4);
  assert.equal(c.plannedMinutes, 4 * 180);
  assert.equal(c.actualMinutes, 184);
});

test("未処理：今日以前の予定のまま。明日以降の予定は未処理にしない", () => {
  const records = [
    rec("2026-10-04", "a", { status: "scheduled" }),
    rec("2026-10-05", "a", { status: "scheduled" }),
    rec("2026-10-06", "a", { status: "scheduled" }),
  ];
  const c = countUsage(records, TODAY);
  assert.equal(c.pending, 2);
  assert.equal(c.scheduled, 3);
});

test("月次集計：利用者ごと、利用日数（予定＋来所）", () => {
  const records = [
    rec("2026-10-01", "a", { status: "attended", actual: { startTime: "14:00", endTime: "17:00" } }),
    rec("2026-10-02", "a", { status: "absent" }),
    rec("2026-10-03", "a", { status: "cancelled" }),
    rec("2026-10-20", "a", { status: "scheduled" }),
    rec("2026-10-01", "b", { status: "attended" }),
  ];
  const map = countUsageByBeneficiary(records, TODAY);
  const a = map.get("a");
  assert.ok(a);
  assert.equal(a.planned, 3);
  assert.equal(a.attended, 1);
  assert.equal(a.absent, 1);
  assert.equal(a.cancelled, 1);
  assert.equal(a.pending, 0);
  assert.equal(a.usageDays, 2);
  assert.equal(a.actualMinutes, 180);
  assert.equal(map.get("b")?.attended, 1);
});

test("支給量との比較：警告のみ", () => {
  assert.deepEqual(compareWithSupply(12, 23), { text: "12 / 23日", over: false });
  assert.deepEqual(compareWithSupply(24, 23), { text: "24 / 23日", over: true });
  assert.equal(compareWithSupply(5, null), null);
});

test("daysPerMonthFromCertificate：通所受給者証の放課後等デイサービスの支給量", () => {
  const pages = [
    { pageNo: 1, formData: {} },
    { pageNo: 2, formData: { serviceType1: "児童発達支援", serviceAmount1: "10日/月", serviceType2: "放課後等デイサービス", serviceAmount2: "23日/月" } },
  ];
  assert.equal(daysPerMonthFromCertificate("tsusho", pages), 23);
  assert.equal(daysPerMonthFromCertificate("child", pages), null, "通所受給者証以外は使わない");
  assert.equal(daysPerMonthFromCertificate("tsusho", []), null);
  const single = [{ pageNo: 2, formData: { serviceType1: "不明", serviceAmount1: "15日／月" } }];
  assert.equal(daysPerMonthFromCertificate("tsusho", single), 15);
});

test("日カレンダー：重ならない予定は1列、重なる予定は列を分ける", () => {
  const placements = layoutCalendarItems([
    { id: "a", startTime: "14:07", endTime: "17:43" },
    { id: "b", startTime: "14:00", endTime: "17:00" },
    { id: "c", startTime: "17:00", endTime: "18:00" },
    { id: "d", startTime: "09:00", endTime: "10:00" },
    { id: "bad", startTime: "17:00", endTime: "14:00" },
  ]);
  const byId = Object.fromEntries(placements.map((p) => [p.id, p]));
  assert.equal(byId.bad, undefined);
  assert.deepEqual([byId.d.column, byId.d.columns], [0, 1]);
  // b(14:00) → 列0, a(14:07) → 列1, c(17:00) は b の後に列0へ入る（a と重なるので同じまとまり）
  assert.deepEqual([byId.b.column, byId.a.column, byId.c.column], [0, 1, 0]);
  assert.equal(byId.a.columns, 2);
  assert.equal(byId.c.columns, 2);
  assert.equal(byId.a.start, 847, "位置は1分単位のまま（30分に丸めない）");
  assert.equal(byId.a.end, 1063);
});

test("日カレンダー：全員同じ時間帯なら人数分の列", () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `k${i}`, startTime: "14:00", endTime: "17:00" }));
  const placements = layoutCalendarItems(items);
  assert.deepEqual(placements.map((p) => p.column).sort(), [0, 1, 2, 3, 4]);
  assert.ok(placements.every((p) => p.columns === 5));
});

test("日カレンダー：位置・高さは時間に比例、範囲外は切り詰め、目盛りは30分", () => {
  const range = { start: 8 * 60, end: 21 * 60 };
  assert.deepEqual(placementToBox({ start: 847, end: 1063 }, range, 1.6), { top: (847 - 480) * 1.6, height: 216 * 1.6 });
  assert.deepEqual(placementToBox({ start: 420, end: 540 }, range, 1), { top: 0, height: 60 });
  assert.equal(placementToBox({ start: 1300, end: 1400 }, range, 1), null);
  const lines = gridLines(range, 30);
  assert.equal(lines[0], 480);
  assert.equal(lines[1], 510);
  assert.equal(lines.at(-1), 1260);
  assert.equal(lines.length, 27);
});
