"use client";

// 利用者一覧（利用者管理）。
// 「誰なのか」（氏名・フリガナ・年齢・学年）と「受給者証は大丈夫か」（状態・有効期限）を一覧で確認し、
// 利用者カルテへ移動する。検索は事業所の利用者を全件読み込んだうえで画面内で絞り込む
// （1事業所あたり数十〜百件程度の想定。検索用のインデックスや外部サービスは使わない）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import { createBeneficiaryWithoutCertificate } from "../lib/firestore/beneficiaries";
import {
  listBeneficiaryChartRows,
  type BeneficiaryChartRow,
} from "@/lib/beneficiaryChart/chartStore";
import {
  CERTIFICATE_STATUS_LABELS,
  getCertificateStatus,
  type CertificateStatus,
  type CertificateStatusKind,
} from "@/lib/beneficiaryChart/certificateStatus";
import { formatJapaneseDate, toLocalIsoDate } from "@/lib/beneficiaryChart/dates";
import {
  matchesChartSearch,
  resolveChartIdentity,
  USAGE_STATUS_OPTIONS,
  type ChartIdentity,
} from "@/lib/beneficiaryChart/model";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import {
  CertificateStatusBadge,
  FormField,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./components/chartUi";

type ListRow = BeneficiaryChartRow & {
  identity: ChartIdentity;
  certStatus: CertificateStatus;
};

const STATUS_FILTERS: { id: "" | CertificateStatusKind; label: string }[] = [
  { id: "", label: "すべて" },
  { id: "valid", label: CERTIFICATE_STATUS_LABELS.valid },
  { id: "expiringSoon", label: CERTIFICATE_STATUS_LABELS.expiringSoon },
  { id: "expired", label: CERTIFICATE_STATUS_LABELS.expired },
  { id: "unknownExpiry", label: CERTIFICATE_STATUS_LABELS.unknownExpiry },
  { id: "none", label: CERTIFICATE_STATUS_LABELS.none },
];

function usageStatusLabel(row: ListRow): string {
  const usage = row.sections.personal.usageStatus;
  if (usage === "suspended" || usage === "ended") {
    return USAGE_STATUS_OPTIONS.find((o) => o.id === usage)?.label ?? "";
  }
  return "";
}

function ageText(identity: ChartIdentity): string {
  return identity.age === null ? "" : `${identity.age}歳`;
}

function validToText(row: ListRow): string {
  return row.currentCertificate?.validTo ? formatJapaneseDate(row.currentCertificate.validTo) : "";
}

function Muted({ text, empty = "—" }: { text: string; empty?: string }) {
  return text ? <>{text}</> : <span className="text-zinc-400">{empty}</span>;
}

export default function BeneficiariesPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params?.tenantId ?? "";
  const router = useRouter();
  const { user, loading } = useRequireAuth();

  const [rows, setRows] = useState<BeneficiaryChartRow[] | null>(null);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | CertificateStatusKind>("");
  const [today] = useState(() => new Date());

  // 受給者証なしで利用者（枠）だけを作成するフォーム（既存の createBeneficiaryWithoutCertificate を使う）
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFurigana, setNewFurigana] = useState("");
  const [newBirthDate, setNewBirthDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await listBeneficiaryChartRows(tenantId);
      setRows(list);
      setError("");
    } catch (e) {
      setError(friendlyChartError(e, "load"));
      setRows([]);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!user || !tenantId) return;
    void Promise.resolve().then(load);
  }, [user, tenantId, load]);

  const listRows: ListRow[] = useMemo(() => {
    const todayIso = toLocalIsoDate(today);
    return (rows ?? []).map((row) => ({
      ...row,
      identity: resolveChartIdentity(row.record, row.sections, today),
      certStatus: getCertificateStatus({
        hasCertificate: !!row.currentCertificate,
        validTo: row.currentCertificate?.validTo,
        today: todayIso,
      }),
    }));
  }, [rows, today]);

  const filtered = useMemo(
    () =>
      listRows.filter(
        (row) =>
          matchesChartSearch(row, keyword) && (!statusFilter || row.certStatus.kind === statusFilter)
      ),
    [listRows, keyword, statusFilter]
  );

  const counts = useMemo(() => {
    const c: Partial<Record<CertificateStatusKind, number>> = {};
    for (const row of listRows) c[row.certStatus.kind] = (c[row.certStatus.kind] ?? 0) + 1;
    return c;
  }, [listRows]);

  const openChart = (id: string) => router.push(`/t/${tenantId}/beneficiaries/${id}`);

  const handleCreate = async () => {
    if (!user || creating) return;
    if (!newName.trim()) {
      setCreateError("氏名を入力してください。");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const id = await createBeneficiaryWithoutCertificate({
        tenantId,
        profile: {
          name: newName.trim(),
          furigana: newFurigana.trim(),
          birthday: formatJapaneseDate(newBirthDate),
        },
        user,
      });
      router.push(`/t/${tenantId}/beneficiaries/${id}`);
    } catch (e: unknown) {
      setCreateError(friendlyChartError(e, "save"));
      setCreating(false);
    }
  };

  if (loading || (user && rows === null)) {
    return <div className="text-sm">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="text-sm">ログインしてください</div>
        <button
          className="mt-4 w-full rounded-xl border px-3 py-2 text-sm"
          onClick={() =>
            router.push(`/login?next=${encodeURIComponent(`/t/${tenantId}/beneficiaries`)}`)
          }
        >
          Login
        </button>
      </div>
    );
  }

  const alertCount = (counts.expired ?? 0) + (counts.expiringSoon ?? 0);

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">利用者管理</h1>
          <p className="mt-1 text-sm text-zinc-500">
            利用者を選ぶと、基本情報・受給者証・契約・書類をまとめた「利用者カルテ」が開きます。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setShowCreateForm((v) => !v);
              setCreateError("");
            }}
          >
            ＋ 新しい利用者を登録
          </button>
          <button type="button" className={primaryButtonClass} onClick={() => router.push(`/t/${tenantId}`)}>
            受給者証を取り込む
          </button>
        </div>
      </div>

      {showCreateForm && (
        <section className="rounded-2xl border border-indigo-300 bg-white p-4 shadow-sm ring-2 ring-indigo-100 sm:p-5">
          <h2 className="text-base font-bold">新しい利用者を登録（受給者証なし）</h2>
          <p className="mt-1 text-xs text-zinc-500">
            氏名などの基本情報だけで利用者を作成します。受給者証は作成後のカルテから登録できます。
            受給者証の写真から登録する場合は「受給者証を取り込む」を使ってください。
          </p>
          <form
            className="mt-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="氏名" required htmlFor="new-name" error={createError && !newName.trim() ? createError : undefined}>
                <input id="new-name" className={inputClass} placeholder="山田 太郎" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </FormField>
              <FormField label="フリガナ" htmlFor="new-furigana">
                <input id="new-furigana" className={inputClass} placeholder="ヤマダ タロウ" value={newFurigana} onChange={(e) => setNewFurigana(e.target.value)} />
              </FormField>
              <FormField label="生年月日" htmlFor="new-birth">
                <input id="new-birth" type="date" className={inputClass} value={newBirthDate} onChange={(e) => setNewBirthDate(e.target.value)} />
              </FormField>
            </div>
            {createError && newName.trim() && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {createError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={secondaryButtonClass} onClick={() => setShowCreateForm(false)} disabled={creating}>
                キャンセル
              </button>
              <button type="submit" className={primaryButtonClass} disabled={creating}>
                {creating ? "作成中..." : "作成する"}
              </button>
            </div>
          </form>
        </section>
      )}

      {alertCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          受給者証の確認が必要な利用者がいます（期限切れ {counts.expired ?? 0}名・期限間近 {counts.expiringSoon ?? 0}名）。
          <button
            type="button"
            className="ml-2 font-semibold underline"
            onClick={() => setStatusFilter(counts.expired ? "expired" : "expiringSoon")}
          >
            表示する
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <FormField label="検索（氏名・フリガナ・受給者証番号）" htmlFor="chart-search">
            <input
              id="chart-search"
              type="search"
              className={inputClass}
              placeholder="例：やまだ／山田／1234567890"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </FormField>
          <FormField label="受給者証の状態" htmlFor="chart-status">
            <select
              id="chart-status"
              className={inputClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | CertificateStatusKind)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                  {f.id ? `（${counts[f.id] ?? 0}）` : ""}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">利用者一覧</h2>
          <div className="text-sm text-zinc-500">
            {keyword || statusFilter ? `${filtered.length}件 / 全${listRows.length}件` : `${listRows.length}件`}
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
            <button type="button" className="ml-2 font-semibold underline" onClick={() => void load()}>
              再読み込み
            </button>
          </div>
        )}

        {!error && listRows.length === 0 && (
          <p className="py-10 text-center text-sm text-zinc-500">
            まだ利用者が登録されていません。「受給者証を取り込む」または「新しい利用者を登録」から登録してください。
          </p>
        )}

        {listRows.length > 0 && filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-zinc-500">
            条件に当てはまる利用者がいません。ひらがな・漢字の一部や、受給者証番号の一部でも検索できます。
          </p>
        )}

        {filtered.length > 0 && (
          <>
            {/* PC：表 */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                    <th className="px-3 py-2 font-semibold">氏名</th>
                    <th className="px-3 py-2 font-semibold">フリガナ</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">年齢</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">学年</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">受給者証</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">有効期限</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.record.id}
                      className="cursor-pointer border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50"
                      onClick={() => openChart(row.record.id)}
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="text-left font-semibold text-indigo-700 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openChart(row.record.id);
                          }}
                        >
                          {row.identity.name || "氏名未登録"}
                        </button>
                        {usageStatusLabel(row) && (
                          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
                            {usageStatusLabel(row)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-zinc-600">
                        <Muted text={row.identity.furigana} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Muted text={ageText(row.identity)} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Muted text={row.identity.grade} />
                      </td>
                      <td className="px-3 py-3">
                        <CertificateStatusBadge kind={row.certStatus.kind} label={row.certStatus.label} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Muted text={validToText(row)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* スマホ・狭い画面：カード */}
            <ul className="divide-y divide-zinc-100 md:hidden">
              {filtered.map((row) => (
                <li key={row.record.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 py-3 text-left"
                    onClick={() => openChart(row.record.id)}
                  >
                    <div className="min-w-0">
                      {row.identity.furigana && (
                        <div className="truncate text-xs text-zinc-500">{row.identity.furigana}</div>
                      )}
                      <div className="truncate font-semibold">
                        {row.identity.name || "氏名未登録"}
                        {usageStatusLabel(row) && (
                          <span className="ml-2 text-xs font-normal text-zinc-500">（{usageStatusLabel(row)}）</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {[ageText(row.identity), row.identity.grade, validToText(row) && `期限 ${validToText(row)}`]
                          .filter(Boolean)
                          .join("・") || "年齢・期限 未登録"}
                      </div>
                    </div>
                    <CertificateStatusBadge kind={row.certStatus.kind} label={row.certStatus.label} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
