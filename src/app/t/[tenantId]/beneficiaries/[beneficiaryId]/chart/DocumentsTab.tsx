"use client";

// 利用者カルテ「書類」タブ。
// 受給者証は既存の受給者証（certificates）をそのまま案内し、ここへは保存しない。
// それ以外の書類（利用契約書・重要事項説明書・個人情報同意書・その他）をアップロード・閲覧・削除する。
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  deleteBeneficiaryDocument,
  fetchBeneficiaryDocumentBlob,
  listBeneficiaryDocuments,
  uploadBeneficiaryDocument,
  type BeneficiaryDocumentRecord,
} from "@/lib/beneficiaryChart/documentsStore";
import {
  defaultDocumentName,
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_NAME_MAX_LENGTH,
  DOCUMENT_TYPE_OPTIONS,
  formatFileSize,
  MAX_DOCUMENT_BYTES,
  validateDocumentFile,
  type BeneficiaryDocumentType,
} from "@/lib/beneficiaryChart/documents";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import {
  CertificateStatusBadge,
  dangerButtonClass,
  FormField,
  inputClass,
  primaryButtonClass,
  ResultNotice,
  secondaryButtonClass,
  type ResultMessage,
} from "../../components/chartUi";
import type { CertificateStatus } from "@/lib/beneficiaryChart/certificateStatus";

type Props = {
  tenantId: string;
  beneficiaryId: string;
  user: User;
  certificateCount: number;
  certificateStatus: CertificateStatus;
  onShowCertificates: () => void;
};

function formatCreatedAt(record: BeneficiaryDocumentRecord): string {
  try {
    return record.createdAt ? record.createdAt.toDate().toLocaleDateString("ja-JP") : "";
  } catch {
    return "";
  }
}

export default function DocumentsTab({
  tenantId,
  beneficiaryId,
  user,
  certificateCount,
  certificateStatus,
  onShowCertificates,
}: Props) {
  const [documents, setDocuments] = useState<BeneficiaryDocumentRecord[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const [docType, setDocType] = useState<BeneficiaryDocumentType | "">("");
  const [docName, setDocName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadErrors, setUploadErrors] = useState<{ type?: string; file?: string }>({});
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<ResultMessage>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [busyId, setBusyId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");

  const load = useCallback(async () => {
    try {
      setDocuments(await listBeneficiaryDocuments(tenantId, beneficiaryId));
      setLoadError("");
    } catch (e) {
      setLoadError(friendlyChartError(e, "load"));
      setDocuments([]);
    }
  }, [tenantId, beneficiaryId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const resetForm = () => {
    setDocType("");
    setDocName("");
    setFile(null);
    setUploadErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileChange = (picked: File | null) => {
    setFile(picked);
    setMessage(null);
    if (!picked) {
      setUploadErrors((prev) => ({ ...prev, file: undefined }));
      return;
    }
    setUploadErrors((prev) => ({ ...prev, file: validateDocumentFile(picked) ?? undefined }));
    if (!docName.trim()) setDocName(defaultDocumentName(picked.name).slice(0, DOCUMENT_NAME_MAX_LENGTH));
  };

  const onUpload = async () => {
    if (uploading) return;
    const errors = {
      type: docType ? undefined : "書類の種類を選んでください",
      file: file ? validateDocumentFile(file) ?? undefined : "ファイルを選んでください",
    };
    setUploadErrors(errors);
    if (errors.type || errors.file || !file || !docType) return;

    setUploading(true);
    setMessage(null);
    try {
      await uploadBeneficiaryDocument({ tenantId, beneficiaryId, type: docType, name: docName, file, user });
      resetForm();
      setMessage({ kind: "ok", text: "書類を登録しました。" });
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: friendlyChartError(e, "upload") });
    } finally {
      setUploading(false);
    }
  };

  const onOpen = async (record: BeneficiaryDocumentRecord, mode: "view" | "download") => {
    if (busyId) return;
    // ポップアップブロックを避けるため、クリック直後に新しいタブを開いておき、取得後に表示する
    const viewer = mode === "view" ? window.open("", "_blank") : null;
    setBusyId(record.id);
    setMessage(null);
    try {
      const blob = await fetchBeneficiaryDocumentBlob(record);
      const url = URL.createObjectURL(blob);
      if (viewer) {
        viewer.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = record.fileName || `${record.name}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      viewer?.close();
      setMessage({ kind: "error", text: friendlyChartError(e, "open") });
    } finally {
      setBusyId("");
    }
  };

  const onDelete = async (record: BeneficiaryDocumentRecord) => {
    if (busyId) return;
    setBusyId(record.id);
    setMessage(null);
    try {
      await deleteBeneficiaryDocument({ tenantId, document: record });
      setConfirmDeleteId("");
      setMessage({ kind: "ok", text: `「${record.name || record.fileName}」を削除しました。` });
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: friendlyChartError(e, "delete") });
    } finally {
      setBusyId("");
    }
  };

  const hasCertificate = certificateStatus.kind !== "none";

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-bold">受給者証</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CertificateStatusBadge kind={certificateStatus.kind} label={certificateStatus.label} />
            <span className="text-zinc-600">
              {hasCertificate
                ? `登録済み（履歴を含めて ${certificateCount}件）`
                : "受給者証はまだ登録されていません"}
            </span>
          </div>
          <button type="button" className={secondaryButtonClass} onClick={onShowCertificates}>
            受給者証タブで見る
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          受給者証の写真は「受給者証」タブで管理しています（ここに重ねて登録する必要はありません）。
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-bold">書類を登録する</h2>
        <p className="mt-1 text-xs text-zinc-500">
          PDF・JPEG・PNG、{formatFileSize(MAX_DOCUMENT_BYTES)}までのファイルを登録できます。
        </p>
        <form
          className="mt-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onUpload();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="書類の種類" required htmlFor="d-type" error={uploadErrors.type}>
              <select
                id="d-type"
                className={inputClass}
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value as BeneficiaryDocumentType | "");
                  setUploadErrors((prev) => ({ ...prev, type: undefined }));
                }}
              >
                <option value="">選んでください</option>
                {DOCUMENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="ファイル" required htmlFor="d-file" error={uploadErrors.file}>
              <input
                id="d-file"
                ref={fileInputRef}
                type="file"
                accept={DOCUMENT_FILE_ACCEPT}
                className="block w-full text-sm file:mr-3 file:rounded-xl file:border file:border-zinc-200 file:bg-white file:px-3 file:py-2 file:text-sm"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
            </FormField>
            <FormField label="書類名" htmlFor="d-name" hint="空欄の場合はファイル名を使います" wide>
              <input
                id="d-name"
                className={inputClass}
                value={docName}
                maxLength={DOCUMENT_NAME_MAX_LENGTH}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="例：利用契約書（2025年4月）"
              />
            </FormField>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButtonClass} onClick={resetForm} disabled={uploading}>
              クリア
            </button>
            <button type="submit" className={primaryButtonClass} disabled={uploading}>
              {uploading ? "アップロード中..." : "アップロード"}
            </button>
          </div>
        </form>
        {message && (
          <div className="mt-3">
            <ResultNotice message={message} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">登録済みの書類</h2>
          {documents && <span className="text-sm text-zinc-500">{documents.length}件</span>}
        </div>

        {loadError && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {loadError}
            <button type="button" className="ml-2 font-semibold underline" onClick={() => void load()}>
              再読み込み
            </button>
          </div>
        )}

        {!documents ? (
          <p className="mt-3 text-sm text-zinc-500">読み込み中...</p>
        ) : (
          <div className="mt-3 space-y-4">
            {DOCUMENT_TYPE_OPTIONS.map((type) => {
              const items = documents.filter((d) => (d.type || "other") === type.id);
              return (
                <div key={type.id}>
                  <div className="mb-1 text-sm font-semibold text-zinc-700">{type.label}</div>
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-400">未登録</div>
                  ) : (
                    <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                      {items.map((d) => (
                        <li key={d.id} className="px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold break-words">{d.name || d.fileName || "名称なし"}</div>
                              <div className="mt-0.5 text-xs text-zinc-500 break-all">
                                {[d.fileName, formatFileSize(d.fileSize), formatCreatedAt(d) && `登録 ${formatCreatedAt(d)}`, d.createdBy.email]
                                  .filter(Boolean)
                                  .join("・")}
                              </div>
                            </div>
                            {confirmDeleteId !== d.id && (
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={secondaryButtonClass} disabled={!!busyId} onClick={() => void onOpen(d, "view")}>
                                  {busyId === d.id ? "開いています..." : "開く"}
                                </button>
                                <button type="button" className={secondaryButtonClass} disabled={!!busyId} onClick={() => void onOpen(d, "download")}>
                                  ダウンロード
                                </button>
                                <button type="button" className={dangerButtonClass} disabled={!!busyId} onClick={() => setConfirmDeleteId(d.id)}>
                                  削除
                                </button>
                              </div>
                            )}
                          </div>
                          {confirmDeleteId === d.id && (
                            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800" role="alertdialog">
                              「{d.name || d.fileName}」を削除しますか？削除したファイルは元に戻せません。
                              <div className="mt-2 flex flex-wrap justify-end gap-2">
                                <button type="button" className={secondaryButtonClass} disabled={busyId === d.id} onClick={() => setConfirmDeleteId("")}>
                                  キャンセル
                                </button>
                                <button
                                  type="button"
                                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                  disabled={busyId === d.id}
                                  onClick={() => void onDelete(d)}
                                >
                                  {busyId === d.id ? "削除中..." : "削除する"}
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
