// 利用者カルテのFirestoreアクセス（基本情報・保護者・契約・学校・相談支援）。
//
// 既存の利用者doc（tenants/{tenantId}/beneficiaries/{beneficiaryId}）を読み、
// カルテの各マップ（personal / guardian / contract / school / consultationSupport）だけを
// updateDoc で更新する。受給者証まわりのフィールド（summary / currentCertificateId /
// certificateCount / certType / pages）には書き込まない。
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
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

export type BeneficiaryChart = {
  record: BeneficiaryRecord;
  sections: BeneficiaryChartSections;
};

// 現在の受給者証の有効期間（一覧・カルテ上部の状態表示用）
export type CurrentCertificateValidity = {
  certificateId: string;
  validFrom: string | null;
  validTo: string | null;
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

/**
 * 現在の受給者証の有効期間を読む。受給者証が無い利用者は null。
 * - 旧データ（利用者doc直下の受給者証）は既存と同じ extractValidity で求める
 * - 受給者証docが読めない場合も「受給者証はある・期限は不明」として扱い、画面を止めない
 */
export async function getCurrentCertificateValidity(
  tenantId: string,
  record: BeneficiaryRecord
): Promise<CurrentCertificateValidity | null> {
  if (record.hasLegacyCertificate) {
    return { certificateId: "legacy", ...extractValidity(record.pages) };
  }
  const certificateId = record.currentCertificateId;
  if (!certificateId) return null;

  try {
    const snap = await getDoc(
      doc(db, "tenants", tenantId, "beneficiaries", record.id, "certificates", certificateId)
    );
    const data = snap.exists() ? snap.data() : {};
    return {
      certificateId,
      validFrom: typeof data.validFrom === "string" ? data.validFrom : null,
      validTo: typeof data.validTo === "string" ? data.validTo : null,
    };
  } catch {
    return { certificateId, validFrom: null, validTo: null };
  }
}

export type BeneficiaryChartRow = BeneficiaryChart & {
  currentCertificate: CurrentCertificateValidity | null;
};

/**
 * 利用者一覧（カルテの情報と、現在の受給者証の有効期間つき）。
 * 並び順・取得条件は既存の listBeneficiaries と同じ（updatedAt の新しい順）。
 * 1事業所あたりの利用者数（数十〜百件程度）を前提に、現在の受給者証は利用者ごとに1件ずつ読む。
 */
export async function listBeneficiaryChartRows(tenantId: string): Promise<BeneficiaryChartRow[]> {
  const snap = await getDocs(
    query(collection(db, "tenants", tenantId, "beneficiaries"), orderBy("updatedAt", "desc"))
  );
  const charts = snap.docs.map((d) => toChart(d.id, d.data()));
  return Promise.all(
    charts.map(async (chart) => ({
      ...chart,
      currentCertificate: await getCurrentCertificateValidity(tenantId, chart.record),
    }))
  );
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
  await updateDoc(beneficiaryRef(tenantId, record.id), {
    ...buildPersonalUpdate({ personal, grade, currentProfile: record.profile }),
    updatedBy: actorOf(user),
    updatedAt: serverTimestamp(),
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
  await updateDoc(beneficiaryRef(tenantId, beneficiaryId), {
    ...buildSectionUpdate(key, value),
    updatedBy: actorOf(user),
    updatedAt: serverTimestamp(),
  });
}
