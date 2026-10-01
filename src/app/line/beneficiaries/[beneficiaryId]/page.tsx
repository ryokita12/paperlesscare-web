"use client";

// LINEスタッフ用の利用者詳細：基本情報・現在の受給者証・履歴・「受給者証を更新」
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getBeneficiary,
  listCertificates,
  type BeneficiaryRecord,
  type CertificateRecord,
} from "@/app/t/[tenantId]/lib/firestore/beneficiaries";
import { CERT_TYPES } from "@/app/t/[tenantId]/constants/certPages";
import CertImageViewer from "@/app/t/[tenantId]/beneficiaries/[beneficiaryId]/CertImageViewer";
import { useLineStaff } from "../../LineSessionProvider";
import { LineBackLink, LineButton, LineCard, LineCenteredMessage, LineField, LineSpinner } from "../../ui";

function formatIsoDate(value: string | null): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? `${y}年${m}月${d}日` : value;
}

function validityText(cert: CertificateRecord): string {
  if (!cert.validFrom && !cert.validTo) return "";
  return `${formatIsoDate(cert.validFrom) || "?"} 〜 ${formatIsoDate(cert.validTo) || "?"}`;
}

function isExpired(cert: CertificateRecord): boolean {
  if (!cert.validTo) return false;
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  return cert.validTo < ymd;
}

function certTypeLabel(certType: string): string {
  return CERT_TYPES.find((t) => t.id === certType)?.label ?? "";
}

export default function LineBeneficiaryDetailPage() {
  const { tenantId } = useLineStaff();
  const params = useParams<{ beneficiaryId: string }>();
  const beneficiaryId = params?.beneficiaryId ?? "";

  const [beneficiary, setBeneficiary] = useState<BeneficiaryRecord | null>(null);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const record = await getBeneficiary(tenantId, beneficiaryId);
        if (cancelled) return;
        if (!record) {
          setState("notFound");
          return;
        }
        const certs = await listCertificates(tenantId, record);
        if (cancelled) return;
        setBeneficiary(record);
        setCertificates(certs);
        setState("ready");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, beneficiaryId]);

  if (state === "loading") return <LineSpinner />;
  if (state === "notFound") {
    return <LineCenteredMessage title="利用者が見つかりません" body="一覧から選び直してください。" />;
  }
  if (state === "error" || !beneficiary) {
    return <LineCenteredMessage title="利用者を読み込めませんでした" body={error} />;
  }

  // listCertificates は現在の証を先頭に返す
  const hasCurrent = !!beneficiary.currentCertificateId || beneficiary.hasLegacyCertificate;
  const current = hasCurrent ? certificates[0] : undefined;
  const history = hasCurrent ? certificates.slice(1) : certificates;
  const page1Path = current?.pages.find((p, i) => (p.pageNo ?? i + 1) === 1)?.storagePath ?? "";

  const name = beneficiary.profile.name || beneficiary.summary.name || "氏名未登録";

  return (
    <div className="space-y-4">
      <LineBackLink href="/line/beneficiaries" label="利用者一覧に戻る" />

      <div className="px-1">
        {(beneficiary.profile.furigana || beneficiary.summary.furigana) && (
          <div className="text-xs text-zinc-500">
            {beneficiary.profile.furigana || beneficiary.summary.furigana}
          </div>
        )}
        <h1 className="text-2xl font-bold break-words">{name}</h1>
      </div>

      <LineCard>
        <LineField label="氏名" value={name} />
        <LineField label="生年月日" value={beneficiary.profile.birthday || beneficiary.summary.birthday} />
        <LineField label="受給者番号" value={beneficiary.summary.number} />
        <LineField label="支給市町村" value={beneficiary.summary.cityName} />
      </LineCard>

      <LineCard>
        <div className="flex items-center justify-between gap-2">
          <div className="text-base font-bold">現在の受給者証</div>
          {current && isExpired(current) && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">期限切れ</span>
          )}
        </div>

        {current ? (
          <div className="mt-2">
            <LineField label="種類" value={certTypeLabel(current.certType)} />
            <LineField label="受給者番号" value={current.summary.number} />
            <LineField label="交付年月日" value={current.issueDate} />
            <LineField label="有効期間" value={validityText(current)} />
            <div className="mt-4">
              <CertImageViewer storagePath={page1Path} />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">受給者証はまだ登録されていません。</p>
        )}
      </LineCard>

      <LineButton href={`/line/import?beneficiaryId=${encodeURIComponent(beneficiary.id)}&new=1`}>
        <span aria-hidden className="text-xl">📷</span>
        {current ? "受給者証を更新" : "受給者証を登録"}
      </LineButton>
      {current && (
        <p className="px-1 text-center text-xs text-zinc-500">
          更新しても、今の受給者証は履歴として残ります
        </p>
      )}

      {history.length > 0 && (
        <LineCard>
          <div className="text-base font-bold">以前の受給者証（{history.length}件）</div>
          <ul className="mt-2">
            {history.map((cert) => (
              <li key={cert.id} className="border-b border-zinc-100 py-3 text-sm last:border-b-0">
                <div className="font-semibold">{validityText(cert) || "有効期間 未登録"}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {cert.issueDate ? `交付 ${cert.issueDate}` : "交付日 未登録"}
                  {cert.summary.number ? `　受給者番号 ${cert.summary.number}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </LineCard>
      )}
    </div>
  );
}
