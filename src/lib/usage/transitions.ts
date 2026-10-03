// 利用記録の状態遷移（Firebase非依存の純粋ロジック）。
//
// 画面（管理Web・LINE）は「どの操作ができるか」「操作した結果どう保存するか」をここだけで決める。
//
//   (なし) ──予定追加──▶ 予定(scheduled) ──来所──▶ 来所(attended) ──退所──▶ 来所＋退所時刻（画面上は「退所」）
//     │                   │  ├──欠席──▶ 欠席(absent) ──来所（遅れて来た）──▶ 来所
//     │                   │  └─キャンセル─▶ キャンセル(cancelled) ──予定に戻す──▶ 予定
//     └──予定外の来所──▶ 来所（origin: walkIn）
//   取り消し：来所→予定（予定外の来所は記録ごと削除）、欠席→予定、退所→来所
//
// キャンセル（予定そのものの取消）と欠席（予定はあったが休んだ）は、時刻などで自動判定せずスタッフが選ぶ。
// 来所・退所の時刻は、操作した実際の時刻（日本時間・1分単位）を記録する（15分などに丸めない）。
import {
  ABSENCE_REASON_MAX_LENGTH,
  EMPTY_ABSENCE,
  EMPTY_ACTUAL,
  NOTE_MAX_LENGTH,
  STATUS_LOG_MAX_ENTRIES,
  usageRecordId,
  yearMonthOf,
  type UsageActor,
  type UsageActual,
  type UsagePlannedTime,
  type UsageRecord,
  type UsageRecordFields,
  type UsageRecordOrigin,
  type UsageRecordStatus,
} from "./model.ts";
import { isIsoDate } from "../beneficiaryChart/dates.ts";
import { isTimeText, parseTime, toJapanTimeText, TIME_RANGE_ERROR_MESSAGES, validateTimeRange } from "./time.ts";

export type UsageAction =
  | { type: "schedule"; planned: UsagePlannedTime; origin?: Exclude<UsageRecordOrigin, "walkIn"> }
  // time を省略すると「今」（日本時間・1分単位）。当日以外の日をあとから記録する場合は明示する（"" = 時刻不明）
  | { type: "walkIn"; time?: string }
  | { type: "attend"; time?: string }
  | { type: "depart"; time?: string }
  | { type: "absent"; reason?: string }
  | { type: "cancel" }
  | { type: "undoAttend" }
  | { type: "undoDepart" }
  | { type: "undoAbsent" }
  | { type: "restore" }
  | { type: "editPlanned"; planned: UsagePlannedTime }
  | { type: "editActual"; actual: Partial<UsageActual> }
  | { type: "editAbsence"; reason: string; contactedAt?: string }
  | { type: "editNote"; note: string };

export type UsageActionType = UsageAction["type"];

export type UsageActionContext = {
  beneficiaryId: string;
  date: string;
  actor: UsageActor;
  now: Date;
};

export type UsageActionResult = { kind: "write"; fields: UsageRecordFields } | { kind: "delete" };

export class UsageTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageTransitionError";
  }
}

/** 状態を変える操作の遷移表（from → この操作ができるか） */
const STATUS_ACTIONS: Record<UsageRecordStatus, readonly UsageActionType[]> = {
  scheduled: ["attend", "absent", "cancel", "editPlanned", "editNote"],
  attended: ["depart", "undoDepart", "undoAttend", "absent", "editActual", "editPlanned", "editNote"],
  absent: ["attend", "undoAbsent", "editAbsence", "editPlanned", "editNote"],
  cancelled: ["restore", "schedule", "editPlanned", "editNote"],
};

/** 記録が無い日にできる操作 */
const CREATE_ACTIONS: readonly UsageActionType[] = ["schedule", "walkIn"];

/** その記録（無ければ null）に対して、操作ができるか。退所済み・未退所の区別も含めて判定する */
export function canApplyUsageAction(record: Pick<UsageRecord, "status" | "actual"> | null, type: UsageActionType): boolean {
  if (!record) return CREATE_ACTIONS.includes(type);
  if (!STATUS_ACTIONS[record.status].includes(type)) return false;
  if (type === "depart") return !record.actual.endTime;
  if (type === "undoDepart") return !!record.actual.endTime;
  return true;
}

function nextLog(record: UsageRecord | null, to: UsageRecordStatus, ctx: UsageActionContext) {
  const log = record ? [...record.statusLog] : [];
  const from = record ? record.status : null;
  if (from === to) return log;
  log.push({ from, to, at: ctx.now.toISOString(), by: { uid: ctx.actor.uid, name: ctx.actor.name } });
  return log.slice(-STATUS_LOG_MAX_ENTRIES);
}

function checkPlanned(planned: UsagePlannedTime): UsagePlannedTime {
  const error = validateTimeRange(planned);
  if (error) throw new UsageTransitionError(TIME_RANGE_ERROR_MESSAGES[error]);
  return { startTime: planned.startTime, endTime: planned.endTime };
}

function trimText(value: string, max: number, label: string): string {
  const text = (value ?? "").trim();
  if (text.length > max) throw new UsageTransitionError(`${label}は${max}文字以内で入力してください。`);
  return text;
}

function baseFields(ctx: UsageActionContext, origin: UsageRecordOrigin, status: UsageRecordStatus): UsageRecordFields {
  return {
    beneficiaryId: ctx.beneficiaryId,
    date: ctx.date,
    yearMonth: yearMonthOf(ctx.date),
    status,
    origin,
    planned: { startTime: "", endTime: "" },
    actual: { ...EMPTY_ACTUAL },
    absence: { ...EMPTY_ABSENCE },
    note: "",
    statusLog: [],
    createdBy: { ...ctx.actor },
    updatedBy: { ...ctx.actor },
  };
}

function fromRecord(record: UsageRecord, ctx: UsageActionContext): UsageRecordFields {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = record;
  void _id;
  void _c;
  void _u;
  return { ...rest, actual: { ...rest.actual }, absence: { ...rest.absence }, planned: { ...rest.planned }, updatedBy: { ...ctx.actor } };
}

/** 実績の時刻（来所・退所）の妥当性。どちらも空か "HH:mm"、両方あるときは 来所 ≦ 退所 */
export function validateActualTimes(actual: Pick<UsageActual, "startTime" | "endTime">): string | null {
  if (actual.startTime && !isTimeText(actual.startTime)) return "来所時刻を「時:分」で入力してください。";
  if (actual.endTime && !isTimeText(actual.endTime)) return "退所時刻を「時:分」で入力してください。";
  if (!actual.startTime && actual.endTime) return "退所時刻を入れる場合は来所時刻も入力してください。";
  if (actual.startTime && actual.endTime && (parseTime(actual.endTime) as number) < (parseTime(actual.startTime) as number)) {
    return "退所時刻は来所時刻より後にしてください。";
  }
  return null;
}

/**
 * 操作を適用した後に保存する内容を返す（削除する場合は kind: "delete"）。
 * できない操作・不正な入力は UsageTransitionError（画面にそのまま出せる日本語のメッセージ）。
 */
export function applyUsageAction(
  record: UsageRecord | null,
  action: UsageAction,
  ctx: UsageActionContext
): UsageActionResult {
  if (!isIsoDate(ctx.date)) throw new UsageTransitionError("日付が正しくありません。");
  usageRecordId(ctx.date, ctx.beneficiaryId);
  if (record && (record.date !== ctx.date || record.beneficiaryId !== ctx.beneficiaryId)) {
    throw new UsageTransitionError("記録の日付・利用者が一致しません。");
  }
  if (!canApplyUsageAction(record, action.type)) {
    throw new UsageTransitionError(
      record ? "この状態ではその操作はできません。画面を更新してもう一度お試しください。" : "この日の記録が見つかりません。"
    );
  }

  const nowTime = toJapanTimeText(ctx.now);
  const timeOf = (time: string | undefined, allowEmpty: boolean): string => {
    if (time === undefined) return nowTime;
    if ((allowEmpty && time === "") || isTimeText(time)) return time;
    throw new UsageTransitionError("時刻を「時:分」で入力してください。");
  };

  if (!record) {
    if (action.type === "schedule") {
      const fields = baseFields(ctx, action.origin ?? "manual", "scheduled");
      fields.planned = checkPlanned(action.planned);
      fields.statusLog = nextLog(null, "scheduled", ctx);
      return { kind: "write", fields };
    }
    // walkIn：予定に無い子が来た。来所時刻＝今
    const fields = baseFields(ctx, "walkIn", "attended");
    fields.actual = { ...EMPTY_ACTUAL, startTime: timeOf(action.type === "walkIn" ? action.time : undefined, true) };
    fields.statusLog = nextLog(null, "attended", ctx);
    return { kind: "write", fields };
  }

  const next = fromRecord(record, ctx);
  const setStatus = (to: UsageRecordStatus) => {
    next.statusLog = nextLog(record, to, ctx);
    next.status = to;
  };

  switch (action.type) {
    case "attend":
      setStatus("attended");
      next.actual = { ...next.actual, startTime: timeOf(action.time, true), endTime: "" };
      next.absence = { ...EMPTY_ABSENCE };
      break;
    case "depart": {
      const endTime = timeOf(action.time, false);
      const start = parseTime(next.actual.startTime);
      const end = parseTime(endTime) as number;
      if (start !== null && end < start) {
        throw new UsageTransitionError("退所時刻が来所時刻より前になります。来所時刻を確認してください。");
      }
      next.actual = { ...next.actual, endTime };
      break;
    }
    case "absent":
      setStatus("absent");
      next.actual = { ...EMPTY_ACTUAL };
      next.absence = {
        reason: trimText(action.reason ?? "", ABSENCE_REASON_MAX_LENGTH, "欠席理由"),
        contactedAt: ctx.date,
      };
      break;
    case "cancel":
      setStatus("cancelled");
      break;
    case "undoAttend":
      // 予定外の来所は「予定」が無いので、取り消すと記録ごと消す
      if (record.origin === "walkIn") return { kind: "delete" };
      setStatus("scheduled");
      next.actual = { ...EMPTY_ACTUAL };
      break;
    case "undoDepart":
      next.actual = { ...next.actual, endTime: "" };
      break;
    case "undoAbsent":
      setStatus("scheduled");
      next.absence = { ...EMPTY_ABSENCE };
      break;
    case "restore":
      setStatus("scheduled");
      break;
    case "schedule":
      // キャンセルした日に、時刻を決め直して予定を入れ直す
      setStatus("scheduled");
      next.planned = checkPlanned(action.planned);
      break;
    case "editPlanned":
      next.planned = checkPlanned(action.planned);
      break;
    case "editActual": {
      const actual: UsageActual = { ...next.actual, ...action.actual };
      const error = validateActualTimes(actual);
      if (error) throw new UsageTransitionError(error);
      next.actual = {
        startTime: actual.startTime,
        endTime: actual.endTime,
        pickup: typeof actual.pickup === "boolean" ? actual.pickup : null,
        dropoff: typeof actual.dropoff === "boolean" ? actual.dropoff : null,
      };
      break;
    }
    case "editAbsence": {
      const contactedAt = action.contactedAt ?? next.absence.contactedAt;
      if (contactedAt && !isIsoDate(contactedAt)) throw new UsageTransitionError("欠席連絡日が正しくありません。");
      next.absence = {
        reason: trimText(action.reason, ABSENCE_REASON_MAX_LENGTH, "欠席理由"),
        contactedAt,
      };
      break;
    }
    case "editNote":
      next.note = trimText(action.note, NOTE_MAX_LENGTH, "メモ");
      break;
    case "walkIn":
      throw new UsageTransitionError("この日はすでに記録があります。");
  }

  return { kind: "write", fields: next };
}

/** 削除できる記録か（誤登録の修正用）：予定・キャンセルのみ。来所・欠席の記録は消さない（予定外の来所は「来所を取り消す」で消える） */
export function canDeleteUsageRecord(record: Pick<UsageRecord, "status">): boolean {
  return record.status === "scheduled" || record.status === "cancelled";
}

/** 予定の日付を変えられるか（予定のままの記録だけ。来所・欠席の記録は日付を動かさない） */
export function canMoveUsageRecordDate(record: Pick<UsageRecord, "status">): boolean {
  return record.status === "scheduled";
}
