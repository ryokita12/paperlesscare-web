"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth";
import {
  getBeneficiary,
  updateBeneficiary,
  type BeneficiaryRecord,
  type SavedCertPage,
} from "../../lib/firestore/beneficiaries";
import { PAGE_COUNT, PAGE_DEFINITIONS, emptyFormData } from "../../constants/certPages";
import type { FormDataType } from "../../types/cert";
import CertLayoutRenderer from "../../components/certLayouts";
import CertImageViewer from "./CertImageViewer";
import EditPageSwitcher from "./EditPageSwitcher";

// 8ページに満たない旧データ（今回の修正前に登録された受給者など）を、
// 画像なし・項目未取得の空ページで補って常にPAGE_COUNT件になるようにする。
function padPages(pages: SavedCertPage[]): SavedCertPage[] {
  return Array.from({ length: PAGE_COUNT }, (_, index) => {
    const existing = pages[index];
    if (existing) return existing;

    return {
      pageNo: index + 1,
      title: PAGE_DEFINITIONS[index]?.title || `ページ ${index + 1}`,
      formData: emptyFormData(),
      ocrText: "",
      storagePath: "",
    };
  });
}

export default function BeneficiaryEditPage() {
  const params = useParams<{ tenantId: string; beneficiaryId: string }>();
  const tenantId = params?.tenantId ?? "";
  const beneficiaryId = params?.beneficiaryId ?? "";
  const router = useRouter();
  const { user, loading } = useRequireAuth();

  const [record, setRecord] = useState<BeneficiaryRecord | null>(null);
  const [editedPages, setEditedPages] = useState<SavedCertPage[] | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [savingState, setSavingState] = useState<"idle" | "saving">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (loading || !user || !tenantId || !beneficiaryId) return;

    let cancelled = false;
    setLoadingRecord(true);
    setLoadError("");

    getBeneficiary(tenantId, beneficiaryId)
      .then((rec) => {
        if (cancelled) return;

        if (!rec) {
          setLoadError("受給者データが見つかりませんでした。");
          return;
        }

        setRecord(rec);
        setEditedPages(padPages(rec.pages));
      })
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
  }, [loading, user, tenantId, beneficiaryId]);

  const hasAnyImage = useMemo(
    () => !!editedPages?.some((p) => !!p.storagePath),
    [editedPages]
  );

  const updateField = (field: keyof FormDataType, value: string) => {
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

  const handleCancel = () => {
    if (dirty) {
      const ok = window.confirm("編集内容を破棄しますか？");
      if (!ok) return;
    }
    router.push(`/t/${tenantId}/beneficiaries`);
  };

  const handleSave = async () => {
    // saving中の連打・二重送信を防止
    if (!user || savingState === "saving" || !editedPages) return;

    setSavingState("saving");
    setSaveMessage("保存中...");

    try {
      await updateBeneficiary({ tenantId, beneficiaryId, pages: editedPages, user });

      const refreshed = await getBeneficiary(tenantId, beneficiaryId);
      if (refreshed) {
        setRecord(refreshed);
        setEditedPages(padPages(refreshed.pages));
      }

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

  if (loadError || !record || !editedPages) {
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

  const currentPage = editedPages[activePageIndex];
  const currentPageTitle =
    PAGE_DEFINITIONS[activePageIndex]?.title || `ページ ${activePageIndex + 1}`;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-bold">受給者情報の編集</div>
          <div className="mt-1 text-xs opacity-70">
            {record.summary.name || "未登録"}（{record.summary.number || "受給者番号未取得"}）
          </div>
        </div>

        <button
          type="button"
          onClick={handleCancel}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50"
        >
          受給者一覧に戻る
        </button>
      </div>

      {!hasAnyImage && (
        <div className="rounded-2xl border bg-amber-50 p-4 text-sm text-amber-800">
          この受給者の取り込み画像は保存されていません
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-4 shadow-sm md:sticky md:top-4 md:self-start">
          <div className="mb-3 text-sm font-semibold">取り込み画像</div>
          <EditPageSwitcher
            pages={editedPages}
            activePageIndex={activePageIndex}
            onChangePage={setActivePageIndex}
          />
          <CertImageViewer storagePath={currentPage.storagePath} />
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 rounded-xl bg-zinc-50 px-3 py-2">
            <div className="text-xs opacity-60">現在のページ</div>
            <div className="text-sm font-semibold break-words">
              {activePageIndex + 1}/{PAGE_COUNT}：{currentPageTitle}
            </div>
          </div>

          <div className="w-full max-w-full overflow-x-auto">
            <CertLayoutRenderer
              pageIndex={activePageIndex}
              pageTitle={currentPageTitle}
              page={{
                selectedFile: null,
                previewUrl: "",
                ocrText: currentPage.ocrText,
                formData: currentPage.formData,
                storagePath: currentPage.storagePath,
              }}
              onChangeField={updateField}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={savingState === "saving"}
              className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
            >
              キャンセル
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={savingState === "saving"}
              className="rounded-xl bg-black text-white px-5 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {savingState === "saving" ? "保存中..." : "保存する"}
            </button>
          </div>

          {saveMessage && <div className="mt-3 text-sm">{saveMessage}</div>}
        </section>
      </div>
    </div>
  );
}
