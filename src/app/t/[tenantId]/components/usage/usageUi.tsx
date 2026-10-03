"use client";

// 予定・実績（Phase 2）の管理Web用UI部品。既存の chartUi（白カード・黒の主ボタン・枠線の副ボタン）に見た目を合わせる。
import { useEffect, useId, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  dangerButtonClass,
  FormField,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../beneficiaries/components/chartUi";
import {
  displayStatusOf,
  formatDateWithWeekday,
  ORIGIN_LABELS,
  USAGE_DISPLAY_LABELS,
  type UsageDisplayStatus,
  type UsageRecord,
} from "@/lib/usage/model";
import { canApplyUsageAction, canDeleteUsageRecord, canMoveUsageRecordDate, type UsageAction } from "@/lib/usage/transitions";
import { formatTimeRange, normalizeTimeInput, TIME_RANGE_ERROR_MESSAGES, validateTimeRange } from "@/lib/usage/time";
import { applyUsageRecordAction, deleteUsageRecord, moveUsageRecordDate } from "@/lib/usage/usageStore";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import { toJapanIsoDate } from "@/lib/beneficiaryChart/dates";

export const USAGE_STATUS_STYLES: Record<UsageDisplayStatus, string> = {
  scheduled: "border-sky-200 bg-sky-50 text-sky-800",
  attended: "border-emerald-200 bg-emerald-50 text-emerald-800",
  departed: "border-zinc-300 bg-zinc-100 text-zinc-700",
  absent: "border-amber-200 bg-amber-50 text-amber-800",
  cancelled: "border-zinc-200 bg-white text-zinc-400 line-through",
};

/** 日カレンダーのブロック・月間表のセルの色（バッジより少し濃い背景） */
export const USAGE_BLOCK_STYLES: Record<UsageDisplayStatus, string> = {
  scheduled: "border-sky-300 bg-sky-100 text-sky-900",
  attended: "border-emerald-300 bg-emerald-100 text-emerald-900",
  departed: "border-zinc-300 bg-zinc-200 text-zinc-700",
  absent: "border-amber-300 bg-amber-100 text-amber-900",
  cancelled: "border-zinc-200 bg-zinc-50 text-zinc-400",
};

/** 月間表のセルの記号 */
export const USAGE_CELL_MARKS: Record<UsageDisplayStatus, string> = {
  scheduled: "●",
  attended: "✓",
  departed: "✓",
  absent: "欠",
  cancelled: "—",
};

export function UsageStatusBadge({ record }: { record: Pick<UsageRecord, "status" | "actual"> }) {
  const s = displayStatusOf(record);
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${USAGE_STATUS_STYLES[s]}`}
    >
      {USAGE_DISPLAY_LABELS[s]}
    </span>
  );
}

/** 記号の凡例 */
export function UsageLegend() {
  const items: UsageDisplayStatus[] = ["scheduled", "attended", "absent", "cancelled"];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold ${USAGE_BLOCK_STYLES[s]}`}>
            {USAGE_CELL_MARKS[s]}
          </span>
          {s === "attended" ? "来所（退所含む）" : USAGE_DISPLAY_LABELS[s]}
        </span>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="-m-1 rounded-lg p-1 text-zinc-500 hover:bg-zinc-100" aria-label="閉じる">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 1分単位で入力できる時刻欄（step=60秒） */
export function TimeField({
  id,
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <FormField label={label} htmlFor={id} error={error}>
      <input
        id={id}
        type="time"
        step={60}
        className={inputClass}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(normalizeTimeInput(e.target.value) ?? e.target.value)}
      />
    </FormField>
  );
}

const navButton = "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50";

/** 前日 / 翌日 / 今日 */
export function DateNavigator({
  label,
  onPrev,
  onNext,
  onToday,
  isToday,
  prevLabel = "前日",
  nextLabel = "翌日",
  todayLabel = "今日",
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isToday: boolean;
  prevLabel?: string;
  nextLabel?: string;
  todayLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={navButton} onClick={onPrev} aria-label={prevLabel}>
        ‹ {prevLabel}
      </button>
      <div className="min-w-[9rem] text-center text-lg font-bold">{label}</div>
      <button type="button" className={navButton} onClick={onNext} aria-label={nextLabel}>
        {nextLabel} ›
      </button>
      {!isToday && (
        <button type="button" className={navButton} onClick={onToday}>
          {todayLabel}へ戻る
        </button>
      )}
    </div>
  );
}

/** 件数のタイル（今日の利用の上部） */
export function CountTile({
  label,
  value,
  tone = "default",
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "default" | "sky" | "emerald" | "amber" | "zinc" | "red";
  active?: boolean;
  onClick?: () => void;
}) {
  const tones = {
    default: "text-zinc-900",
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    zinc: "text-zinc-500",
    red: "text-red-600",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-2xl border bg-white px-3 py-3 text-left shadow-sm transition ${
        active ? "border-indigo-400 ring-2 ring-indigo-100" : "border-zinc-200 hover:bg-zinc-50"
      }`}
    >
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone]}`}>
        {value}
        <span className="ml-0.5 text-sm font-semibold">人</span>
      </div>
    </button>
  );
}

// ===== 記録の詳細・編集ダイアログ =====

export type EditorTarget =
  | { kind: "existing"; record: UsageRecord }
  | { kind: "new"; beneficiaryId: string; date: string; startTime: string; endTime: string };

type ActionButton = { action: UsageAction; label: string; tone?: "primary" | "danger" };

/**
 * 1件の記録の詳細・編集。予定の時刻（1分単位）・日付、状態の変更、実績の時刻・送迎、欠席理由、メモ、削除。
 * 予定が無い日（kind: "new"）は「予定を追加」または「予定外の来所」を記録できる。
 */
export function UsageRecordEditor({
  tenantId,
  user,
  target,
  beneficiaryName,
  onClose,
  onSaved,
}: {
  tenantId: string;
  user: User;
  target: EditorTarget;
  beneficiaryName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const record = target.kind === "existing" ? target.record : null;
  const beneficiaryId = record ? record.beneficiaryId : (target as { beneficiaryId: string }).beneficiaryId;
  const originalDate = record ? record.date : (target as { date: string }).date;

  const [date, setDate] = useState(originalDate);
  const [startTime, setStartTime] = useState(record ? record.planned.startTime : (target as { startTime: string }).startTime);
  const [endTime, setEndTime] = useState(record ? record.planned.endTime : (target as { endTime: string }).endTime);
  const [actualStart, setActualStart] = useState(record?.actual.startTime ?? "");
  const [actualEnd, setActualEnd] = useState(record?.actual.endTime ?? "");
  const [pickup, setPickup] = useState<boolean | null>(record?.actual.pickup ?? null);
  const [dropoff, setDropoff] = useState<boolean | null>(record?.actual.dropoff ?? null);
  const [absenceReason, setAbsenceReason] = useState(record?.absence.reason ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const idPrefix = useId();

  const plannedError = (() => {
    if (!startTime && !endTime && record?.origin === "walkIn") return null;
    const e = validateTimeRange({ startTime, endTime });
    return e ? TIME_RANGE_ERROR_MESSAGES[e] : null;
  })();

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await fn();
      onSaved();
      onClose();
    } catch (e) {
      setError(friendlyChartError(e, "save"));
    } finally {
      setSaving(false);
    }
  };

  const act = (action: UsageAction) =>
    applyUsageRecordAction({ tenantId, beneficiaryId, date: originalDate, action, user });

  /** 予定（時刻・日付）・実績・欠席理由・メモのうち変わったものを順に保存する */
  const saveEdits = () =>
    run(async () => {
      if (!record) {
        if (plannedError) throw new Error(plannedError);
        await applyUsageRecordAction({
          tenantId,
          beneficiaryId,
          date,
          action: { type: "schedule", planned: { startTime, endTime } },
          user,
        });
        return;
      }
      const plannedChanged = startTime !== record.planned.startTime || endTime !== record.planned.endTime;
      if (date !== record.date) {
        if (plannedError) throw new Error(plannedError);
        await moveUsageRecordDate({ tenantId, record, newDate: date, planned: { startTime, endTime }, user });
        return;
      }
      if (plannedChanged) {
        if (plannedError) throw new Error(plannedError);
        await act({ type: "editPlanned", planned: { startTime, endTime } });
      }
      if (
        record.status === "attended" &&
        (actualStart !== record.actual.startTime ||
          actualEnd !== record.actual.endTime ||
          pickup !== record.actual.pickup ||
          dropoff !== record.actual.dropoff)
      ) {
        await act({ type: "editActual", actual: { startTime: actualStart, endTime: actualEnd, pickup, dropoff } });
      }
      if (record.status === "absent" && absenceReason.trim() !== record.absence.reason) {
        await act({ type: "editAbsence", reason: absenceReason });
      }
      if (note.trim() !== record.note) {
        await act({ type: "editNote", note });
      }
    });

  // 当日は押した時刻を記録する。当日以外（あとから記録）は時刻を自動で入れず、実績欄で入力してもらう
  const isToday = originalDate === toJapanIsoDate(new Date());
  const statusButtons: ActionButton[] = record
    ? ([
        { action: isToday ? { type: "attend" } : { type: "attend", time: "" }, label: isToday ? "来所にする（今の時刻）" : "来所にする", tone: "primary" },
        ...(isToday ? [{ action: { type: "depart" } as UsageAction, label: "退所にする（今の時刻）", tone: "primary" as const }] : []),
        { action: { type: "absent", reason: absenceReason }, label: "欠席にする" },
        { action: { type: "cancel" }, label: "キャンセルにする" },
        { action: { type: "restore" }, label: "予定に戻す" },
        { action: { type: "undoAttend" }, label: record.origin === "walkIn" ? "予定外の来所を取り消す" : "来所を取り消す" },
        { action: { type: "undoDepart" }, label: "退所を取り消す" },
        { action: { type: "undoAbsent" }, label: "欠席を取り消す" },
      ] satisfies ActionButton[]).filter((b) => canApplyUsageAction(record, b.action.type))
    : [];

  const dateEditable = !record || canMoveUsageRecordDate(record);
  const title = record ? `${beneficiaryName}　${formatDateWithWeekday(record.date)}` : `${beneficiaryName}　予定を追加`;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-5">
        {record && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <UsageStatusBadge record={record} />
            <span className="text-xs text-zinc-500">{ORIGIN_LABELS[record.origin]}</span>
            {record.updatedBy.name && <span className="text-xs text-zinc-500">最終更新：{record.updatedBy.name}</span>}
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-bold">予定</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="日付" htmlFor={`${idPrefix}-date`} hint={dateEditable ? undefined : "来所・欠席等の記録は日付を変えられません"}>
              <input
                id={`${idPrefix}-date`}
                type="date"
                className={inputClass}
                value={date}
                disabled={!dateEditable || saving}
                onChange={(e) => setDate(e.target.value)}
              />
            </FormField>
            <TimeField id={`${idPrefix}-start`} label="開始時刻" value={startTime} onChange={setStartTime} disabled={saving} />
            <TimeField id={`${idPrefix}-end`} label="終了時刻" value={endTime} onChange={setEndTime} disabled={saving} />
          </div>
          <p className="text-xs text-zinc-500">時刻は1分単位で入力できます（例：14:07）。</p>
          {plannedError && (startTime || endTime || !record) && <p className="text-xs font-semibold text-red-600">{plannedError}</p>}
        </section>

        {record?.status === "attended" && (
          <section className="space-y-3">
            <h3 className="text-sm font-bold">実績</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <TimeField id={`${idPrefix}-astart`} label="来所時刻" value={actualStart} onChange={setActualStart} disabled={saving} />
              <TimeField id={`${idPrefix}-aend`} label="退所時刻" value={actualEnd} onChange={setActualEnd} disabled={saving} />
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <TriStateCheck label="送迎（迎え）" value={pickup} onChange={setPickup} />
              <TriStateCheck label="送迎（送り）" value={dropoff} onChange={setDropoff} />
            </div>
          </section>
        )}

        {(record?.status === "absent" || record?.status === "scheduled") && (
          <FormField
            label={record.status === "absent" ? "欠席理由（任意）" : "欠席にする場合の理由（任意）"}
            htmlFor={`${idPrefix}-reason`}
          >
            <input
              id={`${idPrefix}-reason`}
              className={inputClass}
              value={absenceReason}
              maxLength={200}
              placeholder="例：体調不良"
              onChange={(e) => setAbsenceReason(e.target.value)}
            />
          </FormField>
        )}

        {record && (
          <FormField label="メモ" htmlFor={`${idPrefix}-note`}>
            <textarea
              id={`${idPrefix}-note`}
              className={inputClass}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        )}

        {statusButtons.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold">状態を変える</h3>
            <div className="flex flex-wrap gap-2">
              {statusButtons.map((b) => (
                <button
                  key={b.action.type}
                  type="button"
                  disabled={saving}
                  className={b.tone === "primary" ? primaryButtonClass : secondaryButtonClass}
                  onClick={() => void run(() => act(b.action))}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4">
          <div>
            {record && canDeleteUsageRecord(record) && (
              <button
                type="button"
                className={dangerButtonClass}
                disabled={saving}
                onClick={() => void run(() => deleteUsageRecord({ tenantId, record }))}
              >
                予定を削除
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving}>
              閉じる
            </button>
            <button type="button" className={primaryButtonClass} onClick={() => void saveEdits()} disabled={saving}>
              {saving ? "保存中…" : record ? "変更を保存" : "予定を追加"}
            </button>
          </div>
        </div>
        {!record && (
          <p className="text-xs text-zinc-500">
            {formatDateWithWeekday(date)} {formatTimeRange(startTime, endTime)}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** 未入力 / あり / なし の3択（送迎） */
function TriStateCheck({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }) {
  const options: { v: boolean | null; text: string }[] = [
    { v: null, text: "未入力" },
    { v: true, text: "あり" },
    { v: false, text: "なし" },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-zinc-700">{label}</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(o.v)}
            className={`px-2.5 py-1 text-xs ${value === o.v ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}
