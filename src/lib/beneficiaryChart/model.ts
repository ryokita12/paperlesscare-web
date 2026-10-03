// 利用者カルテのデータモデル（Firebase非依存の純粋ロジック）。
//
// 保存先は既存の利用者doc tenants/{tenantId}/beneficiaries/{beneficiaryId} で、
// Phase 1-A で次のマップを「追加」する（既存フィールドは削除・型変更しない）：
//
//   personal             … 本人情報（カルテの正本）
//   guardian             … 保護者情報
//   contract             … 契約情報
//   school               … 学校・所属（school.grade は手動設定の学年）
//   consultationSupport  … 相談支援
//
// 既存の profile（name / furigana / birthday）は残し、カルテで本人情報を保存したときに
// 同じ値を写す（一覧・LINE版など profile を読む既存画面へ反映するための互換用の写し）。
// 受給者証の取込・更新（addCertificateToBeneficiary）は従来どおり profile を上書きしうるが、
// personal には触れないため、カルテで登録した本人情報は受給者証の更新で上書きされない。
import { calcAge, calcSchoolGrade, formatJapaneseDate, isIsoDate, normalizeDateText } from "./dates.ts";

export type UsageStatus = "active" | "suspended" | "ended";
export type ContractStatus = "none" | "active" | "ended";

export const USAGE_STATUS_OPTIONS: readonly { id: UsageStatus; label: string }[] = [
  { id: "active", label: "利用中" },
  { id: "suspended", label: "休止" },
  { id: "ended", label: "利用終了" },
];

export const CONTRACT_STATUS_OPTIONS: readonly { id: ContractStatus; label: string }[] = [
  { id: "none", label: "未契約" },
  { id: "active", label: "契約中" },
  { id: "ended", label: "契約終了" },
];

export type BeneficiaryPersonal = {
  name: string;
  furigana: string;
  birthDate: string; // "YYYY-MM-DD" または ""
  postalCode: string;
  address: string;
  phone: string;
  usageStatus: UsageStatus | "";
};

export type BeneficiaryGuardian = {
  name: string;
  furigana: string;
  relationship: string;
  phone: string;
  emergencyContact: string;
  email: string;
  // true の場合、保護者の住所は利用者（personal）の住所を使う。
  // 下の postalCode / address は保持したまま（指定を外したときに元の入力へ戻せるように）
  sameAddressAsBeneficiary: boolean;
  postalCode: string;
  address: string;
};

export type BeneficiaryContract = {
  contractDate: string; // "YYYY-MM-DD" または ""
  startDate: string;
  endDate: string;
  contractedAmount: string; // 契約支給量（例："月23日"）
  providerEntryNumber: string; // 事業者記入欄番号
  contractStatus: ContractStatus | "";
};

export type BeneficiarySchool = {
  schoolName: string;
  grade: string; // 手動設定の学年。空なら生年月日から自動計算した学年を表示する
  className: string;
  teacherName: string;
};

export type BeneficiaryConsultationSupport = {
  officeName: string;
  specialistName: string;
  phone: string;
  email: string;
};

export type BeneficiaryChartSections = {
  personal: BeneficiaryPersonal;
  guardian: BeneficiaryGuardian;
  contract: BeneficiaryContract;
  school: BeneficiarySchool;
  consultationSupport: BeneficiaryConsultationSupport;
};

export type ChartSectionKey = keyof BeneficiaryChartSections;

export const EMPTY_PERSONAL: BeneficiaryPersonal = {
  name: "",
  furigana: "",
  birthDate: "",
  postalCode: "",
  address: "",
  phone: "",
  usageStatus: "",
};

export const EMPTY_GUARDIAN: BeneficiaryGuardian = {
  name: "",
  furigana: "",
  relationship: "",
  phone: "",
  emergencyContact: "",
  email: "",
  sameAddressAsBeneficiary: false,
  postalCode: "",
  address: "",
};

export const EMPTY_CONTRACT: BeneficiaryContract = {
  contractDate: "",
  startDate: "",
  endDate: "",
  contractedAmount: "",
  providerEntryNumber: "",
  contractStatus: "",
};

export const EMPTY_SCHOOL: BeneficiarySchool = {
  schoolName: "",
  grade: "",
  className: "",
  teacherName: "",
};

export const EMPTY_CONSULTATION_SUPPORT: BeneficiaryConsultationSupport = {
  officeName: "",
  specialistName: "",
  phone: "",
  email: "",
};

// ===== 読み取り（Firestoreのdocから安全に取り出す） =====

type RawMap = Record<string, unknown>;

function asMap(value: unknown): RawMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawMap) : {};
}

function str(map: RawMap, key: string): string {
  const v = map[key];
  return typeof v === "string" ? v : "";
}

function oneOf<T extends string>(value: string, allowed: readonly { id: T }[]): T | "" {
  return allowed.some((o) => o.id === value) ? (value as T) : "";
}

function isoOrEmpty(value: string): string {
  return isIsoDate(value) ? value : "";
}

/**
 * 利用者docの生データから、カルテの各セクションを取り出す。
 * Phase 1-A 以前の利用者（マップが無い）や、想定外の型が入っている場合も既定値で補い、画面が落ちないようにする。
 */
export function readChartSections(data: unknown): BeneficiaryChartSections {
  const doc = asMap(data);
  const p = asMap(doc.personal);
  const g = asMap(doc.guardian);
  const c = asMap(doc.contract);
  const s = asMap(doc.school);
  const cs = asMap(doc.consultationSupport);

  return {
    personal: {
      name: str(p, "name"),
      furigana: str(p, "furigana"),
      birthDate: isoOrEmpty(str(p, "birthDate")),
      postalCode: str(p, "postalCode"),
      address: str(p, "address"),
      phone: str(p, "phone"),
      usageStatus: oneOf(str(p, "usageStatus"), USAGE_STATUS_OPTIONS),
    },
    guardian: {
      name: str(g, "name"),
      furigana: str(g, "furigana"),
      relationship: str(g, "relationship"),
      phone: str(g, "phone"),
      emergencyContact: str(g, "emergencyContact"),
      email: str(g, "email"),
      sameAddressAsBeneficiary: g.sameAddressAsBeneficiary === true,
      postalCode: str(g, "postalCode"),
      address: str(g, "address"),
    },
    contract: {
      contractDate: isoOrEmpty(str(c, "contractDate")),
      startDate: isoOrEmpty(str(c, "startDate")),
      endDate: isoOrEmpty(str(c, "endDate")),
      contractedAmount: str(c, "contractedAmount"),
      providerEntryNumber: str(c, "providerEntryNumber"),
      contractStatus: oneOf(str(c, "contractStatus"), CONTRACT_STATUS_OPTIONS),
    },
    school: {
      schoolName: str(s, "schoolName"),
      grade: str(s, "grade"),
      className: str(s, "className"),
      teacherName: str(s, "teacherName"),
    },
    consultationSupport: {
      officeName: str(cs, "officeName"),
      specialistName: str(cs, "specialistName"),
      phone: str(cs, "phone"),
      email: str(cs, "email"),
    },
  };
}

// ===== 表示用の解決（互換レイヤー） =====

// 既存の利用者docにある本人情報（profile / summary）。beneficiaries.ts の型と同じ形。
export type LegacyIdentity = {
  profile: { name: string; furigana: string; birthday: string };
  summary: { name: string; furigana: string; number: string; birthday: string; cityName: string };
};

export type BirthDateSource = "chart" | "profile" | "certificate" | "none";

export type ChartIdentity = {
  name: string;
  furigana: string;
  // 正規化済みの生年月日（"YYYY-MM-DD"）。読み取れなければ null
  birthDate: string | null;
  birthDateSource: BirthDateSource;
  // 正規化できなかった場合の元の文字列（画面にそのまま表示する）
  birthDateRawText: string;
  age: number | null;
  grade: string;
  gradeSource: "manual" | "auto" | "none";
};

/**
 * カルテ上の本人情報を決める。優先順位：
 *   氏名・フリガナ … personal（カルテ）→ profile（既存）→ summary（受給者証の写し）
 *   生年月日       … personal.birthDate → profile.birthday を正規化 → summary.birthday を正規化
 *   学年           … school.grade（手動）→ 生年月日からの自動計算
 * 既存の値は読むだけで書き換えない。
 */
export function resolveChartIdentity(
  record: LegacyIdentity,
  sections: BeneficiaryChartSections,
  today: Date
): ChartIdentity {
  const { personal, school } = sections;

  let birthDate: string | null = null;
  let birthDateSource: BirthDateSource = "none";
  if (isIsoDate(personal.birthDate)) {
    birthDate = personal.birthDate;
    birthDateSource = "chart";
  } else if (normalizeDateText(record.profile.birthday)) {
    birthDate = normalizeDateText(record.profile.birthday);
    birthDateSource = "profile";
  } else if (normalizeDateText(record.summary.birthday)) {
    birthDate = normalizeDateText(record.summary.birthday);
    birthDateSource = "certificate";
  }

  const birthDateRawText = birthDate
    ? ""
    : (record.profile.birthday || record.summary.birthday || "").trim();

  const manualGrade = school.grade.trim();
  const autoGrade = calcSchoolGrade(birthDate, today)?.label ?? "";

  return {
    name: personal.name || record.profile.name || record.summary.name || "",
    furigana: personal.furigana || record.profile.furigana || record.summary.furigana || "",
    birthDate,
    birthDateSource,
    birthDateRawText,
    age: calcAge(birthDate, today),
    grade: manualGrade || autoGrade,
    gradeSource: manualGrade ? "manual" : autoGrade ? "auto" : "none",
  };
}

/** 保護者の住所（「利用者と同じ住所」の場合は利用者の住所） */
export function resolveGuardianAddress(sections: BeneficiaryChartSections): {
  postalCode: string;
  address: string;
} {
  const { guardian, personal } = sections;
  if (guardian.sameAddressAsBeneficiary) {
    return { postalCode: personal.postalCode, address: personal.address };
  }
  return { postalCode: guardian.postalCode, address: guardian.address };
}

/** カルテの「本人情報」編集フォームの初期値（未保存の利用者は既存の profile / summary から補う） */
export function initialPersonalForm(
  sections: BeneficiaryChartSections,
  identity: ChartIdentity
): BeneficiaryPersonal {
  return {
    ...sections.personal,
    name: identity.name,
    furigana: identity.furigana,
    birthDate: identity.birthDate ?? "",
  };
}

// ===== 保存用データの組み立て =====

function trimAll<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = typeof v === "string" ? v.trim() : v;
  return out as T;
}

export function sanitizeSection<K extends ChartSectionKey>(
  key: K,
  value: BeneficiaryChartSections[K]
): BeneficiaryChartSections[K] {
  // 想定外のキーを書き込まないよう、既定値のキーだけを残してから整形する
  const empty = EMPTY_SECTIONS[key] as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const k of Object.keys(empty)) {
    const v = (value as Record<string, unknown>)[k];
    picked[k] = typeof v === typeof empty[k] ? v : empty[k];
  }
  return trimAll(picked) as BeneficiaryChartSections[K];
}

export const EMPTY_SECTIONS: BeneficiaryChartSections = {
  personal: EMPTY_PERSONAL,
  guardian: EMPTY_GUARDIAN,
  contract: EMPTY_CONTRACT,
  school: EMPTY_SCHOOL,
  consultationSupport: EMPTY_CONSULTATION_SUPPORT,
};

/**
 * 本人情報を保存するときの更新内容。
 * personal に加え、手動の学年（school.grade）と、既存画面向けの profile の写しも同時に更新する。
 * profile は name / furigana / birthday の3項目のみのマップ（既存仕様）なので丸ごと置き換える。
 * 生年月日が未入力の場合は、既存の profile.birthday（和暦等の文字列）をそのまま残す。
 */
export function buildPersonalUpdate(params: {
  personal: BeneficiaryPersonal;
  grade: string;
  currentProfile: LegacyIdentity["profile"];
}): Record<string, unknown> {
  const personal = sanitizeSection("personal", params.personal);
  return {
    personal,
    "school.grade": params.grade.trim(),
    profile: {
      name: personal.name,
      furigana: personal.furigana,
      birthday: personal.birthDate
        ? formatJapaneseDate(personal.birthDate)
        : params.currentProfile.birthday,
    },
  };
}

/** 本人情報以外のセクションを保存するときの更新内容（そのセクションのマップだけを置き換える） */
export function buildSectionUpdate<K extends Exclude<ChartSectionKey, "personal">>(
  key: K,
  value: BeneficiaryChartSections[K]
): Record<string, unknown> {
  return { [key]: sanitizeSection(key, value) };
}

// ===== 入力チェック =====

export type FieldErrors = Partial<Record<string, string>>;

const POSTAL_RE = /^\d{3}-?\d{4}$/;
const PHONE_RE = /^[0-9+\-() ]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkPostal(errors: FieldErrors, key: string, v: string) {
  if (v && !POSTAL_RE.test(v.normalize("NFKC").trim())) errors[key] = "郵便番号は「123-4567」の形で入力してください";
}
function checkPhone(errors: FieldErrors, key: string, v: string) {
  if (v && !PHONE_RE.test(v.normalize("NFKC").trim())) errors[key] = "電話番号は数字とハイフンで入力してください";
}
function checkEmail(errors: FieldErrors, key: string, v: string) {
  if (v && !EMAIL_RE.test(v.trim())) errors[key] = "メールアドレスの形式が正しくありません";
}
function checkDate(errors: FieldErrors, key: string, v: string) {
  if (v && !isIsoDate(v)) errors[key] = "日付が正しくありません";
}

export function validatePersonal(p: BeneficiaryPersonal, today: Date): FieldErrors {
  const errors: FieldErrors = {};
  if (!p.name.trim()) errors.name = "氏名を入力してください";
  checkDate(errors, "birthDate", p.birthDate);
  if (!errors.birthDate && p.birthDate && calcAge(p.birthDate, today) === null) {
    errors.birthDate = "未来の日付は入力できません";
  }
  checkPostal(errors, "postalCode", p.postalCode);
  checkPhone(errors, "phone", p.phone);
  return errors;
}

export function validateGuardian(g: BeneficiaryGuardian): FieldErrors {
  const errors: FieldErrors = {};
  checkPhone(errors, "phone", g.phone);
  checkPhone(errors, "emergencyContact", g.emergencyContact);
  checkEmail(errors, "email", g.email);
  if (!g.sameAddressAsBeneficiary) checkPostal(errors, "postalCode", g.postalCode);
  return errors;
}

export function validateContract(c: BeneficiaryContract): FieldErrors {
  const errors: FieldErrors = {};
  checkDate(errors, "contractDate", c.contractDate);
  checkDate(errors, "startDate", c.startDate);
  checkDate(errors, "endDate", c.endDate);
  if (!errors.startDate && !errors.endDate && c.startDate && c.endDate && c.endDate < c.startDate) {
    errors.endDate = "契約終了日は利用開始日より後の日付にしてください";
  }
  return errors;
}

export function validateConsultationSupport(cs: BeneficiaryConsultationSupport): FieldErrors {
  const errors: FieldErrors = {};
  checkPhone(errors, "phone", cs.phone);
  checkEmail(errors, "email", cs.email);
  return errors;
}

// ===== 検索 =====

/** 空白（全角含む）を除き、ひらがな→カタカナ、全角英数→半角、英字は小文字に揃える */
export function normalizeForChartSearch(value: string): string {
  return (value || "")
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase();
}

/** 氏名・フリガナ（カルテ・既存profile・受給者証の写し）と受給者証番号で部分一致検索する */
export function matchesChartSearch(
  target: { identity: Pick<ChartIdentity, "name" | "furigana">; record: LegacyIdentity },
  keyword: string
): boolean {
  const q = normalizeForChartSearch(keyword);
  if (!q) return true;
  const { identity, record } = target;
  return [
    identity.name,
    identity.furigana,
    record.profile.name,
    record.profile.furigana,
    record.summary.name,
    record.summary.furigana,
    record.summary.number,
  ]
    .map(normalizeForChartSearch)
    .some((v) => v.includes(q));
}
