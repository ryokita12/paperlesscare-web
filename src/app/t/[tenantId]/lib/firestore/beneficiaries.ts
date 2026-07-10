import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CertPage, FormDataType } from "../../types/cert";
import type { CertTypeId } from "../../constants/certPages";

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

export async function saveBeneficiary(params: {
  tenantId: string;
  certType: CertTypeId;
  pageTitles: string[];
  pages: CertPage[];
  user: User;
}): Promise<string> {
  const { tenantId, certType, pageTitles, pages, user } = params;

  const savedPages: SavedCertPage[] = pages.map((page, index) => ({
    pageNo: index + 1,
    title: pageTitles[index] || `ページ ${index + 1}`,
    formData: page.formData,
    ocrText: page.ocrText,
    storagePath: page.storagePath,
  }));

  // ページ1（受給者証（Ⅰ））の項目を代表値として一覧表示用に保持する
  const identityPage = pages[0]?.formData;

  const summary: BeneficiarySummary = {
    name: identityPage?.name || "",
    furigana: identityPage?.furigana || "",
    number: identityPage?.number || "",
    birthday: identityPage?.birthday || "",
    cityName: identityPage?.cityName || "",
  };

  const actor = { uid: user.uid, email: user.email };

  const docRef = await addDoc(beneficiariesCollection(tenantId), {
    tenantId,
    certType,
    summary,
    pages: savedPages,
    createdBy: actor,
    createdAt: serverTimestamp(),
    updatedBy: actor,
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
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
    const data = d.data() as Omit<BeneficiaryRecord, "id">;
    return { id: d.id, ...data };
  });
}
