import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_END_MINUTES,
  CALENDAR_GRID_MINUTES,
  CALENDAR_START_MINUTES,
  DRAG_SNAP_MINUTES,
  formatDuration,
  formatTime,
  formatTimeRange,
  isTimeText,
  moveTimeRange,
  normalizeTimeInput,
  parseTime,
  pixelsToMinutes,
  rangeMinutes,
  resizeTimeRangeEnd,
  resizeTimeRangeStart,
  snapMinutes,
  toJapanTimeText,
  validateTimeRange,
} from "./time.ts";

const calendarBounds = { min: CALENDAR_START_MINUTES, max: CALENDAR_END_MINUTES, step: DRAG_SNAP_MINUTES };

test("精度の定数：目盛り30分・ドラッグ15分（混同しない）", () => {
  assert.equal(CALENDAR_GRID_MINUTES, 30);
  assert.equal(DRAG_SNAP_MINUTES, 15);
  assert.ok(CALENDAR_START_MINUTES <= 9 * 60 && CALENDAR_END_MINUTES >= 19 * 60, "放デイの通常運用の時間帯を含む");
});

test("1分単位：14:07 をそのまま扱える（丸めない）", () => {
  assert.equal(parseTime("14:07"), 847);
  assert.equal(formatTime(847), "14:07");
  assert.equal(formatTime(parseTime("17:43") as number), "17:43");
  for (let m = 0; m < 24 * 60; m += 1) assert.equal(parseTime(formatTime(m)), m);
});

test("境界：00:00 と 23:59 は有効、24:00・不正形式は無効", () => {
  assert.equal(parseTime("00:00"), 0);
  assert.equal(parseTime("23:59"), 1439);
  for (const bad of ["24:00", "23:60", "9:00", "14:7", "14-07", "", " 14:07", null, 847]) {
    assert.equal(isTimeText(bad), false, String(bad));
    assert.equal(parseTime(bad), null);
  }
  assert.equal(formatTime(1440), null);
  assert.equal(formatTime(-1), null);
  assert.equal(formatTime(1.5), null);
});

test("normalizeTimeInput：time input の値・秒付き・1桁時を整える", () => {
  assert.equal(normalizeTimeInput("14:07"), "14:07");
  assert.equal(normalizeTimeInput("9:05"), "09:05");
  assert.equal(normalizeTimeInput("14:07:00"), "14:07");
  assert.equal(normalizeTimeInput("１４：０７"), "14:07");
  assert.equal(normalizeTimeInput("25:00"), null);
  assert.equal(normalizeTimeInput(""), null);
});

test("validateTimeRange：開始 < 終了（同じ日の中）。日付またぎ・同時刻は拒否", () => {
  assert.equal(validateTimeRange({ startTime: "14:07", endTime: "17:43" }), null);
  assert.equal(validateTimeRange({ startTime: "00:00", endTime: "23:59" }), null);
  assert.equal(validateTimeRange({ startTime: "14:00", endTime: "14:00" }), "order");
  assert.equal(validateTimeRange({ startTime: "17:00", endTime: "14:00" }), "order");
  assert.equal(validateTimeRange({ startTime: "22:00", endTime: "01:00" }), "order", "日付またぎは不可");
  assert.equal(validateTimeRange({ startTime: "", endTime: "17:00" }), "startInvalid");
  assert.equal(validateTimeRange({ startTime: "14:00", endTime: "24:00" }), "endInvalid");
  assert.equal(rangeMinutes({ startTime: "14:07", endTime: "17:43" }), 216);
  assert.equal(rangeMinutes({ startTime: "17:00", endTime: "14:00" }), null);
});

test("snapMinutes：15分の最も近い倍数（中間は後ろ）", () => {
  assert.equal(snapMinutes(847), 840); // 14:07 → 14:00
  assert.equal(snapMinutes(848), 855); // 14:08 → 14:15
  assert.equal(snapMinutes(852.5), 855);
  assert.equal(snapMinutes(867), 870); // 14:27 → 14:30
});

test("moveTimeRange：14:07〜17:43 を約20分後ろへ → 14:30〜18:00（15分スナップ）", () => {
  assert.deepEqual(moveTimeRange({ startTime: "14:07", endTime: "17:43" }, 20), { startTime: "14:30", endTime: "18:00" });
});

test("moveTimeRange：15分単位の予定は長さをそのまま保つ", () => {
  assert.deepEqual(moveTimeRange({ startTime: "14:00", endTime: "17:00" }, 16), { startTime: "14:15", endTime: "17:15" });
  assert.deepEqual(moveTimeRange({ startTime: "14:00", endTime: "17:00" }, -37), { startTime: "13:30", endTime: "16:30" });
  assert.deepEqual(moveTimeRange({ startTime: "14:00", endTime: "17:00" }, 7), { startTime: "14:00", endTime: "17:00" });
  // スナップ結果はすべて15分の倍数
  for (let d = -120; d <= 120; d += 1) {
    const r = moveTimeRange({ startTime: "14:07", endTime: "17:43" }, d);
    assert.ok(r);
    assert.equal((parseTime(r.startTime) as number) % 15, 0);
    assert.equal((parseTime(r.endTime) as number) % 15, 0);
  }
});

test("moveTimeRange：短い予定（15分未満）も最低15分にして動かす", () => {
  assert.deepEqual(moveTimeRange({ startTime: "14:07", endTime: "14:12" }, 0), { startTime: "14:00", endTime: "14:15" });
});

test("moveTimeRange：範囲外へはみ出さない（日付をまたがない）", () => {
  assert.deepEqual(moveTimeRange({ startTime: "20:00", endTime: "23:00" }, 300), { startTime: "20:45", endTime: "23:45" });
  assert.deepEqual(moveTimeRange({ startTime: "01:00", endTime: "03:00" }, -300), { startTime: "00:00", endTime: "02:00" });
  assert.deepEqual(moveTimeRange({ startTime: "18:00", endTime: "20:00" }, 600, calendarBounds), {
    startTime: "19:00",
    endTime: "21:00",
  });
  assert.equal(moveTimeRange({ startTime: "17:00", endTime: "14:00" }, 15), null);
});

test("resizeTimeRangeStart：上端は15分スナップ、終了はそのまま（直接入力の値も保持）", () => {
  assert.deepEqual(resizeTimeRangeStart({ startTime: "14:07", endTime: "17:43" }, 20), { startTime: "14:30", endTime: "17:43" });
  assert.deepEqual(resizeTimeRangeStart({ startTime: "14:00", endTime: "17:00" }, -30), { startTime: "13:30", endTime: "17:00" });
  // 終了を越えない（開始 < 終了を保つ）
  assert.deepEqual(resizeTimeRangeStart({ startTime: "14:00", endTime: "17:00" }, 500), { startTime: "16:45", endTime: "17:00" });
  assert.deepEqual(resizeTimeRangeStart({ startTime: "14:00", endTime: "17:43" }, 500), { startTime: "17:30", endTime: "17:43" });
});

test("resizeTimeRangeEnd：下端は15分スナップ、開始はそのまま", () => {
  assert.deepEqual(resizeTimeRangeEnd({ startTime: "14:07", endTime: "17:43" }, 10), { startTime: "14:07", endTime: "18:00" });
  assert.deepEqual(resizeTimeRangeEnd({ startTime: "14:00", endTime: "17:00" }, -500), { startTime: "14:00", endTime: "14:15" });
  assert.deepEqual(resizeTimeRangeEnd({ startTime: "14:07", endTime: "17:00" }, -500), { startTime: "14:07", endTime: "14:15" });
  // 23:59 を超えない
  assert.deepEqual(resizeTimeRangeEnd({ startTime: "22:00", endTime: "23:00" }, 500), { startTime: "22:00", endTime: "23:45" });
  for (let d = -300; d <= 300; d += 7) {
    const r = resizeTimeRangeEnd({ startTime: "14:07", endTime: "17:43" }, d, calendarBounds);
    assert.ok(r);
    assert.equal(validateTimeRange(r), null);
  }
});

test("pixelsToMinutes：px → 分", () => {
  assert.equal(pixelsToMinutes(32, 1.6), 20);
  assert.equal(pixelsToMinutes(10, 0), 0);
});

test("toJapanTimeText：日本時間の1分単位（端末のタイムゾーンに依存しない・切り捨て）", () => {
  assert.equal(toJapanTimeText(new Date("2026-10-05T05:07:59Z")), "14:07");
  assert.equal(toJapanTimeText(new Date("2026-10-05T08:43:00Z")), "17:43");
  assert.equal(toJapanTimeText(new Date("2026-10-05T15:00:00Z")), "00:00");
  assert.equal(toJapanTimeText(new Date("2026-10-05T14:59:00Z")), "23:59");
});

test("表示用：合計時間・時刻範囲", () => {
  assert.equal(formatDuration(216), "3時間36分");
  assert.equal(formatDuration(180), "3時間");
  assert.equal(formatDuration(45), "45分");
  assert.equal(formatDuration(0), "0分");
  assert.equal(formatTimeRange("14:07", "17:43"), "14:07〜17:43");
  assert.equal(formatTimeRange("14:07", ""), "14:07〜--:--");
  assert.equal(formatTimeRange("", ""), "");
});
