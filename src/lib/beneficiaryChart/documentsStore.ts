// 利用者カルテ「書類」のFirestore / Storageアクセス。
//   Firestore：tenants/{tenantId}/beneficiaries/{beneficiaryId}/documents/{documentId}
//   Storage  ：tenants/{tenantId}/recipients/{beneficiaryId}/documents/{documentId}/file.{ext}
//
// Phase 1-C：提出状態（status）・提出日（submittedAt）・メモ（memo）を追加し、ファイルの無い書類（紙で保管等）も
// 記録できるようにした。既存の書類docにこれらの項目が無くても読めるよう、読み取り時に補う（書き換えはしない）。
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
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { isIsoDate } from "./dates";
import {
  DOCUMENT_MEMO_MAX_LENGTH,
  DOCUMENT_NAME_MAX_LENGTH,
  MAX_DOCUMENT_BYTES,
  documentStoragePath,
  documentTypeLabel,
  isDocumentType,
  normalizeDocumentMeta,
  resolveDocumentContentType,
  resolveDocumentStatus,
  validateDocumentFile,
  type BeneficiaryDocumentType,
  type DocumentMetaInput,
  type DocumentSubmissionStatus,
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
  // Phase 1-C
  status: DocumentSubmissionStatus;
  submittedAt: string; // "YYYY-MM-DD" または ""
  memo: string;
  hasFile: boolean;
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
  const raw = data as Partial<BeneficiaryDocumentRecord> & { status?: unknown };
  const emptyActor = { uid: "", email: null };
  const storagePath = typeof raw.storagePath === "string" ? raw.storagePath : "";
  return {
    id,
    beneficiaryId,
    type: isDocumentType(raw.type) ? raw.type : "other",
    name: typeof raw.name === "string" ? raw.name : "",
    fileName: typeof raw.fileName === "string" ? raw.fileName : "",
    storagePath,
    contentType: typeof raw.contentType === "string" ? raw.contentType : "",
    fileSize: typeof raw.fileSize === "number" ? raw.fileSize : 0,
    status: resolveDocumentStatus({ status: raw.status, storagePath }),
    submittedAt: isIsoDate(raw.submittedAt) ? raw.submittedAt : "",
    memo: typeof raw.memo === "string" ? raw.memo : "",
    hasFile: !!storagePath,
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

async function uploadDocumentFile(params: {
  tenantId: string;
  beneficiaryId: string;
  documentId: string;
  file: File;
}) {
  const { tenantId, beneficiaryId, documentId, file } = params;
  const invalid = validateDocumentFile(file);
  const contentType = resolveDocumentContentType(file);
  if (invalid || !contentType) throw new Error(invalid ?? "対応していないファイル形式です。");
  const storagePath = documentStoragePath({ tenantId, beneficiaryId, documentId, contentType });
  await uploadBytes(ref(storage, storagePath), file, { contentType });
  return { fileName: file.name, storagePath, contentType, fileSize: file.size };
}

/**
 * 書類を登録する（ファイルは任意）。ファイルがある場合は Storage へ保存してから Firestore へ記録し、
 * Firestore への記録に失敗した場合はアップロード済みのファイルを削除する（孤立ファイルを残さない）。
 */
export async function createBeneficiaryDocument(params: {
  tenantId: string;
  beneficiaryId: string;
  type: BeneficiaryDocumentType;
  meta: DocumentMetaInput;
  file: File | null;
  user: User;
}): Promise<void> {
  const { tenantId, beneficiaryId, type, file, user } = params;
  const meta = normalizeDocumentMeta(params.meta);
  const documentRef = doc(documentsCollection(tenantId, beneficiaryId));
  const actor = { uid: user.uid, email: user.email };

  const stored = file
    ? await uploadDocumentFile({ tenantId, beneficiaryId, documentId: documentRef.id, file })
    : { fileName: "", storagePath: "", contentType: "", fileSize: 0 };

  try {
    await setDoc(documentRef, {
      beneficiaryId,
      type,
      name: (meta.name || file?.name || documentTypeLabel(type)).slice(0, DOCUMENT_NAME_MAX_LENGTH),
      ...stored,
      status: meta.status,
      submittedAt: meta.submittedAt,
      memo: meta.memo,
      createdBy: actor,
      createdAt: serverTimestamp(),
      updatedBy: actor,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    if (stored.storagePath) await deleteObject(ref(storage, stored.storagePath)).catch(() => undefined);
    throw e;
  }
}

/** 書類の情報（書類名・提出状態・提出日・メモ）を更新する。種別・ファイルは変えない */
export async function updateBeneficiaryDocumentMeta(params: {
  tenantId: string;
  document: BeneficiaryDocumentRecord;
  meta: DocumentMetaInput;
  user: User;
}): Promise<void> {
  const { tenantId, document, user } = params;
  const meta = normalizeDocumentMeta(params.meta);
  await updateDoc(doc(documentsCollection(tenantId, document.beneficiaryId), document.id), {
    name: (meta.name || document.name || document.fileName || documentTypeLabel(document.type)).slice(
      0,
      DOCUMENT_NAME_MAX_LENGTH
    ),
    status: meta.status,
    submittedAt: meta.submittedAt,
    memo: meta.memo.slice(0, DOCUMENT_MEMO_MAX_LENGTH),
    updatedBy: { uid: user.uid, email: user.email },
    updatedAt: serverTimestamp(),
  });
}

/**
 * ファイルの無い書類にファイルを添付する。ファイルの差し替えは従来どおり「削除して再登録」
 * （storage.rules が既存ファイルへの上書きを禁止しているため）。
 */
export async function attachBeneficiaryDocumentFile(params: {
  tenantId: string;
  document: BeneficiaryDocumentRecord;
  file: File;
  user: User;
}): Promise<void> {
  const { tenantId, document, file, user } = params;
  if (document.hasFile) throw new Error("この書類にはすでにファイルがあります。差し替える場合は削除して登録し直してください。");
  const stored = await uploadDocumentFile({
    tenantId,
    beneficiaryId: document.beneficiaryId,
    documentId: document.id,
    file,
  });
  try {
    await updateDoc(doc(documentsCollection(tenantId, document.beneficiaryId), document.id), {
      ...stored,
      updatedBy: { uid: user.uid, email: user.email },
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    await deleteObject(ref(storage, stored.storagePath)).catch(() => undefined);
    throw e;
  }
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
