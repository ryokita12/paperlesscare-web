"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { storage, functions } from "@/lib/firebase";
import { useRequireAuth } from "@/lib/auth";
import type { CertPage } from "./types/cert";
import { PAGE_COUNT, PAGE_TITLES, emptyFormData, createEmptyPage } from "./constants/certPages";
import PageTabs from "./components/PageTabs";
import { parseCertText } from "./lib/parseCertText";

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

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [activePageIndex, setActivePageIndex] = useState(initialPage);
  const [pages, setPages] = useState<CertPage[]>(() =>
    Array.from({ length: PAGE_COUNT }, () => createEmptyPage())
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const nextPath = useMemo(() => `/t/${tenantId || "aaaa"}`, [tenantId]);
  const currentPage = pages[activePageIndex];
  const currentPageTitle = PAGE_TITLES[activePageIndex] || `ページ ${activePageIndex + 1}`;

  const updateCurrentPage = (updater: (page: CertPage) => CertPage) => {
    setPages((prev) =>
      prev.map((page, index) => (index === activePageIndex ? updater(page) : page))
    );
  };

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
      pages.forEach((page) => {
        if (page.previewUrl.startsWith("blob:")) {
          URL.revokeObjectURL(page.previewUrl);
        }
      });
    };
  }, [pages]);

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

      const parsed = parseCertText(text);

      updateCurrentPage((page) => ({
        ...page,
        ocrText: text,
        formData: parsed,
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

  const scrollToUpload = () => {
    const el = document.getElementById("upload-section");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="grid gap-4 md:hidden justify-items-center">
        <button
          type="button"
          onClick={scrollToUpload}
          className="w-full max-w-[320px] text-left rounded-2xl border bg-white p-4 hover:bg-zinc-50 transition"
        >
          <div className="text-sm font-semibold">受給者証取込＆送信</div>
          <div className="mt-1 text-xs opacity-70">
            8枚綴りの受給者証をページごとに登録します
          </div>
        </button>

        <Link
          href={`/t/${tenantId}/settings`}
          className="w-full max-w-[320px] rounded-2xl border bg-white p-4 hover:bg-zinc-50 transition"
        >
          <div className="text-sm font-semibold">システム設定</div>
          <div className="mt-1 text-xs opacity-70">OCR/保存先などの設定を管理</div>
        </Link>

        <Link
          href="/logout"
          className="w-full max-w-[320px] rounded-2xl border bg-white p-4 hover:bg-zinc-50 transition"
        >
          <div className="text-sm font-semibold text-red-600">ログアウト</div>
          <div className="mt-1 text-xs opacity-70">現在のアカウントからログアウト</div>
        </Link>
      </div>

      <div className="w-full max-w-[360px] md:max-w-full mx-auto rounded-2xl border bg-white p-4 md:p-5 overflow-x-visible">
        <PageTabs
          pages={pages}
          activePageIndex={activePageIndex}
          onChangePage={setActivePageIndex}
        />

        <div className="mb-3 rounded-xl bg-zinc-50 px-3 py-2">
          <div className="text-xs opacity-60">現在のページ</div>
          <div className="text-sm font-semibold break-words">
            {activePageIndex + 1}/8：{currentPageTitle}
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold">受給者証取込＆送信</div>
            <div className="mt-1 w-full min-w-0 text-xs opacity-70 break-all">
              tenant: {tenantId} / uid: {user.uid}
            </div>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50 transition"
              href={`/t/${tenantId}/settings`}
            >
              システム設定
            </Link>
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
              <div className="min-w-full border text-[10px] leading-5">
                <div className="border-b px-4 py-3 text-center text-[18px]">
                  {currentPageTitle}
                </div>

                <div className="grid grid-cols-[140px_1fr] border-b">
                  <div className="border-r px-3 py-3 text-center">受給者番号</div>
                  <div className="px-3 py-3">{currentPage.formData.number}</div>
                </div>

                <div className="grid grid-cols-[30px_110px_1fr] border-b min-h-[220px]">
                  <div className="border-r flex items-center justify-center [writing-mode:vertical-rl] text-center px-2">
                    支給決定障害者等
                  </div>
                  <div className="border-r grid grid-rows-[56px_56px_56px_1fr]">
                    <div className="border-b flex items-center justify-center">居住地</div>
                    <div className="border-b flex items-center justify-center">フリガナ</div>
                    <div className="border-b flex items-center justify-center">氏名</div>
                    <div className="flex items-center justify-center">生年月日</div>
                  </div>
                  <div className="grid grid-rows-[56px_56px_56px_1fr]">
                    <div className="border-b px-3 py-2 whitespace-pre-wrap">
                      {currentPage.formData.address}
                    </div>
                    <div className="border-b px-3 py-2"></div>
                    <div className="border-b px-3 py-2">{currentPage.formData.name}</div>
                    <div className="px-3 py-2">{currentPage.formData.birthday}</div>
                  </div>
                </div>

                <div className="grid grid-cols-[30px_110px_1fr] border-b min-h-[170px]">
                  <div className="border-r flex items-center justify-center [writing-mode:vertical-rl] text-center px-2">
                    児童
                  </div>
                  <div className="border-r grid grid-rows-[56px_56px_1fr]">
                    <div className="border-b flex items-center justify-center">フリガナ</div>
                    <div className="border-b flex items-center justify-center">氏名</div>
                    <div className="flex items-center justify-center">生年月日</div>
                  </div>
                  <div className="grid grid-rows-[56px_56px_1fr]">
                    <div className="border-b px-3 py-2"></div>
                    <div className="border-b px-3 py-2">
                      {currentPage.formData.childName}
                    </div>
                    <div className="px-3 py-2">{currentPage.formData.childBirthday}</div>
                  </div>
                </div>

                <div className="grid grid-cols-[140px_1fr] border-b">
                  <div className="border-r px-3 py-3 text-center">障害種別</div>
                  <div className="px-3 py-3">{currentPage.formData.disabilityType}</div>
                </div>

                <div className="grid grid-cols-[140px_1fr] border-b">
                  <div className="border-r px-3 py-3 text-center">交付年月日</div>
                  <div className="px-3 py-3">{currentPage.formData.issueDate}</div>
                </div>

                <div className="grid grid-cols-[140px_1fr] min-h-[140px]">
                  <div className="border-r px-3 py-3 text-center">
                    <div>支給市区町村名</div>
                    <div className="mt-6">及び印</div>
                  </div>
                  <div className="px-3 py-3">{currentPage.formData.cityName}</div>
                </div>
              </div>
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
      </div>
    </div>
  );
}