// src/app/t/[tenantId]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { useRouter, useParams } from "next/navigation";
import { storage, functions } from "@/lib/firebase";
import { useRequireAuth } from "@/lib/auth";

type OcrResponse = { text?: string };

export default function TenantHome() {
  const router = useRouter();

  const routeParams = useParams<{ tenantId: string }>();
  const tenantId = routeParams?.tenantId ?? "";

  const { user, loading } = useRequireAuth();

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [ocrText, setOcrText] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const nextPath = useMemo(() => `/t/${tenantId || "aaaa"}`, [tenantId]);

  useEffect(() => {
    // revoke old object URL to avoid memory leak
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
      }
      return;
    }

    // set preview
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);

    // cleanup when selectedFile changes
    return () => {
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  const resetSelection = () => {
    setSelectedFile(null);
    setStatus("");
    setOcrText("");
    // reset input value so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onPickClick = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const onFileSelected = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setStatus("✅ 画像を選択しました。内容を確認して「取込開始」を押してください。");
    setOcrText("");
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
    if (!selectedFile || !user) return;

    setBusy(true);
    setStatus("Uploading...");
    setOcrText("");

    try {
      const uid = user.uid;
      const safeName = selectedFile.name.replace(/[^\w.\-]/g, "_");
      const path = `uploads/${uid}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, selectedFile, {
        contentType: selectedFile.type || "image/jpeg",
      });
      setStatus("✅ Uploaded. OCR calling...");

      const ocrFromStoragePath = httpsCallable<{ storagePath: string }, OcrResponse>(
        functions,
        "ocrFromStoragePath"
      );

      const res = await ocrFromStoragePath({ storagePath: path });
      const text = res.data?.text ?? "";

      setOcrText(text);
      setStatus(text ? "✅ OCR done" : "⚠️ OCR done (text empty)");
    } catch (e: any) {
      setStatus(`❌ Error: ${e.code || ""} ${e.message}`);
    } finally {
      setBusy(false);
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
        <div className="rounded-2xl border bg-white p-5">
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

  const scrollToUpload = () => {
    const el = document.getElementById("upload-section");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const canStart = !!selectedFile && !busy;

  return (
    <div className="space-y-6">
      {/* ✅ モバイルだけ：3枚カード（md以上は非表示） */}
      <div className="grid gap-4 md:hidden">
        <button
          type="button"
          onClick={scrollToUpload}
          className="text-left rounded-2xl border bg-white p-5 hover:bg-zinc-50 transition"
        >
          <div className="text-sm font-semibold">受給者証取込＆送信</div>
          <div className="mt-1 text-xs opacity-70">画像アップロード → OCR → 内容確認</div>
        </button>

        <Link
          href={`/t/${tenantId}/settings`}
          className="rounded-2xl border bg-white p-5 hover:bg-zinc-50 transition"
        >
          <div className="text-sm font-semibold">システム設定</div>
          <div className="mt-1 text-xs opacity-70">OCR/保存先などの設定を管理</div>
        </Link>

        <Link
          href="/logout"
          className="rounded-2xl border bg-white p-5 hover:bg-zinc-50 transition"
        >
          <div className="text-sm font-semibold text-red-600">ログアウト</div>
          <div className="mt-1 text-xs opacity-70">現在のアカウントからログアウト</div>
        </Link>
      </div>

      {/* メイン：取込 & OCR */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">受給者証取込＆送信</div>
            <div className="mt-1 text-xs opacity-70 break-all">
              tenant: {tenantId} / uid: {user.uid}
            </div>
          </div>

          {/* ✅ PC/タブレットはサイドバーに導線があるので、ここはモバイルだけ表示 */}
          <div className="flex items-center gap-2 md:hidden">
            <Link
              className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50 transition"
              href={`/t/${tenantId}/settings`}
            >
              システム設定
            </Link>
          </div>
        </div>

        <div id="upload-section" className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border p-5">
            <div className="text-sm font-semibold">画像を選択</div>
            <div className="mt-1 text-xs opacity-70">
              ボタンで選択 or 画像を貼り付け → サムネ確認 → 「取込開始」
            </div>

            {/* ✅ input は隠して、ボタンでわかりやすく */}
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
                {selectedFile ? (
                  <>
                    選択中：<span className="break-all">{selectedFile.name}</span>
                  </>
                ) : (
                  <>ここをタップしてから画像を貼り付け（ペースト）もできます</>
                )}
              </div>
            </div>

            <div className="mt-4 text-sm">{busy ? "処理中…" : status}</div>

            {previewUrl && (
              <div className="mt-4">
                <div className="text-xs opacity-70">サムネイル（内容確認）</div>
                <img src={previewUrl} alt="preview" className="mt-2 w-full rounded-xl border" />
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-5">
            <div className="text-sm font-semibold">OCR結果</div>
            <div className="mt-1 text-xs opacity-70">必要に応じてコピーしてご利用ください</div>

            <textarea
              value={ocrText}
              readOnly
              placeholder="取込開始を押すと OCR text が表示されます"
              className="mt-4 w-full h-64 text-xs border rounded-xl p-3"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
