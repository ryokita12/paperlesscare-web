// 基本の利用曜日（usagePlan）と、そこから月の予定を作る処理（Firebase非依存の純粋ロジック）。
//
// usagePlan は利用者doc（tenants/{t}/beneficiaries/{b}）に追加するマップ。テンプレートであり、それ自体は実績にならない。
//   usagePlan: { weekdays: [1, 3, 5], defaultStartTime: "14:00", defaultEndTime: "17:00", updatedBy, updatedAt }
// 「○月の予定を作成」で、対象の日に usageRecords（status: scheduled, origin: pattern）を作る：
//   - 既に記録がある日（予定・来所・欠席・キャンセルのどれでも）は作らない・上書きしない
//   - 決定的ID（{日付}_{利用者ID}）なので、何度実行しても重複しない
//   - 休止・利用終了（personal.usageStatus）、旧データの利用停止（status: inactive）の利用者は対象外
import { isIsoDate } from "../beneficiaryChart/dates.ts";
import { datesOfMonth, usageRecordId, weekdayOf } from "./model.ts";
import { isTimeText, TIME_RANGE_ERROR_MESSAGES, validateTimeRange } from "./time.ts";

export type UsagePlan = {
  weekdays: number[]; // 0=日 … 6=土（昇順・重複なし）
  defaultStartTime: string; // "HH:mm" または ""
  defaultEndTime: string;
};

export const EMPTY_USAGE_PLAN: UsagePlan = { weekdays: [], defaultStartTime: "", defaultEndTime: "" };

/** 利用者docの生データから usagePlan を取り出す（無い・不正なら空） */
export function readUsagePlan(beneficiaryData: unknown): UsagePlan {
  const doc = beneficiaryData && typeof beneficiaryData === "object" ? (beneficiaryData as Record<string, unknown>) : {};
  const raw = doc.usagePlan && typeof doc.usagePlan === "object" ? (doc.usagePlan as Record<string, unknown>) : {};
  const weekdays = Array.isArray(raw.weekdays)
    ? [...new Set(raw.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [];
  return {
    weekdays,
    defaultStartTime: isTimeText(raw.defaultStartTime) ? raw.defaultStartTime : "",
    defaultEndTime: isTimeText(raw.defaultEndTime) ? raw.defaultEndTime : "",
  };
}

/** 保存前の入力チェック。曜日を選んだ場合は標準時刻（開始 < 終了）が必要 */
export function validateUsagePlan(plan: UsagePlan): string | null {
  if (plan.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "曜日の指定が正しくありません。";
  const anyTime = plan.defaultStartTime || plan.defaultEndTime;
  if (plan.weekdays.length === 0 && !anyTime) return null;
  const error = validateTimeRange({ startTime: plan.defaultStartTime, endTime: plan.defaultEndTime });
  if (error) {
    return error === "order" ? TIME_RANGE_ERROR_MESSAGES.order : "標準の開始・終了時刻を「時:分」で入力してください。";
  }
  return null;
}

/** 保存する形に整える（曜日を昇順・重複なしに） */
export function sanitizeUsagePlan(plan: UsagePlan): UsagePlan {
  return {
    weekdays: [...new Set(plan.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b),
    defaultStartTime: plan.defaultStartTime,
    defaultEndTime: plan.defaultEndTime,
  };
}

/** 曜日の表示（例：「月・水・金」） */
export function formatWeekdays(weekdays: readonly number[]): string {
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  // 月曜始まりで並べる
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.filter((d) => weekdays.includes(d)).map((d) => labels[d]).join("・");
}

export type PlanTarget = {
  beneficiaryId: string;
  plan: UsagePlan;
  /** personal.usageStatus（""＝未設定は利用中として扱う） */
  usageStatus: string;
  /** 旧来の利用者doc の status（"inactive" は対象外） */
  legacyStatus: string;
};

export type PlanSkipReason = "suspended" | "ended" | "inactive" | "noWeekdays" | "invalidTime";

export const PLAN_SKIP_REASON_LABELS: Record<PlanSkipReason, string> = {
  suspended: "休止中",
  ended: "利用終了",
  inactive: "利用停止",
  noWeekdays: "基本の曜日が未設定",
  invalidTime: "標準時刻が未設定",
};

export type GeneratedPlanRecord = {
  id: string;
  beneficiaryId: string;
  date: string;
  planned: { startTime: string; endTime: string };
};

export type MonthPlanResult = {
  records: GeneratedPlanRecord[];
  skipped: { beneficiaryId: string; reason: PlanSkipReason }[];
  /** 既に記録があるため作らなかった件数 */
  existingCount: number;
};

/** 予定を自動で作らない理由（作る場合は null） */
export function planSkipReason(target: PlanTarget): PlanSkipReason | null {
  if (target.legacyStatus === "inactive") return "inactive";
  if (target.usageStatus === "suspended") return "suspended";
  if (target.usageStatus === "ended") return "ended";
  if (target.plan.weekdays.length === 0) return "noWeekdays";
  if (validateTimeRange({ startTime: target.plan.defaultStartTime, endTime: target.plan.defaultEndTime })) {
    return "invalidTime";
  }
  return null;
}

/**
 * 月の予定（作成するものだけ）を求める。
 * @param params.fromDate この日以降だけ作る（過去の日に「予定」を作って未処理を増やさないため。省略時は月初から）
 * @param params.existingIds 既に存在する記録のID（作らない・上書きしない）
 */
export function buildMonthPlan(params: {
  yearMonth: string;
  targets: readonly PlanTarget[];
  existingIds: ReadonlySet<string>;
  fromDate?: string;
}): MonthPlanResult {
  const { yearMonth, targets, existingIds } = params;
  const fromDate = params.fromDate && isIsoDate(params.fromDate) ? params.fromDate : "";
  const dates = datesOfMonth(yearMonth).filter((d) => !fromDate || d >= fromDate);

  const records: GeneratedPlanRecord[] = [];
  const skipped: MonthPlanResult["skipped"] = [];
  let existingCount = 0;
  const seen = new Set<string>();

  for (const target of targets) {
    if (seen.has(target.beneficiaryId)) continue;
    seen.add(target.beneficiaryId);

    const reason = planSkipReason(target);
    if (reason) {
      skipped.push({ beneficiaryId: target.beneficiaryId, reason });
      continue;
    }
    for (const date of dates) {
      if (!target.plan.weekdays.includes(weekdayOf(date))) continue;
      const id = usageRecordId(date, target.beneficiaryId);
      if (existingIds.has(id)) {
        existingCount += 1;
        continue;
      }
      records.push({
        id,
        beneficiaryId: target.beneficiaryId,
        date,
        planned: { startTime: target.plan.defaultStartTime, endTime: target.plan.defaultEndTime },
      });
    }
  }

  return { records, skipped, existingCount };
}
