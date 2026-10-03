"use client";

// 実績（Phase 2）。月単位で、利用者ごとに予定に対して実際どうだったか（来所・欠席・キャンセル・未処理、予定時間・実績時間）を見る。
// 月次締め・請求の確定は行わない（将来の Phase）。記録の修正は「今日の利用」・「利用予定」・利用者カルテから行う。
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import { toJapanIsoDate } from "@/lib/beneficiaryChart/dates";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import { addMonths, formatYearMonth, isYearMonth, type UsageRecord } from "@/lib/usage/model";
import { compareWithSupply, countUsage, countUsageByBeneficiary, EMPTY_COUNTS } from "@/lib/usage/summary";
import { formatDuration } from "@/lib/usage/time";
import { isActiveForUsage, listUsageBeneficiaries, listUsageRecordsByMonth, type UsageBeneficiary } from "@/lib/usage/usageStore";
import { secondaryButtonClass } from "../beneficiaries/components/chartUi";
import { DateNavigator } from "../components/usage/usageUi";

function UsagePage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useRequireAuth();

  const today = toJapanIsoDate(new Date());
  const monthParam = searchParams?.get("month") ?? "";
  const yearMonth = isYearMonth(monthParam) ? monthParam : today.slice(0, 7);

  const [beneficiaries, setBeneficiaries] = useState<UsageBeneficiary[] | null>(null);
  const [records, setRecords] = useState<UsageRecord[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [bs, rs] = await Promise.all([
        listUsageBeneficiaries(tenantId, { withCertificate: true }),
        listUsageRecordsByMonth(tenantId, yearMonth),
      ]);
      setBeneficiaries(bs);
      setRecords(rs);
      setError("");
    } catch (e) {
      setError(friendlyChartError(e, "load"));
      setBeneficiaries((b) => b ?? []);
      setRecords([]);
    }
  }, [tenantId, yearMonth]);

  useEffect(() => {
    if (!user || !tenantId) return;
    void Promise.resolve().then(() => {
      setRecords(null);
      return load();
    });
  }, [user, tenantId, load]);

  const counts = useMemo(() => countUsageByBeneficiary(records ?? [], today), [records, today]);
  const total = useMemo(() => countUsage(records ?? [], today), [records, today]);
  // 記録がある利用者と、記録が無くても基本の曜日が設定されている利用中の利用者を表示する
  const rows = (beneficiaries ?? []).filter((b) => counts.has(b.id) || (isActiveForUsage(b) && b.plan.weekdays.length > 0));

  const goMonth = (m: string) => router.replace(`/t/${tenantId}/usage?month=${m}`);

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
          <h1 className="text-2xl font-bold">実績</h1>
          <p className="mt-1 text-sm text-zinc-500">予定に対して実際に来所したか・欠席したかを、利用者ごとに月単位で確認できます。</p>
        </div>
        <Link href={`/t/${tenantId}/schedule?view=month&month=${yearMonth}`} className={secondaryButtonClass}>
          月間予定を開く
        </Link>
      </div>

      <DateNavigator
        label={formatYearMonth(yearMonth)}
        isToday={yearMonth === today.slice(0, 7)}
        prevLabel="前月"
        nextLabel="次月"
        todayLabel="今月"
        onPrev={() => goMonth(addMonths(yearMonth, -1))}
        onNext={() => goMonth(addMonths(yearMonth, 1))}
        onToday={() => goMonth(today.slice(0, 7))}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "予定", value: `${total.planned}件` },
          { label: "来所", value: `${total.attended}件`, tone: "text-emerald-700" },
          { label: "欠席", value: `${total.absent}件`, tone: "text-amber-700" },
          { label: "キャンセル", value: `${total.cancelled}件`, tone: "text-zinc-500" },
          { label: "未処理", value: `${total.pending}件`, tone: total.pending > 0 ? "text-red-600" : "text-zinc-500" },
          { label: "実績時間", value: formatDuration(total.actualMinutes) },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">{t.label}</div>
            <div className={`mt-1 text-xl font-bold ${t.tone ?? "text-zinc-900"}`}>{t.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-base font-bold">利用者ごとの実績</h2>
        {!beneficiaries || !records ? (
          <div className="py-8 text-center text-sm text-zinc-500">読み込み中…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">この月の予定・実績はありません。</div>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2 font-semibold sm:px-2">利用者</th>
                  <th className="px-2 py-2 text-right font-semibold">予定日数</th>
                  <th className="px-2 py-2 text-right font-semibold">来所</th>
                  <th className="px-2 py-2 text-right font-semibold">欠席</th>
                  <th className="px-2 py-2 text-right font-semibold">キャンセル</th>
                  <th className="px-2 py-2 text-right font-semibold">未処理</th>
                  <th className="px-2 py-2 text-right font-semibold">予定時間</th>
                  <th className="px-2 py-2 text-right font-semibold">実績時間</th>
                  <th className="px-2 py-2 text-right font-semibold">利用日数 / 支給量</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const c = counts.get(b.id) ?? EMPTY_COUNTS;
                  const supply = compareWithSupply(c.usageDays, b.daysPerMonth);
                  return (
                    <tr key={b.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-4 py-2.5 sm:px-2">
                        <Link href={`/t/${tenantId}/beneficiaries/${b.id}?tab=usage`} className="font-semibold hover:underline">
                          {b.name || "（氏名未登録）"}
                        </Link>
                        {b.grade && <span className="ml-2 text-xs text-zinc-500">{b.grade}</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{c.planned}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-emerald-700">
                        {c.attended}
                        {c.walkIn > 0 && <span className="ml-1 text-[11px] text-zinc-500">（予定外{c.walkIn}）</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-amber-700">{c.absent}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-zinc-500">{c.cancelled}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${c.pending > 0 ? "font-bold text-red-600" : "text-zinc-400"}`}>{c.pending}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{formatDuration(c.plannedMinutes)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{formatDuration(c.actualMinutes)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">
                        {supply ? (
                          <span className={supply.over ? "font-bold text-amber-700" : ""}>
                            {supply.text}
                            {supply.over && " ⚠"}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">支給量不明</span>
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
          未処理＝今日までの日で、来所・欠席・キャンセルのどれも記録されていない予定です。実績時間は来所〜退所の時刻がそろっている日の合計です。
          月次の締め・請求の確定は今後の機能で対応します。
        </p>
      </section>
    </div>
  );
}

export default function UsagePageRoute() {
  return (
    <Suspense fallback={<div className="text-sm">Loading...</div>}>
      <UsagePage />
    </Suspense>
  );
}
