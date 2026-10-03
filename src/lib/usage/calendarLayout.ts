// 日カレンダーの配置計算（Firebase非依存の純粋ロジック）。
//
// 予定ブロックは「時間に比例した位置・高さ」で置く（30分の目盛りに丸めない。14:07〜17:43 はその位置に描く）。
// 同じ時間帯に重なる予定は、重なりのまとまり（クラスター）ごとに列へ振り分けて横に並べる
// （Google カレンダーの日表示と同じ考え方：空いている一番左の列に入れ、まとまりの列数で幅を等分する）。
import { parseTime } from "./time.ts";

export type CalendarItem = { id: string; startTime: string; endTime: string };

export type CalendarPlacement = {
  id: string;
  /** 0時からの分 */
  start: number;
  end: number;
  /** 何列目か（0始まり） */
  column: number;
  /** そのまとまりの列数 */
  columns: number;
};

/**
 * 重なりを考慮して列を決める。時刻が不正な（開始 ≧ 終了など）予定は含めない。
 * 並び順：開始が早い順 → 長い順 → id（毎回同じ配置になるように）
 */
export function layoutCalendarItems(items: readonly CalendarItem[]): CalendarPlacement[] {
  const valid = items
    .map((it) => ({ id: it.id, start: parseTime(it.startTime), end: parseTime(it.endTime) }))
    .filter((it): it is { id: string; start: number; end: number } => it.start !== null && it.end !== null && it.start < it.end)
    .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const result: CalendarPlacement[] = [];
  let cluster: CalendarPlacement[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns = columnEnds.length;
    for (const p of cluster) result.push({ ...p, columns });
    cluster = [];
    columnEnds = [];
  };

  for (const it of valid) {
    if (it.start >= clusterEnd && cluster.length > 0) flush();
    let column = columnEnds.findIndex((end) => end <= it.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(it.end);
    } else {
      columnEnds[column] = it.end;
    }
    cluster.push({ id: it.id, start: it.start, end: it.end, column, columns: 0 });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length > 0) flush();
  return result;
}

/** 表示範囲（分）に対する位置（px）。範囲外ははみ出さないよう切り詰める */
export function placementToBox(
  placement: Pick<CalendarPlacement, "start" | "end">,
  range: { start: number; end: number },
  pixelsPerMinute: number
): { top: number; height: number } | null {
  const start = Math.max(placement.start, range.start);
  const end = Math.min(placement.end, range.end);
  if (end <= start) return null;
  return { top: (start - range.start) * pixelsPerMinute, height: (end - start) * pixelsPerMinute };
}

/** 目盛り（例：08:00, 08:30, …）の分の一覧。終了時刻ちょうどの線を含む */
export function gridLines(range: { start: number; end: number }, step: number): number[] {
  const lines: number[] = [];
  for (let m = Math.ceil(range.start / step) * step; m <= range.end; m += step) lines.push(m);
  return lines;
}
