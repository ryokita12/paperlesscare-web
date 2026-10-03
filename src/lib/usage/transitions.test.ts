import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  datesOfMonth,
  daysInMonth,
  displayStatusOf,
  formatDateWithWeekday,
  readUsageRecord,
  toUsageRecordFields,
  USAGE_DISPLAY_LABELS,
  usageRecordId,
  weekdayOf,
  yearMonthOf,
  type UsageRecord,
  type UsageRecordFields,
} from "./model.ts";
import {
  applyUsageAction,
  canApplyUsageAction,
  canDeleteUsageRecord,
  UsageTransitionError,
  validateActualTimes,
  type UsageAction,
  type UsageActionContext,
} from "./transitions.ts";

const actor = { uid: "line_U1", email: null, name: "山田" };
// 2026-10-05 14:07（日本時間）
const NOW = new Date("2026-10-05T05:07:30Z");
const ctx: UsageActionContext = { beneficiaryId: "ben1", date: "2026-10-05", actor, now: NOW };

function asRecord(fields: UsageRecordFields): UsageRecord {
  return { id: usageRecordId(fields.date, fields.beneficiaryId), ...fields, createdAt: null, updatedAt: null };
}

function apply(record: UsageRecord | null, action: UsageAction, c: Partial<UsageActionContext> = {}): UsageRecord {
  const result = applyUsageAction(record, action, { ...ctx, ...c });
  assert.equal(result.kind, "write");
  return asRecord((result as { fields: UsageRecordFields }).fields);
}

const scheduled = () => apply(null, { type: "schedule", planned: { startTime: "14:00", endTime: "17:00" } });

test("ID・年月：{日付}_{利用者ID}", () => {
  assert.equal(usageRecordId("2026-10-05", "Abc123xyz"), "2026-10-05_Abc123xyz");
  assert.equal(yearMonthOf("2026-10-05"), "2026-10");
  assert.throws(() => usageRecordId("2026-02-30", "a"));
  assert.throws(() => usageRecordId("2026-10-05", ""));
  assert.throws(() => usageRecordId("2026-10-05", "a/b"));
});

test("暦：月の日数・うるう年・曜日・日付/月の移動", () => {
  assert.equal(daysInMonth("2028-02"), 29);
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2026-10"), 31);
  assert.equal(datesOfMonth("2026-11").length, 30);
  assert.equal(weekdayOf("2026-10-05"), 1); // 月曜
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(formatDateWithWeekday("2026-10-05"), "10月5日（月）");
});

test("予定の作成：scheduled・origin manual・予定時刻は1分単位のまま", () => {
  const r = apply(null, { type: "schedule", planned: { startTime: "14:07", endTime: "17:43" } });
  assert.equal(r.status, "scheduled");
  assert.equal(r.origin, "manual");
  assert.deepEqual(r.planned, { startTime: "14:07", endTime: "17:43" });
  assert.equal(r.yearMonth, "2026-10");
  assert.equal(r.statusLog.length, 1);
  assert.equal(r.statusLog[0].to, "scheduled");
  assert.deepEqual(r.createdBy, actor);
});

test("予定の作成：開始 ≧ 終了は拒否", () => {
  assert.throws(
    () => applyUsageAction(null, { type: "schedule", planned: { startTime: "17:00", endTime: "14:00" } }, ctx),
    UsageTransitionError
  );
});

test("scheduled → attended：来所時刻は押した時刻（1分単位・丸めない）", () => {
  const r = apply(scheduled(), { type: "attend" });
  assert.equal(r.status, "attended");
  assert.equal(r.actual.startTime, "14:07");
  assert.deepEqual(r.planned, { startTime: "14:00", endTime: "17:00" }, "予定時刻は変えない");
  assert.equal(displayStatusOf(r), "attended");
  assert.equal(r.statusLog.at(-1)?.from, "scheduled");
});

test("attended → 退所：退所時刻は押した時刻（17:43）", () => {
  const attended = apply(scheduled(), { type: "attend" });
  const departed = apply(attended, { type: "depart" }, { now: new Date("2026-10-05T08:43:10Z") });
  assert.equal(departed.status, "attended");
  assert.equal(departed.actual.startTime, "14:07");
  assert.equal(departed.actual.endTime, "17:43");
  assert.equal(displayStatusOf(departed), "departed");
  assert.equal(USAGE_DISPLAY_LABELS[displayStatusOf(departed)], "退所");
  assert.equal(canApplyUsageAction(departed, "depart"), false, "退所は1回");
  // 退所の取消
  const undone = apply(departed, { type: "undoDepart" });
  assert.equal(undone.actual.endTime, "");
  assert.equal(undone.actual.startTime, "14:07");
});

test("退所時刻が来所時刻より前になる場合は拒否", () => {
  const attended = apply(scheduled(), { type: "attend" });
  assert.throws(
    () => applyUsageAction(attended, { type: "depart" }, { ...ctx, now: new Date("2026-10-05T04:00:00Z") }),
    UsageTransitionError
  );
});

test("scheduled → absent：理由は任意（空でよい）、欠席連絡日はその日", () => {
  const r = apply(scheduled(), { type: "absent" });
  assert.equal(r.status, "absent");
  assert.deepEqual(r.absence, { reason: "", contactedAt: "2026-10-05" });
  const withReason = apply(scheduled(), { type: "absent", reason: "  体調不良 " });
  assert.equal(withReason.absence.reason, "体調不良");
  assert.throws(() => applyUsageAction(scheduled(), { type: "absent", reason: "あ".repeat(201) }, ctx), UsageTransitionError);
});

test("scheduled → cancelled、cancelled → scheduled（予定に戻す・時刻を決め直す）", () => {
  const cancelled = apply(scheduled(), { type: "cancel" });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(canApplyUsageAction(cancelled, "attend"), false);
  const restored = apply(cancelled, { type: "restore" });
  assert.equal(restored.status, "scheduled");
  assert.deepEqual(restored.planned, { startTime: "14:00", endTime: "17:00" });
  const replanned = apply(cancelled, { type: "schedule", planned: { startTime: "10:00", endTime: "16:00" } });
  assert.equal(replanned.status, "scheduled");
  assert.deepEqual(replanned.planned, { startTime: "10:00", endTime: "16:00" });
});

test("attended の取消（予定に戻す）と修正（欠席に変更・時刻修正）", () => {
  const attended = apply(scheduled(), { type: "attend" });
  const undone = apply(attended, { type: "undoAttend" });
  assert.equal(undone.status, "scheduled");
  assert.deepEqual(undone.actual, { startTime: "", endTime: "", pickup: null, dropoff: null });

  const toAbsent = apply(attended, { type: "absent", reason: "早退ではなく欠席だった" });
  assert.equal(toAbsent.status, "absent");
  assert.equal(toAbsent.actual.startTime, "");

  const fixed = apply(attended, { type: "editActual", actual: { startTime: "14:08", endTime: "17:12", pickup: true, dropoff: false } });
  assert.deepEqual(fixed.actual, { startTime: "14:08", endTime: "17:12", pickup: true, dropoff: false });
  assert.throws(
    () => applyUsageAction(attended, { type: "editActual", actual: { startTime: "17:00", endTime: "14:00" } }, ctx),
    UsageTransitionError
  );
});

test("absent → attended（遅れて来所）、absent → scheduled（欠席の取消）", () => {
  const absent = apply(scheduled(), { type: "absent", reason: "体調不良" });
  const late = apply(absent, { type: "attend" }, { now: new Date("2026-10-05T07:30:00Z") });
  assert.equal(late.status, "attended");
  assert.equal(late.actual.startTime, "16:30");
  assert.deepEqual(late.absence, { reason: "", contactedAt: "" });
  const undone = apply(absent, { type: "undoAbsent" });
  assert.equal(undone.status, "scheduled");
  assert.equal(undone.absence.reason, "");
});

test("予定外の来所（walkIn）：最初から attended・来所時刻＝今。取り消すと記録ごと削除", () => {
  const r = apply(null, { type: "walkIn" });
  assert.equal(r.status, "attended");
  assert.equal(r.origin, "walkIn");
  assert.equal(r.actual.startTime, "14:07");
  assert.deepEqual(r.planned, { startTime: "", endTime: "" });
  assert.deepEqual(applyUsageAction(r, { type: "undoAttend" }, ctx), { kind: "delete" });
  // 既に記録がある日は walkIn できない
  assert.throws(() => applyUsageAction(scheduled(), { type: "walkIn" }, ctx), UsageTransitionError);
});

test("できない操作：記録が無い日の来所、予定のままの退所 など", () => {
  assert.throws(() => applyUsageAction(null, { type: "attend" }, ctx), UsageTransitionError);
  assert.equal(canApplyUsageAction(scheduled(), "depart"), false);
  assert.equal(canApplyUsageAction(scheduled(), "restore"), false);
  assert.equal(canApplyUsageAction(null, "walkIn"), true);
  assert.throws(() => applyUsageAction(scheduled(), { type: "attend" }, { ...ctx, date: "2026-10-06" }), UsageTransitionError);
});

test("予定時刻の編集：1分単位で保存、状態は変えない", () => {
  const r = apply(scheduled(), { type: "editPlanned", planned: { startTime: "14:07", endTime: "17:43" } });
  assert.deepEqual(r.planned, { startTime: "14:07", endTime: "17:43" });
  assert.equal(r.status, "scheduled");
  assert.equal(r.statusLog.length, 1, "状態が変わらない操作は履歴を増やさない");
});

test("statusLog は最大30件", () => {
  let r = scheduled();
  for (let i = 0; i < 40; i += 1) r = apply(r, { type: i % 2 === 0 ? "cancel" : "restore" });
  assert.equal(r.statusLog.length, 30);
});

test("削除できるのは予定・キャンセルのみ", () => {
  const s = scheduled();
  assert.equal(canDeleteUsageRecord(s), true);
  assert.equal(canDeleteUsageRecord(apply(s, { type: "cancel" })), true);
  assert.equal(canDeleteUsageRecord(apply(s, { type: "attend" })), false);
  assert.equal(canDeleteUsageRecord(apply(s, { type: "absent" })), false);
});

test("validateActualTimes", () => {
  assert.equal(validateActualTimes({ startTime: "14:08", endTime: "" }), null);
  assert.equal(validateActualTimes({ startTime: "14:08", endTime: "14:08" }), null);
  assert.ok(validateActualTimes({ startTime: "", endTime: "17:00" }));
  assert.ok(validateActualTimes({ startTime: "25:00", endTime: "" }));
});

test("readUsageRecord：欠けた値を補い、ID から日付・利用者を補完。往復で値が変わらない", () => {
  const r = readUsageRecord("2026-10-05_ben1", { status: "bogus", planned: { startTime: "14:07", endTime: "x" } });
  assert.ok(r);
  assert.equal(r.date, "2026-10-05");
  assert.equal(r.beneficiaryId, "ben1");
  assert.equal(r.status, "scheduled");
  assert.deepEqual(r.planned, { startTime: "14:07", endTime: "" });
  assert.equal(readUsageRecord("broken", {}), null);

  const original = apply(scheduled(), { type: "attend" });
  const fields = toUsageRecordFields(original);
  const back = readUsageRecord(original.id, fields);
  assert.ok(back);
  assert.deepEqual(toUsageRecordFields(back), fields);
  assert.equal(fields.schemaVersion, 1);
  assert.equal("confirmed" in fields, false, "Phase 2 では実績確定を持たない");
});

test("当日以外をあとから記録：来所・退所・予定外の来所に時刻を明示できる（\"\" = 時刻不明）", () => {
  const attended = apply(scheduled(), { type: "attend", time: "" });
  assert.equal(attended.actual.startTime, "");
  const withTime = apply(scheduled(), { type: "attend", time: "14:03" });
  assert.equal(withTime.actual.startTime, "14:03");
  assert.equal(apply(withTime, { type: "depart", time: "17:58" }).actual.endTime, "17:58");
  assert.throws(() => applyUsageAction(withTime, { type: "depart", time: "" }, ctx), UsageTransitionError, "退所は時刻が必要");
  assert.throws(() => applyUsageAction(scheduled(), { type: "attend", time: "25:00" }, ctx), UsageTransitionError);
  assert.equal(apply(null, { type: "walkIn", time: "" }).actual.startTime, "");
});
