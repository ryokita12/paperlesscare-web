// src/app/t/[tenantId]/layout.tsx
import type { ReactNode } from "react";
import AppShell from "@/app/components/AppShell";

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;

  return (
    <AppShell tenantId={tenantId}>
      {children}
    </AppShell>
  );
}
