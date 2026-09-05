"use client";

// 取込中（確定保存前）のページ画像をブラウザ内に一時保持するためのストア。
//
// スマホでの撮影は別ルート（/t/{tenantId}/capture）へ遷移するため、
// 戻ってきた時点で取込画面は再マウントされ、Reactのstateに持っていた
// File オブジェクトは失われる。sessionStorage には
// formData / ocrText しか退避できない（File はJSON化できず、
// dataURLにすると数MB×8ページで容量上限を超える）ため、
// Blob をそのまま保存できる IndexedDB に退避する。
//
// ここに保存されるのは確定保存前の一時データのみで、
// Firestore / Firebase Storage のデータ構造には一切影響しない。
// 確定保存の成功時・取込のリセット時・新規取込の開始時にクリアされる。

const DB_NAME = "paperlesscare-import";
const DB_VERSION = 1;
const STORE_NAME = "pageImages";
const TENANT_INDEX = "tenantId";

type StoredPageImage = {
  key: string;
  tenantId: string;
  beneficiaryId: string;
  pageIndex: number;
  blob: Blob;
  fileName: string;
  fileType: string;
  savedAt: number;
};

export type RestoredPageImage = {
  pageIndex: number;
  file: File;
};

function isAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function pageImageKey(
  tenantId: string,
  beneficiaryId: string,
  pageIndex: number
): string {
  return `${tenantId}::${beneficiaryId}::${pageIndex}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex(TENANT_INDEX, "tenantId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("indexedDB open blocked"));
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | null
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = work(tx.objectStore(STORE_NAME));

        tx.oncomplete = () => {
          db.close();
          resolve(request ? request.result : null);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

/**
 * 1ページ分の取込画像を保存する。
 * 取込の継続性のための保険であり、失敗しても取込自体は続行できるため例外は投げない。
 */
export async function savePageImage(params: {
  tenantId: string;
  beneficiaryId: string;
  pageIndex: number;
  file: File;
}): Promise<void> {
  const { tenantId, beneficiaryId, pageIndex, file } = params;
  if (!isAvailable() || !tenantId || !beneficiaryId) return;

  const record: StoredPageImage = {
    key: pageImageKey(tenantId, beneficiaryId, pageIndex),
    tenantId,
    beneficiaryId,
    pageIndex,
    blob: file,
    fileName: file.name,
    fileType: file.type || "image/jpeg",
    savedAt: Date.now(),
  };

  try {
    await runTransaction("readwrite", (store) => store.put(record));
  } catch {
    // 容量超過・プライベートブラウジング等で保存できない場合は、
    // 「撮影往復で画像が失われる」従来の挙動に戻るだけなので無視する。
  }
}

/** 指定受給者の取込画像をすべて取り出す。 */
export async function loadPageImages(
  tenantId: string,
  beneficiaryId: string
): Promise<RestoredPageImage[]> {
  if (!isAvailable() || !tenantId || !beneficiaryId) return [];

  try {
    const records = await runTransaction<StoredPageImage[]>(
      "readonly",
      (store) => store.index(TENANT_INDEX).getAll(tenantId)
    );

    return (records ?? [])
      .filter((record) => record.beneficiaryId === beneficiaryId)
      .map((record) => ({
        pageIndex: record.pageIndex,
        file: new File([record.blob], record.fileName, {
          type: record.fileType,
        }),
      }));
  } catch {
    return [];
  }
}

/** 1ページ分の取込画像を削除する（ページ単位の「クリア」操作用）。 */
export async function deletePageImage(params: {
  tenantId: string;
  beneficiaryId: string;
  pageIndex: number;
}): Promise<void> {
  const { tenantId, beneficiaryId, pageIndex } = params;
  if (!isAvailable() || !tenantId || !beneficiaryId) return;

  try {
    await runTransaction("readwrite", (store) =>
      store.delete(pageImageKey(tenantId, beneficiaryId, pageIndex))
    );
  } catch {
    // 削除できなくても、確定保存時は画面上のstateだけを見るため実害はない
  }
}

/**
 * 指定テナントの取込画像をすべて削除する。
 * 確定保存の成功時・取込状況のリセット時・新規取込の開始時に呼ぶ。
 * beneficiaryId 単位ではなくテナント単位で消すことで、
 * 中断された過去の取込（別の事前採番ID）の画像も残さない。
 */
export async function clearPageImages(tenantId: string): Promise<void> {
  if (!isAvailable() || !tenantId) return;

  try {
    const keys = await runTransaction<IDBValidKey[]>("readonly", (store) =>
      store.index(TENANT_INDEX).getAllKeys(tenantId)
    );

    if (!keys || keys.length === 0) return;

    await runTransaction("readwrite", (store) => {
      keys.forEach((key) => store.delete(key));
      return null;
    });
  } catch {
    // クリアできなくても、復元時に現在の受給者IDと一致するものだけを使うため実害は小さい
  }
}
