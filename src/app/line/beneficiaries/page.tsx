"use client";

// LINEスタッフ用の利用者一覧（カード形式）
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  listBeneficiaries,
  type BeneficiaryRecord,
} from "@/app/t/[tenantId]/lib/firestore/beneficiaries";
import { useLineStaff } from "../LineSessionProvider";
import { LineBackLink, LineCenteredMessage, LineSpinner } from "../ui";

function displayName(b: BeneficiaryRecord): string {
  return b.profile.name || b.summary.name || "氏名未登録";
}

function kana(b: BeneficiaryRecord): string {
  return b.profile.furigana || b.summary.furigana || "";
}

export default function LineBeneficiariesPage() {
  const { tenantId } = useLineStaff();
  const [items, setItems] = useState<BeneficiaryRecord[] | null>(null);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    let cancelled = false;
    listBeneficiaries(tenantId)
      .then((list) => {
        if (!cancelled) setItems(list.filter((b) => b.status !== "inactive"));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const filtered = useMemo(() => {
    const q = keyword.replace(/\s/g, "");
    if (!items || !q) return items ?? [];
    return items.filter((b) =>
      [displayName(b), kana(b), b.summary.number].some((v) => v.replace(/\s/g, "").includes(q))
    );
  }, [items, keyword]);

  if (error) {
    return <LineCenteredMessage title="利用者を読み込めませんでした" body={error} />;
  }

  return (
    <div className="space-y-4">
      <LineBackLink href="/line/home" label="TOPに戻る" />
      <h1 className="text-xl font-bold">利用者</h1>

      <input
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-base outline-none focus:border-emerald-400"
        placeholder="氏名・ふりがな・受給者番号で検索"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        inputMode="search"
      />

      {!items ? (
        <LineSpinner />
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-zinc-100 bg-white px-5 py-10 text-center text-sm text-zinc-500">
          {items.length === 0 ? "利用者はまだ登録されていません" : "該当する利用者がいません"}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((b) => (
            <li key={b.id}>
              <Link
                href={`/line/beneficiaries/${b.id}`}
                className="flex items-center gap-3 rounded-3xl border border-zinc-100 bg-white px-5 py-4 shadow-sm active:bg-emerald-50"
              >
                <div className="min-w-0 flex-1">
                  {kana(b) && <div className="truncate text-xs text-zinc-500">{kana(b)}</div>}
                  <div className="truncate text-base font-bold">{displayName(b)}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {b.currentCertificateId || b.hasLegacyCertificate
                      ? `受給者番号 ${b.summary.number || "未登録"}`
                      : "受給者証 未登録"}
                  </div>
                </div>
                <span aria-hidden className="text-2xl text-zinc-300">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
