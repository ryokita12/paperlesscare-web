// 利用記録の集計（Firebase非依存の純粋ロジック）。集計結果は保存しない（毎回 usageRecords から求める）。
//
// 用語（画面の表示と対応）：
//   予定     … もともと予定されていた記録（予定外の来所・キャンセルを除く）
//   来所     … attended（予定外の来所を含む。退所済みも含む）
//   退所     … attended のうち退所時刻があるもの
//   欠席     … absent
//   キャンセル … cancelled
//   未処理   … 当日以前で、まだ「予定」のままの記録（来所・欠席・キャンセルのどれも記録されていない）
//   利用日数 … 予定（まだ来ていない日）＋来所。支給量（日/月）と比べる日数（欠席・キャンセルは数えない）
import { extractTsushoServices } from "../tsusho/services.ts";
import type { TsushoPageLike } from "../tsusho/types.ts";
import type { UsageRecord } from "./model.ts";
import { parseTime, rangeMinutes } from "./time.ts";

export type UsageCounts = {
  planned: number;
  attended: number;
  departed: number;
  absent: number;
  cancelled: number;
  pending: number;
  walkIn: number;
  /** 予定のまま（今日より後の日を含む） */
  scheduled: number;
  /** 支給量と比べる利用日数（予定＋来所） */
  usageDays: number;
  plannedMinutes: number;
  actualMinutes: number;
};

export const EMPTY_COUNTS: UsageCounts = {
  planned: 0,
  attended: 0,
  departed: 0,
  absent: 0,
  cancelled: 0,
  pending: 0,
  walkIn: 0,
  scheduled: 0,
  usageDays: 0,
  plannedMinutes: 0,
  actualMinutes: 0,
};

/** 実績の時間（来所〜退所。両方そろっている場合のみ） */
export function actualMinutesOf(record: Pick<UsageRecord, "status" | "actual">): number {
  if (record.status !== "attended") return 0;
  const start = parseTime(record.actual.startTime);
  const end = parseTime(record.actual.endTime);
  if (start === null || end === null || end < start) return 0;
  return end - start;
}

/** 予定の時間（キャンセル・予定外の来所は数えない） */
export function plannedMinutesOf(record: Pick<UsageRecord, "status" | "origin" | "planned">): number {
  if (record.status === "cancelled" || record.origin === "walkIn") return 0;
  return rangeMinutes(record.planned) ?? 0;
}

/**
 * 記録の件数・時間を数える。
 * @param today 未処理の判定に使う日本の今日（"YYYY-MM-DD"）。この日以前の「予定のまま」を未処理とする
 */
export function countUsage(records: readonly UsageRecord[], today: string): UsageCounts {
  const c = { ...EMPTY_COUNTS };
  for (const r of records) {
    const wasPlanned = r.origin !== "walkIn" && r.status !== "cancelled";
    if (wasPlanned) c.planned += 1;
    if (r.origin === "walkIn") c.walkIn += 1;
    switch (r.status) {
      case "attended":
        c.attended += 1;
        c.usageDays += 1;
        if (r.actual.endTime) c.departed += 1;
        break;
      case "absent":
        c.absent += 1;
        break;
      case "cancelled":
        c.cancelled += 1;
        break;
      case "scheduled":
        c.scheduled += 1;
        c.usageDays += 1;
        if (r.date <= today) c.pending += 1;
        break;
    }
    c.plannedMinutes += plannedMinutesOf(r);
    c.actualMinutes += actualMinutesOf(r);
  }
  return c;
}

/** 利用者ごとに集計する（月次の実績画面用） */
export function countUsageByBeneficiary(records: readonly UsageRecord[], today: string): Map<string, UsageCounts> {
  const groups = new Map<string, UsageRecord[]>();
  for (const r of records) {
    const list = groups.get(r.beneficiaryId) ?? [];
    list.push(r);
    groups.set(r.beneficiaryId, list);
  }
  const result = new Map<string, UsageCounts>();
  for (const [id, list] of groups) result.set(id, countUsage(list, today));
  return result;
}

// ===== 支給量（日/月）=====

/**
 * 現在の受給者証から、放課後等デイサービスの支給量（日/月）を求める。
 * 通所受給者証（tsusho）の給付決定内容のうち、放課後等デイサービスの行で日数が安全に読めたものを使う。
 * 放課後等デイサービスの行が無い場合は、日数が読めた行がちょうど1種類の値のときだけその値を使う。
 * 読めない・通所受給者証でない場合は null（比較を表示しないだけで、予定の登録は止めない）。
 */
export function daysPerMonthFromCertificate(certType: string, pages: readonly TsushoPageLike[]): number | null {
  if (certType !== "tsusho") return null;
  const services = extractTsushoServices(pages);
  const houkago = services.filter((s) => s.kind === "houkagoDay" && s.daysPerMonth !== null);
  const pick = houkago.length > 0 ? houkago : services.filter((s) => s.daysPerMonth !== null);
  const values = new Set(pick.map((s) => s.daysPerMonth as number));
  return values.size === 1 ? [...values][0] : houkago.length > 0 ? (houkago[0].daysPerMonth as number) : null;
}

export type SupplyComparison = { text: string; over: boolean } | null;

/** 「12 / 23日」「24 / 23日」（超過は over: true。警告表示のみ） */
export function compareWithSupply(usageDays: number, daysPerMonth: number | null): SupplyComparison {
  if (daysPerMonth === null) return null;
  return { text: `${usageDays} / ${daysPerMonth}日`, over: usageDays > daysPerMonth };
}
