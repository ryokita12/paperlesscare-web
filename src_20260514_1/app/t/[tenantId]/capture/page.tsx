// src/app/t/[tenantId]/capture/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY_PREFIX = "paperlesscare_capture_v1_";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function CapturePage() {
  const router = useRouter();
  const params = useParams<{ tenantId: string }>();
  const sp = useSearchParams();

  const tenantId = params?.tenantId ?? "";
  const next = sp.get("next") || `/t/${tenantId}`;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [capturedUrl, setCapturedUrl] = useState<string>("");

  const storageKey = useMemo(() => `${STORAGE_KEY_PREFIX}${tenantId}`, [tenantId]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        setError("");

        // iOS/Safari 対策：facingMode は ideal を使う
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) return;

        streamRef.current = stream;

        const v = videoRef.current;
        if (!v) return;

        v.srcObject = stream;
        await v.play();
        setReady(true);
      } catch (e: any) {
        setError(
          "カメラの起動に失敗しました。ブラウザの権限（カメラ許可）をご確認ください。"
        );
      }
    };

    start();

    return () => {
      cancelled = true;
      // stop camera
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      // cleanup preview
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCancel = () => {
    router.push(next);
  };

  const onRetake = () => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl("");
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v) return;

    // ガイド枠（#guide）の位置を video 表示領域に対して取得して、video 元解像度にマッピング
    const videoEl = v;
    const guideEl = document.getElementById("guide");
    if (!guideEl) return;

    const vr = videoEl.getBoundingClientRect();
    const gr = guideEl.getBoundingClientRect();

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (!vw || !vh) return;

    // object-contain 時の「実際に映像が見えている領域」を計算
    const videoAspect = vw / vh;
    const boxAspect = vr.width / vr.height;

    let renderW = 0;
    let renderH = 0;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > boxAspect) {
      // 横が基準。上下に余白
      renderW = vr.width;
      renderH = vr.width / videoAspect;
      offsetX = 0;
      offsetY = (vr.height - renderH) / 2;
    } else {
      // 縦が基準。左右に余白
      renderH = vr.height;
      renderW = vr.height * videoAspect;
      offsetX = (vr.width - renderW) / 2;
      offsetY = 0;
    }

    // guide の位置を、実際の映像表示領域 기준で相対化
    const relX = (gr.left - (vr.left + offsetX)) / renderW;
    const relY = (gr.top - (vr.top + offsetY)) / renderH;
    const relW = gr.width / renderW;
    const relH = gr.height / renderH;

    // 元動画座標（px）
    let sx = relX * vw;
    let sy = relY * vh;
    let sw = relW * vw;
    let sh = relH * vh;

    // clamp（念のため）
    sx = clamp(sx, 0, vw - 1);
    sy = clamp(sy, 0, vh - 1);
    sw = clamp(sw, 1, vw - sx);
    sh = clamp(sh, 1, vh - sy);

    // 出力サイズ（OCR向け：縦長、最大高さ 1400px 程度）
    const outH = 1400;
    const scale = outH / sh;
    const outW = Math.round(sw * scale);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, outW, outH);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88)
    );

    if (!blob) return;

    // main page に渡す：sessionStorage に dataURL を保存（枠内トリミング後なのでサイズは抑えられます）
    const dataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.readAsDataURL(blob);
    });

    sessionStorage.setItem(storageKey, dataUrl);

    // 画面内プレビュー用
    const url = URL.createObjectURL(blob);
    setCapturedUrl(url);
  };

  const useThisPhoto = () => {
    router.push(next);
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="p-4 flex items-center justify-between">
        <div className="text-sm font-semibold">受給者証を枠に合わせて撮影</div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-white/30 px-3 py-2 text-xs"
        >
          戻る
        </button>
      </div>

      {error ? (
        <div className="px-4 pb-6">
          <div className="rounded-2xl border border-white/20 bg-white/10 p-4 text-sm">
            {error}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl bg-white text-black px-4 py-2 text-sm"
              >
                ファイル選択に戻る
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative w-full overflow-hidden">
        {/* video */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-[calc(100dvh-160px)] object-contain bg-black"
        />

        {/* オーバーレイ（枠外を暗く + 枠線） */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {/* 縦長：aspect は受給者証に合わせて調整（まずは 3:4） */}
          <div
            id="guide"
            className="relative w-[82vw] max-w-[430px] aspect-[210/297] rounded-2xl"
          >
            {/* 枠線 */}
            <div className="absolute inset-0 rounded-2xl border-[6px] border-[#39FF14]" />
            {/* 角の強調（任意） */}
            <div className="absolute -top-1 -left-1 h-7 w-7 border-l-[5px] border-t-[5px] border-[#39FF14]" />
            <div className="absolute -top-1 -right-1 h-7 w-7 border-r-[5px] border-t-[5px] border-[#39FF14]" />
            <div className="absolute -bottom-1 -left-1 h-7 w-7 border-l-[5px] border-b-[5px] border-[#39FF14]" />
            <div className="absolute -bottom-1 -right-1 h-7 w-7 border-r-[5px] border-b-[5px] border-[#39FF14]" />

            {/* 内側補助線 */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              <div className="absolute left-0 right-0 top-[8%] border-t-2 border-[#39FF14]/80" />
              <div className="absolute left-0 right-0 top-[16%] border-t-2 border-[#39FF14]/70" />
              <div className="absolute left-0 right-0 top-[48%] border-t-2 border-[#39FF14]/70" />
              <div className="absolute left-0 right-0 top-[70%] border-t-2 border-[#39FF14]/70" />
            </div>

            {/* ガイド文 */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-xs text-[#39FF14] font-medium whitespace-nowrap">
              受給者証の四辺を枠に合わせてください
            </div>
          </div>

          {/* 枠外を暗くするマスク（4枚） */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-black/55" />
            {/* 透明抜きは擬似的に“中央だけ明るく”するため、guide の上に透明板を置く */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[82vw] max-w-[430px] aspect-[210/297] rounded-2xl"
              style={{ background: "transparent" }}
            />
          </div>
        </div>

        {/* 撮影後プレビュー（小さく） */}
        {capturedUrl ? (
          <div className="absolute top-3 left-3 w-24 h-32 rounded-xl overflow-hidden border border-white/40">
            <img src={capturedUrl} alt="captured" className="w-full h-full object-contain bg-black" />
          </div>
        ) : null}
      </div>

      {/* 操作ボタン */}
      <div className="p-4 pb-8 flex items-center justify-center gap-3">
        {!capturedUrl ? (
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            className="rounded-2xl bg-white text-black px-6 py-3 text-sm font-semibold disabled:opacity-50"
          >
            撮影
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onRetake}
              className="rounded-2xl border border-white/30 px-5 py-3 text-sm"
            >
              撮り直し
            </button>
            <button
              type="button"
              onClick={useThisPhoto}
              className="rounded-2xl bg-white text-black px-5 py-3 text-sm font-semibold"
            >
              この写真でOK
            </button>
          </>
        )}
      </div>
    </div>
  );
}