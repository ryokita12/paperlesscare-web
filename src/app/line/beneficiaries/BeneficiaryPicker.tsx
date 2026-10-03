"use client";

// 利用者の検索＋一覧（「利用者を確認する」と「登録済みの利用者を選ぶ」で共通）。
// Phase 2：「今日の利用」の「予定にない子が来た」でも使う（onSelect：画面遷移せずに選んだ利用者を返す）。
// 一覧はログイン中スタッフの事業所（tenantId）の利用者だけを読み込む（Firestore Rulesでも他事業所は読めない）。
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  listBeneficiaries,
  type BeneficiaryRecord,
} from "@/app/t/[tenantId]/lib/firestore/beneficiaries";
import { useLineStaff } from "../LineSessionProvider";
import {
  beneficiaryDisplayName,
  beneficiaryFurigana,
  filterBeneficiaries,
} from "../lib/beneficiarySearch";
import {
  friendlyErrorMessage,
  IconChevronRight,
  IconSearch,
  LineCenteredMessage,
  LineSpinner,
} from "../ui";

export function hasCertificate(b: BeneficiaryRecord): boolean {
  return !!b.currentCertificateId || b.hasLegacyCertificate;
}

function useBeneficiaryList(tenantId: string) {
  const [items, setItems] = useState<BeneficiaryRecord[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listBeneficiaries(tenantId)
      .then((list) => {
        if (!cancelled) setItems(list.filter((b) => b.status !== "inactive"));
      })
      .catch((e: unknown) => {
        console.error("[line] listBeneficiaries failed", e);
        if (!cancelled) setError(friendlyErrorMessage(e, "通信状況を確認して、もう一度お試しください。"));
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, attempt]);

  const retry = useCallback(() => {
    setError("");
    setItems(null);
    setAttempt((n) => n + 1);
  }, []);

  return { items, error, retry };
}

export default function BeneficiaryPicker({
  hrefFor,
  onSelect,
  excludeIds,
  disabled = false,
}: {
  /** 利用者をタップしたときの遷移先 */
  hrefFor?: (b: BeneficiaryRecord) => string;
  /** 遷移せずに選んだ利用者を受け取る（hrefFor より優先） */
  onSelect?: (b: BeneficiaryRecord) => void;
  /** 一覧に出さない利用者（例：今日すでに予定・記録がある子） */
  excludeIds?: ReadonlySet<string>;
  disabled?: boolean;
}) {
  const { tenantId } = useLineStaff();
  const { items: allItems, error, retry } = useBeneficiaryList(tenantId);
  const [keyword, setKeyword] = useState("");

  const items = useMemo(
    () => (allItems && excludeIds ? allItems.filter((b) => !excludeIds.has(b.id)) : allItems),
    [allItems, excludeIds]
  );
  const filtered = useMemo(() => filterBeneficiaries(items ?? [], keyword), [items, keyword]);

  if (error) {
    return (
      <LineCenteredMessage
        tone="error"
        title="利用者を読み込めませんでした"
        body={error}
        action={{ label: "もう一度読み込む", onClick: retry }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 検索欄はスクロールしても上部に残す */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-[5] -mx-5 bg-[#f6faf8] px-5 pb-2 pt-1">
        <label className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-zinc-200 focus-within:ring-2 focus-within:ring-emerald-400">
          <IconSearch className="h-6 w-6 shrink-0 text-zinc-400" />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent py-3 text-[1.05rem] outline-none placeholder:text-zinc-400"
            placeholder="利用者名で検索"
            aria-label="利用者名で検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword("")}
              className="-mr-1 min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-zinc-500 active:bg-zinc-100"
            >
              クリア
            </button>
          )}
        </label>
        {items && items.length > 0 && (
          <div className="mt-2 px-1 text-sm text-zinc-500">
            {keyword ? `${filtered.length}人 見つかりました` : `${items.length}人の利用者`}
          </div>
        )}
      </div>

      {!items ? (
        <LineSpinner fullHeight={false} label="利用者を読み込んでいます" />
      ) : filtered.length === 0 ? (
        <div className="px-4 py-14 text-center text-base leading-relaxed text-zinc-500">
          {items.length === 0 ? (
            "まだ利用者が登録されていません"
          ) : (
            <>
              「{keyword}」に当てはまる利用者がいません
              <br />
              <span className="text-sm">ひらがな・漢字の一部でも検索できます</span>
            </>
          )}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200/60">
          {filtered.map((b) => {
            const furigana = beneficiaryFurigana(b);
            return (
              <li key={b.id} className="border-b border-zinc-100 last:border-b-0">
                <PickerRow b={b} hrefFor={hrefFor} onSelect={onSelect} disabled={disabled}>
                  <div className="min-w-0 flex-1">
                    {furigana && <div className="truncate text-sm text-zinc-500">{furigana}</div>}
                    <div className="truncate text-lg font-bold">
                      {beneficiaryDisplayName(b) ? (
                        <>
                          {beneficiaryDisplayName(b)}
                          <span className="ml-1 text-base font-normal text-zinc-500">さん</span>
                        </>
                      ) : (
                        "氏名未登録"
                      )}
                    </div>
                    {!hasCertificate(b) && (
                      <div className="mt-0.5 text-sm font-semibold text-amber-600">受給者証 未登録</div>
                    )}
                  </div>
                  <IconChevronRight className="h-6 w-6 shrink-0 text-zinc-300" />
                </PickerRow>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PickerRow({
  b,
  hrefFor,
  onSelect,
  disabled,
  children,
}: {
  b: BeneficiaryRecord;
  hrefFor?: (b: BeneficiaryRecord) => string;
  onSelect?: (b: BeneficiaryRecord) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const cls = "flex min-h-[4.5rem] w-full items-center gap-3 px-5 py-3.5 text-left active:bg-emerald-50";
  if (onSelect || !hrefFor) {
    return (
      <button type="button" className={`${cls} disabled:opacity-50`} disabled={disabled} onClick={() => onSelect?.(b)}>
        {children}
      </button>
    );
  }
  return (
    <Link href={hrefFor(b)} className={cls}>
      {children}
    </Link>
  );
}
