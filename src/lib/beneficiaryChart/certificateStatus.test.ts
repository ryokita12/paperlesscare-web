import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXPIRING_SOON_DAYS, getCertificateStatus } from "./certificateStatus.ts";

const TODAY = "2025-10-01";

test("受給者証が無ければ「未登録」", () => {
  const s = getCertificateStatus({ hasCertificate: false, validTo: "2026-03-31", today: TODAY });
  assert.equal(s.kind, "none");
  assert.equal(s.label, "未登録");
});

test("有効期限が無い・読めない受給者証は「期限未入力」（期限を推測しない）", () => {
  assert.equal(getCertificateStatus({ hasCertificate: true, validTo: null, today: TODAY }).kind, "unknownExpiry");
  assert.equal(getCertificateStatus({ hasCertificate: true, validTo: "", today: TODAY }).kind, "unknownExpiry");
  assert.equal(getCertificateStatus({ hasCertificate: true, validTo: "令和8年3月31日", today: TODAY }).kind, "unknownExpiry");
});

test("期限切れ・期限間近・有効の境界", () => {
  assert.equal(getCertificateStatus({ hasCertificate: true, validTo: "2025-09-30", today: TODAY }).kind, "expired");
  // 期限当日はまだ有効期間内
  const sameDay = getCertificateStatus({ hasCertificate: true, validTo: TODAY, today: TODAY });
  assert.equal(sameDay.kind, "expiringSoon");
  assert.equal(sameDay.daysLeft, 0);
  assert.equal(getCertificateStatus({ hasCertificate: true, validTo: "2025-10-31", today: TODAY }).kind, "expiringSoon");
  assert.equal(getCertificateStatus({ hasCertificate: true, validTo: "2025-11-01", today: TODAY }).kind, "valid");
  assert.equal(DEFAULT_EXPIRING_SOON_DAYS, 30);
});

test("期限間近の日数は引数で変更できる（将来の設定値化に備える）", () => {
  const s = getCertificateStatus({ hasCertificate: true, validTo: "2025-11-15", today: TODAY, expiringSoonDays: 60 });
  assert.equal(s.kind, "expiringSoon");
  assert.equal(s.daysLeft, 45);
});
