"use client";

// 利用者カルテ「利用予定」タブ（Phase 2）：基本の利用曜日・標準時刻、月の予定と実績。
// 「実績」は別タブにせず、このタブの月の一覧（予定 → 来所・欠席・キャンセル → 退所）で確認する。
import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { toJapanIsoDate } from "@/lib/beneficiaryChart/dates";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import {
  addMonths,
  formatDateWithWeekday,
  formatYearMonth,
  WEEKDAY_LABELS,
  type UsageRecord,
} from "@/lib/usage/model";
import { formatWeekdays, validateUsagePlan, type UsagePlan } from "@/lib/usage/plan";
import { compareWithSupply, countUsage } from "@/lib/usage/summary";
import { formatDuration, formatTimeRange } from "@/lib/usage/time";
import {
  generateMonthPlan,
  getUsageBeneficiary,
  listUsageRecordsForBeneficiary,
  monthPlanResultMessage,
  saveUsagePlan,
  toPlanTarget,
  type UsageBeneficiary,
} from "@/lib/usage/usageStore";
import {
  InfoGrid,
  InfoItem,
  primaryButtonClass,
  ResultNotice,
  secondaryButtonClass,
  SectionCard,
  type ResultMessage,
} from "../../components/chartUi";
import { DateNavigator, TimeField, UsageRecordEditor, UsageStatusBadge, type EditorTarget } from "../../../components/usage/usageUi";
import { useSectionEditor, type SectionEditorControl } from "./useSectionEditor";

type Props = {
  tenantId: string;
  beneficiaryId: string;
  beneficiaryName: string;
  user: User;
  control: SectionEditorControl;
};

// 月曜始まりで並べる
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function UsageTab({ tenantId, beneficiaryId, beneficiaryName, user, control }: Props) {
  const today = toJapanIsoDate(new Date());
  const [beneficiary, setBeneficiary] = useState<UsageBeneficiary | null>(null);
  const [yearMonth, setYearMonth] = useState(today.slice(0, 7));
  const [records, setRecords] = useState<UsageRecord[] | null>(null);
  const [prevRecords, setPrevRecords] = useState<UsageRecord[] | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<ResultMessage>(null);

  const loadBeneficiary = useCallback(async () => {
    setBeneficiary(await getUsageBeneficiary(tenantId, beneficiaryId));
  }, [tenantId, beneficiaryId]);

  const loadRecords = useCallback(async () => {
    const [current, prev] = await Promise.all([
      listUsageRecordsForBeneficiary(tenantId, beneficiaryId, yearMonth),
      listUsageRecordsForBeneficiary(tenantId, beneficiaryId, addMonths(yearMonth, -1)),
    ]);
    setRecords(current.sort((a, b) => (a.date < b.date ? -1 : 1)));
    setPrevRecords(prev);
  }, [tenantId, beneficiaryId, yearMonth]);

  useEffect(() => {
    void Promise.resolve()
      .then(() => Promise.all([loadBeneficiary(), loadRecords()]))
      .then(() => setError(""))
      .catch((e) => setError(friendlyChartError(e, "load")));
  }, [loadBeneficiary, loadRecords]);

  const plan = beneficiary?.plan ?? { weekdays: [], defaultStartTime: "", defaultEndTime: "" };

  const editorState = useSectionEditor<UsagePlan>({
    id: "usagePlan",
    control,
    initial: () => plan,
    validate: (draft) => {
      const msg = validateUsagePlan(draft);
      return msg ? { plan: msg } : {};
    },
    save: async (draft) => {
      await saveUsagePlan({ tenantId, beneficiaryId, plan: draft, user });
      await loadBeneficiary();
    },
  });

  const counts = useMemo(() => countUsage(records ?? [], today), [records, today]);
  const prevCounts = useMemo(() => countUsage(prevRecords ?? [], today), [prevRecords, today]);
  const supply = compareWithSupply(counts.usageDays, beneficiary?.daysPerMonth ?? null);
  const isPastMonth = yearMonth < today.slice(0, 7);

  const generate = async () => {
    if (!beneficiary) return;
    setGenerating(true);
    setMessage(null);
    try {
      const monthStart = `${yearMonth}-01`;
      const result = await generateMonthPlan({
        tenantId,
        yearMonth,
        targets: [toPlanTarget(beneficiary)],
        user,
        fromDate: monthStart > today ? monthStart : today,
      });
      setMessage({ kind: "ok", text: monthPlanResultMessage(result, yearMonth) });
      await loadRecords();
    } catch (e) {
      setMessage({ kind: "error", text: friendlyChartError(e, "save") });
    } finally {
      setGenerating(false);
    }
  };

  const toggleWeekday = (d: number) => {
    const set = new Set(editorState.draft.weekdays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    editorState.setField("weekdays", [...set].sort((a, b) => a - b));
  };

  const planReady = plan.weekdays.length > 0 && !!plan.defaultStartTime && !!plan.defaultEndTime;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <SectionCard
        title="基本の利用曜日"
        description="毎週利用する曜日と、標準の利用時間です。利用予定の「この月の予定を作成」で使います。"
        editing={editorState.editing}
        canEdit={control.editingId === null && !!beneficiary}
        onEdit={editorState.start}
        onCancel={editorState.cancel}
        onSave={() => void editorState.submit()}
        saving={editorState.saving}
        message={editorState.message}
      >
        {editorState.editing ? (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-semibold text-zinc-700">利用する曜日</div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_ORDER.map((d) => {
                  const on = editorState.draft.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleWeekday(d)}
                      className={`h-10 w-10 rounded-xl border text-sm font-bold ${
                        on ? "border-black bg-black text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {WEEKDAY_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TimeField
                id="usage-plan-start"
                label="標準の開始時刻"
                value={editorState.draft.defaultStartTime}
                onChange={(v) => editorState.setField("defaultStartTime", v)}
              />
              <TimeField
                id="usage-plan-end"
                label="標準の終了時刻"
                value={editorState.draft.defaultEndTime}
                onChange={(v) => editorState.setField("defaultEndTime", v)}
              />
            </div>
            <p className="text-xs text-zinc-500">時刻は1分単位で設定できます。作成した後の各日の予定は、個別に変更できます。</p>
            {editorState.errors.plan && <p className="text-xs font-semibold text-red-600">{editorState.errors.plan}</p>}
          </div>
        ) : (
          <InfoGrid>
            <InfoItem label="利用する曜日">
              {plan.weekdays.length > 0 ? formatWeekdays(plan.weekdays) : <span className="text-zinc-400">未設定</span>}
            </InfoItem>
            <InfoItem label="標準の利用時間">
              {plan.defaultStartTime ? formatTimeRange(plan.defaultStartTime, plan.defaultEndTime) : <span className="text-zinc-400">未設定</span>}
            </InfoItem>
          </InfoGrid>
        )}
      </SectionCard>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">予定と実績</h2>
          <DateNavigator
            label={formatYearMonth(yearMonth)}
            isToday={yearMonth === today.slice(0, 7)}
            prevLabel="前月"
            nextLabel="次月"
            todayLabel="今月"
            onPrev={() => setYearMonth(addMonths(yearMonth, -1))}
            onNext={() => setYearMonth(addMonths(yearMonth, 1))}
            onToday={() => setYearMonth(today.slice(0, 7))}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span>予定 <b>{counts.planned}</b></span>
          <span className="text-emerald-700">来所 <b>{counts.attended}</b></span>
          <span className="text-amber-700">欠席 <b>{counts.absent}</b></span>
          <span className="text-zinc-500">キャンセル <b>{counts.cancelled}</b></span>
          <span className={counts.pending > 0 ? "font-bold text-red-600" : "text-zinc-500"}>未処理 {counts.pending}</span>
          <span>
            利用日数 / 支給量：
            {supply ? (
              <b className={supply.over ? "text-amber-700" : ""}>
                {supply.text}
                {supply.over && " ⚠"}
              </b>
            ) : (
              <span className="text-zinc-500">
                {counts.usageDays}日（支給量不明{beneficiary && !beneficiary.hasCertificate ? "・受給者証未登録" : ""}）
              </span>
            )}
          </span>
        </div>
        {supply?.over && <p className="mt-1 text-xs text-amber-700">支給量を超えています（予定の保存はできます）。</p>}
        {beneficiary?.certificateValidTo && beneficiary.certificateValidTo < today && (
          <p className="mt-1 text-xs text-red-600">受給者証の有効期限が切れています（予定の登録はできます）。</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!isPastMonth && (
            <button type="button" className={primaryButtonClass} onClick={() => void generate()} disabled={!planReady || generating}>
              {generating ? "作成中…" : `基本の曜日から${Number(yearMonth.slice(5))}月の予定を作成`}
            </button>
          )}
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() =>
              setEditor({
                kind: "new",
                beneficiaryId,
                date: yearMonth === today.slice(0, 7) ? today : `${yearMonth}-01`,
                startTime: plan.defaultStartTime || "14:00",
                endTime: plan.defaultEndTime || "17:00",
              })
            }
          >
            ＋ 予定を追加
          </button>
        </div>
        {!planReady && !isPastMonth && (
          <p className="mt-2 text-xs text-zinc-500">基本の利用曜日と標準時刻を設定すると、月の予定をまとめて作成できます。</p>
        )}
        <div className="mt-3">
          <ResultNotice message={message} />
        </div>

        {records === null ? (
          <div className="py-6 text-center text-sm text-zinc-500">読み込み中…</div>
        ) : records.length === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-500">この月の予定・実績はありません。</div>
        ) : (
          <div className="-mx-4 mt-3 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2 font-semibold sm:px-2">日付</th>
                  <th className="px-2 py-2 font-semibold">状態</th>
                  <th className="px-2 py-2 font-semibold">予定</th>
                  <th className="px-2 py-2 font-semibold">実績（来所〜退所）</th>
                  <th className="px-2 py-2 font-semibold">メモ・欠席理由</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r.id}
                    className={`cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50 ${r.date === today ? "bg-indigo-50/40" : ""}`}
                    onClick={() => setEditor({ kind: "existing", record: r })}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 sm:px-2">{formatDateWithWeekday(r.date)}</td>
                    <td className="px-2 py-2.5">
                      <UsageStatusBadge record={r} />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">
                      {r.origin === "walkIn" ? <span className="text-xs text-zinc-500">予定外</span> : formatTimeRange(r.planned.startTime, r.planned.endTime)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 tabular-nums">
                      {r.status === "attended" ? formatTimeRange(r.actual.startTime, r.actual.endTime) || "時刻未入力" : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="max-w-[16rem] truncate px-2 py-2.5 text-xs text-zinc-600">{r.status === "absent" ? r.absence.reason || r.note : r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          行を押すと予定の時刻（1分単位）・状態・実績の時刻を変更できます。
          {prevRecords && prevRecords.length > 0 && (
            <>
              {" "}
              前月の実績：来所 {prevCounts.attended}日・欠席 {prevCounts.absent}日・実績時間 {formatDuration(prevCounts.actualMinutes)}
            </>
          )}
        </p>
      </section>

      {editor && (
        <UsageRecordEditor
          tenantId={tenantId}
          user={user}
          target={editor}
          beneficiaryName={beneficiaryName}
          onClose={() => setEditor(null)}
          onSaved={() => void loadRecords().catch(() => undefined)}
        />
      )}
    </div>
  );
}
