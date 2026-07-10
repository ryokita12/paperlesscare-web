"use client";

import { useCertPageImage } from "../../lib/storage/useCertPageImage";

type Props = {
  storagePath: string;
};

export default function CertImageViewer({ storagePath }: Props) {
  const { url, loading, error } = useCertPageImage(storagePath);

  if (!storagePath) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border bg-zinc-50 text-sm text-zinc-500">
        画像が保存されていません
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border bg-zinc-50 text-sm text-zinc-500">
        画像を読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border bg-zinc-50 px-4 text-center text-sm text-red-600">
        <div>画像の読み込みに失敗しました</div>
        <div className="text-xs text-zinc-500 break-all">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] w-full overflow-auto rounded-xl border bg-zinc-50 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="受給者証画像"
        className="mx-auto h-auto max-w-full object-contain"
      />
    </div>
  );
}
