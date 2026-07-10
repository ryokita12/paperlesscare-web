"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { storage, functions } from "@/lib/firebase";
import { useRequireAuth } from "@/lib/auth";
import type { CertPage } from "./types/cert";
import {
  PAGE_COUNT,
  PAGE_TITLES,
  CERT_TYPES,
  type CertTypeId,
  emptyFormData,
  createEmptyPage,
} from "./constants/certPages";
import PageTabs from "./components/PageTabs";
import CertLayoutRenderer from "./components/certLayouts";
import RecipientImportModeSelect from "./components/RecipientImportModeSelect";
import { parseCertText } from "./lib/parsers/parseCertText";
import { saveBeneficiary } from "./lib/firestore/beneficiaries";

type OcrResponse = { text?: string };

const STORAGE_KEY_PREFIX = "paperlesscare_capture_v1_";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function TenantHome() {
  const router = useRouter();
  const routeParams = useParams<{ tenantId: string }>();
  const searchParams = useSearchParams();

  const tenantId = routeParams?.tenantId ?? "";
  const { user, loading } = useRequireAuth();

  const initialPage = clamp(
    Number(searchParams.get("page") || "1") - 1,
    0,
    PAGE_COUNT - 1
  );

  const [flowStep, setFlowStep] = useState<"selectMode" | "import">("selectMode");
  const [importMode, setImportMode] = useState<"new" | "update" | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [activePageIndex, setActivePageIndex] = useState(initialPage);
  const [selectedCertType, setSelectedCertType] = useState<CertTypeId>("adult");
  const [pages, setPages] = useState<CertPage[]>(() =>
    Array.from({ length: PAGE_COUNT }, () => createEmptyPage())
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pagesRef = useRef<CertPage[]>(pages);

  const nextPath = useMemo(() => `/t/${tenantId || "aaaa"}`, [tenantId]);
  const currentPage = pages[activePageIndex];
  const currentPageTitle = PAGE_TITLES[activePageIndex] || `ページ ${activePageIndex + 1}`;
  const currentCertType = CERT_TYPES.find((type) => type.id === selectedCertType) || CERT_TYPES[0];
  const completedCount = pages.filter((page) => !!page.previewUrl).length;

  const updateCurrentPage = (updater: (page: CertPage) => CertPage) => {
    setPages((prev) =>
      prev.map((page, index) => (index === activePageIndex ? updater(page) : page))
    );
  };

  const updateFormField = (
    field: keyof CertPage["formData"],
    value: string
  ) => {
    updateCurrentPage((page) => ({
      ...page,
      formData: {
        ...page.formData,
        [field]: value,
      },
    }));
  };

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    setActivePageIndex(initialPage);
  }, [initialPage]);

  useEffect(() => {
    const storageKey = `${STORAGE_KEY_PREFIX}${tenantId}`;
    const dataUrl =
      typeof window !== "undefined" ? sessionStorage.getItem(storageKey) : null;
    if (!dataUrl) return;

    sessionStorage.removeItem(storageKey);

    (async () => {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `capture_${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      onFileSelected(file, dataUrl);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activePageIndex]);

  useEffect(() => {
    return () => {
      pagesRef.current.forEach((page) => {
        if (page.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(page.previewUrl);
        }
      });
    };
  }, []);

  const resetSelection = () => {
    if (currentPage.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(currentPage.previewUrl);
    }

    updateCurrentPage(() => createEmptyPage());
    setStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onPickClick = () => {
    if (busy) return;

    const isMobile =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)")?.matches ||
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

    if (isMobile) {
      router.push(
        `/t/${tenantId}/capture?next=${encodeURIComponent(
          `/t/${tenantId}?page=${activePageIndex + 1}`
        )}`
      );
      return;
    }

    fileInputRef.current?.click();
  };

  const onFileSelected = (file: File | null, previewOverride?: string) => {
    if (!file) return;

    const nextPreviewUrl = previewOverride || URL.createObjectURL(file);

    if (currentPage.previewUrl && currentPage.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(currentPage.previewUrl);
    }

    updateCurrentPage((page) => ({
      ...page,
      selectedFile: file,
      previewUrl: nextPreviewUrl,
      ocrText: "",
      formData: emptyFormData(),
    }));

    setStatus(
      `✅ ${activePageIndex + 1}/${PAGE_COUNT} の画像を選択しました。内容を確認して「取込開始」を押してください。`
    );
  };

  const onPasteImage = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (busy) return;

    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const imageItem = Array.from(items).find((it) => it.type.startsWith("image/"));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    e.preventDefault();
    onFileSelected(file);
  };

  const startImport = async () => {
    if (!currentPage.selectedFile || !user) return;

    setBusy(true);
    setStatus(`${activePageIndex + 1}/${PAGE_COUNT} をアップロード中...`);

    updateCurrentPage((page) => ({
      ...page,
      ocrText: "",
      formData: emptyFormData(),
    }));

    try {
      const uid = user.uid;
      const safeName = currentPage.selectedFile.name.replace(/[^\w.\-]/g, "_");
      const path = `uploads/${uid}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, currentPage.selectedFile, {
        contentType: currentPage.selectedFile.type || "image/jpeg",
      });

      setStatus(`✅ ${activePageIndex + 1}/${PAGE_COUNT} をOCR中...`);

      const ocrFromStoragePath = httpsCallable<{ storagePath: string }, OcrResponse>(
        functions,
        "ocrFromStoragePath"
      );

      const res = await ocrFromStoragePath({ storagePath: path });
      const text = res.data?.text ?? "";

      console.log("OCR RAW TEXT", text);

      const parsed = parseCertText(
        text,
        activePageIndex,
        selectedCertType
      );

      console.log("PARSED CERT DATA", parsed);

      updateCurrentPage((page) => ({
        ...page,
        ocrText: text,
        formData: parsed,
        storagePath: path,
      }));

      setStatus(
        text
          ? `✅ ${activePageIndex + 1}/${PAGE_COUNT} のOCRが完了しました`
          : `⚠️ ${activePageIndex + 1}/${PAGE_COUNT} のOCR結果が空でした`
      );
    } catch (e: any) {
      setStatus(`❌ Error: ${e.code || ""} ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBeneficiary = async () => {
    if (!user || saving) return;

    if (completedCount === 0) {
      setSaveMessage("⚠️ 少なくとも1ページ以上取り込んでから保存してください。");
      return;
    }

    setSaving(true);
    setSaveMessage("保存中...");

    try {
      const id = await saveBeneficiary({
        tenantId,
        certType: selectedCertType,
        pageTitles: PAGE_TITLES,
        pages: pagesRef.current,
        user,
      });

      setSaveMessage(`✅ 保存しました（ID: ${id}）。「受給者管理」画面から確認できます。`);
      setPages(Array.from({ length: PAGE_COUNT }, () => createEmptyPage()));
      setActivePageIndex(0);
      setStatus("");
      setFlowStep("selectMode");
      setImportMode(null);
    } catch (e: any) {
      setSaveMessage(`❌ 保存に失敗しました: ${e.code || ""} ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
            onClick={() => router.push(`/login?next=${encodeURIComponent(nextPath)}`)}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  const canStart = !!currentPage.selectedFile && !busy;

  if (flowStep === "selectMode") {
    return (
      <div className="space-y-6 overflow-x-hidden">
        <RecipientImportModeSelect
          onSelect={(mode) => {
            setImportMode(mode);

            if (mode === "new") {
              setFlowStep("import");
              return;
            }

            alert("既存受給者検索は次のステップで追加します");
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="mb-3 text-xl font-bold">受給者証取込＆送信</div>
      <div className="w-full max-w-[1280px] mx-auto space-y-4">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold">
            ①受給者証の種類を選択してください
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {CERT_TYPES.map((type) => {
              const active = selectedCertType === type.id;
              const disabled = !type.enabled;

              return (
                <button
                  key={type.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    setSelectedCertType(type.id);
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${type.themeClass} ${
                    active ? "cert-type-active shadow-sm" : "opacity-70 hover:opacity-100"
                  } ${disabled ? "cursor-not-allowed opacity-50 hover:opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold">{type.shortLabel}</div>
                      <div className="mt-1 text-xs opacity-70">{type.colorName}</div>

                      {type.statusLabel && (
                        <div className="mt-2 inline-flex rounded-full bg-white/70 px-2 py-1 text-[11px] font-bold text-zinc-500">
                          {type.statusLabel}
                        </div>
                      )}
                    </div>

                    {active && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold shadow-sm">
                        ✓
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">現在の取込状況</div>

            <button
              type="button"
              onClick={() => {
                setPages(Array.from({ length: PAGE_COUNT }, () => createEmptyPage()));
                setStatus("");
              }}
              disabled={busy}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              取込状況をリセット
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.4fr] md:items-center">
            <div className={`rounded-xl border px-4 py-2 text-sm font-semibold ${currentCertType.themeClass}`}>
              {currentCertType.colorName.replace("色の受給者証", "")}：{currentCertType.label}
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold">
                {completedCount} / {PAGE_COUNT} ページ取込済み
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className={`h-full rounded-full transition-all ${currentCertType.themeClass}`}
                  style={{ width: `${(completedCount / PAGE_COUNT) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-5">
            <PageTabs
              pages={pages}
              activePageIndex={activePageIndex}
              selectedCertType={selectedCertType}
              onChangePage={setActivePageIndex}
            />
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 rounded-xl bg-zinc-50 px-3 py-2">
            <div className="text-xs opacity-60">現在のページ</div>
            <div className="text-sm font-semibold break-words">
              {activePageIndex + 1}/8：{currentPageTitle}
            </div>
          </div>

          <div id="upload-section" className="mt-5 grid gap-4 md:grid-cols-2 w-full max-w-full min-w-0">
            <div className="min-w-0 rounded-2xl border p-5">
              <div className="text-sm font-semibold">
                受給者証画像（{activePageIndex + 1}/8）
              </div>
              <div className="mt-1 text-xs opacity-70">
                {currentPageTitle} の画像を登録します
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy}
                className="hidden"
                onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
              />

              <div
                className="mt-4 rounded-2xl border p-4 bg-zinc-50"
                onPaste={onPasteImage}
                tabIndex={0}
                role="button"
                aria-label="画像貼り付けエリア"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onPickClick}
                    disabled={busy}
                    className="rounded-xl bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
                  >
                    ファイルを選択
                  </button>

                  <button
                    type="button"
                    onClick={startImport}
                    disabled={!canStart}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-white transition disabled:opacity-50"
                  >
                    取込開始
                  </button>

                  <button
                    type="button"
                    onClick={resetSelection}
                    disabled={busy}
                    className="rounded-xl border px-4 py-2 text-sm hover:bg-white transition disabled:opacity-50"
                  >
                    クリア
                  </button>
                </div>

                <div className="mt-2 text-xs opacity-70">
                  {currentPage.selectedFile ? (
                    <>
                      選択中：
                      <span className="break-all">{currentPage.selectedFile.name}</span>
                    </>
                  ) : (
                    <>このページの画像を選択してください</>
                  )}
                </div>
              </div>

              <div className="mt-4 text-sm">{busy ? "処理中…" : status}</div>

              {currentPage.previewUrl && (
                <div className="mt-4">
                  <div className="text-xs opacity-70">
                    サムネイル（{activePageIndex + 1}/8）
                  </div>
                  <img
                    src={currentPage.previewUrl}
                    alt="preview"
                    className="mt-2 block w-full max-w-full rounded-xl border"
                  />
                </div>
              )}
            </div>

            <div className="min-w-0 rounded-2xl border p-5">
              <div className="text-sm font-semibold">
                受給者証取込 結果（{activePageIndex + 1}/8）
              </div>
              <div className="mt-1 text-xs opacity-70">
                {currentPageTitle} のレイアウトに合わせて表示
              </div>

              <div className="mt-4 w-full max-w-full overflow-x-auto">
                <CertLayoutRenderer
                  pageIndex={activePageIndex}
                  pageTitle={currentPageTitle}
                  page={currentPage}
                  onChangeField={updateFormField}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActivePageIndex((prev) => Math.max(0, prev - 1))}
              disabled={activePageIndex === 0}
              className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
            >
              前のページ
            </button>

            <div className="text-xs opacity-70">
              現在 {activePageIndex + 1} / {PAGE_COUNT} ： {currentPageTitle}
            </div>

            <button
              type="button"
              onClick={() =>
                setActivePageIndex((prev) => Math.min(PAGE_COUNT - 1, prev + 1))
              }
              disabled={activePageIndex === PAGE_COUNT - 1}
              className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
            >
              次のページ
            </button>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">③内容を確認して保存</div>
              <div className="mt-1 text-xs opacity-70">
                {completedCount} / {PAGE_COUNT} ページ取込済み。取り込んだ内容を確定してFirestoreに保存します。
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveBeneficiary}
              disabled={saving || completedCount === 0}
              className="rounded-xl bg-black text-white px-5 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "保存中..." : "確定して保存"}
            </button>
          </div>

          {saveMessage && (
            <div className="mt-3 text-sm">{saveMessage}</div>
          )}
        </section>
      </div>
    </div>
  );
}