"use client";

// 利用者カルテ「変更履歴」タブ（Phase 1-C）。
// カルテ（本人情報・保護者・契約・学校・相談支援）を、いつ・誰が・何を・どう変えたかを新しい順に表示する。
// 受給者証そのものの更新は「受給者証」タブの履歴（現在／過去）で確認する（ここには重ねて出さない）。
import { useCallback, useEffect, useState } from "react";
import { listChartHistory } from "@/lib/beneficiaryChart/chartStore";
import {
  actorDisplayName,
  CHART_HISTORY_SOURCE_LABELS,
  formatChartHistoryTime,
  formatChartHistoryValue,
  SECTION_LABELS,
  type ChartHistoryEntry,
} from "@/lib/beneficiaryChart/chartHistory";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import { secondaryButtonClass } from "../../components/chartUi";

const PAGE_SIZE = 30;

type Props = {
  tenantId: string;
  beneficiaryId: string;
  onShowCertificates: () => void;
};

// カルテの編集・反映は別のタブで行うため、このタブを開くたびに最新を読み込む（タブ切り替えで作り直される）
export default function ChartHistoryTab({ tenantId, beneficiaryId, onShowCertificates }: Props) {
  const [entries, setEntries] = useState<ChartHistoryEntry[] | null>(null);
  const [max, setMax] = useState(PAGE_SIZE);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(
    async (count: number) => {
      try {
        setEntries(await listChartHistory(tenantId, beneficiaryId, count));
        setLoadError("");
      } catch (e) {
        setLoadError(friendlyChartError(e, "load"));
        setEntries((prev) => prev ?? []);
      }
    },
    [tenantId, beneficiaryId]
  );

  useEffect(() => {
    void Promise.resolve().then(() => load(max));
  }, [load, max]);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5" data-testid="chart-history">
      <h2 className="text-base font-bold">変更履歴</h2>
      <p className="mt-1 text-xs text-zinc-500">
        カルテ（本人情報・保護者・契約・学校・相談支援）の変更を新しい順に表示します。
        受給者証そのものの更新は
        <button type="button" className="mx-1 font-semibold text-indigo-700 underline" onClick={onShowCertificates}>
          受給者証タブ
        </button>
        の履歴で確認できます。
      </p>

      {loadError && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {loadError}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => void load(max)}>
            再読み込み
          </button>
        </div>
      )}

      {!entries ? (
        <p className="mt-3 text-sm text-zinc-500">読み込み中...</p>
      ) : entries.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-zinc-500">
          まだ変更履歴はありません。カルテを編集して保存すると、ここに記録されます。
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-zinc-200 px-3 py-3" data-testid="chart-history-entry" data-source={entry.source}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold tabular-nums">{formatChartHistoryTime(entry.createdAt)}</span>
                <span className="text-zinc-700">{actorDisplayName(entry.actor)}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    entry.source === "certificateReview"
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600"
                  }`}
                >
                  {CHART_HISTORY_SOURCE_LABELS[entry.source]}
                </span>
                {entry.sections.length > 0 && (
                  <span className="text-xs text-zinc-500">{entry.sections.map((s) => SECTION_LABELS[s] ?? s).join("・")}</span>
                )}
              </div>
              <ul className="mt-2 space-y-2">
                {entry.changes.map((change) => (
                  <li key={change.path} className="text-sm" data-testid="chart-history-change" data-path={change.path}>
                    <div className="text-xs font-semibold text-zinc-600">{change.label}</div>
                    <div className="mt-0.5 break-words">
                      <span className={change.before === "" ? "text-zinc-400" : "text-zinc-600"}>
                        {formatChartHistoryValue(change.path, change.before)}
                      </span>
                      <span className="mx-2 text-zinc-400" aria-label="から">
                        →
                      </span>
                      <span className={change.after === "" ? "text-zinc-400" : "font-semibold"}>
                        {formatChartHistoryValue(change.path, change.after)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {entries && entries.length >= max && (
        <div className="mt-3 flex justify-center">
          <button type="button" className={secondaryButtonClass} onClick={() => setMax((m) => m + PAGE_SIZE)}>
            さらに表示
          </button>
        </div>
      )}
    </section>
  );
}
