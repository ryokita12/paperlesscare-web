// 利用記録（予定 → 当日 → 実績）のデータモデル（Firebase非依存の純粋ロジック）。
//
// 保存先：tenants/{tenantId}/usageRecords/{recordId}
//   recordId = "{YYYY-MM-DD}_{beneficiaryId}"（1件 = 1人の利用者 × 1日）
// 予定と実績を別データに分けず、同じ1件が status を変えていく：
//   scheduled（予定）→ attended（来所。actual.endTime があれば退所済み）/ absent（欠席）/ cancelled（キャンセル）
// 予定外の来所は origin: "walkIn" で最初から attended として作る。
//
// 予定時刻（planned）と実績時刻（actual）は別々に持つ（例：予定 14:00 → 実際の来所 14:08）。
//
// Phase 2 では「実績確定（confirmed）」は持たない。予定に対して記録された状態がそのまま実績として表示される。
// 将来の月次締め・請求では、月単位の締めデータ（例：usageMonths/{YYYY-MM}）を別に作り、
// 締めた月の記録を Rules で変更不可にする想定（個々の記録の構造は変えずに追加できる）。
import { isIsoDate } from "../beneficiaryChart/dates.ts";
import { isTimeText } from "./time.ts";

export const USAGE_RECORDS_COLLECTION = "usageRecords";
export const USAGE_RECORD_SCHEMA_VERSION = 1;

export type UsageRecordStatus = "scheduled" | "attended" | "absent" | "cancelled";
export type UsageRecordOrigin = "pattern" | "manual" | "walkIn";

export const USAGE_RECORD_STATUSES: readonly UsageRecordStatus[] = ["scheduled", "attended", "absent", "cancelled"];
export const USAGE_RECORD_ORIGINS: readonly UsageRecordOrigin[] = ["pattern", "manual", "walkIn"];

/** 記録した人。LINE スタッフはメールアドレスを持たないため、画面表示用に氏名（name）を持つ */
export type UsageActor = { uid: string; email: string | null; name: string };

export type UsagePlannedTime = { startTime: string; endTime: string };

export type UsageActual = {
  startTime: string; // 来所時刻 "HH:mm" または ""
  endTime: string; // 退所時刻 "HH:mm" または ""
  pickup: boolean | null; // 送迎（迎え）。null = 未入力
  dropoff: boolean | null; // 送迎（送り）
};

export type UsageAbsence = {
  reason: string; // 欠席理由（任意）
  contactedAt: string; // 欠席連絡を受けた日 "YYYY-MM-DD" または ""（将来の欠席時対応加算の判定材料）
};

export type UsageStatusLogEntry = {
  from: UsageRecordStatus | null;
  to: UsageRecordStatus;
  at: string; // ISO 8601（配列の中ではサーバー時刻を使えないため端末の時刻）
  by: { uid: string; name: string };
};

export type UsageRecord = {
  id: string;
  beneficiaryId: string;
  date: string;
  yearMonth: string;
  status: UsageRecordStatus;
  origin: UsageRecordOrigin;
  planned: UsagePlannedTime;
  actual: UsageActual;
  absence: UsageAbsence;
  note: string;
  statusLog: UsageStatusLogEntry[];
  createdBy: UsageActor;
  updatedBy: UsageActor;
  // Firestore の Timestamp（表示には使わないため型を絞らない）
  createdAt: unknown;
  updatedAt: unknown;
};

export const NOTE_MAX_LENGTH = 500;
export const ABSENCE_REASON_MAX_LENGTH = 200;
export const STATUS_LOG_MAX_ENTRIES = 30;

export const EMPTY_PLANNED: UsagePlannedTime = { startTime: "", endTime: "" };
export const EMPTY_ACTUAL: UsageActual = { startTime: "", endTime: "", pickup: null, dropoff: null };
export const EMPTY_ABSENCE: UsageAbsence = { reason: "", contactedAt: "" };

// ===== ID・日付 =====

/** 2026-10-05 + Abc → "2026-10-05_Abc" */
export function usageRecordId(date: string, beneficiaryId: string): string {
  if (!isIsoDate(date)) throw new Error(`invalid date: ${date}`);
  if (!beneficiaryId || beneficiaryId.includes("/")) throw new Error("invalid beneficiaryId");
  return `${date}_${beneficiaryId}`;
}

/** "2026-10-05" → "2026-10" */
export function yearMonthOf(date: string): string {
  if (!isIsoDate(date)) throw new Error(`invalid date: ${date}`);
  return date.slice(0, 7);
}

export function isYearMonth(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  return true;
}

/** 月の日数 */
export function daysInMonth(yearMonth: string): number {
  if (!isYearMonth(yearMonth)) throw new Error(`invalid yearMonth: ${yearMonth}`);
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 月の全日付 ["2026-10-01", …, "2026-10-31"] */
export function datesOfMonth(yearMonth: string): string[] {
  const n = daysInMonth(yearMonth);
  return Array.from({ length: n }, (_, i) => `${yearMonth}-${String(i + 1).padStart(2, "0")}`);
}

/** 曜日（0=日 … 6=土）。日付は暦日として扱う（タイムゾーンに依存しない） */
export function weekdayOf(date: string): number {
  if (!isIsoDate(date)) throw new Error(`invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 日付を days 日ずらす */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** 月を months か月ずらす */
export function addMonths(yearMonth: string, months: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** "2026-10-05" → "10月5日（月）" */
export function formatDateWithWeekday(date: string): string {
  if (!isIsoDate(date)) return date;
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日（${WEEKDAY_LABELS[weekdayOf(date)]}）`;
}

/** "2026-10" → "2026年10月" */
export function formatYearMonth(yearMonth: string): string {
  if (!isYearMonth(yearMonth)) return yearMonth;
  const [y, m] = yearMonth.split("-").map(Number);
  return `${y}年${m}月`;
}

// ===== 表示 =====

/** 画面に出す状態。内部値（scheduled 等）は画面に出さない */
export type UsageDisplayStatus = "scheduled" | "attended" | "departed" | "absent" | "cancelled";

export const USAGE_DISPLAY_LABELS: Record<UsageDisplayStatus, string> = {
  scheduled: "予定",
  attended: "来所",
  departed: "退所",
  absent: "欠席",
  cancelled: "キャンセル",
};

export function displayStatusOf(record: Pick<UsageRecord, "status" | "actual">): UsageDisplayStatus {
  if (record.status === "attended") return record.actual.endTime ? "departed" : "attended";
  return record.status;
}

export const ORIGIN_LABELS: Record<UsageRecordOrigin, string> = {
  pattern: "基本の曜日から作成",
  manual: "個別に追加",
  walkIn: "予定外の来所",
};

// ===== 読み取り（Firestore の doc から安全に取り出す） =====

type RawMap = Record<string, unknown>;

function asMap(value: unknown): RawMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawMap) : {};
}

function str(map: RawMap, key: string): string {
  const v = map[key];
  return typeof v === "string" ? v : "";
}

function timeOrEmpty(value: string): string {
  return isTimeText(value) ? value : "";
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readActor(value: unknown): UsageActor {
  const m = asMap(value);
  return { uid: str(m, "uid"), email: typeof m.email === "string" ? m.email : null, name: str(m, "name") };
}

function readStatusLog(value: unknown): UsageStatusLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const m = asMap(raw);
    const to = str(m, "to");
    if (!USAGE_RECORD_STATUSES.includes(to as UsageRecordStatus)) return [];
    const from = str(m, "from");
    const by = asMap(m.by);
    return [
      {
        from: USAGE_RECORD_STATUSES.includes(from as UsageRecordStatus) ? (from as UsageRecordStatus) : null,
        to: to as UsageRecordStatus,
        at: str(m, "at"),
        by: { uid: str(by, "uid"), name: str(by, "name") },
      },
    ];
  });
}

/**
 * 利用記録docの生データを型に揃える。ID から日付・利用者IDを補えるので、欠けた値・不正な型でも画面を止めない。
 * 日付・利用者が特定できないdocは null（一覧から外す）。
 */
export function readUsageRecord(id: string, data: unknown): UsageRecord | null {
  const d = asMap(data);
  const sep = id.indexOf("_");
  const idDate = sep > 0 ? id.slice(0, sep) : "";
  const idBeneficiary = sep > 0 ? id.slice(sep + 1) : "";
  const date = isIsoDate(d.date) ? (d.date as string) : idDate;
  const beneficiaryId = str(d, "beneficiaryId") || idBeneficiary;
  if (!isIsoDate(date) || !beneficiaryId) return null;

  const status = str(d, "status");
  const origin = str(d, "origin");
  const planned = asMap(d.planned);
  const actual = asMap(d.actual);
  const absence = asMap(d.absence);

  return {
    id,
    beneficiaryId,
    date,
    yearMonth: date.slice(0, 7),
    status: USAGE_RECORD_STATUSES.includes(status as UsageRecordStatus) ? (status as UsageRecordStatus) : "scheduled",
    origin: USAGE_RECORD_ORIGINS.includes(origin as UsageRecordOrigin) ? (origin as UsageRecordOrigin) : "manual",
    planned: { startTime: timeOrEmpty(str(planned, "startTime")), endTime: timeOrEmpty(str(planned, "endTime")) },
    actual: {
      startTime: timeOrEmpty(str(actual, "startTime")),
      endTime: timeOrEmpty(str(actual, "endTime")),
      pickup: boolOrNull(actual.pickup),
      dropoff: boolOrNull(actual.dropoff),
    },
    absence: {
      reason: str(absence, "reason"),
      contactedAt: isIsoDate(absence.contactedAt) ? (absence.contactedAt as string) : "",
    },
    note: str(d, "note"),
    statusLog: readStatusLog(d.statusLog),
    createdBy: readActor(d.createdBy),
    updatedBy: readActor(d.updatedBy),
    createdAt: d.createdAt ?? null,
    updatedAt: d.updatedAt ?? null,
  };
}

/** 保存するフィールド（id・Timestamp を除く。createdAt / updatedAt は保存側でサーバー時刻を入れる） */
export type UsageRecordFields = Omit<UsageRecord, "id" | "createdAt" | "updatedAt">;

export function toUsageRecordFields(record: UsageRecord | UsageRecordFields): UsageRecordFields & {
  schemaVersion: number;
} {
  return {
    schemaVersion: USAGE_RECORD_SCHEMA_VERSION,
    beneficiaryId: record.beneficiaryId,
    date: record.date,
    yearMonth: record.yearMonth,
    status: record.status,
    origin: record.origin,
    planned: { ...record.planned },
    actual: { ...record.actual },
    absence: { ...record.absence },
    note: record.note,
    statusLog: record.statusLog.map((e) => ({ ...e, by: { ...e.by } })),
    createdBy: { ...record.createdBy },
    updatedBy: { ...record.updatedBy },
  };
}

/** 一覧の並び順：予定開始時刻（未設定は後ろ）→ 氏名 */
export function compareByPlannedStart(a: UsageRecord, b: UsageRecord): number {
  const as = a.planned.startTime || a.actual.startTime || "99:99";
  const bs = b.planned.startTime || b.actual.startTime || "99:99";
  return as < bs ? -1 : as > bs ? 1 : 0;
}
