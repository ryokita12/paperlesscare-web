"use client";

// 利用者カルテのタブ。主要タブ＋開発中の機能（押せない表示）
// Phase 1-C：「変更履歴」を追加
import { PlannedBadge } from "../../components/chartUi";

export const CHART_TABS = [
  { id: "basic", label: "基本情報" },
  { id: "certificates", label: "受給者証" },
  { id: "contract", label: "契約・関係先" },
  { id: "documents", label: "書類" },
  { id: "history", label: "変更履歴" },
] as const;

export type ChartTabId = (typeof CHART_TABS)[number]["id"];

const PLANNED_TABS = ["利用予定", "支援記録", "支援計画", "モニタリング", "実績"];

export function isChartTabId(value: string | null): value is ChartTabId {
  return CHART_TABS.some((t) => t.id === value);
}

export default function ChartTabs({
  active,
  onChange,
}: {
  active: ChartTabId;
  onChange: (tab: ChartTabId) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div role="tablist" aria-label="利用者カルテ" className="flex min-w-max items-end gap-1 border-b border-zinc-200">
        {CHART_TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={`-mb-px whitespace-nowrap rounded-t-xl border px-4 py-2 text-sm font-semibold transition ${
                selected
                  ? "border-zinc-200 border-b-white bg-white text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
        <span className="mx-2 mb-2 h-5 w-px bg-zinc-200" aria-hidden="true" />
        {PLANNED_TABS.map((label) => (
          <span
            key={label}
            role="tab"
            aria-disabled="true"
            aria-selected={false}
            title="この機能は現在開発中です"
            className="mb-1 inline-flex cursor-not-allowed select-none items-center whitespace-nowrap px-2 py-1 text-sm text-zinc-400"
          >
            {label}
            <PlannedBadge />
          </span>
        ))}
      </div>
    </div>
  );
}
