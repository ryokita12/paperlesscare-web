import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FormDataType } from "../../types/cert";
import type { CertTypeId } from "../../constants/certPages";
import { isPage2, migrateLegacyPage2FormData } from "../compat/legacyPage2";

export type SavedCertPage = {
  pageNo: number;
  title: string;
  formData: FormDataType;
  ocrText: string;
  storagePath: string;
};

export type BeneficiarySummary = {
  name: string;
  furigana: string;
  number: string;
  birthday: string;
  cityName: string;
};

export type BeneficiaryRecord = {
  id: string;
  tenantId: string;
  certType: CertTypeId;
  summary: BeneficiarySummary;
  pages: SavedCertPage[];
  createdBy: { uid: string; email: string | null };
  createdAt: Timestamp | null;
  updatedBy: { uid: string; email: string | null };
  updatedAt: Timestamp | null;
};

function beneficiariesCollection(tenantId: string) {
  return collection(db, "tenants", tenantId, "beneficiaries");
}

const EMPTY_SUMMARY: BeneficiarySummary = {
  name: "",
  furigana: "",
  number: "",
  birthday: "",
  cityName: "",
};

// Firestoreから読み出した受給者ドキュメントを、現行のデータ構造へ揃えてから返す。
// - certType が欠けている旧データは "adult" とみなす（child/mobility は当時まだ選べなかったため）
// - summary / pages が欠けている不正データを既定値で補い、一覧・編集画面が丸ごと落ちないようにする
// - ページ2の1組目が旧フィールド（name/birthday/childName）に入っている場合は移送する
function normalizeBeneficiaryData(
  data: Omit<BeneficiaryRecord, "id">
): Omit<BeneficiaryRecord, "id"> {
  const pages = Array.isArray(data.pages) ? data.pages : [];

  return {
    ...data,
    certType: data.certType ?? "adult",
    summary: { ...EMPTY_SUMMARY, ...(data.summary ?? {}) },
    pages: pages.map((page, index) => {
      if (!page?.formData || !isPage2(page.pageNo, index)) return page;
      return { ...page, formData: migrateLegacyPage2FormData(page.formData) };
    }),
  };
}

// 受給者ドキュメントIDをネットワーク不要でクライアント側に事前採番する。
// 取込中のページ画像を最初からこのIDに紐づくStorageパスへアップロードすることで、
// 保存後にファイルを移動させる必要をなくし、保存の再試行も安全（同一ID＝setDocで冪等）にする。
export function reserveBeneficiaryId(tenantId: string): string {
  return doc(beneficiariesCollection(tenantId)).id;
}

export async function getBeneficiary(
  tenantId: string,
  beneficiaryId: string
): Promise<BeneficiaryRecord | null> {
  const snap = await getDoc(doc(beneficiariesCollection(tenantId), beneficiaryId));
  if (!snap.exists()) return null;

  const data = normalizeBeneficiaryData(
    snap.data() as Omit<BeneficiaryRecord, "id">
  );
  return { id: snap.id, ...data };
}

function buildSummary(pages: { formData: FormDataType }[]): BeneficiarySummary {
  const identityPage = pages[0]?.formData;
  return {
    name: identityPage?.name || "",
    furigana: identityPage?.furigana || "",
    number: identityPage?.number || "",
    birthday: identityPage?.birthday || "",
    cityName: identityPage?.cityName || "",
  };
}

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
    updatedBy: { uid: user.uid, email: user.email },
    updatedAt: serverTimestamp(),
  });
}

export async function saveBeneficiary(params: {
  tenantId: string;
  beneficiaryId: string;
  certType: CertTypeId;
  // 画像アップロード（Storageパスの確定）は呼び出し側（確定保存の直前）で
  // 完了させておき、ここではFirestoreへの書き込みのみを行う。
  pages: SavedCertPage[];
  user: User;
}): Promise<string> {
  const { tenantId, beneficiaryId, certType, pages, user } = params;

  // ページ1（受給者証（Ⅰ））の項目を代表値として一覧表示用に保持する
  const summary = buildSummary(pages);

  const actor = { uid: user.uid, email: user.email };

  // 事前採番済みIDへのsetDocなので、通信失敗後の再試行でも重複ドキュメントが生まれない
  await setDoc(doc(beneficiariesCollection(tenantId), beneficiaryId), {
    tenantId,
    certType,
    summary,
    pages,
    createdBy: actor,
    createdAt: serverTimestamp(),
    updatedBy: actor,
    updatedAt: serverTimestamp(),
  });

  return beneficiaryId;
}

export async function listBeneficiaries(
  tenantId: string
): Promise<BeneficiaryRecord[]> {
  const q = query(
    beneficiariesCollection(tenantId),
    orderBy("updatedAt", "desc")
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = normalizeBeneficiaryData(
      d.data() as Omit<BeneficiaryRecord, "id">
    );
    return { id: d.id, ...data };
  });
}
