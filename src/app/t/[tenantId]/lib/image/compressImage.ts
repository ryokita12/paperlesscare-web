// スマホ等で撮影された大きな画像を、OCR/目視確認に十分な品質を保ちつつ
// アップロード前にリサイズ・圧縮するためのユーティリティ。

type CompressOptions = {
  maxDimension?: number;
  quality?: number;
};

export async function compressImageToJpeg(
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 1800;
  const quality = opts.quality ?? 0.85;

  // EXIFの回転情報を反映してから読み込む（スマホの縦写真が横倒しにならないようにする）
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const { width, height } = bitmap;
  const longEdge = Math.max(width, height);
  const scale = longEdge > maxDimension ? maxDimension / longEdge : 1;

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );

  if (!blob) return file;

  const newName = file.name.replace(/\.[^./\\]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}
