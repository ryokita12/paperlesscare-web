"use client";

// LINEスタッフ用の利用者詳細：氏名 → 現在の受給者証 →「受給者証を更新」→ 基本情報 → 以前の受給者証
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
import {
  friendlyErrorMessage,
  IconCamera,
  LineButton,
  LineCard,
  LineCenteredMessage,
  LineField,
  LinePageHeader,
  LineSpinner,
} from "../../ui";

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
  const [showImage, setShowImage] = useState(false);

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
        console.error("[line] load beneficiary failed", e);
        if (cancelled) return;
        setError(friendlyErrorMessage(e, "通信状況を確認して、もう一度お試しください。"));
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, beneficiaryId]);

  if (state === "loading") return <LineSpinner />;
  if (state === "notFound") {
    return (
      <LineCenteredMessage
        tone="error"
        title="利用者が見つかりません"
        body="一覧から選び直してください。"
        action={{ label: "利用者一覧へ", href: "/line/beneficiaries" }}
      />
    );
  }
  if (state === "error" || !beneficiary) {
    return (
      <LineCenteredMessage
        tone="error"
        title="利用者を読み込めませんでした"
        body={error}
        action={{ label: "利用者一覧へ", href: "/line/beneficiaries" }}
      />
    );
  }

  // listCertificates は現在の証を先頭に返す
  const hasCurrent = !!beneficiary.currentCertificateId || beneficiary.hasLegacyCertificate;
  const current = hasCurrent ? certificates[0] : undefined;
  const history = hasCurrent ? certificates.slice(1) : certificates;
  const page1Path = current?.pages.find((p, i) => (p.pageNo ?? i + 1) === 1)?.storagePath ?? "";

  const name = beneficiary.profile.name || beneficiary.summary.name;
  const furigana = beneficiary.profile.furigana || beneficiary.summary.furigana;
  const expired = !!current && isExpired(current);

  return (
    <div className="space-y-5">
      <LinePageHeader
        back={{ href: "/line/beneficiaries", label: "利用者一覧" }}
        title={
          <>
            {furigana && <span className="block text-base font-normal text-zinc-500">{furigana}</span>}
            {name ? (
              <>
                {name}
                <span className="ml-1 text-lg font-normal text-zinc-500">さん</span>
              </>
            ) : (
              "氏名未登録"
            )}
          </>
        }
      />

      <LineCard>
        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-bold">受給者証</div>
          {current &&
            (expired ? (
              <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-600">期限切れ</span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">現在の証</span>
            ))}
        </div>

        {current ? (
          <div className="mt-1 divide-y divide-zinc-100">
            <LineField label="有効期間" value={validityText(current)} />
            <LineField label="受給者番号" value={current.summary.number} />
            <LineField label="種類" value={certTypeLabel(current.certType)} />
            <LineField label="交付年月日" value={current.issueDate} />
            {page1Path && (
              <div className="pt-3">
                {showImage ? (
                  <CertImageViewer storagePath={page1Path} />
                ) : (
                  <LineButton variant="secondary" onClick={() => setShowImage(true)}>
                    受給者証の写真を見る
                  </LineButton>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-base text-zinc-500">受給者証はまだ登録されていません。</p>
        )}
      </LineCard>

      <div className="space-y-2">
        <LineButton href={`/line/import?beneficiaryId=${encodeURIComponent(beneficiary.id)}&new=1`}>
          <IconCamera className="h-6 w-6" />
          {current ? "受給者証を更新する" : "受給者証を登録する"}
        </LineButton>
        {current && (
          <p className="px-1 text-center text-sm text-zinc-500">更新しても、今の受給者証は履歴として残ります</p>
        )}
      </div>

      <LineCard>
        <div className="text-lg font-bold">基本情報</div>
        <div className="mt-1 divide-y divide-zinc-100">
          <LineField label="生年月日" value={beneficiary.profile.birthday || beneficiary.summary.birthday} />
          <LineField label="支給市町村" value={beneficiary.summary.cityName} />
        </div>
      </LineCard>

      {history.length > 0 && (
        <LineCard>
          <div className="text-lg font-bold">以前の受給者証（{history.length}件）</div>
          <ul className="mt-1 divide-y divide-zinc-100">
            {history.map((cert) => (
              <li key={cert.id} className="py-3">
                <div className="text-base font-semibold">{validityText(cert) || "有効期間 未登録"}</div>
                <div className="mt-0.5 text-sm text-zinc-500">
                  {cert.issueDate ? `交付 ${cert.issueDate}` : "交付日 未登録"}
                  {cert.summary.number ? `・受給者番号 ${cert.summary.number}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </LineCard>
      )}
    </div>
  );
}
