/**
 * Cloud Functions Gen2 - OCR Function (Vision API)
 */

import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import { ImageAnnotatorClient } from "@google-cloud/vision";

// ===== Gen2 共通設定 =====
setGlobalOptions({
  region: "asia-northeast1",
  timeoutSeconds: 60,
  memory: "1GiB",
  maxInstances: 10,
});

// Callable Functionsのペイロードサイズを考慮した上限（Base64換算前のおおよそのバイト数）。
// クライアント側で圧縮済みの画像を送る前提のため、通常はこれを大きく下回る。
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * OCR: 画像データ（Base64）を直接受け取り、Cloud Vision APIで文字起こしして返す。
 *
 * 取込中（保存前）の受給者証はまだFirestore/Storageのどちらにも存在しないため、
 * このFunctionはStorage・Firestoreのいずれにもアクセスしない
 * （画像はブラウザ内で保持され、確定保存時に初めてStorageへアップロードされる）。
 */
export const ocrFromImageData = onCall(async (req) => {
  // 認証チェック（Vision APIの濫用防止。取込中データはまだ存在しないためテナントチェックは不要）
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const imageBase64 = (req.data as any)?.imageBase64 as string | undefined;

  if (!imageBase64) {
    throw new HttpsError("invalid-argument", "imageBase64 is required");
  }

  const approxBytes = (imageBase64.length * 3) / 4;
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw new HttpsError("invalid-argument", "Image is too large");
  }

  try {
    const buffer = Buffer.from(imageBase64, "base64");

    const client = new ImageAnnotatorClient();
    const [result] = await client.documentTextDetection({
      image: { content: buffer },
    });

    const text = result.fullTextAnnotation?.text ?? "";

    logger.info("ocrFromImageData raw text", {
      textLength: text.length,
      text,
    });

    return { text };
  } catch (err: any) {
    logger.error("ocrFromImageData error", err);
    throw new HttpsError("internal", err?.message ?? "OCR failed");
  }
});
