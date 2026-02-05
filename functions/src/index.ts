/**
 * Cloud Functions Gen2 - OCR Function (Vision API)
 */

import { setGlobalOptions } from "firebase-functions/v2";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import * as admin from "firebase-admin";
import { ImageAnnotatorClient } from "@google-cloud/vision";

// ===== Gen2 共通設定 =====
setGlobalOptions({
  region: "asia-northeast1",
  timeoutSeconds: 60,
  memory: "1GiB",
  maxInstances: 10,
});

// Firebase Admin 初期化（1回だけ）
admin.initializeApp();

/**
 * OCR: Storageパス（例: uploads/{uid}/xxx.jpg）を受け取り、
 * Cloud Vision APIで文字起こしして返す
 *
 * フロントからは downloadURL ではなく storagePath を渡す
 */
export const ocrFromStoragePath = onCall(async (req) => {
  // 認証チェック
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  const storagePath = (req.data as any)?.storagePath as string | undefined;

  if (!storagePath) {
    throw new HttpsError("invalid-argument", "storagePath is required");
  }

  // 自分のアップロード配下のみ許可
  if (!storagePath.startsWith(`uploads/${req.auth.uid}/`)) {
    throw new HttpsError("permission-denied", "Invalid storagePath");
  }

  try {
    // Storage から画像取得
    const bucket = admin.storage().bucket();
    const [bytes] = await bucket.file(storagePath).download();

    // Vision OCR
    const client = new ImageAnnotatorClient();
    const [result] = await client.textDetection({
      image: { content: bytes },
    });

    const text = result.fullTextAnnotation?.text ?? "";

    return { text };
  } catch (err: any) {
    logger.error("ocrFromStoragePath error", err);
    throw new HttpsError("internal", err?.message ?? "OCR failed");
  }
});
