// 利用予定・実績の時刻（Firebase非依存の純粋ロジック）。
//
// 時刻は "HH:mm"（00:00〜23:59）の文字列で保存し、計算は「0時からの分（0〜1439）」で行う。
// 精度の使い分け（混同しないこと）：
//   - 保存・直接入力 … 1分単位（"14:07" はそのまま保存する）
//   - 日カレンダーの目盛り … 30分（CALENDAR_GRID_MINUTES）
//   - ドラッグでの移動・リサイズ … 15分にスナップ（DRAG_SNAP_MINUTES）
//   - 来所・退所の実績 … ボタンを押した実際の時刻（日本時間・1分単位。丸めない）
// 日付またぎ（終了が翌日）は扱わない。予定は同じ日の中で 開始 < 終了 とする。

export const MINUTES_PER_DAY = 24 * 60;
/** 1日の最後の分（23:59） */
export const LAST_MINUTE = MINUTES_PER_DAY - 1;

/** 日カレンダーの目盛り（表示のみ） */
export const CALENDAR_GRID_MINUTES = 30;
/** ドラッグ移動・リサイズのスナップ単位 */
export const DRAG_SNAP_MINUTES = 15;
/** 日カレンダーの表示範囲（放課後等デイサービスの通常運用＋学校休業日の朝から夜まで） */
export const CALENDAR_START_MINUTES = 8 * 60;
export const CALENDAR_END_MINUTES = 21 * 60;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:mm"（00:00〜23:59）かどうか */
export function isTimeText(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/** "14:07" → 847。形式が正しくなければ null */
export function parseTime(value: unknown): number | null {
  if (!isTimeText(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** 847 → "14:07"。範囲外・整数でない値は null */
export function formatTime(minutes: number): string | null {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > LAST_MINUTE) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 時刻入力（<input type="time"> の値など）を "HH:mm" に整える。"9:05" "14:07:00" も受け付ける。不正なら null */
export function normalizeTimeInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.normalize("NFKC").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const text = `${m[1].padStart(2, "0")}:${m[2]}`;
  return isTimeText(text) ? text : null;
}

export type TimeRange = { startTime: string; endTime: string };

export type TimeRangeError = "startInvalid" | "endInvalid" | "order";

export const TIME_RANGE_ERROR_MESSAGES: Record<TimeRangeError, string> = {
  startInvalid: "開始時刻を「時:分」で入力してください。",
  endInvalid: "終了時刻を「時:分」で入力してください。",
  order: "終了時刻は開始時刻より後にしてください（日付をまたぐ予定は登録できません）。",
};

/** 予定時刻の妥当性。開始・終了とも "HH:mm" で、開始 < 終了（同じ日の中）であること */
export function validateTimeRange(range: { startTime: unknown; endTime: unknown }): TimeRangeError | null {
  const start = parseTime(range.startTime);
  if (start === null) return "startInvalid";
  const end = parseTime(range.endTime);
  if (end === null) return "endInvalid";
  if (start >= end) return "order";
  return null;
}

/** 範囲の長さ（分）。不正なら null */
export function rangeMinutes(range: { startTime: unknown; endTime: unknown }): number | null {
  if (validateTimeRange(range)) return null;
  return (parseTime(range.endTime) as number) - (parseTime(range.startTime) as number);
}

/** 最も近い step 分の倍数へ丸める（ちょうど中間は後ろへ） */
export function snapMinutes(minutes: number, step = DRAG_SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

export type DragBounds = {
  /** 開始の下限（分） */
  min: number;
  /** 終了の上限（分） */
  max: number;
  step: number;
};

export const DEFAULT_DRAG_BOUNDS: DragBounds = {
  min: 0,
  // 23:59 以下で 15分の倍数の最大値（23:45）
  max: Math.floor(LAST_MINUTE / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES,
  step: DRAG_SNAP_MINUTES,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toRange(start: number, end: number): TimeRange {
  return { startTime: formatTime(start) as string, endTime: formatTime(end) as string };
}

/**
 * ドラッグでの移動。開始時刻を step 分にスナップし、長さは step 分単位に丸めた長さを保つ。
 * 例：14:07〜17:43（216分）を20分後ろへ → 開始 14:27 → 14:30、長さ 216 → 210分 → 14:30〜18:00
 * 範囲（bounds）からはみ出す場合は、長さを保ったまま範囲内へ押し戻す。不正な元の範囲なら null。
 */
export function moveTimeRange(
  range: TimeRange,
  deltaMinutes: number,
  bounds: DragBounds = DEFAULT_DRAG_BOUNDS
): TimeRange | null {
  const start = parseTime(range.startTime);
  const length = rangeMinutes(range);
  if (start === null || length === null) return null;

  const span = bounds.max - bounds.min;
  const snappedLength = clamp(Math.max(snapMinutes(length, bounds.step), bounds.step), bounds.step, span);
  const newStart = clamp(snapMinutes(start + deltaMinutes, bounds.step), bounds.min, bounds.max - snappedLength);
  return toRange(newStart, newStart + snappedLength);
}

/**
 * 上端のドラッグ（開始時刻の変更）。開始を step 分にスナップし、終了は元のまま。
 * 開始は終了の step 分前までに制限する（終了が step の倍数でない直接入力の値でも、開始 < 終了 を保つ）。
 */
export function resizeTimeRangeStart(
  range: TimeRange,
  deltaMinutes: number,
  bounds: DragBounds = DEFAULT_DRAG_BOUNDS
): TimeRange | null {
  const start = parseTime(range.startTime);
  const end = parseTime(range.endTime);
  if (start === null || end === null || start >= end) return null;

  const latest = Math.floor((end - 1) / bounds.step) * bounds.step;
  const lowest = Math.min(bounds.min, latest);
  const newStart = clamp(snapMinutes(start + deltaMinutes, bounds.step), lowest, latest);
  return toRange(newStart, end);
}

/** 下端のドラッグ（終了時刻の変更）。終了を step 分にスナップし、開始は元のまま。終了は開始の後の最初の step 境界以降 */
export function resizeTimeRangeEnd(
  range: TimeRange,
  deltaMinutes: number,
  bounds: DragBounds = DEFAULT_DRAG_BOUNDS
): TimeRange | null {
  const start = parseTime(range.startTime);
  const end = parseTime(range.endTime);
  if (start === null || end === null || start >= end) return null;

  const earliest = Math.floor(start / bounds.step) * bounds.step + bounds.step;
  const highest = Math.max(bounds.max, earliest);
  const newEnd = clamp(snapMinutes(end + deltaMinutes, bounds.step), earliest, Math.min(highest, LAST_MINUTE));
  return toRange(start, newEnd);
}

/** 画面上の移動量（px）を分へ換算する */
export function pixelsToMinutes(deltaPixels: number, pixelsPerMinute: number): number {
  if (!(pixelsPerMinute > 0)) return 0;
  return deltaPixels / pixelsPerMinute;
}

/** 日本時間（Asia/Tokyo）の現在時刻を "HH:mm"（1分単位・切り捨て）で返す。端末のタイムゾーン設定に左右されない */
export function toJapanTimeText(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** 分 → "3時間30分"（合計時間の表示用） */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0分";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** "14:07〜17:43"。どちらかが空なら空いた側を「--:--」で示す。両方空なら "" */
export function formatTimeRange(startTime: string, endTime: string): string {
  if (!startTime && !endTime) return "";
  return `${startTime || "--:--"}〜${endTime || "--:--"}`;
}
