"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
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
import {
  reserveBeneficiaryId,
  saveBeneficiary,
  type SavedCertPage,
} from "./lib/firestore/beneficiaries";
import { compressImageToJpeg } from "./lib/image/compressImage";

type OcrResponse = { text?: string };

// OCR用に画像をCallable Functionへ渡すため、Base64文字列（data:URLのプレフィックスなし）に変換する
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

const STORAGE_KEY_PREFIX = "paperlesscare_capture_v1_";
const SESSION_STORAGE_KEY_PREFIX = "paperlesscare_import_session_v1_";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatError(e: unknown): string {
  const code =
    typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e instanceof Error ? e.message : String(e);
  return `${code} ${message}`.trim();
}

// スマホ撮影画面（別ルート）へ遷移して戻ってきた際に、取込中の状態を
// 復元するためのセッション。File/blobなどJSON化できない値は対象外。
type PersistedPageData = {
  formData: CertPage["formData"];
  ocrText: string;
  storagePath: string;
};

type ImportSession = {
  flowStep: "selectMode" | "import";
  importMode: "new" | "update" | null;
  selectedCertType: CertTypeId;
  activePageIndex: number;
  beneficiaryId: string;
  pages: PersistedPageData[];
};

function importSessionKey(tenantId: string) {
  return `${SESSION_STORAGE_KEY_PREFIX}${tenantId}`;
}

function readImportSession(tenantId: string): ImportSession | null {
  if (typeof window === "undefined" || !tenantId) return null;

  try {
    const raw = sessionStorage.getItem(importSessionKey(tenantId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.pages)) return null;

    return parsed as ImportSession;
  } catch {
    return null;
  }
}

function writeImportSession(tenantId: string, session: ImportSession) {
  if (typeof window === "undefined" || !tenantId) return;

  try {
    sessionStorage.setItem(importSessionKey(tenantId), JSON.stringify(session));
  } catch {
    // sessionStorageが使えない環境では復元できないだけなので無視する
  }
}

function clearImportSession(tenantId: string) {
  if (typeof window === "undefined" || !tenantId) return;
  sessionStorage.removeItem(importSessionKey(tenantId));
}

export default function TenantHome() {
  const router = useRouter();
  const routeParams = useParams<{ tenantId: string }>();
  const searchParams = useSearchParams();

  const tenantId = routeParams?.tenantId ?? "";
  const { user, loading } = useRequireAuth();

  // スマホ撮影からの復路など、同一tenantIdでの再マウント時に
  // sessionStorageから取込中の状態を1回だけ読み込む
  const restoredSession = useMemo(() => readImportSession(tenantId), [tenantId]);

  const pageQueryParam = searchParams.get("page");
  const initialPage = pageQueryParam
    ? clamp(Number(pageQueryParam) - 1, 0, PAGE_COUNT - 1)
    : clamp(restoredSession?.activePageIndex ?? 0, 0, PAGE_COUNT - 1);

  const [flowStep, setFlowStep] = useState<"selectMode" | "import">(
    () => restoredSession?.flowStep ?? "selectMode"
  );
  const [importMode, setImportMode] = useState<"new" | "update" | null>(
    () => restoredSession?.importMode ?? null
  );

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [activePageIndex, setActivePageIndex] = useState(initialPage);
  const [selectedCertType, setSelectedCertType] = useState<CertTypeId>(
    () => restoredSession?.selectedCertType ?? "adult"
  );
  // 受給者ドキュメントIDを取込開始時点で事前採番しておく。ページ画像は最初から
  // このIDに紐づくStorageパス（tenants/{tenantId}/recipients/{beneficiaryId}/pageN.jpg）へ
  // アップロードするため、保存後に画像を移動させる必要がなく、保存の再試行も安全になる。
  const [beneficiaryId, setBeneficiaryId] = useState<string>(
    () => restoredSession?.beneficiaryId || (tenantId ? reserveBeneficiaryId(tenantId) : "")
  );
  const [compressing, setCompressing] = useState(false);
  const [pages, setPages] = useState<CertPage[]>(() => {
    const base = Array.from({ length: PAGE_COUNT }, () => createEmptyPage());
    if (!restoredSession) return base;

    return base.map((page, index) => {
      const saved = restoredSession.pages[index];
      if (!saved) return page;

      return {
        ...page,
        formData: { ...emptyFormData(), ...saved.formData },
        ocrText: saved.ocrText || "",
        storagePath: saved.storagePath || "",
      };
    });
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pagesRef = useRef<CertPage[]>(pages);
  const hasHydratedSessionRef = useRef(false);

  const nextPath = useMemo(() => `/t/${tenantId || "aaaa"}`, [tenantId]);
  const currentPage = pages[activePageIndex];
  const currentPageTitle = PAGE_TITLES[activePageIndex] || `ページ ${activePageIndex + 1}`;
  const currentCertType = CERT_TYPES.find((type) => type.id === selectedCertType) || CERT_TYPES[0];
  // 画像は確定保存時まで一切アップロードしないため、「取込済み」の判定は
  // ブラウザ内に保持しているFile（selectedFile）の有無で行う。
  // ページ再読み込みやセッション復元をまたぐとFileは保持できないため、
  // その場合は再度この画面で画像を選び直す必要がある。
  const completedCount = pages.filter((page) => !!page.selectedFile).length;

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

  // tenantIdの解決がレンダリング後にずれ込んだ場合の保険。通常はuseParams()が
  // 初回レンダリングで解決済みのため、ここが実行されるのは稀。
  useEffect(() => {
    if (!tenantId || beneficiaryId) return;
    setBeneficiaryId(reserveBeneficiaryId(tenantId));
  }, [tenantId, beneficiaryId]);

  // 取込中の状態（flowStep/importMode/selectedCertType/activePageIndex/beneficiaryId/
  // 各ページのformData・ocrText・storagePath）をtenantId単位でsessionStorageへ自動保存する。
  // マウント直後（＝復元直後）の1回目は書き込みをスキップし、
  // 復元前の空状態で上書きしてしまわないようにする。
  useEffect(() => {
    if (!tenantId) return;

    if (!hasHydratedSessionRef.current) {
      hasHydratedSessionRef.current = true;
      return;
    }

    writeImportSession(tenantId, {
      flowStep,
      importMode,
      selectedCertType,
      activePageIndex,
      beneficiaryId,
      pages: pages.map((page) => ({
        formData: page.formData,
        ocrText: page.ocrText,
        storagePath: page.storagePath,
      })),
    });
  }, [tenantId, flowStep, importMode, selectedCertType, activePageIndex, beneficiaryId, pages]);

  useEffect(() => {
    if (loading || !user) return;

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
      await performOcr(file);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activePageIndex, loading, user]);

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

  const onFileSelected = async (file: File | null, previewOverride?: string) => {
    if (!file) return;

    let finalFile = file;

    // カメラ撮影経由（previewOverrideあり）は既にcapture画面側でcrop・圧縮済みのため対象外。
    // デスクトップのファイル選択・クリップボード貼り付けのみ、アップロード前に圧縮する。
    if (!previewOverride) {
      setCompressing(true);
      setStatus("画像を圧縮中...");
      try {
        finalFile = await compressImageToJpeg(file, { maxDimension: 1800, quality: 0.85 });
      } catch {
        finalFile = file; // 圧縮に失敗しても元ファイルで取込を継続する
      } finally {
        setCompressing(false);
      }
    }

    const nextPreviewUrl = previewOverride || URL.createObjectURL(finalFile);

    if (currentPage.previewUrl && currentPage.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(currentPage.previewUrl);
    }

    updateCurrentPage((page) => ({
      ...page,
      selectedFile: finalFile,
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

  // OCR〜パース〜結果反映までの本体。
  // 手動の「取込開始」ボタンと、スマホ撮影から戻った直後の自動OCRの両方から呼ばれる。
  // 画像はここではStorageへ一切アップロードしない。ブラウザ内のFileをBase64化して
  // Callable Functionへ直接渡し、確定保存（handleSaveBeneficiary）時に初めてアップロードする。
  const performOcr = async (file: File) => {
    if (!user) return;

    setBusy(true);
    setStatus(`${activePageIndex + 1}/${PAGE_COUNT} をOCR中...`);

    updateCurrentPage((page) => ({
      ...page,
      ocrText: "",
      formData: emptyFormData(),
    }));

    try {
      const imageBase64 = await fileToBase64(file);

      const ocrFromImageData = httpsCallable<{ imageBase64: string }, OcrResponse>(
        functions,
        "ocrFromImageData"
      );

      const res = await ocrFromImageData({ imageBase64 });
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
      }));

      setStatus(
        text
          ? `✅ ${activePageIndex + 1}/${PAGE_COUNT} のOCRが完了しました`
          : `⚠️ ${activePageIndex + 1}/${PAGE_COUNT} のOCR結果が空でした`
      );
    } catch (e: unknown) {
      setStatus(`❌ Error: ${formatError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const startImport = async () => {
    if (!currentPage.selectedFile) return;
    await performOcr(currentPage.selectedFile);
  };

  const handleSaveBeneficiary = async () => {
    // saving中の連打・二重送信を防止
    if (!user || saving) return;

    if (completedCount === 0) {
      setSaveMessage("⚠️ 少なくとも1ページ以上取り込んでから保存してください。");
      return;
    }

    if (!beneficiaryId) {
      setSaveMessage("⚠️ 受給者IDの準備ができていません。少し待ってから再度お試しください。");
      return;
    }

    setSaving(true);
    setSaveMessage("画像をアップロード中...");

    // 途中まで成功したアップロードを、失敗時に削除できるよう記録しておく
    const uploadedPaths: string[] = [];

    try {
      const savedPages: SavedCertPage[] = [];

      for (let index = 0; index < pagesRef.current.length; index++) {
        const page = pagesRef.current[index];
        const pageNo = index + 1;
        let pageStoragePath = "";

        // このページに画像がある場合のみ、確定保存のこのタイミングで初めてアップロードする
        if (page.selectedFile) {
          pageStoragePath = `tenants/${tenantId}/recipients/${beneficiaryId}/page${pageNo}.jpg`;
          await uploadBytes(ref(storage, pageStoragePath), page.selectedFile, {
            contentType: "image/jpeg",
          });
          uploadedPaths.push(pageStoragePath);
        }

        savedPages.push({
          pageNo,
          title: PAGE_TITLES[index] || `ページ ${pageNo}`,
          formData: page.formData,
          ocrText: page.ocrText,
          storagePath: pageStoragePath,
        });
      }

      setSaveMessage("受給者データを保存中...");

      const id = await saveBeneficiary({
        tenantId,
        beneficiaryId,
        certType: selectedCertType,
        pages: savedPages,
        user,
      });

      setSaveMessage(`✅ 保存しました（ID: ${id}）。「受給者管理」画面から確認できます。`);
      setPages(Array.from({ length: PAGE_COUNT }, () => createEmptyPage()));
      setActivePageIndex(0);
      setStatus("");
      setFlowStep("selectMode");
      setImportMode(null);
      clearImportSession(tenantId);
    } catch (e: unknown) {
      // アップロード失敗時・Firestore保存失敗時のいずれも、今回アップロード済みの
      // 画像は孤立させず可能な範囲で削除する。入力内容・OCR結果（pages）はそのまま
      // 保持し、再度「確定して保存」を押せば同じ受給者IDへ再送信できるようにする。
      await Promise.allSettled(uploadedPaths.map((p) => deleteObject(ref(storage, p))));
      setSaveMessage(`❌ 保存に失敗しました: ${formatError(e)}`);
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

  const canStart = !!currentPage.selectedFile && !busy && !compressing;

  if (flowStep === "selectMode") {
    return (
      <div className="space-y-6 overflow-x-hidden">
        <RecipientImportModeSelect
          onSelect={(mode) => {
            setImportMode(mode);

            if (mode === "new") {
              // 新規登録を最初から開始するので、前回分の取込セッションが
              // 残っていればクリアしてからimportステップへ進む。
              // 受給者IDも新しく採番し直し、前回の取込フォルダとは別の
              // Storageパスに画像を保存する。
              clearImportSession(tenantId);
              setPages(Array.from({ length: PAGE_COUNT }, () => createEmptyPage()));
              setBeneficiaryId(reserveBeneficiaryId(tenantId));
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
                clearImportSession(tenantId);
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
                disabled={busy || compressing}
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
                    disabled={busy || compressing}
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
                    disabled={busy || compressing}
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