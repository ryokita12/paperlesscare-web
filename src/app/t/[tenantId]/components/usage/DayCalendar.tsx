"use client";

// 日カレンダー（時間軸 × 利用予定ブロック）。Google カレンダーの日表示に近い操作感。
//
// 精度の使い分け（src/lib/usage/time.ts の定数）：
//   - 目盛り：30分（CALENDAR_GRID_MINUTES）。表示範囲：CALENDAR_START_MINUTES〜CALENDAR_END_MINUTES
//   - ブロックの位置・高さ：予定時刻（1分単位）に比例。14:07〜17:43 は丸めずにその位置へ描く
//   - ドラッグでの移動・上端/下端のリサイズ：15分にスナップ（DRAG_SNAP_MINUTES）。計算は純粋関数（moveTimeRange 等）
//   - 予定時刻の直接入力（1分単位）はブロックをクリックして開く詳細ダイアログで行う
// D&D はライブラリを使わず Pointer Events（setPointerCapture）で実装する（マウス・タッチ・ペン共通）。
// ブロック上ではタッチのスクロールを止める（touch-action: none）。空いている部分ではこれまでどおりスクロールできる。
// 保存は楽観的に表示を先に変え、失敗したら元の位置へ戻してエラーを出す。
import { useMemo, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { gridLines, layoutCalendarItems, placementToBox } from "@/lib/usage/calendarLayout";
import { displayStatusOf, USAGE_DISPLAY_LABELS, type UsageRecord } from "@/lib/usage/model";
import {
  CALENDAR_END_MINUTES,
  CALENDAR_GRID_MINUTES,
  CALENDAR_START_MINUTES,
  DRAG_SNAP_MINUTES,
  formatTime,
  formatTimeRange,
  moveTimeRange,
  parseTime,
  pixelsToMinutes,
  resizeTimeRangeEnd,
  resizeTimeRangeStart,
  snapMinutes,
  type TimeRange,
} from "@/lib/usage/time";
import { USAGE_BLOCK_STYLES } from "./usageUi";

/** 30分の目盛り1つ分の高さ（px）。1分あたりの高さはここから求める */
const SLOT_HEIGHT = 48;
const PIXELS_PER_MINUTE = SLOT_HEIGHT / CALENDAR_GRID_MINUTES;
/** これ以上動かしたらドラッグ、それ未満ならクリック（px） */
const DRAG_THRESHOLD = 4;
/** 重なりで列が増えたときの1列の最小幅（px）。足りなければ横にスクロールする */
const MIN_COLUMN_WIDTH = 96;
const RESIZE_HANDLE = 8;

const RANGE = { start: CALENDAR_START_MINUTES, end: CALENDAR_END_MINUTES };
const BOUNDS = { min: CALENDAR_START_MINUTES, max: CALENDAR_END_MINUTES, step: DRAG_SNAP_MINUTES };

type DragMode = "move" | "resizeStart" | "resizeEnd";

type DragState = {
  id: string;
  mode: DragMode;
  pointerId: number;
  startY: number;
  original: TimeRange;
  preview: TimeRange;
  moved: boolean;
};

export type DayCalendarProps = {
  records: readonly UsageRecord[];
  nameOf: (beneficiaryId: string) => string;
  /** 現在時刻の線を出す（今日のみ） */
  nowMinutes: number | null;
  onOpen: (record: UsageRecord) => void;
  /** 空いている時間帯をクリック（15分にスナップした開始時刻） */
  onCreateAt: (startTime: string) => void;
  /** ドラッグ・リサイズで予定時刻を変えた。失敗したら reject（表示を元に戻す） */
  onChangePlanned: (record: UsageRecord, planned: TimeRange) => Promise<void>;
};

/** ドラッグで時刻を変えられるのは「予定」の記録だけ（来所・欠席などの記録の予定時刻は詳細から直す） */
function isDraggable(record: UsageRecord): boolean {
  return record.status === "scheduled";
}

export function calendarItemsOf(records: readonly UsageRecord[]) {
  const onGrid: UsageRecord[] = [];
  const offGrid: UsageRecord[] = [];
  for (const r of records) {
    if (r.status === "cancelled") continue;
    if (parseTime(r.planned.startTime) !== null && parseTime(r.planned.endTime) !== null && r.planned.startTime < r.planned.endTime) {
      onGrid.push(r);
    } else {
      offGrid.push(r);
    }
  }
  return { onGrid, offGrid };
}

export default function DayCalendar({ records, nameOf, nowMinutes, onOpen, onCreateAt, onChangePlanned }: DayCalendarProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // 保存中（または保存直後で、購読の更新がまだ届いていない）の表示上の時刻
  const [pending, setPending] = useState<Record<string, TimeRange>>({});
  const [error, setError] = useState("");

  const { onGrid } = useMemo(() => calendarItemsOf(records), [records]);

  const rangeOf = (r: UsageRecord): TimeRange => {
    if (drag?.id === r.id) return drag.preview;
    return pending[r.id] ?? r.planned;
  };

  const placements = layoutCalendarItems(onGrid.map((r) => ({ id: r.id, ...rangeOf(r) })));
  const maxColumns = placements.reduce((m, p) => Math.max(m, p.columns), 1);
  const recordById = new Map(onGrid.map((r) => [r.id, r]));
  const lines = gridLines(RANGE, CALENDAR_GRID_MINUTES);
  const height = (RANGE.end - RANGE.start) * PIXELS_PER_MINUTE;

  const startDrag = (e: ReactPointerEvent, record: UsageRecord, mode: DragMode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const original = pending[record.id] ?? record.planned;
    setDrag({ id: record.id, mode, pointerId: e.pointerId, startY: e.clientY, original, preview: original, moved: false });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = e.clientY - drag.startY;
    const moved = drag.moved || Math.abs(dy) >= DRAG_THRESHOLD;
    if (!moved) return;
    const delta = pixelsToMinutes(dy, PIXELS_PER_MINUTE);
    const calc = drag.mode === "move" ? moveTimeRange : drag.mode === "resizeStart" ? resizeTimeRangeStart : resizeTimeRangeEnd;
    const preview = calc(drag.original, delta, BOUNDS) ?? drag.original;
    setDrag({ ...drag, moved, preview });
  };

  const finishDrag = async (e: ReactPointerEvent, cancelled = false) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const state = drag;
    setDrag(null);
    const record = recordById.get(state.id);
    if (!record) return;
    if (!state.moved) {
      if (!cancelled) onOpen(record);
      return;
    }
    const changed = state.preview.startTime !== state.original.startTime || state.preview.endTime !== state.original.endTime;
    if (cancelled || !changed) return;

    setError("");
    setPending((p) => ({ ...p, [state.id]: state.preview }));
    try {
      await onChangePlanned(record, state.preview);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "予定の時刻を保存できませんでした。もう一度お試しください。");
    } finally {
      // 成功時は購読の更新で新しい時刻が届く。失敗時は元の時刻に戻る
      setPending((p) => {
        const next = { ...p };
        delete next[state.id];
        return next;
      });
    }
  };

  const onGridClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = RANGE.start + pixelsToMinutes(e.clientY - rect.top, PIXELS_PER_MINUTE);
    const snapped = Math.min(Math.max(snapMinutes(minute - DRAG_SNAP_MINUTES / 2, DRAG_SNAP_MINUTES), RANGE.start), RANGE.end - DRAG_SNAP_MINUTES);
    onCreateAt(formatTime(snapped) as string);
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      <div className="max-h-[70dvh] overflow-auto rounded-2xl border border-zinc-200 bg-white" data-testid="day-calendar">
        <div className="flex" style={{ minWidth: `calc(3.5rem + ${maxColumns * MIN_COLUMN_WIDTH}px)` }}>
          {/* 時刻の目盛り（30分ごと。正時のみ文字を出す） */}
          <div className="relative w-14 shrink-0 border-r border-zinc-100" style={{ height }} aria-hidden="true">
            {lines.map((m) => (
              <div
                key={m}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-zinc-400"
                style={{ top: (m - RANGE.start) * PIXELS_PER_MINUTE }}
              >
                {m % 60 === 0 && m !== RANGE.start ? formatTime(m) : m === RANGE.start ? formatTime(m) : ""}
              </div>
            ))}
          </div>

          <div
            className="relative flex-1 cursor-copy"
            style={{ height }}
            onClick={onGridClick}
            title="空いているところをクリックすると予定を追加できます"
          >
            {lines.map((m) => (
              <div
                key={m}
                className={`pointer-events-none absolute inset-x-0 border-t ${m % 60 === 0 ? "border-zinc-200" : "border-dashed border-zinc-100"}`}
                style={{ top: (m - RANGE.start) * PIXELS_PER_MINUTE }}
              />
            ))}

            {nowMinutes !== null && nowMinutes >= RANGE.start && nowMinutes <= RANGE.end && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                style={{ top: (nowMinutes - RANGE.start) * PIXELS_PER_MINUTE }}
                aria-label="現在時刻"
              >
                <span className="absolute -left-1.5 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
              </div>
            )}

            {placements.map((p) => {
              const record = recordById.get(p.id);
              const box = placementToBox(p, RANGE, PIXELS_PER_MINUTE);
              if (!record || !box) return null;
              const range = rangeOf(record);
              const status = displayStatusOf(record);
              const draggable = isDraggable(record);
              const dragging = drag?.id === record.id && drag.moved;
              const saving = !!pending[record.id];
              const widthPct = 100 / p.columns;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${nameOf(record.beneficiaryId)} ${formatTimeRange(range.startTime, range.endTime)} ${USAGE_DISPLAY_LABELS[status]}`}
                  data-testid="calendar-block"
                  className={`absolute select-none overflow-hidden rounded-lg border px-1.5 py-1 text-xs shadow-sm ${USAGE_BLOCK_STYLES[status]} ${
                    draggable ? "cursor-grab touch-none" : "cursor-pointer"
                  } ${dragging ? "z-30 cursor-grabbing opacity-90 shadow-lg ring-2 ring-indigo-300" : "z-10"} ${saving ? "opacity-70" : ""}`}
                  style={{
                    top: box.top,
                    height: Math.max(box.height, 18),
                    left: `calc(${p.column * widthPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                  }}
                  onPointerDown={(e) => (draggable ? startDrag(e, record, "move") : undefined)}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => void finishDrag(e)}
                  onPointerCancel={(e) => void finishDrag(e, true)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!draggable) onOpen(record);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(record);
                    }
                  }}
                >
                  {draggable && (
                    <div
                      className="absolute inset-x-0 top-0 cursor-ns-resize"
                      style={{ height: RESIZE_HANDLE }}
                      onPointerDown={(e) => startDrag(e, record, "resizeStart")}
                      aria-hidden="true"
                    />
                  )}
                  <div className="truncate font-bold">{nameOf(record.beneficiaryId)}</div>
                  <div className="truncate tabular-nums">{formatTimeRange(range.startTime, range.endTime)}</div>
                  {status !== "scheduled" && <div className="truncate text-[11px] font-semibold">{USAGE_DISPLAY_LABELS[status]}</div>}
                  {draggable && (
                    <div
                      className="absolute inset-x-0 bottom-0 cursor-ns-resize"
                      style={{ height: RESIZE_HANDLE }}
                      onPointerDown={(e) => startDrag(e, record, "resizeEnd")}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        予定をドラッグすると15分単位で時刻を移動、上端・下端をドラッグすると開始・終了を変更できます。1分単位の時刻は予定をクリックして入力してください。
      </p>
    </div>
  );
}
