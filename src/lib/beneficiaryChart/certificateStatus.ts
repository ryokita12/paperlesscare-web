// 受給者証の状態（有効／期限間近／期限切れ／期限未入力／未登録）の判定。
// 期限は受給者証docの validTo（"YYYY-MM-DD"。OCR・手入力由来で空のこともある）を使う。
import { daysBetween, isIsoDate } from "./dates.ts";

// 「期限間近」とみなす残り日数。Phase 1-A は固定値。
// 将来、事業所ごとの設定値にする場合は getCertificateStatus の expiringSoonDays に渡す。
export const DEFAULT_EXPIRING_SOON_DAYS = 30;

export type CertificateStatusKind = "valid" | "expiringSoon" | "expired" | "unknownExpiry" | "none";

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatusKind, string> = {
  valid: "有効",
  expiringSoon: "期限間近",
  expired: "期限切れ",
  // 受給者証は登録済みだが、有効期限が読み取れていない・未入力
  unknownExpiry: "期限未入力",
  none: "未登録",
};

export type CertificateStatus = {
  kind: CertificateStatusKind;
  label: string;
  // 期限までの残り日数（期限切れは負の数）。期限が無い場合は null
  daysLeft: number | null;
};

export function getCertificateStatus(params: {
  hasCertificate: boolean;
  validTo: string | null | undefined;
  today: string; // "YYYY-MM-DD"
  expiringSoonDays?: number;
}): CertificateStatus {
  const { hasCertificate, validTo, today } = params;
  const expiringSoonDays = params.expiringSoonDays ?? DEFAULT_EXPIRING_SOON_DAYS;

  const make = (kind: CertificateStatusKind, daysLeft: number | null): CertificateStatus => ({
    kind,
    label: CERTIFICATE_STATUS_LABELS[kind],
    daysLeft,
  });

  if (!hasCertificate) return make("none", null);
  if (!isIsoDate(validTo)) return make("unknownExpiry", null);

  const daysLeft = daysBetween(today, validTo);
  if (daysLeft === null) return make("unknownExpiry", null);
  if (daysLeft < 0) return make("expired", daysLeft);
  if (daysLeft <= expiringSoonDays) return make("expiringSoon", daysLeft);
  return make("valid", daysLeft);
}
