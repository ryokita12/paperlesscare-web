"use client";

// 利用者カルテ上部の「要対応」（Phase 1-C）。
// 受給者証の期限・必要書類の未提出・受給者証からのカルテ反映候補を、1つの一覧にまとめて表示する。
// 色に加えて、アイコンと「至急／要対応／要確認」の文字でも重要度が分かるようにする。
import { ACTION_SEVERITY_META, type ActionItem, type ActionItemSeverity, type ActionItemTarget } from "@/lib/beneficiaryChart/actionItems";
import { secondaryButtonClass } from "../../components/chartUi";

const SEVERITY_STYLES: Record<ActionItemSeverity, { row: string; badge: string }> = {
  urgent: { row: "border-red-200 bg-red-50/60", badge: "border-red-200 bg-white text-red-700" },
  warning: { row: "border-amber-200 bg-amber-50/60", badge: "border-amber-200 bg-white text-amber-800" },
  review: { row: "border-indigo-200 bg-indigo-50/60", badge: "border-indigo-200 bg-white text-indigo-700" },
};

type Props = {
  items: readonly ActionItem[];
  // 書類の提出状況を読み込めなかった場合 true（書類の要対応は数えていないことを知らせる）
  documentsUnavailable: boolean;
  onNavigate: (target: ActionItemTarget) => void;
};

export default function ActionItemsPanel({ items, documentsUnavailable, onNavigate }: Props) {
  const note = documentsUnavailable && (
    <p className="mt-2 text-xs text-zinc-500">
      ※ 書類の提出状況を読み込めなかったため、書類の要対応は表示していません。画面を再読み込みしてください。
    </p>
  );

  if (items.length === 0) {
    return (
      <section
        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        aria-label="要対応"
        data-testid="action-items-none"
      >
        <span aria-hidden="true">✓ </span>現在、要対応はありません
        {note}
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="action-items-title"
      data-testid="action-items"
    >
      <h2 id="action-items-title" className="text-base font-bold">
        要対応 <span data-testid="action-items-count">{items.length}</span>件
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const meta = ACTION_SEVERITY_META[item.severity];
          const style = SEVERITY_STYLES[item.severity];
          return (
            <li
              key={item.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${style.row}`}
              data-testid={`action-item-${item.id}`}
              data-type={item.type}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span aria-hidden="true" className="leading-6">
                  {meta.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${style.badge}`}>
                      {meta.label}
                    </span>
                    <span className="text-sm font-semibold break-words">{item.message}</span>
                  </div>
                  {item.detail && <div className="mt-0.5 text-xs text-zinc-600 break-words">{item.detail}</div>}
                </div>
              </div>
              <button type="button" className={secondaryButtonClass} onClick={() => onNavigate(item.target)}>
                {item.actionLabel}
              </button>
            </li>
          );
        })}
      </ul>
      {note}
    </section>
  );
}
