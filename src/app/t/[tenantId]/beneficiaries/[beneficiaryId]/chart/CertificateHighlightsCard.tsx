"use client";

// 選択中の受給者証の要点。既存の受給者証docの値を表示するだけで、値の生成・推測はしない。
import { extractCertificateHighlights } from "@/lib/beneficiaryChart/certificateHighlights";
import { formatJapaneseDate } from "@/lib/beneficiaryChart/dates";
import type { CertificateRecord } from "../../../lib/firestore/beneficiaries";
import { DisplayValue, InfoGrid, InfoItem } from "../../components/chartUi";

function periodText(cert: CertificateRecord): string {
  if (!cert.validFrom && !cert.validTo) return "";
  return `${formatJapaneseDate(cert.validFrom) || "?"} 〜 ${formatJapaneseDate(cert.validTo) || "?"}`;
}

export default function CertificateHighlightsCard({ certificate }: { certificate: CertificateRecord }) {
  const h = extractCertificateHighlights(certificate.pages);
  const empty = "未取得";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">
          {certificate.status === "current" ? "現在の受給者証の主な内容" : "この受給者証（過去）の主な内容"}
        </h3>
        <p className="text-xs text-zinc-500">受給者証の各ページの記載から表示しています。誤りは下のページ表示で修正できます。</p>
      </div>

      <InfoGrid>
        <InfoItem label="受給者証番号">
          <DisplayValue value={h.number} empty={empty} />
        </InfoItem>
        <InfoItem label="支給市区町村">
          <DisplayValue value={h.cityName} empty={empty} />
        </InfoItem>
        <InfoItem label="交付日">
          <DisplayValue value={certificate.issueDate} empty={empty} />
        </InfoItem>
        <InfoItem label="有効期間">
          <DisplayValue value={periodText(certificate)} empty={empty} />
        </InfoItem>
        <InfoItem label="利用者負担上限月額">
          <DisplayValue value={h.burdenLimitAmount} empty={empty} />
          {h.burdenLimitAmount && h.burdenPeriod && (
            <div className="text-xs text-zinc-500">適用期間：{h.burdenPeriod}</div>
          )}
        </InfoItem>
        <InfoItem label="上限額管理">
          {h.managementTargetStatus || h.managementOfficeName ? (
            <>
              <DisplayValue value={h.managementTargetStatus} empty="対象 未取得" />
              {h.managementOfficeName && (
                <div className="text-xs text-zinc-600">管理事業所：{h.managementOfficeName}</div>
              )}
            </>
          ) : (
            <DisplayValue value="" empty={empty} />
          )}
        </InfoItem>
      </InfoGrid>

      <div className="mt-4">
        <div className="text-xs text-zinc-500">サービス種別・支給量</div>
        {h.services.length === 0 ? (
          <div className="mt-0.5 text-sm text-zinc-400">{empty}</div>
        ) : (
          <ul className="mt-1 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {h.services.map((s, i) => (
              <li key={i} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[1.2fr_1fr_1.4fr] sm:gap-3">
                <div className="font-semibold break-words">
                  <DisplayValue value={s.type} empty="種別 未取得" />
                </div>
                <div className="break-words">
                  <span className="text-xs text-zinc-500 sm:hidden">支給量：</span>
                  <DisplayValue value={s.amount} empty="支給量 未取得" />
                </div>
                <div className="break-words text-xs text-zinc-600">
                  <DisplayValue value={s.period} empty="期間 未取得" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
