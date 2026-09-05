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

// ログに残してよい受給者証種別。クライアントから届いた値をそのまま出力せず、
// この一覧に含まれる場合だけ記録する。
const LOGGABLE_CERT_TYPES = ["mobility", "adult", "child"] as const;

/**
 * ログ用の診断メタデータ（個人情報を含まない）を組み立てる。
 * 受給者証の本文・氏名・住所・受給者番号等は一切含めない。
 */
function buildLogContext(data: unknown): { pageNo?: number; certType?: string } {
  const payload = (data ?? {}) as { pageNo?: unknown; certType?: unknown };

  const pageNo =
    typeof payload.pageNo === "number" &&
    Number.isInteger(payload.pageNo) &&
    payload.pageNo >= 1 &&
    payload.pageNo <= 8 ?
      payload.pageNo :
      undefined;

  const certType = LOGGABLE_CERT_TYPES.find((t) => t === payload.certType);

  return { pageNo, certType };
}

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

  const logContext = buildLogContext(req.data);

  const imageBase64 = (req.data as { imageBase64?: unknown } | undefined)
    ?.imageBase64;

  if (typeof imageBase64 !== "string" || !imageBase64) {
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

    // OCR本文には氏名・住所・生年月日・受給者番号が含まれるため、
    // Cloud Loggingへは本文を出力せず、診断に必要な件数情報のみ記録する。
    logger.info("ocrFromImageData completed", {
      ...logContext,
      textLength: text.length,
    });

    return { text };
  } catch (err: unknown) {
    // err が null / undefined でもここで例外にならないようにしておく
    // （分割代入が失敗するとcatch内から抜けてしまい、ログも残らなくなる）
    const { code, message } = (err ?? {}) as {
      code?: unknown;
      message?: unknown;
    };

    // Vision API のエラーオブジェクトには送信内容が含まれうるため、
    // オブジェクト全体ではなくコード・メッセージのみを記録する。
    logger.error("ocrFromImageData failed", {
      ...logContext,
      code,
      message,
    });

    throw new HttpsError(
      "internal",
      typeof message === "string" ? message : "OCR failed"
    );
  }
});
