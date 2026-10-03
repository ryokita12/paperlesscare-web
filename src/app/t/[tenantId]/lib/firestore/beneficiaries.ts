import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CertTypeId } from "../../constants/certPages";
import { isPage2, migrateLegacyPage2FormData } from "../compat/legacyPage2";
import {
  buildCertificateContent,
  buildSummary,
  EMPTY_PROFILE,
  EMPTY_SUMMARY,
  hasChartPersonal,
  hasLegacyCertificate,
  LEGACY_CERTIFICATE_ID,
  mergeSummary,
  profileFromSummary,
  resolveProfileOnCertificateAdd,
  type BeneficiaryProfile,
  type BeneficiarySummary,
  type CertificateSource,
  type CertificateStatus,
  type SavedCertPage,
} from "./certificateModel";
import { initialChartForNewBeneficiary } from "@/lib/tsusho/initialChart";

export type { BeneficiaryProfile, BeneficiarySummary, SavedCertPage };
export { LEGACY_CERTIFICATE_ID };

type Actor = { uid: string; email: string | null };

export type BeneficiaryRecord = {
  id: string;
  tenantId: string;
  profile: BeneficiaryProfile;
  summary: BeneficiarySummary;
  // 現在の受給者証ID。null = 受給者証未登録の利用者
  currentCertificateId: string | null;
  certificateCount: number;
  status: "active" | "inactive";
  // 現在の受給者証の種別（一覧表示用の写し）。受給者証未登録なら null
  certType: CertTypeId | null;
  // currentCertificateId 導入前の旧データの場合のみ true。
  // このとき certType / pages が旧構造の受給者証そのものを表す。
  hasLegacyCertificate: boolean;
  pages: SavedCertPage[];
  createdBy: Actor;
  createdAt: Timestamp | null;
  updatedBy: Actor;
  updatedAt: Timestamp | null;
};

export type CertificateRecord = {
  id: string;
  beneficiaryId: string;
  certType: CertTypeId;
  pages: SavedCertPage[];
  summary: BeneficiarySummary;
  issueDate: string;
  validFrom: string | null;
  validTo: string | null;
  status: CertificateStatus;
  supersededBy: string | null;
  source: CertificateSource;
  // サブコレクションにまだ保存されていない旧データ（利用者doc直下）を
  // 表示用に受給者証として見せている場合 true
  isLegacyVirtual: boolean;
  createdBy: Actor;
  createdAt: Timestamp | null;
  updatedBy: Actor;
  updatedAt: Timestamp | null;
};

function beneficiariesCollection(tenantId: string) {
  return collection(db, "tenants", tenantId, "beneficiaries");
}

function certificatesCollection(tenantId: string, beneficiaryId: string) {
  return collection(db, "tenants", tenantId, "beneficiaries", beneficiaryId, "certificates");
}

function actorOf(user: User): Actor {
  return { uid: user.uid, email: user.email };
}

// ページ2の1組目が旧フィールド（name/birthday/childName）に入っている場合は移送する
function normalizePages(pages: unknown): SavedCertPage[] {
  const list = Array.isArray(pages) ? (pages as SavedCertPage[]) : [];
  return list.map((page, index) => {
    if (!page?.formData || !isPage2(page.pageNo, index)) return page;
    return { ...page, formData: migrateLegacyPage2FormData(page.formData) };
  });
}

// Firestoreから読み出した利用者ドキュメントを、現行のデータ構造へ揃えてから返す。
// - currentCertificateId が無い旧データは、直下の certType / pages を legacy certificate とみなす
//   （certType が欠けている旧データは "adult"。child/mobility は当時まだ選べなかったため）
// - summary / pages / profile が欠けている不正データを既定値で補い、一覧・詳細画面が丸ごと落ちないようにする
// 利用者カルテ（src/lib/beneficiaryChart）からも同じ正規化を使うため export している（処理内容は変更なし）。
export function normalizeBeneficiaryData(
  id: string,
  data: Record<string, unknown>
): BeneficiaryRecord {
  const raw = data as Partial<BeneficiaryRecord> & { currentCertificateId?: string | null };
  const legacy = hasLegacyCertificate(raw);
  const summary = { ...EMPTY_SUMMARY, ...(raw.summary ?? {}) };

  return {
    id,
    tenantId: raw.tenantId ?? "",
    profile: { ...EMPTY_PROFILE, ...(raw.profile ?? profileFromSummary(summary)) },
    summary,
    currentCertificateId: raw.currentCertificateId ?? null,
    certificateCount: raw.certificateCount ?? (legacy ? 1 : 0),
    status: raw.status ?? "active",
    certType: raw.certType ?? (legacy ? "adult" : null),
    hasLegacyCertificate: legacy,
    pages: normalizePages(raw.pages),
    createdBy: raw.createdBy ?? { uid: "", email: null },
    createdAt: raw.createdAt ?? null,
    updatedBy: raw.updatedBy ?? { uid: "", email: null },
    updatedAt: raw.updatedAt ?? null,
  };
}

function normalizeCertificateData(
  id: string,
  beneficiaryId: string,
  data: Record<string, unknown>
): CertificateRecord {
  const raw = data as Partial<CertificateRecord>;
  return {
    id,
    beneficiaryId,
    certType: raw.certType ?? "adult",
    pages: normalizePages(raw.pages),
    summary: { ...EMPTY_SUMMARY, ...(raw.summary ?? {}) },
    issueDate: raw.issueDate ?? "",
    validFrom: raw.validFrom ?? null,
    validTo: raw.validTo ?? null,
    status: raw.status ?? "superseded",
    supersededBy: raw.supersededBy ?? null,
    source: raw.source ?? "web",
    isLegacyVirtual: false,
    createdBy: raw.createdBy ?? { uid: "", email: null },
    createdAt: raw.createdAt ?? null,
    updatedBy: raw.updatedBy ?? { uid: "", email: null },
    updatedAt: raw.updatedAt ?? null,
  };
}

// 旧データ（利用者doc直下の受給者証）を、表示用の受給者証レコードとして組み立てる
function legacyVirtualCertificate(record: BeneficiaryRecord): CertificateRecord {
  const content = buildCertificateContent({
    certType: record.certType ?? "adult",
    pages: record.pages,
  });
  return {
    id: LEGACY_CERTIFICATE_ID,
    beneficiaryId: record.id,
    ...content,
    status: "current",
    supersededBy: null,
    source: "legacy",
    isLegacyVirtual: true,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
  };
}

// 利用者ドキュメントIDをネットワーク不要でクライアント側に事前採番する。
// 取込中のページ画像を最初からこのIDに紐づくStorageパスへアップロードすることで、
// 保存後にファイルを移動させる必要をなくし、保存の再試行も安全（同一ID＝setで冪等）にする。
export function reserveBeneficiaryId(tenantId: string): string {
  return doc(beneficiariesCollection(tenantId)).id;
}

// 受給者証IDも同様に事前採番する（利用者IDが未確定でも採番できるよう、パスはダミーで良い）
export function reserveCertificateId(tenantId: string): string {
  return doc(certificatesCollection(tenantId, "_")).id;
}

// 受給者証ごとに別フォルダへ保存することで、更新時に以前の証の画像を上書きしない
export function certificatePageStoragePath(params: {
  tenantId: string;
  beneficiaryId: string;
  certificateId: string;
  pageNo: number;
}): string {
  const { tenantId, beneficiaryId, certificateId, pageNo } = params;
  return `tenants/${tenantId}/recipients/${beneficiaryId}/certificates/${certificateId}/page${pageNo}.jpg`;
}

export async function getBeneficiary(
  tenantId: string,
  beneficiaryId: string
): Promise<BeneficiaryRecord | null> {
  const snap = await getDoc(doc(beneficiariesCollection(tenantId), beneficiaryId));
  if (!snap.exists()) return null;
  return normalizeBeneficiaryData(snap.id, snap.data());
}

export async function listBeneficiaries(
  tenantId: string
): Promise<BeneficiaryRecord[]> {
  const q = query(
    beneficiariesCollection(tenantId),
    orderBy("updatedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeBeneficiaryData(d.id, d.data()));
}

/**
 * 利用者の受給者証一覧（現在の証が先頭、以降は登録日の新しい順）。
 * 旧データの利用者は、利用者doc直下の内容を現在の証として1件返す。
 */
export async function listCertificates(
  tenantId: string,
  beneficiary: BeneficiaryRecord
): Promise<CertificateRecord[]> {
  const snap = await getDocs(
    query(certificatesCollection(tenantId, beneficiary.id), orderBy("createdAt", "desc"))
  );
  const stored = snap.docs.map((d) =>
    normalizeCertificateData(d.id, beneficiary.id, d.data())
  );

  const all = beneficiary.hasLegacyCertificate
    ? [legacyVirtualCertificate(beneficiary), ...stored]
    : stored;

  const currentId = beneficiary.hasLegacyCertificate
    ? LEGACY_CERTIFICATE_ID
    : beneficiary.currentCertificateId;

  return [
    ...all.filter((c) => c.id === currentId),
    ...all.filter((c) => c.id !== currentId),
  ];
}

/**
 * 受給者証の取込から新規利用者を作成する。
 * 利用者doc＋受給者証docを1回のバッチで書き込み、currentCertificateId を設定する。
 * どちらのIDも事前採番済みのため、通信失敗後の再試行でも重複は生まれない。
 */
export async function createBeneficiaryWithCertificate(params: {
  tenantId: string;
  beneficiaryId: string;
  certificateId: string;
  certType: CertTypeId;
  pages: SavedCertPage[];
  source: CertificateSource;
  user: User;
}): Promise<string> {
  const { tenantId, beneficiaryId, certificateId, certType, pages, source, user } = params;
  const actor = actorOf(user);
  const content = buildCertificateContent({ certType, pages });

  const batch = writeBatch(db);

  batch.set(doc(beneficiariesCollection(tenantId), beneficiaryId), {
    tenantId,
    profile: profileFromSummary(content.summary),
    summary: content.summary,
    currentCertificateId: certificateId,
    certificateCount: 1,
    status: "active",
    certType,
    // 通所受給者証から作る新しい利用者だけ、利用者カルテ（personal＝児童・guardian＝通所給付決定保護者）の
    // 初期値を入れる。mobility / adult / child は従来どおり何も追加しない（空オブジェクト）。
    ...initialChartForNewBeneficiary(certType, pages),
    createdBy: actor,
    createdAt: serverTimestamp(),
    updatedBy: actor,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(certificatesCollection(tenantId, beneficiaryId), certificateId), {
    beneficiaryId,
    ...content,
    status: "current",
    supersededBy: null,
    source,
    createdBy: actor,
    createdAt: serverTimestamp(),
    updatedBy: actor,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return beneficiaryId;
}

/** 管理Webから、受給者証なしで利用者（枠）だけを作成する */
export async function createBeneficiaryWithoutCertificate(params: {
  tenantId: string;
  profile: BeneficiaryProfile;
  user: User;
}): Promise<string> {
  const { tenantId, profile, user } = params;
  const actor = actorOf(user);
  const beneficiaryId = reserveBeneficiaryId(tenantId);

  const batch = writeBatch(db);
  batch.set(doc(beneficiariesCollection(tenantId), beneficiaryId), {
    tenantId,
    profile,
    summary: { ...EMPTY_SUMMARY, ...profile },
    currentCertificateId: null,
    certificateCount: 0,
    status: "active",
    certType: null,
    createdBy: actor,
    createdAt: serverTimestamp(),
    updatedBy: actor,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return beneficiaryId;
}

/**
 * 既存利用者に新しい受給者証を登録し、現在の証を切り替える。
 * 以前の受給者証は削除・上書きせず status: "superseded" として残す。
 *
 * 1トランザクションで以下を行う：
 *   1. 新しい受給者証docを作成（status: current）
 *   2. 旧current証を superseded にし、supersededBy に新証IDを設定
 *      旧データ（利用者doc直下の受給者証）の場合は、ここで初めて
 *      certificates/legacy として保存してから superseded にする
 *   3. 利用者docの currentCertificateId / certType / summary / profile を新証の内容に更新
 * 現在の証を読んでから切り替えるため writeBatch ではなく runTransaction を使う。
 */
export async function addCertificateToBeneficiary(params: {
  tenantId: string;
  beneficiaryId: string;
  certificateId: string;
  certType: CertTypeId;
  pages: SavedCertPage[];
  source: CertificateSource;
  user: User;
}): Promise<void> {
  const { tenantId, beneficiaryId, certificateId, certType, pages, source, user } = params;
  const actor = actorOf(user);
  const content = buildCertificateContent({ certType, pages });
  const beneficiaryRef = doc(beneficiariesCollection(tenantId), beneficiaryId);
  const certs = certificatesCollection(tenantId, beneficiaryId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(beneficiaryRef);
    if (!snap.exists()) throw new Error("対象の利用者が見つかりません");

    const raw = snap.data() as Record<string, unknown> & {
      currentCertificateId?: string | null;
      certificateCount?: number;
    };
    const previousId = raw.currentCertificateId;

    // 前回の保存が実は成功していた場合の再試行。二重に切り替えない。
    if (previousId === certificateId) return;

    let addedCount = 1;

    if (hasLegacyCertificate(raw)) {
      // 旧データを受給者証として保存し直す（利用者doc直下の値は消さずに残す）
      const legacy = normalizeBeneficiaryData(snap.id, raw);
      tx.set(doc(certs, LEGACY_CERTIFICATE_ID), {
        beneficiaryId,
        ...buildCertificateContent({
          certType: legacy.certType ?? "adult",
          pages: legacy.pages,
        }),
        status: "superseded",
        supersededBy: certificateId,
        source: "legacy",
        createdBy: legacy.createdBy,
        createdAt: legacy.createdAt ?? serverTimestamp(),
        updatedBy: actor,
        updatedAt: serverTimestamp(),
      });
      addedCount = 2;
    } else if (previousId) {
      tx.update(doc(certs, previousId), {
        status: "superseded",
        supersededBy: certificateId,
        updatedBy: actor,
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(doc(certs, certificateId), {
      beneficiaryId,
      ...content,
      status: "current",
      supersededBy: null,
      source,
      createdBy: actor,
      createdAt: serverTimestamp(),
      updatedBy: actor,
      updatedAt: serverTimestamp(),
    });

    const previousSummary = raw.summary as Partial<BeneficiarySummary> | undefined;
    const summary = mergeSummary(content.summary, previousSummary);
    // 旧データには profile が無いため、従来の summary をプロフィールとして補う
    const previousProfile =
      (raw.profile as Partial<BeneficiaryProfile> | undefined) ??
      profileFromSummary({ ...EMPTY_SUMMARY, ...(previousSummary ?? {}) });

    // profile：mobility / adult / child は従来どおり（新しい証の値を優先）。
    // tsusho は personal（カルテ）がある利用者なら更新しない・無ければ空欄だけ補う（certificateModel 参照）。
    // personal / guardian 等のカルテのマップには、種別を問わず触れない。
    const profile = resolveProfileOnCertificateAdd({
      certType,
      certSummary: content.summary,
      previousProfile,
      hasPersonal: hasChartPersonal(raw),
    });

    // currentCertificateId は単一のまま（Phase 1-B の方針）。種別の違う証（例：child → tsusho）を
    // 追加した場合も、新しい証が現在の証になり、それまでの証は superseded になる。
    tx.update(beneficiaryRef, {
      currentCertificateId: certificateId,
      certType,
      summary,
      ...(profile ? { profile } : {}),
      certificateCount: (raw.certificateCount ?? 0) + addedCount,
      updatedBy: actor,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * 保存済みの受給者証の内容（OCR結果の訂正）を更新する。
 * それが現在の証であれば、利用者docの一覧表示用 summary も合わせて更新する。
 */
export async function updateCertificatePages(params: {
  tenantId: string;
  beneficiaryId: string;
  certificateId: string;
  pages: SavedCertPage[];
  user: User;
}): Promise<void> {
  const { tenantId, beneficiaryId, certificateId, pages, user } = params;
  const actor = actorOf(user);
  const beneficiaryRef = doc(beneficiariesCollection(tenantId), beneficiaryId);
  const certRef = doc(certificatesCollection(tenantId, beneficiaryId), certificateId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(beneficiaryRef);
    const certSnap = await tx.get(certRef);
    if (!snap.exists() || !certSnap.exists()) throw new Error("受給者証が見つかりません");

    const certType = (certSnap.data().certType ?? "adult") as CertTypeId;
    const content = buildCertificateContent({ certType, pages });

    tx.update(certRef, {
      pages: content.pages,
      summary: content.summary,
      issueDate: content.issueDate,
      validFrom: content.validFrom,
      validTo: content.validTo,
      updatedBy: actor,
      updatedAt: serverTimestamp(),
    });

    if (snap.data().currentCertificateId === certificateId) {
      tx.update(beneficiaryRef, {
        summary: mergeSummary(content.summary, snap.data().summary),
        updatedBy: actor,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * 旧データ（利用者doc直下の受給者証）の内容を更新する。
 * 受給者証サブコレクション導入前の利用者専用。
 */
export async function updateBeneficiary(params: {
  tenantId: string;
  beneficiaryId: string;
  pages: SavedCertPage[];
  user: User;
}): Promise<void> {
  const { tenantId, beneficiaryId, pages, user } = params;

  await updateDoc(doc(beneficiariesCollection(tenantId), beneficiaryId), {
    pages,
    summary: buildSummary(pages),
    updatedBy: actorOf(user),
    updatedAt: serverTimestamp(),
  });
}
