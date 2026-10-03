// 利用者（beneficiary）と受給者証（certificate）のデータ構造に関する、
// Firebaseに依存しない純粋ロジック。node:test から直接テストできるよう
// Firestore SDK を import しない。
//
// データ構造：
//   tenants/{tenantId}/beneficiaries/{beneficiaryId}                 … 利用者
//   tenants/{tenantId}/beneficiaries/{beneficiaryId}/certificates/{id} … 受給者証（1利用者 : N件）
//
// 利用者docの currentCertificateId が「現在の受給者証」を指す。
//   - 文字列 … そのIDの受給者証が現在の証
//   - null   … 受給者証が未登録の利用者（管理Webで枠だけ作成した場合）
//   - 欠落   … 本構造の導入前に保存された旧データ。利用者doc直下の
//              certType / pages を「legacy certificate」として扱う
import type { FormDataType } from "../../types/cert";
import type { CertTypeId } from "../../constants/certPages";
import { extractTsushoValidity } from "../../../../../lib/tsusho/validity.ts";

export type SavedCertPage = {
  pageNo: number;
  title: string;
  formData: FormDataType;
  ocrText: string;
  storagePath: string;
};

export type BeneficiarySummary = {
  name: string;
  furigana: string;
  number: string;
  birthday: string;
  cityName: string;
};

export type BeneficiaryProfile = {
  name: string;
  furigana: string;
  birthday: string;
};

export type CertificateStatus = "current" | "superseded";
export type CertificateSource = "mobile" | "web" | "legacy";

// 旧データを受給者証として保存し直す際に使う固定ID。
// 固定にしておくことで、移送が再試行されても重複した証が作られない。
export const LEGACY_CERTIFICATE_ID = "legacy";

export const EMPTY_SUMMARY: BeneficiarySummary = {
  name: "",
  furigana: "",
  number: "",
  birthday: "",
  cityName: "",
};

export const EMPTY_PROFILE: BeneficiaryProfile = {
  name: "",
  furigana: "",
  birthday: "",
};

// ページ1（受給者証（Ⅰ））の項目を代表値とする
export function buildSummary(pages: { formData: FormDataType }[]): BeneficiarySummary {
  const identityPage = pages[0]?.formData;
  return {
    name: identityPage?.name || "",
    furigana: identityPage?.furigana || "",
    number: identityPage?.number || "",
    birthday: identityPage?.birthday || "",
    cityName: identityPage?.cityName || "",
  };
}

// 新しい受給者証から作った summary を、空欄の項目だけ従来の値で補う。
// OCRで氏名等が取れなかった場合に、利用者一覧の表示が空欄に戻ってしまうのを防ぐ。
export function mergeSummary(
  next: BeneficiarySummary,
  fallback: Partial<BeneficiarySummary> | undefined
): BeneficiarySummary {
  const base = { ...EMPTY_SUMMARY, ...(fallback ?? {}) };
  return {
    name: next.name || base.name,
    furigana: next.furigana || base.furigana,
    number: next.number || base.number,
    birthday: next.birthday || base.birthday,
    cityName: next.cityName || base.cityName,
  };
}

export function profileFromSummary(summary: BeneficiarySummary): BeneficiaryProfile {
  return {
    name: summary.name,
    furigana: summary.furigana,
    birthday: summary.birthday,
  };
}

// 新しい受給者証の値を優先し、空欄の項目だけ従来のプロフィールで補う
export function mergeProfile(
  summary: BeneficiarySummary,
  fallback: Partial<BeneficiaryProfile> | undefined
): BeneficiaryProfile {
  const base = { ...EMPTY_PROFILE, ...(fallback ?? {}) };
  return {
    name: summary.name || base.name,
    furigana: summary.furigana || base.furigana,
    birthday: summary.birthday || base.birthday,
  };
}

/**
 * 本構造の導入前に保存された旧データ（利用者doc直下に pages を持ち、
 * currentCertificateId フィールド自体が無い）かどうか。
 * currentCertificateId が null の利用者は「証なし利用者」であり legacy ではない。
 */
export function hasLegacyCertificate(raw: {
  currentCertificateId?: string | null;
  pages?: unknown;
}): boolean {
  return (
    raw.currentCertificateId === undefined &&
    Array.isArray(raw.pages) &&
    raw.pages.length > 0
  );
}

const ERA_BASE_YEAR: Record<string, number> = {
  令和: 2018,
  平成: 1988,
  昭和: 1925,
};

function toHalfWidthDigits(value: string): string {
  return value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 「令和8年4月1日」形式の和暦を "2026-04-01" に変換する。変換できなければ null。 */
export function parseWarekiDate(value: string): string | null {
  const m = toHalfWidthDigits(value).match(
    /(令和|平成|昭和)\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/
  );
  if (!m) return null;

  const eraYear = m[2] === "元" ? 1 : Number(m[2]);
  const year = ERA_BASE_YEAR[m[1]] + eraYear;
  const month = Number(m[3]);
  const day = Number(m[4]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 「令和7年4月1日から令和8年3月31日まで」形式の期間を開始日・終了日に分ける。 */
export function parseWarekiPeriod(value: string): {
  validFrom: string | null;
  validTo: string | null;
} {
  const [fromPart, toPart] = value.split(/から|～|〜|~/);
  return {
    validFrom: fromPart ? parseWarekiDate(fromPart) : null,
    validTo: toPart ? parseWarekiDate(toPart) : null,
  };
}

/**
 * 受給者証の期間（一覧・履歴の表示用）を取り出す。
 * ページ2の支給決定期間①を優先し、無ければ利用者負担の適用期間を使う。
 * 「現在の証」の判定には使わない（OCR由来で誤読・空欄がありうるため、
 * 現在の証は currentCertificateId で決める）。
 */
export function extractValidity(pages: { pageNo?: number; formData: FormDataType }[]): {
  validFrom: string | null;
  validTo: string | null;
} {
  const candidates = [
    pages.find((p, i) => (p.pageNo ?? i + 1) === 2)?.formData.servicePeriod1,
    pages.find((p, i) => (p.pageNo ?? i + 1) === 7)?.formData.burdenPeriod,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const period = parseWarekiPeriod(candidate);
    if (period.validFrom || period.validTo) return period;
  }

  return { validFrom: null, validTo: null };
}

/**
 * 通所受給者証（tsusho）の期間（一覧・履歴の表示用）。
 * 二・三面の給付決定期間から、放課後等デイサービスを優先して代表期間を選ぶ（Phase 1-B1 の
 * extractTsushoValidity をそのまま使う）。利用者負担（五面）・相談支援（四面）の期間は使わない。
 * 代表期間が無ければ両方 null（一覧では「期限未入力」）。
 */
export function extractTsushoCertificateValidity(pages: { pageNo?: number; formData: FormDataType }[]): {
  validFrom: string | null;
  validTo: string | null;
} {
  const representative = extractTsushoValidity(pages);
  return representative
    ? { validFrom: representative.validFrom, validTo: representative.validTo }
    : { validFrom: null, validTo: null };
}

export type CertificateDocInput = {
  certType: CertTypeId;
  pages: SavedCertPage[];
};

/** 受給者証docの内容部分（作成者・日時を除く）を組み立てる */
export function buildCertificateContent(input: CertificateDocInput) {
  const summary = buildSummary(input.pages);
  return {
    certType: input.certType,
    pages: input.pages,
    summary,
    issueDate: input.pages[0]?.formData.issueDate || "",
    // 期間の求め方だけ種別で分ける。summary（一面：name＝児童・number・cityName 等）と issueDate は
    // tsusho も同じ組み立てで正しい値になる（tsusho の一面は name が児童本人のため）
    ...(input.certType === "tsusho"
      ? extractTsushoCertificateValidity(input.pages)
      : extractValidity(input.pages)),
  };
}

/**
 * 既存の利用者へ受給者証を追加したときに、利用者docの profile をどうするか。
 * 戻り値が null のときは profile を更新しない。
 *
 *   mobility / adult / child … 従来どおり mergeProfile（新しい証の値を優先し、空欄だけ従来値で補う）
 *   tsusho
 *     - personal（利用者カルテの正本）がある利用者 … profile を更新しない
 *       （OCR の値でカルテ・既存画面の表示名を変えない。反映は Phase 1-B7 の候補→確認→反映で行う）
 *     - personal が無い旧データ … 従来の値を優先し、空欄の項目だけ証の値で補う（表示名を変えず、消さない）
 */
export function resolveProfileOnCertificateAdd(params: {
  certType: CertTypeId;
  certSummary: BeneficiarySummary;
  previousProfile: Partial<BeneficiaryProfile> | undefined;
  hasPersonal: boolean;
}): BeneficiaryProfile | null {
  const { certType, certSummary, previousProfile, hasPersonal } = params;
  if (certType !== "tsusho") return mergeProfile(certSummary, previousProfile);
  if (hasPersonal) return null;

  const base = { ...EMPTY_PROFILE, ...(previousProfile ?? {}) };
  return {
    name: base.name || certSummary.name,
    furigana: base.furigana || certSummary.furigana,
    birthday: base.birthday || certSummary.birthday,
  };
}

/** 利用者docに Phase 1-A のカルテ（personal）があるか */
export function hasChartPersonal(raw: Record<string, unknown>): boolean {
  const personal = raw.personal;
  return !!personal && typeof personal === "object" && !Array.isArray(personal);
}
