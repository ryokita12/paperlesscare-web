"use client";

// 今日の利用（Phase 2）。ログイン後のメイン画面。
// その日の利用予定者と、来所・退所・欠席・キャンセルの状況を一覧で確認し、必要な記録を行う。
// 記録はその日の usageRecords を購読しているため、LINE スタッフ版など他の端末での記録もすぐ反映される。
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import { isIsoDate, toJapanIsoDate } from "@/lib/beneficiaryChart/dates";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import {
  addDays,
  compareByPlannedStart,
  displayStatusOf,
  formatDateWithWeekday,
  type UsageDisplayStatus,
  type UsageRecord,
} from "@/lib/usage/model";
import { canApplyUsageAction, type UsageAction } from "@/lib/usage/transitions";
import { countUsage } from "@/lib/usage/summary";
import { formatTimeRange } from "@/lib/usage/time";
import {
  applyUsageRecordAction,
  isActiveForUsage,
  listUsageBeneficiaries,
  subscribeUsageRecordsByDate,
  type UsageBeneficiary,
} from "@/lib/usage/usageStore";
import { primaryButtonClass, secondaryButtonClass } from "../beneficiaries/components/chartUi";
import {
  CountTile,
  DateNavigator,
  UsageRecordEditor,
  UsageStatusBadge,
  type EditorTarget,
} from "../components/usage/usageUi";
import BeneficiarySelectDialog from "../components/usage/BeneficiarySelectDialog";

type Filter = "all" | "pending" | "attended" | "absent" | "cancelled";

const FILTER_MATCH: Record<Filter, (s: UsageDisplayStatus, r: UsageRecord, today: string) => boolean> = {
  all: () => true,
  pending: (s, r, today) => s === "scheduled" && r.date <= today,
  attended: (s) => s === "attended" || s === "departed",
  absent: (s) => s === "absent",
  cancelled: (s) => s === "cancelled",
};

function TodayPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useRequireAuth();

  const today = toJapanIsoDate(new Date());
  const dateParam = searchParams?.get("date") ?? "";
  const date = isIsoDate(dateParam) ? dateParam : today;
  const isToday = date === today;

  const [beneficiaries, setBeneficiaries] = useState<UsageBeneficiary[] | null>(null);
  // 読み込んだ日と記録の組（日付を移動した直後に前の日の記録を出さない）
  const [loaded, setLoaded] = useState<{ key: string; records: UsageRecord[] } | null>(null);
  const records = loaded?.key === date ? loaded.records : null;
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [pickerOpen, setPickerOpen] = useState<"walkIn" | "schedule" | null>(null);

  const loadBeneficiaries = useCallback(() => {
    listUsageBeneficiaries(tenantId)
      .then(setBeneficiaries)
      .catch((e) => setLoadError(friendlyChartError(e, "load")));
  }, [tenantId]);

  useEffect(() => {
    if (!user || !tenantId) return;
    void Promise.resolve().then(loadBeneficiaries);
  }, [user, tenantId, loadBeneficiaries]);

  useEffect(() => {
    if (!user || !tenantId) return;
    return subscribeUsageRecordsByDate(
      tenantId,
      date,
      (list) => {
        setLoaded({ key: date, records: list });
        setLoadError("");
      },
      (e) => setLoadError(friendlyChartError(e, "load"))
    );
  }, [user, tenantId, date]);

  const byId = useMemo(() => new Map((beneficiaries ?? []).map((b) => [b.id, b])), [beneficiaries]);
  const counts = useMemo(() => countUsage(records ?? [], today), [records, today]);
  const rows = useMemo(
    () =>
      [...(records ?? [])]
        .sort((a, b) => compareByPlannedStart(a, b) || (byId.get(a.beneficiaryId)?.furigana ?? "").localeCompare(byId.get(b.beneficiaryId)?.furigana ?? "", "ja"))
        .filter((r) => FILTER_MATCH[filter](displayStatusOf(r), r, today)),
    [records, byId, filter, today]
  );

  const goDate = (d: string) => {
    setFilter("all");
    router.replace(d === today ? `/t/${tenantId}/today` : `/t/${tenantId}/today?date=${d}`);
  };

  const run = async (record: UsageRecord, action: UsageAction) => {
    if (!user) return;
    setBusyId(record.id);
    setActionError("");
    try {
      await applyUsageRecordAction({ tenantId, beneficiaryId: record.beneficiaryId, date: record.date, action, user });
    } catch (e) {
      setActionError(friendlyChartError(e, "save"));
    } finally {
      setBusyId("");
    }
  };

  const nameOf = (id: string) => byId.get(id)?.name || "（利用者が見つかりません）";
  const recordedIds = new Set((records ?? []).map((r) => r.beneficiaryId));
  const candidates = (beneficiaries ?? []).filter((b) => isActiveForUsage(b) && !recordedIds.has(b.id));

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
          <h1 className="text-2xl font-bold">{isToday ? "今日の利用" : "利用状況"}</h1>
          <p className="mt-1 text-sm text-zinc-500">利用予定の子と、来所・退所・欠席の状況です。LINE での記録もすぐに反映されます。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/t/${tenantId}/schedule?view=day&date=${date}`} className={secondaryButtonClass}>
            日カレンダーで見る
          </Link>
          {isToday ? (
            <button type="button" className={primaryButtonClass} onClick={() => setPickerOpen("walkIn")}>
              ＋ 予定外の来所
            </button>
          ) : (
            <button type="button" className={primaryButtonClass} onClick={() => setPickerOpen("schedule")}>
              ＋ 予定を追加
            </button>
          )}
        </div>
      </div>

      <DateNavigator
        label={formatDateWithWeekday(date)}
        isToday={isToday}
        onPrev={() => goDate(addDays(date, -1))}
        onNext={() => goDate(addDays(date, 1))}
        onToday={() => goDate(today)}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <CountTile label="予定" value={counts.planned} active={filter === "all"} onClick={() => setFilter("all")} />
        <CountTile label="来所" value={counts.attended} tone="emerald" active={filter === "attended"} onClick={() => setFilter("attended")} />
        <CountTile label="欠席" value={counts.absent} tone="amber" active={filter === "absent"} onClick={() => setFilter("absent")} />
        <CountTile label="キャンセル" value={counts.cancelled} tone="zinc" active={filter === "cancelled"} onClick={() => setFilter("cancelled")} />
        <CountTile label="未処理" value={counts.pending} tone={counts.pending > 0 ? "red" : "zinc"} active={filter === "pending"} onClick={() => setFilter("pending")} />
        <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 shadow-sm">
          <div className="text-xs text-zinc-500">退所済み / 予定外</div>
          <div className="mt-1 text-lg font-bold text-zinc-700">
            {counts.departed}人 / {counts.walkIn}人
          </div>
        </div>
      </div>

      {(loadError || actionError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {loadError || actionError}
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">利用者</h2>
          <div className="text-sm text-zinc-500">{filter === "all" ? `${rows.length}件` : `${rows.length}件 / 全${records?.length ?? 0}件`}</div>
        </div>

        {records === null ? (
          <div className="py-8 text-center text-sm text-zinc-500">読み込み中…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            {records.length === 0 ? (
              <>
                この日の利用予定はありません。
                <br />
                <Link href={`/t/${tenantId}/schedule?month=${date.slice(0, 7)}`} className="font-semibold text-indigo-600 underline">
                  利用予定
                </Link>
                から予定を作成できます。
              </>
            ) : (
              "該当する利用者はいません。"
            )}
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2 font-semibold sm:px-2">氏名</th>
                  <th className="px-2 py-2 font-semibold">予定</th>
                  <th className="px-2 py-2 font-semibold">実績（来所〜退所）</th>
                  <th className="px-2 py-2 font-semibold">状態</th>
                  <th className="px-2 py-2 text-right font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = byId.get(r.beneficiaryId);
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-4 py-3 sm:px-2">
                        <Link href={`/t/${tenantId}/beneficiaries/${r.beneficiaryId}?tab=usage`} className="font-semibold hover:underline">
                          {nameOf(r.beneficiaryId)}
                        </Link>
                        {b?.grade && <span className="ml-2 text-xs text-zinc-500">{b.grade}</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 tabular-nums">
                        {r.origin === "walkIn" ? <span className="text-xs text-zinc-500">予定外</span> : formatTimeRange(r.planned.startTime, r.planned.endTime)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 tabular-nums">
                        {r.status === "attended" ? (
                          formatTimeRange(r.actual.startTime, r.actual.endTime) || <span className="text-xs text-zinc-400">時刻未入力</span>
                        ) : r.status === "absent" && r.absence.reason ? (
                          <span className="text-xs text-zinc-500">{r.absence.reason}</span>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <UsageStatusBadge record={r} />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-1.5">
                          {isToday && canApplyUsageAction(r, "attend") && r.status === "scheduled" && (
                            <button type="button" disabled={busy} className={primaryButtonClass} onClick={() => void run(r, { type: "attend" })}>
                              来所
                            </button>
                          )}
                          {isToday && canApplyUsageAction(r, "depart") && (
                            <button type="button" disabled={busy} className={primaryButtonClass} onClick={() => void run(r, { type: "depart" })}>
                              退所
                            </button>
                          )}
                          {r.status === "scheduled" && (
                            <button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => void run(r, { type: "absent" })}>
                              欠席
                            </button>
                          )}
                          <button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => setEditor({ kind: "existing", record: r })}>
                            詳細
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

      {pickerOpen && (
        <BeneficiarySelectDialog
          title={pickerOpen === "walkIn" ? "予定にない子が来た" : "予定を追加する利用者"}
          description={
            pickerOpen === "walkIn"
              ? "来所した利用者を選ぶと、今の時刻で来所を記録します。"
              : "利用者を選ぶと、予定の時刻を入力できます。"
          }
          beneficiaries={candidates}
          onClose={() => setPickerOpen(null)}
          onSelect={async (b) => {
            if (pickerOpen === "schedule") {
              setPickerOpen(null);
              setEditor({
                kind: "new",
                beneficiaryId: b.id,
                date,
                startTime: b.plan.defaultStartTime,
                endTime: b.plan.defaultEndTime,
              });
              return;
            }
            await applyUsageRecordAction({ tenantId, beneficiaryId: b.id, date, action: { type: "walkIn" }, user });
            setPickerOpen(null);
          }}
        />
      )}
    </div>
  );
}

export default function TodayPageRoute() {
  return (
    <Suspense fallback={<div className="text-sm">Loading...</div>}>
      <TodayPage />
    </Suspense>
  );
}
