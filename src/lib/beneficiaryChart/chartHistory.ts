// 利用者カルテの変更履歴（Phase 1-C）。Firebase非依存の純粋ロジック。
//
// 保存先：tenants/{tenantId}/beneficiaries/{beneficiaryId}/chartHistory/{historyId}
//   1件 = 1回の保存操作（カルテの編集の「保存する」、受給者証からの反映の「反映」）。
//   その操作で実際に値が変わった項目だけを changes に入れる（変わらない項目・何も変わらない保存は残さない）。
//
// 対象はカルテの項目（personal / guardian / contract / school / consultationSupport）だけ。
//   - 受給者証そのものの更新は、既存の受給者証の履歴（certificates の current / superseded）で追える。重複して残さない
//   - profile（一覧・LINE 向けの写し）・summary（受給者証の写し）・updatedAt 等は履歴に入れない
//
// 誰が（actor）・いつ（createdAt = サーバー時刻）は保存時に付ける。firestore.rules で actor.uid が
// 書き込んだ本人であること・createdAt がサーバー時刻であること・同じ書き込みで利用者docも更新していることを確認し、
// 作成後の変更・削除はできない。
import { CONTRACT_STATUS_OPTIONS, USAGE_STATUS_OPTIONS, sanitizeSection, type BeneficiaryChartSections, type BeneficiaryPersonal, type ChartSectionKey } from "./model.ts";
import { formatJapaneseDate } from "./dates.ts";

export const CHART_HISTORY_COLLECTION = "chartHistory";
export const CHART_HISTORY_SCHEMA_VERSION = 1;

/** chartEdit：カルテの編集画面での保存 / certificateReview：受給者証からの反映（Phase 1-B7） */
export type ChartHistorySource = "chartEdit" | "certificateReview";

export const CHART_HISTORY_SOURCE_LABELS: Readonly<Record<ChartHistorySource, string>> = {
  chartEdit: "カルテを編集",
  certificateReview: "受給者証から反映",
};

export type ChartHistoryValue = string | boolean;

export type ChartHistoryChange = {
  /** カルテのフィールドパス（例 "guardian.name"） */
  path: string;
  section: ChartSectionKey;
  /** 画面に出す項目名（例「保護者氏名」） */
  label: string;
  before: ChartHistoryValue;
  after: ChartHistoryValue;
};

export type ChartHistoryActor = {
  uid: string;
  email: string | null;
  /** 保存時点の表示名（Firebase Auth の displayName。LINE スタッフは登録したスタッフ名）。無ければ "" */
  displayName: string;
};

export const SECTION_LABELS: Readonly<Record<ChartSectionKey, string>> = {
  personal: "本人情報",
  guardian: "保護者情報",
  contract: "契約情報",
  school: "学校・所属",
  consultationSupport: "相談支援",
};

// 項目名はカルテの画面の表示に合わせる（保護者・相談支援など、セクション内で同じ名前の項目は区別できる名前にする）
const FIELD_LABELS: Readonly<Record<string, string>> = {
  "personal.name": "氏名",
  "personal.furigana": "フリガナ",
  "personal.birthDate": "生年月日",
  "personal.postalCode": "郵便番号",
  "personal.address": "住所",
  "personal.phone": "電話番号",
  "personal.usageStatus": "利用状態",
  "guardian.name": "保護者氏名",
  "guardian.furigana": "保護者フリガナ",
  "guardian.relationship": "続柄",
  "guardian.phone": "保護者電話番号",
  "guardian.emergencyContact": "緊急連絡先",
  "guardian.email": "保護者メールアドレス",
  "guardian.sameAddressAsBeneficiary": "保護者の住所（利用者と同じ）",
  "guardian.postalCode": "保護者郵便番号",
  "guardian.address": "保護者住所",
  "contract.contractDate": "契約日",
  "contract.startDate": "利用開始日",
  "contract.endDate": "契約終了日",
  "contract.contractedAmount": "契約支給量",
  "contract.providerEntryNumber": "事業者記入欄番号",
  "contract.contractStatus": "契約状態",
  "school.schoolName": "学校名",
  "school.grade": "学年（手動設定）",
  "school.className": "クラス",
  "school.teacherName": "担任名",
  "consultationSupport.officeName": "相談支援事業所",
  "consultationSupport.specialistName": "相談支援専門員",
  "consultationSupport.phone": "相談支援 電話番号",
  "consultationSupport.email": "相談支援 メールアドレス",
};

const DATE_PATHS = new Set(["personal.birthDate", "contract.contractDate", "contract.startDate", "contract.endDate"]);

export function chartFieldLabel(path: string): string {
  return FIELD_LABELS[path] ?? path;
}

function sectionOf(path: string): ChartSectionKey {
  return path.split(".")[0] as ChartSectionKey;
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b;
}

/** 1つのセクションの変更（保存前の値 → 保存する値。保存する値は sanitizeSection 済みのもの） */
function diffSection<K extends ChartSectionKey>(
  key: K,
  before: BeneficiaryChartSections[K],
  after: BeneficiaryChartSections[K]
): ChartHistoryChange[] {
  const changes: ChartHistoryChange[] = [];
  const b = before as Record<string, ChartHistoryValue>;
  const a = after as Record<string, ChartHistoryValue>;
  for (const field of Object.keys(a)) {
    if (sameValue(b[field], a[field])) continue;
    const path = `${key}.${field}`;
    changes.push({ path, section: key, label: chartFieldLabel(path), before: b[field], after: a[field] });
  }
  return changes;
}

/**
 * 本人情報の保存（buildPersonalUpdate と同じ内容）で変わる項目。
 * 本人情報のフォームで一緒に保存する手動の学年（school.grade）も含める。profile の写しは含めない。
 */
export function diffPersonalSave(params: {
  before: BeneficiaryChartSections;
  personal: BeneficiaryPersonal;
  grade: string;
}): ChartHistoryChange[] {
  const { before } = params;
  const changes = diffSection("personal", before.personal, sanitizeSection("personal", params.personal));
  const grade = params.grade.trim();
  if (!sameValue(before.school.grade, grade)) {
    changes.push({
      path: "school.grade",
      section: "school",
      label: chartFieldLabel("school.grade"),
      before: before.school.grade,
      after: grade,
    });
  }
  return changes;
}

/** 保護者・契約・学校・相談支援の保存（buildSectionUpdate と同じ内容）で変わる項目 */
export function diffSectionSave<K extends Exclude<ChartSectionKey, "personal">>(params: {
  before: BeneficiaryChartSections;
  key: K;
  value: BeneficiaryChartSections[K];
}): ChartHistoryChange[] {
  const { before, key } = params;
  return diffSection(key, before[key], sanitizeSection(key, params.value));
}

/**
 * フィールドパス単位の更新（受給者証からの反映：{ "guardian.name": "山田 花子", ... }）で変わる項目。
 * 変更前の値は、反映直前に読み直したカルテの値（profile 等の補完をしない、カルテに保存されている値）。
 * カルテの項目以外のパス（profile.* 等）は無視する。
 */
export function diffFieldUpdates(params: {
  before: BeneficiaryChartSections;
  updates: Readonly<Record<string, string>>;
}): ChartHistoryChange[] {
  const changes: ChartHistoryChange[] = [];
  for (const [path, after] of Object.entries(params.updates)) {
    const [section, field] = path.split(".");
    if (!(section in SECTION_LABELS) || !field) continue;
    const sectionValues = params.before[section as ChartSectionKey] as Record<string, ChartHistoryValue>;
    if (!(field in sectionValues)) continue;
    const before = sectionValues[field];
    if (sameValue(before, after)) continue;
    changes.push({ path, section: sectionOf(path), label: chartFieldLabel(path), before, after });
  }
  return changes;
}

// ===== 保存する内容 =====

export type ChartHistoryRecordInput = {
  beneficiaryId: string;
  source: ChartHistorySource;
  changes: readonly ChartHistoryChange[];
  actor: ChartHistoryActor;
  /** 受給者証から反映した場合の証ID */
  certificateId?: string | null;
};

/** chartHistory doc の内容（createdAt はサーバー時刻を chartStore が付ける） */
export function buildChartHistoryRecord(input: ChartHistoryRecordInput): Record<string, unknown> {
  const sections = [...new Set(input.changes.map((c) => c.section))];
  return {
    schemaVersion: CHART_HISTORY_SCHEMA_VERSION,
    beneficiaryId: input.beneficiaryId,
    source: input.source,
    sections,
    changes: input.changes.map((c) => ({ ...c })),
    certificateId: input.certificateId ?? null,
    actor: { uid: input.actor.uid, email: input.actor.email, displayName: input.actor.displayName },
  };
}

// ===== 読み取り・表示 =====

export type ChartHistoryEntry = {
  id: string;
  source: ChartHistorySource;
  sections: ChartSectionKey[];
  changes: ChartHistoryChange[];
  certificateId: string | null;
  actor: ChartHistoryActor;
  /** サーバー時刻（書き込み直後のキャッシュ等で未確定なら null） */
  createdAt: Date | null;
};

function asMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asValue(value: unknown): ChartHistoryValue {
  return typeof value === "string" || typeof value === "boolean" ? value : "";
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === "function") {
    try {
      return maybe.toDate();
    } catch {
      return null;
    }
  }
  return null;
}

/** Firestore の chartHistory doc を安全に読み取る（形が想定外の項目は飛ばす） */
export function readChartHistoryEntry(id: string, data: unknown): ChartHistoryEntry {
  const raw = asMap(data);
  const actor = asMap(raw.actor);
  const changes: ChartHistoryChange[] = [];
  for (const item of Array.isArray(raw.changes) ? raw.changes : []) {
    const c = asMap(item);
    if (typeof c.path !== "string" || !c.path) continue;
    changes.push({
      path: c.path,
      section: sectionOf(c.path),
      label: typeof c.label === "string" && c.label ? c.label : chartFieldLabel(c.path),
      before: asValue(c.before),
      after: asValue(c.after),
    });
  }
  return {
    id,
    source: raw.source === "certificateReview" ? "certificateReview" : "chartEdit",
    sections: [...new Set(changes.map((c) => c.section))],
    changes,
    certificateId: typeof raw.certificateId === "string" ? raw.certificateId : null,
    actor: {
      uid: typeof actor.uid === "string" ? actor.uid : "",
      email: typeof actor.email === "string" ? actor.email : null,
      displayName: typeof actor.displayName === "string" ? actor.displayName : "",
    },
    createdAt: toDate(raw.createdAt),
  };
}

/** 変更した人の表示名：表示名 → メールアドレス → 「不明なスタッフ」 */
export function actorDisplayName(actor: Pick<ChartHistoryActor, "displayName" | "email">): string {
  const name = actor.displayName.trim();
  if (name) return `${name}さん`;
  if (actor.email) return actor.email;
  return "不明なスタッフ";
}

/** 変更前・変更後の値の表示（空は「未入力」、日付・選択肢・チェックは画面と同じ表記） */
export function formatChartHistoryValue(path: string, value: ChartHistoryValue): string {
  if (typeof value === "boolean") {
    return path === "guardian.sameAddressAsBeneficiary" ? (value ? "利用者と同じ" : "別の住所") : value ? "はい" : "いいえ";
  }
  if (!value) return "未入力";
  if (DATE_PATHS.has(path)) return formatJapaneseDate(value);
  if (path === "personal.usageStatus") return USAGE_STATUS_OPTIONS.find((o) => o.id === value)?.label ?? value;
  if (path === "contract.contractStatus") return CONTRACT_STATUS_OPTIONS.find((o) => o.id === value)?.label ?? value;
  return value;
}

/** 日時の表示（例「2026/10/4 10:32」。日本時間） */
export function formatChartHistoryTime(date: Date | null): string {
  if (!date) return "保存中";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}
