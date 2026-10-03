// 利用者カルテ「書類」の純粋ロジック（Firebase非依存）。
//
// Firestore：tenants/{tenantId}/beneficiaries/{beneficiaryId}/documents/{documentId}
// Storage  ：tenants/{tenantId}/recipients/{beneficiaryId}/documents/{documentId}/file.{pdf|jpg|png}
//   （Storage側は既存の受給者証画像と同じ recipients/{beneficiaryId} 配下にまとめる）
//
// 受給者証は既存の certificates を使い、documents には保存しない。
// 種別・サイズ・形式の制約は firestore.rules / storage.rules にも同じ値で書いている。

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
