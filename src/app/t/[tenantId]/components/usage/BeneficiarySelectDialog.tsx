"use client";

// 利用者を1人選ぶダイアログ（予定外の来所・予定の追加）。氏名・フリガナで絞り込める。
import { useMemo, useState } from "react";
import { inputClass } from "../../beneficiaries/components/chartUi";
import { normalizeForChartSearch } from "@/lib/beneficiaryChart/model";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import type { UsageBeneficiary } from "@/lib/usage/usageStore";
import { Modal } from "./usageUi";

export default function BeneficiarySelectDialog({
  title,
  description,
  beneficiaries,
  onClose,
  onSelect,
}: {
  title: string;
  description: string;
  beneficiaries: readonly UsageBeneficiary[];
  onClose: () => void;
  onSelect: (b: UsageBeneficiary) => Promise<void> | void;
}) {
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeForChartSearch(keyword);
    if (!q) return beneficiaries;
    return beneficiaries.filter((b) => [b.name, b.furigana].some((v) => normalizeForChartSearch(v).includes(q)));
  }, [beneficiaries, keyword]);

  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-3 text-sm text-zinc-600">{description}</p>
      <input
        className={inputClass}
        placeholder="氏名・フリガナで検索"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        autoFocus
      />
      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <ul className="mt-3 max-h-[50dvh] divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200">
        {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-500">該当する利用者はいません</li>}
        {filtered.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              disabled={!!busy}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 disabled:opacity-50"
              onClick={async () => {
                setBusy(b.id);
                setError("");
                try {
                  await onSelect(b);
                } catch (e) {
                  setError(friendlyChartError(e, "save"));
                } finally {
                  setBusy("");
                }
              }}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{b.name || "（氏名未登録）"}</span>
                {b.furigana && <span className="block truncate text-xs text-zinc-500">{b.furigana}</span>}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">{busy === b.id ? "記録中…" : b.grade}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
