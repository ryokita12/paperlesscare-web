// 利用者カルテ「書類」のFirestore / Storageアクセス。
//   Firestore：tenants/{tenantId}/beneficiaries/{beneficiaryId}/documents/{documentId}
//   Storage  ：tenants/{tenantId}/recipients/{beneficiaryId}/documents/{documentId}/file.{ext}
import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  DOCUMENT_NAME_MAX_LENGTH,
  MAX_DOCUMENT_BYTES,
  documentStoragePath,
  resolveDocumentContentType,
  validateDocumentFile,
  type BeneficiaryDocumentType,
} from "./documents";

type Actor = { uid: string; email: string | null };

export type BeneficiaryDocumentRecord = {
  id: string;
  beneficiaryId: string;
  type: BeneficiaryDocumentType;
  name: string;
  fileName: string;
  storagePath: string;
  contentType: string;
  fileSize: number;
  createdBy: Actor;
  createdAt: Timestamp | null;
  updatedBy: Actor;
  updatedAt: Timestamp | null;
};

function documentsCollection(tenantId: string, beneficiaryId: string) {
  return collection(db, "tenants", tenantId, "beneficiaries", beneficiaryId, "documents");
}

function normalizeDocument(
  id: string,
  beneficiaryId: string,
  data: Record<string, unknown>
): BeneficiaryDocumentRecord {
  const raw = data as Partial<BeneficiaryDocumentRecord>;
  const emptyActor = { uid: "", email: null };
  return {
    id,
    beneficiaryId,
    type: raw.type ?? "other",
    name: typeof raw.name === "string" ? raw.name : "",
    fileName: typeof raw.fileName === "string" ? raw.fileName : "",
    storagePath: typeof raw.storagePath === "string" ? raw.storagePath : "",
    contentType: typeof raw.contentType === "string" ? raw.contentType : "",
    fileSize: typeof raw.fileSize === "number" ? raw.fileSize : 0,
    createdBy: raw.createdBy ?? emptyActor,
    createdAt: raw.createdAt ?? null,
    updatedBy: raw.updatedBy ?? emptyActor,
    updatedAt: raw.updatedAt ?? null,
  };
}

/** 書類一覧（登録日の新しい順） */
export async function listBeneficiaryDocuments(
  tenantId: string,
  beneficiaryId: string
): Promise<BeneficiaryDocumentRecord[]> {
  const snap = await getDocs(
    query(documentsCollection(tenantId, beneficiaryId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => normalizeDocument(d.id, beneficiaryId, d.data()));
}

/**
 * 書類をアップロードする。Storageへ保存してからFirestoreへ記録し、
 * Firestoreへの記録に失敗した場合はアップロード済みのファイルを削除する（孤立ファイルを残さない）。
 */
export async function uploadBeneficiaryDocument(params: {
  tenantId: string;
  beneficiaryId: string;
  type: BeneficiaryDocumentType;
  name: string;
  file: File;
  user: User;
}): Promise<BeneficiaryDocumentRecord> {
  const { tenantId, beneficiaryId, type, file, user } = params;

  const invalid = validateDocumentFile(file);
  const contentType = resolveDocumentContentType(file);
  if (invalid || !contentType) throw new Error(invalid ?? "対応していないファイル形式です。");

  const documentRef = doc(documentsCollection(tenantId, beneficiaryId));
  const storagePath = documentStoragePath({
    tenantId,
    beneficiaryId,
    documentId: documentRef.id,
    contentType,
  });
  const name = (params.name.trim() || file.name).slice(0, DOCUMENT_NAME_MAX_LENGTH);
  const actor = { uid: user.uid, email: user.email };

  await uploadBytes(ref(storage, storagePath), file, { contentType });

  try {
    await setDoc(documentRef, {
      beneficiaryId,
      type,
      name,
      fileName: file.name,
      storagePath,
      contentType,
      fileSize: file.size,
      createdBy: actor,
      createdAt: serverTimestamp(),
      updatedBy: actor,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    await deleteObject(ref(storage, storagePath)).catch(() => undefined);
    throw e;
  }

  return normalizeDocument(documentRef.id, beneficiaryId, {
    type,
    name,
    fileName: file.name,
    storagePath,
    contentType,
    fileSize: file.size,
    createdBy: actor,
    updatedBy: actor,
  });
}

function isObjectNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "storage/object-not-found";
}

/**
 * 書類を削除する。ファイル → 記録の順に消す。
 * 途中で失敗しても、もう一度「削除」を押せば最後まで消せる（ファイルが既に無い場合は無視する）。
 */
export async function deleteBeneficiaryDocument(params: {
  tenantId: string;
  document: BeneficiaryDocumentRecord;
}): Promise<void> {
  const { tenantId, document } = params;
  if (document.storagePath) {
    try {
      await deleteObject(ref(storage, document.storagePath));
    } catch (e) {
      if (!isObjectNotFound(e)) throw e;
    }
  }
  await deleteDoc(doc(documentsCollection(tenantId, document.beneficiaryId), document.id));
}

/**
 * 書類のファイルを取得する。getDownloadURL() は Storage Rules を経由しない恒久URLを発行するため使わず、
 * 既存の受給者証画像と同じく getBytes()（都度 Rules が評価される）で取得して Blob にする。
 */
export async function fetchBeneficiaryDocumentBlob(document: BeneficiaryDocumentRecord): Promise<Blob> {
  const bytes = await getBytes(ref(storage, document.storagePath), MAX_DOCUMENT_BYTES + 1024);
  return new Blob([bytes], { type: document.contentType || "application/octet-stream" });
}
