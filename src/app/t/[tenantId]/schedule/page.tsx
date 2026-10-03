"use client";

// 利用予定（Phase 2）。月間予定（利用者 × 日）と日カレンダー（時間軸 × 予定ブロック）を切り替えて使う。
//   ?view=month&month=YYYY-MM（既定）／?view=day&date=YYYY-MM-DD
// 月間予定では、基本の利用曜日から「この月の予定を作成」でき、各セルから予定の追加・編集・削除ができる。
// 日カレンダーでは、予定をドラッグ（15分単位）で移動・上端/下端でリサイズでき、クリックで1分単位の編集ができる。
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import { useRequireAuth } from "@/lib/auth";
import { isIsoDate, toJapanIsoDate } from "@/lib/beneficiaryChart/dates";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import {
  addDays,
  addMonths,
  datesOfMonth,
  displayStatusOf,
  formatDateWithWeekday,
  formatYearMonth,
  isYearMonth,
  usageRecordId,
  USAGE_DISPLAY_LABELS,
  weekdayOf,
  WEEKDAY_LABELS,
  type UsageRecord,
} from "@/lib/usage/model";
import { buildMonthPlan, formatWeekdays, PLAN_SKIP_REASON_LABELS } from "@/lib/usage/plan";
import { compareWithSupply, countUsageByBeneficiary } from "@/lib/usage/summary";
import { DRAG_SNAP_MINUTES, formatTime, formatTimeRange, parseTime, toJapanTimeText, type TimeRange } from "@/lib/usage/time";
import {
  applyUsageRecordAction,
  generateMonthPlan,
  isActiveForUsage,
  listUsageBeneficiaries,
  monthPlanResultMessage,
  subscribeUsageRecordsByDate,
  subscribeUsageRecordsByMonth,
  toPlanTarget,
  type UsageBeneficiary,
} from "@/lib/usage/usageStore";
import {
  primaryButtonClass,
  ResultNotice,
  secondaryButtonClass,
  type ResultMessage,
} from "../beneficiaries/components/chartUi";
import {
  DateNavigator,
  Modal,
  USAGE_BLOCK_STYLES,
  USAGE_CELL_MARKS,
  UsageLegend,
  UsageRecordEditor,
  UsageStatusBadge,
  type EditorTarget,
} from "../components/usage/usageUi";
import DayCalendar, { calendarItemsOf } from "../components/usage/DayCalendar";
import BeneficiarySelectDialog from "../components/usage/BeneficiarySelectDialog";

type View = "month" | "day";

/** 標準時刻が無い利用者に予定を追加するときの初期値（その場で1分単位に直せる） */
const FALLBACK_TIME: TimeRange = { startTime: "14:00", endTime: "17:00" };

function defaultTimesOf(b: UsageBeneficiary | undefined): TimeRange {
  if (b?.plan.defaultStartTime && b.plan.defaultEndTime) {
    return { startTime: b.plan.defaultStartTime, endTime: b.plan.defaultEndTime };
  }
  return FALLBACK_TIME;
}

function SchedulePage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useRequireAuth();

  const today = toJapanIsoDate(new Date());
  const view: View = searchParams?.get("view") === "day" ? "day" : "month";
  const monthParam = searchParams?.get("month") ?? "";
  const dateParam = searchParams?.get("date") ?? "";
  const date = isIsoDate(dateParam) ? dateParam : today;
  const yearMonth = isYearMonth(monthParam) ? monthParam : view === "day" ? date.slice(0, 7) : today.slice(0, 7);

  const [beneficiaries, setBeneficiaries] = useState<UsageBeneficiary[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadBeneficiaries = useCallback(() => {
    listUsageBeneficiaries(tenantId, { withCertificate: true })
      .then(setBeneficiaries)
      .catch((e) => setLoadError(friendlyChartError(e, "load")));
  }, [tenantId]);

  useEffect(() => {
    if (!user || !tenantId) return;
    void Promise.resolve().then(loadBeneficiaries);
  }, [user, tenantId, loadBeneficiaries]);

  const go = (next: { view: View; month?: string; date?: string }) => {
    const qs = new URLSearchParams({ view: next.view });
    if (next.view === "month") qs.set("month", next.month ?? yearMonth);
    else qs.set("date", next.date ?? date);
    router.replace(`/t/${tenantId}/schedule?${qs.toString()}`);
  };

  if (loading) return <div className="text-sm">Loading...</div>;
  if (!user) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="text-sm">ログインしてください</div>
        <button className="mt-4 w-full rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/login")}>
          ログインへ
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">利用予定</h1>
          <p className="mt-1 text-sm text-zinc-500">月間の予定の確認・作成と、日ごとの時間の調整ができます。</p>
        </div>
        <div role="tablist" aria-label="表示の切り替え" className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
          {(
            [
              { id: "month", label: "月間予定" },
              { id: "day", label: "日カレンダー" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${view === t.id ? "bg-black text-white" : "text-zinc-600 hover:bg-zinc-50"}`}
              onClick={() => go(t.id === "month" ? { view: "month", month: date.slice(0, 7) } : { view: "day", date: yearMonth === today.slice(0, 7) ? today : `${yearMonth}-01` })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {loadError}
        </div>
      )}

      {view === "month" ? (
        <MonthView
          tenantId={tenantId}
          user={user}
          yearMonth={yearMonth}
          today={today}
          beneficiaries={beneficiaries}
          onMonth={(m) => go({ view: "month", month: m })}
          onOpenDay={(d) => go({ view: "day", date: d })}
        />
      ) : (
        <DayView
          tenantId={tenantId}
          user={user}
          date={date}
          today={today}
          beneficiaries={beneficiaries}
          onDate={(d) => go({ view: "day", date: d })}
        />
      )}
    </div>
  );
}

// ===== 月間予定 =====

function MonthView({
  tenantId,
  user,
  yearMonth,
  today,
  beneficiaries,
  onMonth,
  onOpenDay,
}: {
  tenantId: string;
  user: User;
  yearMonth: string;
  today: string;
  beneficiaries: UsageBeneficiary[] | null;
  onMonth: (m: string) => void;
  onOpenDay: (d: string) => void;
}) {
  // 読み込んだ月と記録の組。表示中の月と違う間は「読み込み中」（月を移動した直後に前の月の記録を出さない）
  const [loaded, setLoaded] = useState<{ key: string; records: UsageRecord[] } | null>(null);
  const records = loaded?.key === yearMonth ? loaded.records : null;
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [message, setMessage] = useState<ResultMessage>(null);

  useEffect(() => {
    return subscribeUsageRecordsByMonth(
      tenantId,
      yearMonth,
      (list) => {
        setLoaded({ key: yearMonth, records: list });
        setError("");
      },
      (e) => setError(friendlyChartError(e, "load"))
    );
  }, [tenantId, yearMonth]);

  const dates = datesOfMonth(yearMonth);
  const recordMap = useMemo(() => new Map((records ?? []).map((r) => [r.id, r])), [records]);
  const counts = useMemo(() => countUsageByBeneficiary(records ?? [], today), [records, today]);
  const withRecords = useMemo(() => new Set((records ?? []).map((r) => r.beneficiaryId)), [records]);
  const rows = (beneficiaries ?? []).filter((b) => showInactive || isActiveForUsage(b) || withRecords.has(b.id));
  const byId = new Map((beneficiaries ?? []).map((b) => [b.id, b]));
  const hiddenCount = (beneficiaries ?? []).length - rows.length;

  const openCell = (b: UsageBeneficiary, d: string) => {
    const r = recordMap.get(usageRecordId(d, b.id));
    if (r) setEditor({ kind: "existing", record: r });
    else setEditor({ kind: "new", beneficiaryId: b.id, date: d, ...defaultTimesOf(b) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNavigator
          label={formatYearMonth(yearMonth)}
          isToday={yearMonth === today.slice(0, 7)}
          prevLabel="前月"
          nextLabel="次月"
          todayLabel="今月"
          onPrev={() => onMonth(addMonths(yearMonth, -1))}
          onNext={() => onMonth(addMonths(yearMonth, 1))}
          onToday={() => onMonth(today.slice(0, 7))}
        />
        <button type="button" className={primaryButtonClass} onClick={() => setGenerateOpen(true)} disabled={!beneficiaries || !records}>
          基本の曜日からこの月の予定を作成
        </button>
      </div>

      <ResultNotice message={message} />
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <UsageLegend />
          <label className="flex items-center gap-2 text-xs text-zinc-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            休止・利用終了の利用者も表示{hiddenCount > 0 && !showInactive ? `（${hiddenCount}人）` : ""}
          </label>
        </div>

        {!beneficiaries || !records ? (
          <div className="py-8 text-center text-sm text-zinc-500">読み込み中…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">利用者が登録されていません。</div>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0" data-testid="month-table">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[9rem] border-b border-zinc-200 bg-white px-2 py-2 text-left font-semibold text-zinc-500">
                    利用者
                  </th>
                  {dates.map((d) => {
                    const w = weekdayOf(d);
                    return (
                      <th key={d} className="border-b border-zinc-200 px-0 py-1 font-semibold">
                        <button
                          type="button"
                          onClick={() => onOpenDay(d)}
                          title={`${formatDateWithWeekday(d)}の日カレンダー`}
                          className={`flex w-8 flex-col items-center rounded-md py-0.5 hover:bg-zinc-100 ${
                            d === today ? "bg-indigo-50 text-indigo-700" : w === 0 ? "text-red-500" : w === 6 ? "text-sky-600" : "text-zinc-600"
                          }`}
                        >
                          <span>{Number(d.slice(8))}</span>
                          <span className="text-[10px] font-normal">{WEEKDAY_LABELS[w]}</span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="whitespace-nowrap border-b border-zinc-200 px-2 py-2 text-right font-semibold text-zinc-500">
                    利用日数 / 支給量
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const c = counts.get(b.id);
                  const supply = compareWithSupply(c?.usageDays ?? 0, b.daysPerMonth);
                  return (
                    <tr key={b.id}>
                      <td className="sticky left-0 z-10 border-b border-zinc-100 bg-white px-2 py-1.5">
                        <Link href={`/t/${tenantId}/beneficiaries/${b.id}?tab=usage`} className="block truncate font-semibold hover:underline">
                          {b.name || "（氏名未登録）"}
                        </Link>
                        <span className="block truncate text-[11px] text-zinc-500">
                          {b.plan.weekdays.length > 0 ? `基本：${formatWeekdays(b.plan.weekdays)}` : "基本の曜日：未設定"}
                          {!isActiveForUsage(b) && "（休止・終了）"}
                        </span>
                      </td>
                      {dates.map((d) => {
                        const r = recordMap.get(usageRecordId(d, b.id));
                        const s = r ? displayStatusOf(r) : null;
                        return (
                          <td key={d} className={`border-b border-zinc-100 p-0.5 ${d === today ? "bg-indigo-50/50" : ""}`}>
                            <button
                              type="button"
                              onClick={() => openCell(b, d)}
                              data-testid={`cell-${b.id}-${d}`}
                              title={
                                r
                                  ? `${formatDateWithWeekday(d)} ${USAGE_DISPLAY_LABELS[displayStatusOf(r)]} ${formatTimeRange(r.planned.startTime, r.planned.endTime)}`
                                  : `${formatDateWithWeekday(d)} 予定を追加`
                              }
                              className={`flex h-8 w-8 items-center justify-center rounded-md border text-[11px] font-bold ${
                                s ? USAGE_BLOCK_STYLES[s] : "border-transparent text-zinc-300 hover:border-zinc-200 hover:bg-zinc-50"
                              }`}
                            >
                              {s ? USAGE_CELL_MARKS[s] : "＋"}
                            </button>
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap border-b border-zinc-100 px-2 py-1.5 text-right tabular-nums">
                        {supply ? (
                          <span className={supply.over ? "font-bold text-amber-700" : ""} title={supply.over ? "支給量を超えています（保存はできます）" : undefined}>
                            {supply.text}
                            {supply.over && " ⚠"}
                          </span>
                        ) : (
                          <span>
                            {c?.usageDays ?? 0}日<span className="ml-1 text-[11px] text-zinc-400">（支給量不明）</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          セルを押すと予定の追加・編集ができます。利用日数は「予定」と「来所」の日数です（欠席・キャンセルは数えません）。支給量は通所受給者証から読み取れた場合に表示し、超えても保存はできます。
        </p>
      </section>

      {editor && (
        <UsageRecordEditor
          tenantId={tenantId}
          user={user}
          target={editor}
          beneficiaryName={byId.get(editor.kind === "existing" ? editor.record.beneficiaryId : editor.beneficiaryId)?.name || "利用者"}
          onClose={() => setEditor(null)}
          onSaved={() => undefined}
        />
      )}

      {generateOpen && beneficiaries && records && (
        <GeneratePlanDialog
          tenantId={tenantId}
          user={user}
          yearMonth={yearMonth}
          today={today}
          beneficiaries={beneficiaries}
          records={records}
          onClose={() => setGenerateOpen(false)}
          onDone={(text) => setMessage({ kind: "ok", text })}
        />
      )}
    </div>
  );
}

function GeneratePlanDialog({
  tenantId,
  user,
  yearMonth,
  today,
  beneficiaries,
  records,
  onClose,
  onDone,
}: {
  tenantId: string;
  user: User;
  yearMonth: string;
  today: string;
  beneficiaries: UsageBeneficiary[];
  records: UsageRecord[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // 過去の日に「予定」を作ると未処理が増えるだけなので、今日以降だけ作る
  const monthStart = `${yearMonth}-01`;
  const fromDate = monthStart > today ? monthStart : today;
  const isPast = datesOfMonth(yearMonth).at(-1)! < today;
  const targets = beneficiaries.map(toPlanTarget);
  const preview = buildMonthPlan({ yearMonth, targets, existingIds: new Set(records.map((r) => r.id)), fromDate });
  const nameOf = new Map(beneficiaries.map((b) => [b.id, b.name]));
  const perBeneficiary = new Map<string, number>();
  for (const r of preview.records) perBeneficiary.set(r.beneficiaryId, (perBeneficiary.get(r.beneficiaryId) ?? 0) + 1);
  // 休止・終了・利用停止は「対象外」として件数だけ示す（未設定の人は設定を促すため名前を出す）
  const notConfigured = preview.skipped.filter((s) => s.reason === "noWeekdays" || s.reason === "invalidTime");
  const inactiveCount = preview.skipped.length - notConfigured.length;

  const run = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await generateMonthPlan({ tenantId, yearMonth, targets, user, fromDate });
      onDone(monthPlanResultMessage(result, yearMonth));
      onClose();
    } catch (e) {
      setError(`${friendlyChartError(e, "save")} もう一度「作成する」を押すと、まだ作られていない予定だけが作成されます。`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`${formatYearMonth(yearMonth)}の予定を作成`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {isPast ? (
          <p className="text-zinc-600">過去の月の予定は作成できません。必要な日は月間予定のセルから個別に追加してください。</p>
        ) : (
          <>
            <p className="text-zinc-600">
              利用者カルテの「基本の利用曜日」と標準時刻から、{formatDateWithWeekday(fromDate)}以降の予定を作成します。
              すでに予定・来所・欠席・キャンセルがある日はそのままにします（何度押しても重複しません）。
            </p>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <div className="font-bold">作成する予定：{preview.records.length}件（{perBeneficiary.size}人）</div>
              {preview.existingCount > 0 && <div className="mt-1 text-xs text-zinc-500">すでにある予定・記録 {preview.existingCount}件はそのままにします。</div>}
              {inactiveCount > 0 && <div className="mt-1 text-xs text-zinc-500">休止・利用終了の{inactiveCount}人は対象外です。</div>}
            </div>
            {perBeneficiary.size > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {[...perBeneficiary].map(([id, n]) => (
                  <li key={id} className="flex justify-between gap-2">
                    <span className="truncate">{nameOf.get(id) || "（氏名未登録）"}</span>
                    <span className="shrink-0 tabular-nums text-zinc-500">{n}日</span>
                  </li>
                ))}
              </ul>
            )}
            {notConfigured.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <div className="font-semibold">基本の曜日・標準時刻が未設定のため作成しない利用者（{notConfigured.length}人）</div>
                <div className="mt-1">
                  {notConfigured
                    .slice(0, 12)
                    .map((s) => `${nameOf.get(s.beneficiaryId) || "（氏名未登録）"}（${PLAN_SKIP_REASON_LABELS[s.reason]}）`)
                    .join("、")}
                  {notConfigured.length > 12 && ` ほか${notConfigured.length - 12}人`}
                </div>
                <div className="mt-1">利用者カルテの「利用予定」タブで設定できます。</div>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <button type="button" className={secondaryButtonClass} onClick={onClose} disabled={saving}>
            閉じる
          </button>
          {!isPast && (
            <button type="button" className={primaryButtonClass} onClick={() => void run()} disabled={saving || preview.records.length === 0}>
              {saving ? "作成中…" : "作成する"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ===== 日カレンダー =====

function DayView({
  tenantId,
  user,
  date,
  today,
  beneficiaries,
  onDate,
}: {
  tenantId: string;
  user: User;
  date: string;
  today: string;
  beneficiaries: UsageBeneficiary[] | null;
  onDate: (d: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; records: UsageRecord[] } | null>(null);
  const records = loaded?.key === date ? loaded.records : null;
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [picker, setPicker] = useState<{ startTime: string } | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    return subscribeUsageRecordsByDate(
      tenantId,
      date,
      (list) => {
        setLoaded({ key: date, records: list });
        setError("");
      },
      (e) => setError(friendlyChartError(e, "load"))
    );
  }, [tenantId, date]);

  // 現在時刻の線（今日のみ。1分ごとに更新）
  useEffect(() => {
    if (date !== today) {
      void Promise.resolve().then(() => setNowMinutes(null));
      return;
    }
    const tick = () => setNowMinutes(parseTime(toJapanTimeText(new Date())));
    void Promise.resolve().then(tick);
    const timer = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [date, today]);

  const byId = useMemo(() => new Map((beneficiaries ?? []).map((b) => [b.id, b])), [beneficiaries]);
  const nameOf = (id: string) => byId.get(id)?.name || "（利用者が見つかりません）";
  const { offGrid } = useMemo(() => calendarItemsOf(records ?? []), [records]);
  const cancelled = (records ?? []).filter((r) => r.status === "cancelled");
  const recordedIds = new Set((records ?? []).map((r) => r.beneficiaryId));
  const candidates = (beneficiaries ?? []).filter((b) => isActiveForUsage(b) && !recordedIds.has(b.id));

  const changePlanned = async (record: UsageRecord, planned: TimeRange) => {
    try {
      await applyUsageRecordAction({ tenantId, beneficiaryId: record.beneficiaryId, date: record.date, action: { type: "editPlanned", planned }, user });
    } catch (e) {
      throw new Error(friendlyChartError(e, "save"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNavigator
          label={formatDateWithWeekday(date)}
          isToday={date === today}
          onPrev={() => onDate(addDays(date, -1))}
          onNext={() => onDate(addDays(date, 1))}
          onToday={() => onDate(today)}
        />
        <div className="flex flex-wrap gap-2">
          <Link href={`/t/${tenantId}/today${date === today ? "" : `?date=${date}`}`} className={secondaryButtonClass}>
            来所・欠席の記録へ
          </Link>
          <button type="button" className={primaryButtonClass} onClick={() => setPicker({ startTime: "" })} disabled={!beneficiaries}>
            ＋ 予定を追加
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {records === null || !beneficiaries ? (
        <div className="rounded-2xl border border-zinc-200 bg-white py-8 text-center text-sm text-zinc-500">読み込み中…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <DayCalendar
            records={records}
            nameOf={nameOf}
            nowMinutes={nowMinutes}
            onOpen={(r) => setEditor({ kind: "existing", record: r })}
            onCreateAt={(startTime) => setPicker({ startTime })}
            onChangePlanned={changePlanned}
          />
          <aside className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold">この日の予定 {records.filter((r) => r.status !== "cancelled").length}件</h2>
              <div className="mt-2">
                <UsageLegend />
              </div>
            </section>
            {offGrid.length > 0 && (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-bold">時刻のない記録</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {offGrid.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-2 text-left hover:underline" onClick={() => setEditor({ kind: "existing", record: r })}>
                        <span className="truncate">{nameOf(r.beneficiaryId)}</span>
                        <UsageStatusBadge record={r} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {cancelled.length > 0 && (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-bold">キャンセル {cancelled.length}件</h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {cancelled.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-zinc-500 hover:underline" onClick={() => setEditor({ kind: "existing", record: r })}>
                        <span className="truncate">{nameOf(r.beneficiaryId)}</span>
                        <span className="text-xs tabular-nums">{formatTimeRange(r.planned.startTime, r.planned.endTime)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {editor && (
        <UsageRecordEditor
          tenantId={tenantId}
          user={user}
          target={editor}
          beneficiaryName={nameOf(editor.kind === "existing" ? editor.record.beneficiaryId : editor.beneficiaryId)}
          onClose={() => setEditor(null)}
          onSaved={() => undefined}
        />
      )}

      {picker && (
        <BeneficiarySelectDialog
          title={picker.startTime ? `${picker.startTime}からの予定を追加` : "予定を追加する利用者"}
          description="利用者を選ぶと、予定の時刻（1分単位）を確認して追加できます。"
          beneficiaries={candidates}
          onClose={() => setPicker(null)}
          onSelect={(b) => {
            const defaults = defaultTimesOf(b);
            let times = defaults;
            if (picker.startTime) {
              // クリックした時刻から、標準の長さ（未設定なら3時間）で入れる
              const length = (parseTime(defaults.endTime) ?? 0) - (parseTime(defaults.startTime) ?? 0) || 180;
              const start = parseTime(picker.startTime) as number;
              const end = Math.min(start + length, 23 * 60 + 59);
              times = { startTime: picker.startTime, endTime: formatTime(Math.max(end, start + DRAG_SNAP_MINUTES)) as string };
            }
            setPicker(null);
            setEditor({ kind: "new", beneficiaryId: b.id, date, ...times });
          }}
        />
      )}
    </div>
  );
}

export default function SchedulePageRoute() {
  return (
    <Suspense fallback={<div className="text-sm">Loading...</div>}>
      <SchedulePage />
    </Suspense>
  );
}
