"use client";

// 利用者カルテ「受給者証」タブの本体。
// Phase 1-A 以前の利用者詳細画面（beneficiaries/[beneficiaryId]/page.tsx）の内容をそのまま移したもので、
// 受給者証の読み込み・現在／過去の切り替え・画像表示・OCR結果の修正保存・更新フローへの遷移の処理は変えていない。
// 変更点は (1) 利用者IDを URL ではなく props で受け取る、(2) 氏名の見出しと「一覧に戻る」をカルテ上部へ移した、
// (3) 選択中の受給者証の要点（CertificateHighlightsCard）を追加した、(4) 未保存の修正があるかを親へ知らせる、の4点。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import {
  getBeneficiary,
  listCertificates,
  updateBeneficiary,
  updateCertificatePages,
  type BeneficiaryRecord,
  type CertificateRecord,
  type SavedCertPage,
} from "../../../lib/firestore/beneficiaries";
import {
  CERT_TYPES,
  PAGE_COUNT,
  getPageDefinitions,
  getPageTitle,
  emptyFormData,
  type CertTypeId,
} from "../../../constants/certPages";
import type { FormDataType } from "../../../types/cert";
import CertLayoutRenderer from "../../../components/certLayouts";
import CertImageViewer from "../CertImageViewer";
import EditPageSwitcher from "../EditPageSwitcher";
import CertificateHighlightsCard from "./CertificateHighlightsCard";

// 8ページに満たない旧データ（今回の修正前に登録された受給者など）を、
// 画像なし・項目未取得の空ページで補って常にPAGE_COUNT件になるようにする。
function padPages(
  pages: SavedCertPage[],
  certType: CertTypeId
): SavedCertPage[] {
  return Array.from({ length: PAGE_COUNT }, (_, index) => {
    const existing = pages[index];
    if (existing) return existing;

    return {
      pageNo: index + 1,
      title: getPageDefinitions(certType)[index]?.title || `ページ ${index + 1}`,
      formData: emptyFormData(),
      ocrText: "",
      storagePath: "",
    };
  });
}

function certTypeLabel(certType: string | null) {
  if (!certType) return "";
  return CERT_TYPES.find((t) => t.id === certType)?.colorName || certType;
}

function formatTimestamp(ts: CertificateRecord["createdAt"]) {
  if (!ts) return "";
  try {
    return ts.toDate().toLocaleDateString("ja-JP");
  } catch {
    return "";
  }
}

function formatPeriod(cert: CertificateRecord) {
  if (!cert.validFrom && !cert.validTo) return "";
  return `${cert.validFrom ?? "?"} 〜 ${cert.validTo ?? "?"}`;
}

type Props = {
  tenantId: string;
  beneficiaryId: string;
  // 受給者証の修正に未保存の変更があるか（カルテのタブ切り替え時の確認に使う）
  onDirtyChange?: (dirty: boolean) => void;
  // 受給者証の修正を保存したとき（カルテ上部の表示を最新にする）
  onSaved?: () => void;
};

export default function CertificatesPanel({ tenantId, beneficiaryId, onDirtyChange, onSaved }: Props) {
  const router = useRouter();
  const { user, loading } = useRequireAuth();

  const [record, setRecord] = useState<BeneficiaryRecord | null>(null);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [editedPages, setEditedPages] = useState<SavedCertPage[] | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savingState, setSavingState] = useState<"idle" | "saving">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const selectCertificate = useCallback((cert: CertificateRecord | undefined) => {
    setSelectedCertificateId(cert?.id ?? "");
    setEditedPages(cert ? padPages(cert.pages, cert.certType) : null);
    setActivePageIndex(0);
    setDirty(false);
  }, []);

  // 利用者と受給者証一覧を読み込み、選択中の証（既定は現在の証）を表示する
  const load = useCallback(
    async (preferCertificateId?: string) => {
      const rec = await getBeneficiary(tenantId, beneficiaryId);
      if (!rec) {
        setLoadError("受給者データが見つかりませんでした。");
        return;
      }

      const certs = await listCertificates(tenantId, rec);
      setRecord(rec);
      setCertificates(certs);
      selectCertificate(certs.find((c) => c.id === preferCertificateId) ?? certs[0]);
    },
    [tenantId, beneficiaryId, selectCertificate]
  );

  useEffect(() => {
    if (loading || !user || !tenantId || !beneficiaryId) return;

    let cancelled = false;
    setLoadingRecord(true);
    setLoadError("");

    load()
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "受給者データの取得に失敗しました");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRecord(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user, tenantId, beneficiaryId, load]);

  const selectedCertificate = certificates.find((c) => c.id === selectedCertificateId);
  const currentCertificates = certificates.filter((c) => c.status === "current");
  const pastCertificates = certificates.filter((c) => c.status !== "current");
  // 過去の受給者証は履歴として閲覧のみ（内容を書き換えない）
  const readOnly = !!selectedCertificate && selectedCertificate.status !== "current";

  const hasAnyImage = useMemo(
    () => !!editedPages?.some((p) => !!p.storagePath),
    [editedPages]
  );

  const updateField = (field: keyof FormDataType, value: string) => {
    if (readOnly) return;
    setEditedPages((prev) => {
      if (!prev) return prev;
      return prev.map((page, index) =>
        index === activePageIndex
          ? { ...page, formData: { ...page.formData, [field]: value } }
          : page
      );
    });
    setDirty(true);
    setSaveMessage("");
  };

  const confirmDiscard = () => !dirty || window.confirm("編集内容を破棄しますか？");

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleSelectCertificate = (cert: CertificateRecord) => {
    if (cert.id === selectedCertificateId || !confirmDiscard()) return;
    selectCertificate(cert);
    setSaveMessage("");
  };

  // 受給者証の取込画面へ、この利用者を対象として遷移する
  const handleRegisterCertificate = () => {
    if (!confirmDiscard()) return;
    router.push(`/t/${tenantId}?beneficiaryId=${encodeURIComponent(beneficiaryId)}&new=1`);
  };

  const handleSave = async () => {
    // saving中の連打・二重送信を防止
    if (!user || savingState === "saving" || !editedPages || !selectedCertificate || readOnly) return;

    setSavingState("saving");
    setSaveMessage("保存中...");

    try {
      if (selectedCertificate.isLegacyVirtual) {
        // 受給者証サブコレクション導入前の旧データは、従来どおり利用者docを更新する
        await updateBeneficiary({ tenantId, beneficiaryId, pages: editedPages, user });
      } else {
        await updateCertificatePages({
          tenantId,
          beneficiaryId,
          certificateId: selectedCertificate.id,
          pages: editedPages,
          user,
        });
      }

      await load(selectedCertificate.id);
      onSaved?.();
      setDirty(false);
      setSaveMessage("✅ 保存しました。");
    } catch (e: unknown) {
      // 失敗時も入力内容は保持し、再度「保存する」を押せばそのまま再送信できるようにする
      const code =
        typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
      const message = e instanceof Error ? e.message : String(e);
      setSaveMessage(`❌ 保存に失敗しました: ${code} ${message}`);
    } finally {
      setSavingState("idle");
    }
  };

  if (loading || loadingRecord) {
    return (
      <div className="space-y-4">
        <div className="text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 w-full max-w-full overflow-hidden">
          <div className="text-sm">ログインしてください</div>
          <button
            className="mt-4 w-full rounded-xl border px-3 py-2 text-sm"
            onClick={() =>
              router.push(
                `/login?next=${encodeURIComponent(`/t/${tenantId}/beneficiaries/${beneficiaryId}`)}`
              )
            }
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  if (loadError || !record) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border bg-white p-5 text-sm">
          {loadError || "受給者データが見つかりませんでした。"}
        </div>
        <button
          type="button"
          onClick={() => router.push(`/t/${tenantId}/beneficiaries`)}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50"
        >
          受給者一覧に戻る
        </button>
      </div>
    );
  }

  const hasCertificate = certificates.length > 0;

  const renderCertificateButton = (cert: CertificateRecord) => {
    const active = cert.id === selectedCertificateId;
    const isCurrent = cert.status === "current";
    const period = formatPeriod(cert);

    return (
      <button
        key={cert.id}
        type="button"
        onClick={() => handleSelectCertificate(cert)}
        className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
          active ? "border-black bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              isCurrent ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-700"
            }`}
          >
            {isCurrent ? "現在" : "過去"}
          </span>
          <span className="font-semibold">{certTypeLabel(cert.certType)}</span>
        </div>
        <div className={`mt-1 ${active ? "opacity-80" : "text-zinc-500"}`}>
          {cert.issueDate && <>交付：{cert.issueDate}　</>}
          {period && <>期間：{period}　</>}
          {formatTimestamp(cert.createdAt) && <>登録：{formatTimestamp(cert.createdAt)}</>}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold">受給者証</div>
          <div className="mt-1 text-xs text-zinc-500">
            受給者証の写真と記載内容です。新しい受給者証に変わったときは「受給者証を更新」から取り込んでください（以前の受給者証は履歴に残ります）。
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRegisterCertificate}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            {hasCertificate ? "受給者証を更新" : "受給者証を登録"}
          </button>
        </div>
      </div>

      {!hasCertificate && (
        <section className="rounded-2xl border bg-amber-50 p-5 text-sm text-amber-900">
          <div className="font-semibold">受給者証がまだ登録されていません</div>
          <div className="mt-1 text-xs">
            「受給者証を登録」から受給者証を撮影・取り込むと、この利用者に紐付けて保存されます。
          </div>
          <button
            type="button"
            onClick={handleRegisterCertificate}
            className="mt-3 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            受給者証を登録
          </button>
        </section>
      )}

      {hasCertificate && (
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-semibold">現在の受給者証</div>
              <div className="space-y-2">
                {currentCertificates.length > 0 ? (
                  currentCertificates.map(renderCertificateButton)
                ) : (
                  <div className="text-xs text-zinc-500">現在の受給者証はありません</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold">
                過去の受給者証（{pastCertificates.length}件）
              </div>
              <div className="space-y-2">
                {pastCertificates.length > 0 ? (
                  pastCertificates.map(renderCertificateButton)
                ) : (
                  <div className="text-xs text-zinc-500">過去の受給者証はありません</div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedCertificate && editedPages && (
        <>
          <CertificateHighlightsCard certificate={selectedCertificate} />

          {readOnly && (
            <div className="rounded-2xl border bg-zinc-100 p-4 text-sm text-zinc-700">
              過去の受給者証を表示しています（履歴のため閲覧のみ）
            </div>
          )}

          {!hasAnyImage && (
            <div className="rounded-2xl border bg-amber-50 p-4 text-sm text-amber-800">
              この受給者証の取り込み画像は保存されていません
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border bg-white p-4 shadow-sm md:sticky md:top-4 md:self-start">
              <div className="mb-3 text-sm font-semibold">取り込み画像</div>
              <EditPageSwitcher
                certType={selectedCertificate.certType}
                pages={editedPages}
                activePageIndex={activePageIndex}
                onChangePage={setActivePageIndex}
              />
              <CertImageViewer storagePath={editedPages[activePageIndex].storagePath} />
            </section>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-3 rounded-xl bg-zinc-50 px-3 py-2">
                <div className="text-xs opacity-60">
                  {readOnly ? "過去の受給者証" : "現在の受給者証"}：{certTypeLabel(selectedCertificate.certType)}
                </div>
                <div className="text-sm font-semibold break-words">
                  {activePageIndex + 1}/{PAGE_COUNT}：
                  {getPageTitle(selectedCertificate.certType, activePageIndex)}
                </div>
              </div>

              {/* 過去の受給者証は fieldset ごと無効化し、編集ボタンを押せないようにする */}
              <fieldset disabled={readOnly} className="w-full max-w-full min-w-0 overflow-x-auto">
                <CertLayoutRenderer
                  certType={selectedCertificate.certType}
                  pageIndex={activePageIndex}
                  pageTitle={getPageTitle(selectedCertificate.certType, activePageIndex)}
                  page={{
                    selectedFile: null,
                    previewUrl: "",
                    ocrText: editedPages[activePageIndex].ocrText,
                    formData: editedPages[activePageIndex].formData,
                    storagePath: editedPages[activePageIndex].storagePath,
                  }}
                  onChangeField={updateField}
                />
              </fieldset>

              {!readOnly && (
                <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={savingState === "saving" || !dirty}
                    className="rounded-xl bg-black text-white px-5 py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    {savingState === "saving" ? "保存中..." : "修正内容を保存"}
                  </button>
                </div>
              )}

              {saveMessage && <div className="mt-3 text-sm">{saveMessage}</div>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
