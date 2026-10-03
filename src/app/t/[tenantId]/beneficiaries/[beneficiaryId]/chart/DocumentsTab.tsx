"use client";

// 利用者カルテ「書類」タブ。
// 受給者証は既存の受給者証（certificates）をそのまま案内し、ここへは保存しない。
// それ以外の書類（利用契約書・重要事項説明書・個人情報同意書・その他）をアップロード・閲覧・削除する。
//
// Phase 1-C：提出管理を追加。
//   - 「必要書類」（利用契約書・重要事項説明書・個人情報同意書）の提出状況を上部にまとめ、未提出なら「提出済みにする」
//   - 書類ごとに 提出状態・提出日・メモ を記録できる（ファイルは任意。紙で保管している場合はファイルなしで記録）
//   - Phase 1-C 以前に登録した書類（提出状態の項目が無い）は、ファイルを登録済み＝提出済みとして表示する
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  attachBeneficiaryDocumentFile,
  createBeneficiaryDocument,
  deleteBeneficiaryDocument,
  fetchBeneficiaryDocumentBlob,
  listBeneficiaryDocuments,
  updateBeneficiaryDocumentMeta,
  type BeneficiaryDocumentRecord,
} from "@/lib/beneficiaryChart/documentsStore";
import {
  defaultDocumentName,
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_MEMO_MAX_LENGTH,
  DOCUMENT_NAME_MAX_LENGTH,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  documentTypeLabel,
  formatFileSize,
  MAX_DOCUMENT_BYTES,
  summarizeRequiredDocuments,
  validateDocumentFile,
  validateDocumentMeta,
  type BeneficiaryDocumentType,
  type DocumentMetaInput,
  type DocumentSubmissionStatus,
} from "@/lib/beneficiaryChart/documents";
import { formatJapaneseDate, toJapanIsoDate } from "@/lib/beneficiaryChart/dates";
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
  // Phase 1-C：「要対応」から移動してきたときの書類の種別と、移動のたびに変わる値
  focusType?: string;
  focusKey?: number;
  // Phase 1-C：書類を登録・変更・削除したとき（カルテ上部の「要対応」を最新にする）
  onChanged?: () => void;
};

type MetaErrors = Partial<Record<"name" | "submittedAt" | "memo" | "file", string>>;

const fileInputClass =
  "block w-full text-sm file:mr-3 file:rounded-xl file:border file:border-zinc-200 file:bg-white file:px-3 file:py-2 file:text-sm";

function formatCreatedAt(record: BeneficiaryDocumentRecord): string {
  try {
    return record.createdAt ? record.createdAt.toDate().toLocaleDateString("ja-JP") : "";
  } catch {
    return "";
  }
}

function StatusBadge({ status }: { status: DocumentSubmissionStatus }) {
  return status === "submitted" ? (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
      ✓ 提出済み
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
      未提出
    </span>
  );
}

function submittedText(record: BeneficiaryDocumentRecord): string {
  if (record.status !== "submitted") return "";
  return record.submittedAt ? `提出日 ${formatJapaneseDate(record.submittedAt)}` : "提出日 未入力";
}

/** 書類の情報（書類名・提出状態・提出日・メモ、必要ならファイル）の入力フォーム */
function DocumentMetaForm({
  idPrefix,
  initial,
  withFile,
  fileRequired = false,
  busy,
  submitLabel,
  today,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  initial: DocumentMetaInput;
  withFile: boolean;
  fileRequired?: boolean;
  busy: boolean;
  submitLabel: string;
  today: string;
  onSubmit: (meta: DocumentMetaInput, file: File | null) => void;
  onCancel: () => void;
}) {
  const [meta, setMeta] = useState<DocumentMetaInput>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<MetaErrors>({});

  const set = <K extends keyof DocumentMetaInput>(key: K, value: DocumentMetaInput[K]) => {
    setMeta((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = () => {
    const found: MetaErrors = { ...validateDocumentMeta(meta, today) };
    if (file) found.file = validateDocumentFile(file) ?? undefined;
    else if (fileRequired) found.file = "ファイルを選んでください";
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    onSubmit(meta, file);
  };

  return (
    <form
      className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="提出状態" htmlFor={`${idPrefix}-status`}>
          <select
            id={`${idPrefix}-status`}
            className={inputClass}
            value={meta.status}
            onChange={(e) => {
              const status = e.target.value as DocumentSubmissionStatus;
              set("status", status);
              if (status === "submitted" && !meta.submittedAt) set("submittedAt", today);
            }}
          >
            {DOCUMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        {meta.status === "submitted" ? (
          <FormField label="提出日" htmlFor={`${idPrefix}-date`} error={errors.submittedAt} hint="分からない場合は空欄のままで構いません">
            <input
              id={`${idPrefix}-date`}
              type="date"
              className={inputClass}
              value={meta.submittedAt}
              max={today}
              onChange={(e) => set("submittedAt", e.target.value)}
            />
          </FormField>
        ) : (
          <div className="hidden sm:block" />
        )}
        <FormField label="書類名" htmlFor={`${idPrefix}-name`} error={errors.name} wide>
          <input
            id={`${idPrefix}-name`}
            className={inputClass}
            value={meta.name}
            maxLength={DOCUMENT_NAME_MAX_LENGTH}
            onChange={(e) => set("name", e.target.value)}
          />
        </FormField>
        <FormField label="メモ" htmlFor={`${idPrefix}-memo`} error={errors.memo} hint="例：原本は事務所の書庫に保管／次回来所時に持参予定" wide>
          <textarea
            id={`${idPrefix}-memo`}
            className={`${inputClass} min-h-[4rem]`}
            value={meta.memo}
            maxLength={DOCUMENT_MEMO_MAX_LENGTH}
            onChange={(e) => set("memo", e.target.value)}
          />
        </FormField>
        {withFile && (
          <FormField
            label={fileRequired ? "ファイル" : "ファイル（任意）"}
            required={fileRequired}
            htmlFor={`${idPrefix}-file`}
            error={errors.file}
            hint={`PDF・JPEG・PNG、${formatFileSize(MAX_DOCUMENT_BYTES)}まで。紙で保管している場合はファイルなしでも記録できます`}
            wide
          >
            <input
              id={`${idPrefix}-file`}
              type="file"
              accept={DOCUMENT_FILE_ACCEPT}
              className={fileInputClass}
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                setErrors((prev) => ({ ...prev, file: picked ? validateDocumentFile(picked) ?? undefined : undefined }));
              }}
            />
          </FormField>
        )}
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className={primaryButtonClass} disabled={busy}>
          {busy ? "保存中..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

type Editing = { kind: "required"; type: BeneficiaryDocumentType } | { kind: "document"; id: string } | null;

export default function DocumentsTab({
  tenantId,
  beneficiaryId,
  user,
  certificateCount,
  certificateStatus,
  onShowCertificates,
  focusType,
  focusKey,
  onChanged,
}: Props) {
  const [documents, setDocuments] = useState<BeneficiaryDocumentRecord[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [today] = useState(() => toJapanIsoDate(new Date()));

  const [docType, setDocType] = useState<BeneficiaryDocumentType | "">("");
  const [docName, setDocName] = useState("");
  const [docStatus, setDocStatus] = useState<DocumentSubmissionStatus>("submitted");
  const [docSubmittedAt, setDocSubmittedAt] = useState(today);
  const [docMemo, setDocMemo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadErrors, setUploadErrors] = useState<{ type?: string; file?: string; submittedAt?: string; memo?: string; name?: string }>({});
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<ResultMessage>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [busyId, setBusyId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [requiredMessage, setRequiredMessage] = useState<ResultMessage>(null);
  const [listMessage, setListMessage] = useState<ResultMessage>(null);
  const scrolledFocusKey = useRef<number | undefined>(undefined);

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

  // 「要対応」から移動してきたときは、該当する必要書類の行までスクロールする
  const loaded = documents !== null;
  useEffect(() => {
    if (!loaded || focusKey === undefined || focusKey === scrolledFocusKey.current) return;
    // 描画が落ち着いてから瞬時に移動する（smooth だと読み込み中のレイアウト変化で途中で止まることがある）
    const frame = requestAnimationFrame(() => {
      scrolledFocusKey.current = focusKey;
      const el = document.getElementById(focusType ? `required-doc-${focusType}` : "required-documents");
      el?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [loaded, focusKey, focusType]);

  const afterChange = async () => {
    await load();
    onChanged?.();
  };

  const resetForm = () => {
    setDocType("");
    setDocName("");
    setDocStatus("submitted");
    setDocSubmittedAt(today);
    setDocMemo("");
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
    const meta: DocumentMetaInput = { name: docName, status: docStatus, submittedAt: docSubmittedAt, memo: docMemo };
    const errors = {
      type: docType ? undefined : "書類の種類を選んでください",
      file: file ? validateDocumentFile(file) ?? undefined : undefined,
      ...validateDocumentMeta(meta, today),
    };
    setUploadErrors(errors);
    if (Object.values(errors).some(Boolean) || !docType) return;

    setUploading(true);
    setMessage(null);
    try {
      await createBeneficiaryDocument({ tenantId, beneficiaryId, type: docType, meta, file, user });
      resetForm();
      setMessage({ kind: "ok", text: "書類を登録しました。" });
      await afterChange();
    } catch (e) {
      setMessage({ kind: "error", text: friendlyChartError(e, file ? "upload" : "save") });
    } finally {
      setUploading(false);
    }
  };

  // 必要書類を「提出済みにする」：未提出の記録があればそれを更新し、無ければ新しく記録する
  const onSubmitRequired = async (type: BeneficiaryDocumentType, meta: DocumentMetaInput, picked: File | null) => {
    if (busyId) return;
    const pending = documents?.find((d) => d.type === type && d.status === "notSubmitted");
    setBusyId(`required-${type}`);
    setRequiredMessage(null);
    try {
      if (pending) {
        await updateBeneficiaryDocumentMeta({ tenantId, document: pending, meta, user });
        if (picked && !pending.hasFile) {
          await attachBeneficiaryDocumentFile({ tenantId, document: pending, file: picked, user });
        }
      } else {
        await createBeneficiaryDocument({ tenantId, beneficiaryId, type, meta, file: picked, user });
      }
      setEditing(null);
      setRequiredMessage({
        kind: "ok",
        text: `${documentTypeLabel(type)}を${meta.status === "submitted" ? "提出済みにしました" : "記録しました"}。`,
      });
      await afterChange();
    } catch (e) {
      setRequiredMessage({ kind: "error", text: friendlyChartError(e, picked ? "upload" : "save") });
    } finally {
      setBusyId("");
    }
  };

  const onEditDocument = async (record: BeneficiaryDocumentRecord, meta: DocumentMetaInput, picked: File | null) => {
    if (busyId) return;
    setBusyId(record.id);
    setListMessage(null);
    try {
      await updateBeneficiaryDocumentMeta({ tenantId, document: record, meta, user });
      if (picked && !record.hasFile) {
        await attachBeneficiaryDocumentFile({ tenantId, document: record, file: picked, user });
      }
      setEditing(null);
      setListMessage({ kind: "ok", text: `「${meta.name || record.name || record.fileName}」を保存しました。` });
      await afterChange();
    } catch (e) {
      setListMessage({ kind: "error", text: friendlyChartError(e, picked ? "upload" : "save") });
    } finally {
      setBusyId("");
    }
  };

  const onOpen = async (record: BeneficiaryDocumentRecord, mode: "view" | "download") => {
    if (busyId) return;
    // ポップアップブロックを避けるため、クリック直後に新しいタブを開いておき、取得後に表示する
    const viewer = mode === "view" ? window.open("", "_blank") : null;
    setBusyId(record.id);
    setListMessage(null);
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
      setListMessage({ kind: "error", text: friendlyChartError(e, "open") });
    } finally {
      setBusyId("");
    }
  };

  const onDelete = async (record: BeneficiaryDocumentRecord) => {
    if (busyId) return;
    setBusyId(record.id);
    setListMessage(null);
    try {
      await deleteBeneficiaryDocument({ tenantId, document: record });
      setConfirmDeleteId("");
      setListMessage({ kind: "ok", text: `「${record.name || record.fileName}」を削除しました。` });
      await afterChange();
    } catch (e) {
      setListMessage({ kind: "error", text: friendlyChartError(e, "delete") });
    } finally {
      setBusyId("");
    }
  };

  const hasCertificate = certificateStatus.kind !== "none";
  const required = documents ? summarizeRequiredDocuments(documents) : null;
  const missingCount = required?.filter((r) => !r.submitted).length ?? 0;

  const latestSubmitted = (type: BeneficiaryDocumentType) =>
    documents?.find((d) => d.type === type && d.status === "submitted");

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

      <section
        id="required-documents"
        className="scroll-mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
        data-testid="required-documents"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">必要書類</h2>
          {required && (
            <span className={`text-sm font-semibold ${missingCount ? "text-amber-800" : "text-emerald-700"}`}>
              {missingCount ? `未提出 ${missingCount}件` : "すべて提出済み"}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          利用者ごとにそろえる書類です。紙で受け取って保管している場合も「提出済みにする」で記録できます（ファイルは任意）。
        </p>

        {!required ? (
          <p className="mt-3 text-sm text-zinc-500">読み込み中...</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {required.map((r) => {
              const submittedDoc = latestSubmitted(r.type);
              const focused = focusType === r.type;
              const isEditing = editing?.kind === "required" && editing.type === r.type;
              return (
                <li
                  key={r.type}
                  id={`required-doc-${r.type}`}
                  className={`scroll-mt-4 px-3 py-3 ${focused && !r.submitted ? "bg-amber-50/60" : ""}`}
                  data-testid={`required-doc-${r.type}`}
                  data-submitted={r.submitted ? "true" : "false"}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.label}</span>
                        <StatusBadge status={r.submitted ? "submitted" : "notSubmitted"} />
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {submittedDoc
                          ? [submittedText(submittedDoc), submittedDoc.hasFile ? "ファイルあり" : "ファイルなし（紙で保管等）"]
                              .filter(Boolean)
                              .join("・")
                          : r.count > 0
                            ? "記録はありますが、まだ提出されていません"
                            : "まだ記録がありません"}
                      </div>
                    </div>
                    {!r.submitted && !isEditing && (
                      <button
                        type="button"
                        className={primaryButtonClass}
                        disabled={!!busyId || editing !== null}
                        onClick={() => {
                          setRequiredMessage(null);
                          setEditing({ kind: "required", type: r.type });
                        }}
                      >
                        提出済みにする
                      </button>
                    )}
                  </div>
                  {isEditing && (
                    <DocumentMetaForm
                      idPrefix={`req-${r.type}`}
                      initial={{ name: r.label, status: "submitted", submittedAt: today, memo: "" }}
                      withFile
                      busy={busyId === `required-${r.type}`}
                      submitLabel="保存する"
                      today={today}
                      onSubmit={(meta, picked) => void onSubmitRequired(r.type, meta, picked)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {requiredMessage && (
          <div className="mt-3">
            <ResultNotice message={requiredMessage} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-bold">書類を登録する</h2>
        <p className="mt-1 text-xs text-zinc-500">
          PDF・JPEG・PNG、{formatFileSize(MAX_DOCUMENT_BYTES)}までのファイルを登録できます。紙で保管している書類は、ファイルなしでも記録できます。
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
            <FormField label="ファイル（任意）" htmlFor="d-file" error={uploadErrors.file}>
              <input
                id="d-file"
                ref={fileInputRef}
                type="file"
                accept={DOCUMENT_FILE_ACCEPT}
                className={fileInputClass}
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
            </FormField>
            <FormField label="提出状態" htmlFor="d-status">
              <select
                id="d-status"
                className={inputClass}
                value={docStatus}
                onChange={(e) => {
                  const status = e.target.value as DocumentSubmissionStatus;
                  setDocStatus(status);
                  if (status === "submitted" && !docSubmittedAt) setDocSubmittedAt(today);
                }}
              >
                {DOCUMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FormField>
            {docStatus === "submitted" ? (
              <FormField label="提出日" htmlFor="d-date" error={uploadErrors.submittedAt} hint="分からない場合は空欄のままで構いません">
                <input
                  id="d-date"
                  type="date"
                  className={inputClass}
                  value={docSubmittedAt}
                  max={today}
                  onChange={(e) => {
                    setDocSubmittedAt(e.target.value);
                    setUploadErrors((prev) => ({ ...prev, submittedAt: undefined }));
                  }}
                />
              </FormField>
            ) : (
              <div className="hidden sm:block" />
            )}
            <FormField label="書類名" htmlFor="d-name" hint="空欄の場合はファイル名（ファイルが無ければ書類の種類）を使います" error={uploadErrors.name} wide>
              <input
                id="d-name"
                className={inputClass}
                value={docName}
                maxLength={DOCUMENT_NAME_MAX_LENGTH}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="例：利用契約書（2025年4月）"
              />
            </FormField>
            <FormField label="メモ" htmlFor="d-memo" error={uploadErrors.memo} wide>
              <textarea
                id="d-memo"
                className={`${inputClass} min-h-[4rem]`}
                value={docMemo}
                maxLength={DOCUMENT_MEMO_MAX_LENGTH}
                onChange={(e) => setDocMemo(e.target.value)}
                placeholder="例：原本は事務所の書庫に保管"
              />
            </FormField>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButtonClass} onClick={resetForm} disabled={uploading}>
              クリア
            </button>
            <button type="submit" className={primaryButtonClass} disabled={uploading}>
              {uploading ? "保存中..." : file ? "アップロード" : "登録する"}
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

        {listMessage && (
          <div className="mt-3">
            <ResultNotice message={listMessage} />
          </div>
        )}

        {!documents ? (
          <p className="mt-3 text-sm text-zinc-500">読み込み中...</p>
        ) : (
          <div className="mt-3 space-y-4">
            {DOCUMENT_TYPE_OPTIONS.map((type) => {
              const items = documents.filter((d) => d.type === type.id);
              return (
                <div key={type.id}>
                  <div className="mb-1 text-sm font-semibold text-zinc-700">{type.label}</div>
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-400">未登録</div>
                  ) : (
                    <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                      {items.map((d) => {
                        const isEditing = editing?.kind === "document" && editing.id === d.id;
                        return (
                          <li key={d.id} className="px-3 py-3" data-testid="document-item" data-status={d.status}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold break-words">{d.name || d.fileName || "名称なし"}</span>
                                  <StatusBadge status={d.status} />
                                </div>
                                <div className="mt-0.5 text-xs text-zinc-500 break-all">
                                  {[
                                    submittedText(d),
                                    d.hasFile ? d.fileName : "ファイルなし",
                                    d.hasFile && formatFileSize(d.fileSize),
                                    formatCreatedAt(d) && `登録 ${formatCreatedAt(d)}`,
                                    d.createdBy.email,
                                  ]
                                    .filter(Boolean)
                                    .join("・")}
                                </div>
                                {d.memo && (
                                  <div className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                                    {d.memo}
                                  </div>
                                )}
                              </div>
                              {confirmDeleteId !== d.id && !isEditing && (
                                <div className="flex flex-wrap gap-2">
                                  {d.hasFile && (
                                    <>
                                      <button type="button" className={secondaryButtonClass} disabled={!!busyId} onClick={() => void onOpen(d, "view")}>
                                        {busyId === d.id ? "開いています..." : "開く"}
                                      </button>
                                      <button type="button" className={secondaryButtonClass} disabled={!!busyId} onClick={() => void onOpen(d, "download")}>
                                        ダウンロード
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    className={secondaryButtonClass}
                                    disabled={!!busyId || editing !== null}
                                    onClick={() => {
                                      setListMessage(null);
                                      setEditing({ kind: "document", id: d.id });
                                    }}
                                  >
                                    編集
                                  </button>
                                  <button type="button" className={dangerButtonClass} disabled={!!busyId} onClick={() => setConfirmDeleteId(d.id)}>
                                    削除
                                  </button>
                                </div>
                              )}
                            </div>
                            {isEditing && (
                              <DocumentMetaForm
                                idPrefix={`doc-${d.id}`}
                                initial={{ name: d.name, status: d.status, submittedAt: d.submittedAt, memo: d.memo }}
                                withFile={!d.hasFile}
                                busy={busyId === d.id}
                                submitLabel="保存する"
                                today={today}
                                onSubmit={(meta, picked) => void onEditDocument(d, meta, picked)}
                                onCancel={() => setEditing(null)}
                              />
                            )}
                            {confirmDeleteId === d.id && (
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800" role="alertdialog">
                                「{d.name || d.fileName}」を削除しますか？{d.hasFile ? "削除したファイルは元に戻せません。" : "削除した記録は元に戻せません。"}
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
                        );
                      })}
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
