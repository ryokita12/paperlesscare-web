// 利用者カルテのFirestoreアクセス（基本情報・保護者・契約・学校・相談支援）。
//
// 既存の利用者doc（tenants/{tenantId}/beneficiaries/{beneficiaryId}）を読み、
// カルテの各マップ（personal / guardian / contract / school / consultationSupport）だけを
// 部分更新する。受給者証まわりのフィールド（summary / currentCertificateId /
// certificateCount / certType / pages）には書き込まない。
// Phase 1-B7 の受給者証の反映候補（applyCertificateReview）も同じで、証doc には chartReview だけを書く。
//
// Phase 1-C：カルテの値が変わる保存（編集・受給者証からの反映）では、同じトランザクションで
// 変更履歴 chartHistory/{id} を1件作り、利用者doc の lastChartHistoryId にそのIDを入れる
// （firestore.rules が「同じ書き込みで利用者doc も更新した履歴」だけを作成可能にするための目印）。
// 値が1つも変わらない保存では履歴を作らない。
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  normalizeBeneficiaryData,
  type BeneficiaryRecord,
} from "@/app/t/[tenantId]/lib/firestore/beneficiaries";
import { extractValidity } from "@/app/t/[tenantId]/lib/firestore/certificateModel";
import {
  buildPersonalUpdate,
  buildSectionUpdate,
  readChartSections,
  type BeneficiaryChartSections,
  type BeneficiaryPersonal,
  type ChartSectionKey,
} from "./model";
import {
  buildCertificateReview,
  buildChartFieldUpdates,
  buildReviewDecisions,
  planCertificateReview,
  type CertificateReview,
  type CertificateReviewCandidate,
  type ReviewTarget,
} from "./certificateReview";
import {
  buildChartHistoryRecord,
  CHART_HISTORY_COLLECTION,
  diffFieldUpdates,
  diffPersonalSave,
  diffSectionSave,
  readChartHistoryEntry,
  type ChartHistoryChange,
  type ChartHistoryEntry,
  type ChartHistorySource,
} from "./chartHistory";
import type { DocumentSubmissionInput } from "./documents";
import { listBeneficiaryDocuments } from "./documentsStore";

export type BeneficiaryChart = {
  record: BeneficiaryRecord;
  sections: BeneficiaryChartSections;
};

// 現在の受給者証の有効期間（一覧・カルテ上部の状態表示用）
export type CurrentCertificateValidity = {
  certificateId: string;
  validFrom: string | null;
  validTo: string | null;
  // Phase 1-C：カルテ反映候補（Phase 1-B7）のうち未確認の件数。tsusho 以外・旧データは 0
  pendingReviewCount: number;
};

function beneficiaryRef(tenantId: string, beneficiaryId: string) {
  return doc(db, "tenants", tenantId, "beneficiaries", beneficiaryId);
}

function actorOf(user: User) {
  return { uid: user.uid, email: user.email };
}

function toChart(id: string, data: Record<string, unknown>): BeneficiaryChart {
  return { record: normalizeBeneficiaryData(id, data), sections: readChartSections(data) };
}

export async function getBeneficiaryChart(
  tenantId: string,
  beneficiaryId: string
): Promise<BeneficiaryChart | null> {
  const snap = await getDoc(beneficiaryRef(tenantId, beneficiaryId));
  if (!snap.exists()) return null;
  return toChart(snap.id, snap.data());
}

function certificateRef(tenantId: string, beneficiaryId: string, certificateId: string) {
  return doc(db, "tenants", tenantId, "beneficiaries", beneficiaryId, "certificates", certificateId);
}

function asPages(value: unknown) {
  return Array.isArray(value) ? value : [];
}

/**
 * 現在の受給者証の有効期間（と、未確認のカルテ反映候補の件数）を読む。受給者証が無い利用者は null。
 * - 旧データ（利用者doc直下の受給者証）は既存と同じ extractValidity で求める
 * - 受給者証docが読めない場合も「受給者証はある・期限は不明」として扱い、画面を止めない
 * - 反映候補の件数は、受給者証タブの確認カードと同じ buildCertificateReview で数える（sections が無ければ 0）
 */
export async function getCurrentCertificateValidity(
  tenantId: string,
  record: BeneficiaryRecord,
  sections?: BeneficiaryChartSections
): Promise<CurrentCertificateValidity | null> {
  if (record.hasLegacyCertificate) {
    return { certificateId: "legacy", ...extractValidity(record.pages), pendingReviewCount: 0 };
  }
  const certificateId = record.currentCertificateId;
  if (!certificateId) return null;

  try {
    const snap = await getDoc(certificateRef(tenantId, record.id, certificateId));
    const data = snap.exists() ? snap.data() : {};
    return {
      certificateId,
      validFrom: typeof data.validFrom === "string" ? data.validFrom : null,
      validTo: typeof data.validTo === "string" ? data.validTo : null,
      pendingReviewCount: sections ? countPendingReview(record, sections, data) : 0,
    };
  } catch {
    return { certificateId, validFrom: null, validTo: null, pendingReviewCount: 0 };
  }
}

function countPendingReview(
  record: BeneficiaryRecord,
  sections: BeneficiaryChartSections,
  cert: Record<string, unknown>
): number {
  return buildCertificateReview({
    certType: String(cert.certType ?? ""),
    pages: asPages(cert.pages),
    record,
    sections,
    chartReview: cert.chartReview,
  }).candidates.length;
}

/**
 * 書類の提出状態（要対応の判定用）。読み込めなかった場合は null（書類の要対応を出さないだけで、画面は止めない）。
 */
export async function getDocumentSubmissions(
  tenantId: string,
  beneficiaryId: string
): Promise<DocumentSubmissionInput[] | null> {
  try {
    const docs = await listBeneficiaryDocuments(tenantId, beneficiaryId);
    return docs.map((d) => ({ type: d.type, status: d.status }));
  } catch {
    return null;
  }
}

export type BeneficiaryChartRow = BeneficiaryChart & {
  currentCertificate: CurrentCertificateValidity | null;
  // Phase 1-C：要対応の判定用（読み込めなかった場合は null）
  documents: DocumentSubmissionInput[] | null;
};

/**
 * 利用者一覧（カルテの情報と、現在の受給者証の有効期間・書類の提出状態つき）。
 * 並び順・取得条件は既存の listBeneficiaries と同じ（updatedAt の新しい順）。
 * 1事業所あたりの利用者数（数十〜百件程度）を前提に、現在の受給者証と書類は利用者ごとに読む。
 */
export async function listBeneficiaryChartRows(tenantId: string): Promise<BeneficiaryChartRow[]> {
  const snap = await getDocs(
    query(collection(db, "tenants", tenantId, "beneficiaries"), orderBy("updatedAt", "desc"))
  );
  const charts = snap.docs.map((d) => toChart(d.id, d.data()));
  return Promise.all(
    charts.map(async (chart) => {
      const [currentCertificate, documents] = await Promise.all([
        getCurrentCertificateValidity(tenantId, chart.record, chart.sections),
        getDocumentSubmissions(tenantId, chart.record.id),
      ]);
      return { ...chart, currentCertificate, documents };
    })
  );
}

// ===== カルテの変更履歴（Phase 1-C） =====

function chartHistoryCollection(tenantId: string, beneficiaryId: string) {
  return collection(db, "tenants", tenantId, "beneficiaries", beneficiaryId, CHART_HISTORY_COLLECTION);
}

/**
 * 利用者doc の更新と、変更があれば変更履歴の作成を、同じトランザクションで行う。
 * 変更が無い場合も利用者doc の更新（profile の写し・updatedAt 等）は従来どおり行い、履歴だけ作らない。
 */
function writeChartUpdate(params: {
  tx: Transaction;
  tenantId: string;
  benRef: DocumentReference;
  update: Record<string, unknown>;
  changes: readonly ChartHistoryChange[];
  source: ChartHistorySource;
  certificateId?: string;
  user: User;
}) {
  const { tx, tenantId, benRef, update, changes, source, certificateId, user } = params;
  const historyRef = changes.length > 0 ? doc(chartHistoryCollection(tenantId, benRef.id)) : null;
  tx.update(benRef, {
    ...update,
    updatedBy: actorOf(user),
    updatedAt: serverTimestamp(),
    ...(historyRef ? { lastChartHistoryId: historyRef.id } : {}),
  });
  if (historyRef) {
    tx.set(historyRef, {
      ...buildChartHistoryRecord({
        beneficiaryId: benRef.id,
        source,
        changes,
        certificateId,
        actor: { uid: user.uid, email: user.email, displayName: user.displayName ?? "" },
      }),
      createdAt: serverTimestamp(),
    });
  }
}

async function readBeneficiaryInTx(tx: Transaction, benRef: DocumentReference) {
  const snap = await tx.get(benRef);
  if (!snap.exists()) throw new Error("利用者が見つかりません。画面を再読み込みしてください。");
  return snap.data();
}

/** 変更履歴（新しい順）。max 件まで */
export async function listChartHistory(
  tenantId: string,
  beneficiaryId: string,
  max: number
): Promise<ChartHistoryEntry[]> {
  const snap = await getDocs(
    query(chartHistoryCollection(tenantId, beneficiaryId), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map((d) => readChartHistoryEntry(d.id, d.data({ serverTimestamps: "estimate" })));
}

/** 本人情報（＋手動の学年・既存画面向けの profile の写し）を保存する */
export async function saveChartPersonal(params: {
  tenantId: string;
  record: BeneficiaryRecord;
  personal: BeneficiaryPersonal;
  grade: string;
  user: User;
}): Promise<void> {
  const { tenantId, record, personal, grade, user } = params;
  const benRef = beneficiaryRef(tenantId, record.id);
  await runTransaction(db, async (tx) => {
    const raw = await readBeneficiaryInTx(tx, benRef);
    // profile.birthday の引き継ぎは、画面の値ではなく保存直前に読み直した値を使う
    const latest = normalizeBeneficiaryData(record.id, raw);
    writeChartUpdate({
      tx,
      tenantId,
      benRef,
      update: buildPersonalUpdate({ personal, grade, currentProfile: latest.profile }),
      changes: diffPersonalSave({ before: readChartSections(raw), personal, grade }),
      source: "chartEdit",
      user,
    });
  });
}

/** 保護者・契約・学校・相談支援のいずれかのセクションを保存する */
export async function saveChartSection<K extends Exclude<ChartSectionKey, "personal">>(params: {
  tenantId: string;
  beneficiaryId: string;
  key: K;
  value: BeneficiaryChartSections[K];
  user: User;
}): Promise<void> {
  const { tenantId, beneficiaryId, key, value, user } = params;
  const benRef = beneficiaryRef(tenantId, beneficiaryId);
  await runTransaction(db, async (tx) => {
    const raw = await readBeneficiaryInTx(tx, benRef);
    writeChartUpdate({
      tx,
      tenantId,
      benRef,
      update: buildSectionUpdate(key, value),
      changes: diffSectionSave({ before: readChartSections(raw), key, value }),
      source: "chartEdit",
      user,
    });
  });
}

// ===== 受給者証（tsusho）の内容をカルテへ反映する確認（Phase 1-B7） =====

/**
 * 現在の受給者証と現在のカルテを読み、確認画面に出す反映候補を作る。
 * 現在の証でない・tsusho でない・未確認の候補が無い場合は候補 0 件。
 */
export async function getCertificateReview(params: {
  tenantId: string;
  beneficiaryId: string;
  certificateId: string;
}): Promise<CertificateReview> {
  const { tenantId, beneficiaryId, certificateId } = params;
  const [snap, certSnap] = await Promise.all([
    getDoc(beneficiaryRef(tenantId, beneficiaryId)),
    getDoc(certificateRef(tenantId, beneficiaryId, certificateId)),
  ]);
  const raw = snap.exists() ? snap.data() : null;
  const cert = certSnap.exists() ? certSnap.data() : null;
  const isCurrent = raw?.currentCertificateId === certificateId;
  return buildCertificateReview({
    certType: raw && cert && isCurrent ? String(cert.certType ?? "") : "",
    pages: asPages(cert?.pages),
    record: normalizeBeneficiaryData(beneficiaryId, raw ?? {}),
    sections: readChartSections(raw ?? {}),
    chartReview: cert?.chartReview,
  });
}

export type CertificateReviewResult = {
  applied: ReviewTarget[];
  dismissed: ReviewTarget[];
  /** 確認画面を開いたあとに別の操作でカルテ（または証）が変わったため、反映しなかった項目 */
  stale: ReviewTarget[];
};

export class CertificateReviewOutdatedError extends Error {
  constructor() {
    super("この受給者証は現在の受給者証ではなくなりました。最新の情報を確認してください。");
    this.name = "CertificateReviewOutdatedError";
  }
}

/**
 * 確認画面で選んだ内容を反映する（mode "apply"）か、すべて反映しない（mode "dismiss"）。
 * 1つのトランザクションで：
 *   - 利用者doc と証doc を読み直し、表示時から値が変わった項目は反映も記録もしない（stale）
 *   - 反映する項目だけをフィールドパスで更新（personal / guardian / consultationSupport を丸ごと置き換えない）
 *     personal の氏名・フリガナ・生年月日は profile の同じ項目にも写す。summary・currentCertificateId には触れない
 *   - 証doc の chartReview に、反映 / 反映しないの判断を項目ごとに記録（証の pages・status 等には触れない）
 * 反映する項目が無い場合（「今回は反映しない」など）は利用者doc を更新しない。
 */
export async function applyCertificateReview(params: {
  tenantId: string;
  beneficiaryId: string;
  certificateId: string;
  shown: readonly CertificateReviewCandidate[];
  selected: ReadonlySet<ReviewTarget>;
  mode: "apply" | "dismiss";
  user: User;
}): Promise<CertificateReviewResult> {
  const { tenantId, beneficiaryId, certificateId, shown, mode, user } = params;
  const selected: ReadonlySet<ReviewTarget> = mode === "apply" ? params.selected : new Set();
  const benRef = beneficiaryRef(tenantId, beneficiaryId);
  const certRef = certificateRef(tenantId, beneficiaryId, certificateId);
  const actor = actorOf(user);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(benRef);
    const certSnap = await tx.get(certRef);
    if (!snap.exists() || !certSnap.exists()) throw new Error("利用者または受給者証が見つかりません");
    const raw = snap.data();
    const cert = certSnap.data();
    if (raw.currentCertificateId !== certificateId || cert.certType !== "tsusho") {
      throw new CertificateReviewOutdatedError();
    }

    const sections = readChartSections(raw);
    const plan = planCertificateReview({
      shown,
      selected,
      mode,
      latest: {
        certType: "tsusho",
        pages: asPages(cert.pages),
        record: normalizeBeneficiaryData(beneficiaryId, raw),
        sections,
      },
    });

    // 利用者doc の更新（カルテの項目＋profile の写し）と変更履歴（Phase 1-C）は writeChartUpdate で行う
    const fieldUpdates = buildChartFieldUpdates(plan.applied);
    if (Object.keys(fieldUpdates).length > 0) {
      writeChartUpdate({
        tx,
        tenantId,
        benRef,
        update: fieldUpdates,
        changes: diffFieldUpdates({ before: sections, updates: fieldUpdates }),
        source: "certificateReview",
        certificateId,
        user,
      });
    }

    const decisions = buildReviewDecisions(plan, selected);
    if (Object.keys(decisions).length > 0) {
      const reviewUpdates: Record<string, unknown> = {
        "chartReview.sourceCertificateId": certificateId,
        "chartReview.reviewedAt": serverTimestamp(),
        "chartReview.reviewedBy": actor,
      };
      const existing = cert.chartReview as { createdAt?: unknown } | undefined;
      if (!existing?.createdAt) reviewUpdates["chartReview.createdAt"] = serverTimestamp();
      for (const [key, decision] of Object.entries(decisions)) {
        reviewUpdates[`chartReview.decisions.${key}`] = { ...decision, at: serverTimestamp(), by: actor };
      }
      tx.update(certRef, reviewUpdates);
    }

    return {
      applied: plan.applied.map((c) => c.target),
      dismissed: plan.dismissed.map((c) => c.target),
      stale: plan.stale.map((c) => c.target),
    };
  });
}
