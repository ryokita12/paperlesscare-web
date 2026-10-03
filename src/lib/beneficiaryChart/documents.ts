// 利用者カルテ「書類」の純粋ロジック（Firebase非依存）。
//
// Firestore：tenants/{tenantId}/beneficiaries/{beneficiaryId}/documents/{documentId}
// Storage  ：tenants/{tenantId}/recipients/{beneficiaryId}/documents/{documentId}/file.{pdf|jpg|png}
//   （Storage側は既存の受給者証画像と同じ recipients/{beneficiaryId} 配下にまとめる）
//
// 受給者証は既存の certificates を使い、documents には保存しない。
// 種別・サイズ・形式の制約は firestore.rules / storage.rules にも同じ値で書いている。
import { isIsoDate } from "./dates.ts";

export type BeneficiaryDocumentType = "contract" | "importantMatters" | "privacyConsent" | "other";

export const DOCUMENT_TYPE_OPTIONS: readonly { id: BeneficiaryDocumentType; label: string }[] = [
  { id: "contract", label: "利用契約書" },
  { id: "importantMatters", label: "重要事項説明書" },
  { id: "privacyConsent", label: "個人情報同意書" },
  { id: "other", label: "その他" },
];

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_OPTIONS.find((o) => o.id === type)?.label ?? "その他";
}

// 10MB。既存の受給者証OCR（Functions側の上限 10MB）と同じ値。storage.rules / firestore.rules と一致させる
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_CONTENT_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export type DocumentContentType = keyof typeof DOCUMENT_CONTENT_TYPES;

const EXTENSION_TO_CONTENT_TYPE: Record<string, DocumentContentType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const DOCUMENT_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/**
 * ファイルの形式を決める。ブラウザが type を返さない場合（一部のAndroid等）は拡張子で判断する。
 * 対応外なら null。
 */
export function resolveDocumentContentType(file: { name: string; type: string }): DocumentContentType | null {
  if (file.type in DOCUMENT_CONTENT_TYPES) return file.type as DocumentContentType;
  if (file.type) return null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_CONTENT_TYPE[ext] ?? null;
}

/** アップロード前のチェック。問題があれば利用者向けのメッセージを返す */
export function validateDocumentFile(file: { name: string; type: string; size: number }): string | null {
  if (!resolveDocumentContentType(file)) {
    return "PDF・JPEG・PNG のファイルを選んでください。";
  }
  if (file.size <= 0) return "ファイルが空です。別のファイルを選んでください。";
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `ファイルが大きすぎます（${formatFileSize(file.size)}）。${formatFileSize(MAX_DOCUMENT_BYTES)}以下のファイルを選んでください。`;
  }
  return null;
}

export function documentStoragePath(params: {
  tenantId: string;
  beneficiaryId: string;
  documentId: string;
  contentType: DocumentContentType;
}): string {
  const { tenantId, beneficiaryId, documentId, contentType } = params;
  return `tenants/${tenantId}/recipients/${beneficiaryId}/documents/${documentId}/file.${DOCUMENT_CONTENT_TYPES[contentType]}`;
}

/** 書類名の初期値（ファイル名から拡張子を除いたもの） */
export function defaultDocumentName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base || fileName;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)}MB`;
}

export const DOCUMENT_NAME_MAX_LENGTH = 100;

// ===== 提出管理（Phase 1-C） =====
//
// 書類docに次の項目を追加する（既存の書類docには無いことがある。書き換え・移行はしない）：
//   status       … "submitted"（提出済み）| "notSubmitted"（未提出）
//   submittedAt  … 提出日 "YYYY-MM-DD"（不明なら ""）
//   memo         … メモ
// ファイルの無い書類doc（紙で受け取って事業所で保管している等）も作れる。その場合 storagePath は "" ・ fileSize は 0。
//
// 既存の書類doc（status が無い）は「ファイルを登録した＝受け取った」として提出済みとみなす。

export type DocumentSubmissionStatus = "submitted" | "notSubmitted";

export const DOCUMENT_STATUS_OPTIONS: readonly { id: DocumentSubmissionStatus; label: string }[] = [
  { id: "submitted", label: "提出済み" },
  { id: "notSubmitted", label: "未提出" },
];

/** 利用者ごとに必ずそろえる書類（「その他」は一律の必須にしない） */
export const REQUIRED_DOCUMENT_TYPES: readonly BeneficiaryDocumentType[] = [
  "contract",
  "importantMatters",
  "privacyConsent",
];

export const DOCUMENT_MEMO_MAX_LENGTH = 500;

export function isDocumentType(value: unknown): value is BeneficiaryDocumentType {
  return DOCUMENT_TYPE_OPTIONS.some((o) => o.id === value);
}

/** 書類docの提出状態。status が無い既存データは、ファイルがあれば提出済み・無ければ未提出 */
export function resolveDocumentStatus(raw: { status?: unknown; storagePath?: unknown }): DocumentSubmissionStatus {
  if (raw.status === "submitted" || raw.status === "notSubmitted") return raw.status;
  return typeof raw.storagePath === "string" && raw.storagePath ? "submitted" : "notSubmitted";
}

export type DocumentSubmissionInput = { type: string; status: DocumentSubmissionStatus };

export type RequiredDocumentState = {
  type: BeneficiaryDocumentType;
  label: string;
  submitted: boolean;
  /** この種別で登録されている書類の件数（提出済み・未提出の両方） */
  count: number;
};

/**
 * 必要書類ごとの提出状況。同じ種別の書類が複数ある場合（再契約・差し替え等）は、
 * 1件でも提出済みがあれば提出済みとする。
 */
export function summarizeRequiredDocuments(
  documents: readonly DocumentSubmissionInput[]
): RequiredDocumentState[] {
  return REQUIRED_DOCUMENT_TYPES.map((type) => {
    const items = documents.filter((d) => d.type === type);
    return {
      type,
      label: documentTypeLabel(type),
      submitted: items.some((d) => d.status === "submitted"),
      count: items.length,
    };
  });
}

export type DocumentMetaInput = {
  name: string;
  status: DocumentSubmissionStatus;
  submittedAt: string;
  memo: string;
};

/** 書類の情報（ファイル以外）の入力チェック。today は "YYYY-MM-DD" */
export function validateDocumentMeta(
  meta: DocumentMetaInput,
  today: string
): Partial<Record<"name" | "submittedAt" | "memo", string>> {
  const errors: Partial<Record<"name" | "submittedAt" | "memo", string>> = {};
  if (meta.name.trim().length > DOCUMENT_NAME_MAX_LENGTH) {
    errors.name = `書類名は${DOCUMENT_NAME_MAX_LENGTH}文字以内で入力してください`;
  }
  if (meta.submittedAt) {
    if (!isIsoDate(meta.submittedAt)) {
      errors.submittedAt = "日付が正しくありません";
    } else if (meta.submittedAt > today) {
      errors.submittedAt = "未来の日付は入力できません";
    }
  }
  if (meta.memo.length > DOCUMENT_MEMO_MAX_LENGTH) {
    errors.memo = `メモは${DOCUMENT_MEMO_MAX_LENGTH}文字以内で入力してください`;
  }
  return errors;
}

/**
 * 保存する提出情報を整える。未提出にした場合、提出日は空にする（未提出なのに提出日が残らないように）。
 */
export function normalizeDocumentMeta(meta: DocumentMetaInput): DocumentMetaInput {
  const status = meta.status === "submitted" ? "submitted" : "notSubmitted";
  return {
    name: meta.name.trim().slice(0, DOCUMENT_NAME_MAX_LENGTH),
    status,
    submittedAt: status === "submitted" ? meta.submittedAt.trim() : "",
    memo: meta.memo.trim().slice(0, DOCUMENT_MEMO_MAX_LENGTH),
  };
}
