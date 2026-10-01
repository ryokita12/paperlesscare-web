"use client";

// 受給者証の登録（新規利用者：?new=1）・既存利用者への登録／更新（?beneficiaryId=&new=1）。
// 撮影・OCR・確認・保存の処理は管理Webと同じ CertImportFlow を使い、
// 表示は variant="line" でスマートフォン向けの画面（LineCertImportView）に切り替わる。
import { Suspense } from "react";
import CertImportFlow from "@/app/t/[tenantId]/CertImportFlow";
import { useLineStaff } from "../LineSessionProvider";
import { LineSpinner } from "../ui";

export default function LineImportPage() {
  const { tenantId } = useLineStaff();

  return (
    <Suspense fallback={<LineSpinner />}>
      <CertImportFlow tenantId={tenantId} variant="line" />
    </Suspense>
  );
}
