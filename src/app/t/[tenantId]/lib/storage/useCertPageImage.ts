"use client";

import { useEffect, useState } from "react";
import { getBytes, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;

export type CertPageImageState = {
  url: string;
  loading: boolean;
  error: string;
};

type FetchResult = {
  path: string;
  url: string;
  error: string;
};

// 受給者証ページ画像の表示専用フック。
// getDownloadURL() は `?alt=media&token=...` という、以後Storage Rulesを経由せず
// 誰でもアクセスできてしまう恒久的なURLを発行するため使わない。
// 代わりにgetBytes()（アクセスの都度Storage Rulesが評価される）でバイト列を取得し、
// blob: URLとして表示する。
export function useCertPageImage(storagePath: string): CertPageImageState {
  const [result, setResult] = useState<FetchResult | null>(null);

  useEffect(() => {
    if (!storagePath) return;

    let cancelled = false;
    let objectUrl = "";

    (async () => {
      try {
        const bytes = await getBytes(ref(storage, storagePath), MAX_DOWNLOAD_BYTES);
        if (cancelled) return;

        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        setResult({ path: storagePath, url: objectUrl, error: "" });
      } catch (e: unknown) {
        if (cancelled) return;
        setResult({
          path: storagePath,
          url: "",
          error: e instanceof Error ? e.message : "画像の取得に失敗しました",
        });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [storagePath]);

  if (!storagePath) return { url: "", loading: false, error: "" };
  if (!result || result.path !== storagePath) return { url: "", loading: true, error: "" };
  return { url: result.url, loading: false, error: result.error };
}
