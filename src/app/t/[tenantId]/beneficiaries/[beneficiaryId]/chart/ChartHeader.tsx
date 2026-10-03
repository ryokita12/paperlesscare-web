"use client";

// 利用者カルテの上部（常に表示）：氏名・フリガナ・年齢・学年・受給者証の状態・有効期間
import type { CertificateStatus } from "@/lib/beneficiaryChart/certificateStatus";
import { formatJapaneseDate } from "@/lib/beneficiaryChart/dates";
import type { ChartIdentity } from "@/lib/beneficiaryChart/model";
import type { CurrentCertificateValidity } from "@/lib/beneficiaryChart/chartStore";
import { CertificateStatusBadge, primaryButtonClass, secondaryButtonClass } from "../../components/chartUi";

type Props = {
  identity: ChartIdentity;
  usageLabel: string;
  certificateStatus: CertificateStatus;
  currentCertificate: CurrentCertificateValidity | null;
  onBack: () => void;
  onRegisterCertificate: () => void;
};

function validityText(cert: CurrentCertificateValidity | null): string {
  if (!cert || (!cert.validFrom && !cert.validTo)) return "";
  return `${formatJapaneseDate(cert.validFrom) || "?"} 〜 ${formatJapaneseDate(cert.validTo) || "?"}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`text-sm font-semibold ${value ? "" : "text-zinc-400"}`}>{value || "—"}</div>
    </div>
  );
}

export default function ChartHeader({
  identity,
  usageLabel,
  certificateStatus,
  currentCertificate,
  onBack,
  onRegisterCertificate,
}: Props) {
  const hasCertificate = certificateStatus.kind !== "none";
  const validity = validityText(currentCertificate);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-zinc-500">利用者カルテ</div>
          {identity.furigana && <div className="mt-1 text-sm text-zinc-500 break-words">{identity.furigana}</div>}
          <h1 className="text-2xl font-bold break-words">
            {identity.name || "氏名未登録"}
            {usageLabel && (
              <span className="ml-2 align-middle rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                {usageLabel}
              </span>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onBack} className={secondaryButtonClass}>
            利用者一覧に戻る
          </button>
          <button type="button" onClick={onRegisterCertificate} className={primaryButtonClass}>
            {hasCertificate ? "受給者証を更新" : "受給者証を登録"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-4">
        <Fact label="年齢" value={identity.age === null ? "" : `${identity.age}歳`} />
        <Fact label="学年" value={identity.grade} />
        <div className="min-w-0">
          <div className="text-[11px] text-zinc-500">受給者証</div>
          <div className="mt-0.5">
            <CertificateStatusBadge kind={certificateStatus.kind} label={certificateStatus.label} />
            {certificateStatus.kind === "expiringSoon" && certificateStatus.daysLeft !== null && (
              <span className="ml-1 text-xs text-amber-800">あと{certificateStatus.daysLeft}日</span>
            )}
          </div>
        </div>
        <Fact label="現在の受給者証の有効期間" value={validity} />
      </div>
    </section>
  );
}
