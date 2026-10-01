"use client";

import { useParams } from "next/navigation";
import CertImportFlow from "./CertImportFlow";

// 受給者証取込＆送信。取込・OCR・保存の本体は CertImportFlow（LINEスタッフ版と共通）
export default function TenantHome() {
  const routeParams = useParams<{ tenantId: string }>();
  return <CertImportFlow tenantId={routeParams?.tenantId ?? ""} />;
}
