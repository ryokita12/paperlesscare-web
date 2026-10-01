"use client";

// 受給者証の登録（新規利用者）・更新（?beneficiaryId=）。
// 撮影・OCR・確認・保存は管理Webと同じ CertImportFlow をそのまま使う。
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CertImportFlow from "@/app/t/[tenantId]/CertImportFlow";
import { useLineStaff } from "../LineSessionProvider";
import { LineBackLink, LineSpinner } from "../ui";

function BackLink() {
  const beneficiaryId = useSearchParams().get("beneficiaryId");
  return beneficiaryId ? (
    <LineBackLink href={`/line/beneficiaries/${beneficiaryId}`} label="利用者に戻る" />
  ) : (
    <LineBackLink href="/line/home" label="TOPに戻る" />
  );
}

export default function LineImportPage() {
  const { tenantId } = useLineStaff();

  return (
    <Suspense fallback={<LineSpinner />}>
      <div className="space-y-2">
        <BackLink />
        <CertImportFlow tenantId={tenantId} variant="line" />
      </div>
    </Suspense>
  );
}
