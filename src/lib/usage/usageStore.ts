// 利用記録（予定 → 実績）の Firestore アクセス。判定・計算は src/lib/usage の純粋関数に任せ、ここでは読み書きだけを行う。
//
// 保存先：tenants/{tenantId}/usageRecords/{date}_{beneficiaryId}
// 読み取りはすべて等価条件のみ（date == / yearMonth == / yearMonth == かつ beneficiaryId ==）で、
// 複合インデックスを必要としない（並び替えは画面側で行う。1日・1か月の件数は小さい）。
//
// usagePlan（基本の利用曜日）は利用者doc に追加するマップ。保存時は usagePlan だけを部分更新し、
// 利用者doc 自体の updatedAt は変えない（利用者一覧の並び順＝最近更新した利用者 を、曜日の変更で動かさないため）。
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeBeneficiaryData } from "@/app/t/[tenantId]/lib/firestore/beneficiaries";
import { readChartSections, resolveChartIdentity } from "@/lib/beneficiaryChart/model";
import {
  readUsageRecord,
  toUsageRecordFields,
  USAGE_RECORDS_COLLECTION,
  usageRecordId,

  type UsageActor,
  type UsageRecord,
} from "./model";
import { applyUsageAction, canDeleteUsageRecord, canMoveUsageRecordDate, UsageTransitionError, type UsageAction } from "./transitions";
import { buildMonthPlan, readUsagePlan, sanitizeUsagePlan, validateUsagePlan, type MonthPlanResult, type PlanTarget, type UsagePlan } from "./plan";
import { daysPerMonthFromCertificate } from "./summary";

function recordsCollection(tenantId: string) {
  return collection(db, "tenants", tenantId, USAGE_RECORDS_COLLECTION);
}

function recordRef(tenantId: string, id: string) {
  return doc(db, "tenants", tenantId, USAGE_RECORDS_COLLECTION, id);
}

/** 記録した人。LINE スタッフは displayName（スタッフ氏名）、管理Webはメールアドレスを表示名にする */
export function usageActorOf(user: User): UsageActor {
  const name = (user.displayName || user.email || "").slice(0, 100);
  return { uid: user.uid, email: user.email ?? null, name };
}

function toRecords(snap: { docs: { id: string; data(): unknown }[] }): UsageRecord[] {
  return snap.docs.flatMap((d) => {
    const r = readUsageRecord(d.id, d.data());
    return r ? [r] : [];
  });
}

/** ある日の記録（全員分）を購読する。管理Web・LINE の「今日の利用」で、他の端末での記録をすぐ反映するため */
export function subscribeUsageRecordsByDate(
  tenantId: string,
  date: string,
  onNext: (records: UsageRecord[]) => void,
  onError: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    query(recordsCollection(tenantId), where("date", "==", date)),
    (snap) => onNext(toRecords(snap)),
    onError
  );
}

/** ある月の記録（全員分）を購読する（月間予定表） */
export function subscribeUsageRecordsByMonth(
  tenantId: string,
  yearMonth: string,
  onNext: (records: UsageRecord[]) => void,
  onError: (e: unknown) => void
): Unsubscribe {
  return onSnapshot(
    query(recordsCollection(tenantId), where("yearMonth", "==", yearMonth)),
    (snap) => onNext(toRecords(snap)),
    onError
  );
}

export async function listUsageRecordsByDate(tenantId: string, date: string): Promise<UsageRecord[]> {
  return toRecords(await getDocs(query(recordsCollection(tenantId), where("date", "==", date))));
}

export async function listUsageRecordsByMonth(tenantId: string, yearMonth: string): Promise<UsageRecord[]> {
  return toRecords(await getDocs(query(recordsCollection(tenantId), where("yearMonth", "==", yearMonth))));
}

/** 利用者×月（等価条件2つ。単一フィールドのインデックスの組み合わせで動き、複合インデックスは不要） */
export async function listUsageRecordsForBeneficiary(
  tenantId: string,
  beneficiaryId: string,
  yearMonth: string
): Promise<UsageRecord[]> {
  const snap = await getDocs(
    query(recordsCollection(tenantId), where("yearMonth", "==", yearMonth), where("beneficiaryId", "==", beneficiaryId))
  );
  return toRecords(snap);
}

/**
 * 1件に操作を適用して保存する（来所・退所・欠席・キャンセル・予定の追加・時刻の編集 など）。
 * 最新のdocを読んでから遷移の可否を判定するため、トランザクションで行う（複数の端末で同時に押しても矛盾しない）。
 * @return 保存後の記録（削除した場合は null）
 */
export async function applyUsageRecordAction(params: {
  tenantId: string;
  beneficiaryId: string;
  date: string;
  action: UsageAction;
  user: User;
  now?: Date;
}): Promise<UsageRecord | null> {
  const { tenantId, beneficiaryId, date, action, user } = params;
  const id = usageRecordId(date, beneficiaryId);
  const ref = recordRef(tenantId, id);
  const actor = usageActorOf(user);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? readUsageRecord(id, snap.data()) : null;
    const result = applyUsageAction(current, action, { beneficiaryId, date, actor, now: params.now ?? new Date() });

    if (result.kind === "delete") {
      tx.delete(ref);
      return null;
    }
    const fields = toUsageRecordFields(result.fields);
    if (!current) {
      tx.set(ref, { ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      // createdAt は既存の値のまま（Rules で変更不可）。マップ（planned / actual / absence）は丸ごと置き換える
      tx.update(ref, { ...fields, updatedAt: serverTimestamp() });
    }
    return { ...result.fields, id, createdAt: snap.exists() ? snap.data()?.createdAt ?? null : null, updatedAt: null };
  });
}

/** 予定の削除（誤登録の修正）。予定・キャンセルのみ */
export async function deleteUsageRecord(params: { tenantId: string; record: UsageRecord }): Promise<void> {
  const ref = recordRef(params.tenantId, params.record.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const current = readUsageRecord(params.record.id, snap.data());
    if (!current || !canDeleteUsageRecord(current)) {
      throw new UsageTransitionError("来所・欠席の記録は削除できません。状態を「予定」に戻してから削除してください。");
    }
    tx.delete(ref);
  });
}

/**
 * 予定の日付を変える（予定のままの記録のみ）。IDに日付を含むため、新しい日のdocを作って元のdocを消す。
 * 移動先の日に同じ利用者の記録が既にある場合はエラー（上書きしない）。
 */
export async function moveUsageRecordDate(params: {
  tenantId: string;
  record: UsageRecord;
  newDate: string;
  planned: { startTime: string; endTime: string };
  user: User;
}): Promise<UsageRecord> {
  const { tenantId, record, newDate, planned, user } = params;
  const actor = usageActorOf(user);
  const newId = usageRecordId(newDate, record.beneficiaryId);
  const oldRef = recordRef(tenantId, record.id);
  const newRef = recordRef(tenantId, newId);

  return runTransaction(db, async (tx) => {
    const [oldSnap, newSnap] = await Promise.all([tx.get(oldRef), tx.get(newRef)]);
    const current = oldSnap.exists() ? readUsageRecord(record.id, oldSnap.data()) : null;
    if (!current) throw new UsageTransitionError("予定が見つかりません。画面を更新してください。");
    if (!canMoveUsageRecordDate(current)) {
      throw new UsageTransitionError("来所・欠席・キャンセルの記録は日付を変えられません。");
    }
    if (newSnap.exists()) throw new UsageTransitionError("移動先の日には、すでにこの利用者の予定・記録があります。");

    // 新しい日の予定として作り直す（時刻の検証は applyUsageAction に任せる）
    const created = applyUsageAction(null, { type: "schedule", planned, origin: current.origin === "pattern" ? "pattern" : "manual" }, {
      beneficiaryId: record.beneficiaryId,
      date: newDate,
      actor,
      now: new Date(),
    });
    if (created.kind !== "write") throw new UsageTransitionError("予定を移動できませんでした。");
    const fields = toUsageRecordFields({ ...created.fields, note: current.note });
    tx.set(newRef, { ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.delete(oldRef);
    return { ...fields, id: newId, createdAt: null, updatedAt: null };
  });
}

// ===== 月の予定の一括作成 =====

const BATCH_LIMIT = 400;

/**
 * 基本の利用曜日から月の予定を作る。既に記録がある日は作らない（buildMonthPlan）。
 * 書き込みは「作成」のみで、万一その間に他の画面で同じ日の記録が作られていた場合は Rules が上書きを拒否する
 * （作成日時が変わる書き込みは不可）。決定的IDなので、失敗しても再実行すれば残りだけが作られる。
 */
export async function generateMonthPlan(params: {
  tenantId: string;
  yearMonth: string;
  targets: readonly PlanTarget[];
  user: User;
  fromDate?: string;
}): Promise<MonthPlanResult> {
  const { tenantId, yearMonth, targets, user, fromDate } = params;
  const existing = await listUsageRecordsByMonth(tenantId, yearMonth);
  const plan = buildMonthPlan({ yearMonth, targets, existingIds: new Set(existing.map((r) => r.id)), fromDate });
  const actor = usageActorOf(user);
  const now = new Date();

  for (let i = 0; i < plan.records.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const r of plan.records.slice(i, i + BATCH_LIMIT)) {
      const result = applyUsageAction(null, { type: "schedule", planned: r.planned, origin: "pattern" }, {
        beneficiaryId: r.beneficiaryId,
        date: r.date,
        actor,
        now,
      });
      if (result.kind !== "write") continue;
      batch.set(recordRef(tenantId, r.id), {
        ...toUsageRecordFields(result.fields),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return plan;
}

// ===== 基本の利用曜日（usagePlan） =====

export async function saveUsagePlan(params: {
  tenantId: string;
  beneficiaryId: string;
  plan: UsagePlan;
  user: User;
}): Promise<UsagePlan> {
  const error = validateUsagePlan(params.plan);
  if (error) throw new UsageTransitionError(error);
  const plan = sanitizeUsagePlan(params.plan);
  await updateDoc(doc(db, "tenants", params.tenantId, "beneficiaries", params.beneficiaryId), {
    usagePlan: { ...plan, updatedBy: usageActorOf(params.user), updatedAt: serverTimestamp() },
  });
  return plan;
}

// ===== 予定・実績の画面で使う利用者の一覧 =====

export type UsageBeneficiary = {
  id: string;
  name: string;
  furigana: string;
  grade: string;
  /** personal.usageStatus（"" = 未設定） */
  usageStatus: string;
  /** 旧来の status（active / inactive） */
  legacyStatus: string;
  plan: UsagePlan;
  hasCertificate: boolean;
  /** 現在の受給者証の有効期限（"YYYY-MM-DD"）。不明・未登録は null */
  certificateValidTo: string | null;
  /** 支給量（日/月）。通所受給者証から読めた場合のみ（withCertificate: true のとき） */
  daysPerMonth: number | null;
};

/** 予定を入れる対象として通常表示する利用者か（休止・利用終了・利用停止は既定で隠す） */
export function isActiveForUsage(b: Pick<UsageBeneficiary, "usageStatus" | "legacyStatus">): boolean {
  return b.legacyStatus !== "inactive" && b.usageStatus !== "suspended" && b.usageStatus !== "ended";
}

export function toPlanTarget(b: UsageBeneficiary): PlanTarget {
  return { beneficiaryId: b.id, plan: b.plan, usageStatus: b.usageStatus, legacyStatus: b.legacyStatus };
}

function compareBeneficiary(a: UsageBeneficiary, b: UsageBeneficiary): number {
  return (a.furigana || a.name).localeCompare(b.furigana || b.name, "ja");
}

/**
 * 事業所の利用者（氏名・学年・基本の曜日、必要なら現在の受給者証の期限・支給量）。
 * 1事業所あたり数十〜百人の前提で全件読む（利用者一覧と同じ考え方）。
 */
async function toUsageBeneficiary(
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
  withCertificate: boolean,
  today: Date
): Promise<UsageBeneficiary> {
  const record = normalizeBeneficiaryData(id, data);
  const sections = readChartSections(data);
  const identity = resolveChartIdentity(record, sections, today);
  let certificateValidTo: string | null = null;
  let daysPerMonth: number | null = null;
  if (withCertificate && record.currentCertificateId && !record.hasLegacyCertificate) {
    try {
      const cert = await getDoc(doc(db, "tenants", tenantId, "beneficiaries", id, "certificates", record.currentCertificateId));
      const c = cert.exists() ? cert.data() : {};
      certificateValidTo = typeof c.validTo === "string" ? c.validTo : null;
      daysPerMonth = daysPerMonthFromCertificate(String(c.certType ?? ""), Array.isArray(c.pages) ? c.pages : []);
    } catch {
      // 受給者証が読めなくても予定の画面は止めない（支給量の比較を出さないだけ）
    }
  }
  return {
    id,
    name: identity.name,
    furigana: identity.furigana,
    grade: identity.grade,
    usageStatus: sections.personal.usageStatus,
    legacyStatus: record.status,
    plan: readUsagePlan(data),
    hasCertificate: !!record.currentCertificateId || record.hasLegacyCertificate,
    certificateValidTo,
    daysPerMonth,
  };
}

/**
 * 事業所の利用者（氏名・学年・基本の曜日、必要なら現在の受給者証の期限・支給量）。
 * 1事業所あたり数十〜百人の前提で全件読む（利用者一覧と同じ考え方）。
 */
export async function listUsageBeneficiaries(
  tenantId: string,
  options: { withCertificate?: boolean } = {}
): Promise<UsageBeneficiary[]> {
  const snap = await getDocs(collection(db, "tenants", tenantId, "beneficiaries"));
  const today = new Date();
  const list = await Promise.all(
    snap.docs.map((d) => toUsageBeneficiary(tenantId, d.id, d.data(), !!options.withCertificate, today))
  );
  return list.sort(compareBeneficiary);
}

/** 1人分（カルテの利用予定タブ用。受給者証の支給量つき）。見つからなければ null */
export async function getUsageBeneficiary(tenantId: string, beneficiaryId: string): Promise<UsageBeneficiary | null> {
  const snap = await getDoc(doc(db, "tenants", tenantId, "beneficiaries", beneficiaryId));
  if (!snap.exists()) return null;
  return toUsageBeneficiary(tenantId, snap.id, snap.data(), true, new Date());
}

/** 月の予定作成の結果メッセージ */
export function monthPlanResultMessage(result: MonthPlanResult, yearMonth: string): string {
  const [, m] = yearMonth.split("-").map(Number);
  const parts = [`${m}月の予定を${result.records.length}件作成しました。`];
  if (result.existingCount > 0) parts.push(`すでに予定・記録がある${result.existingCount}件はそのままにしました。`);
  return parts.join("");
}


