// 書類の提出管理（Phase 1-C）の純粋ロジック
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_MEMO_MAX_LENGTH,
  isDocumentType,
  normalizeDocumentMeta,
  REQUIRED_DOCUMENT_TYPES,
  resolveDocumentStatus,
  summarizeRequiredDocuments,
  validateDocumentMeta,
} from "./documents.ts";

test("書類：必要書類は利用契約書・重要事項説明書・個人情報同意書の3種類（その他は含めない）", () => {
  assert.deepEqual([...REQUIRED_DOCUMENT_TYPES], ["contract", "importantMatters", "privacyConsent"]);
  assert.equal(REQUIRED_DOCUMENT_TYPES.includes("other"), false);
});

test("書類：既存データ（status なし）はファイルがあれば提出済み、無ければ未提出", () => {
  assert.equal(resolveDocumentStatus({ storagePath: "tenants/t/recipients/b/documents/d/file.pdf" }), "submitted");
  assert.equal(resolveDocumentStatus({}), "notSubmitted");
  assert.equal(resolveDocumentStatus({ storagePath: "" }), "notSubmitted");
  // status が入っていればそれを使う（ファイルの有無に関係なく）
  assert.equal(resolveDocumentStatus({ status: "notSubmitted", storagePath: "x/file.pdf" }), "notSubmitted");
  assert.equal(resolveDocumentStatus({ status: "submitted", storagePath: "" }), "submitted");
  // 想定外の値は無いものとして扱う
  assert.equal(resolveDocumentStatus({ status: "done", storagePath: "x/file.pdf" }), "submitted");
});

test("書類：必要書類ごとの提出状況（未提出・提出済み・件数）", () => {
  assert.deepEqual(
    summarizeRequiredDocuments([]).map((r) => [r.type, r.label, r.submitted, r.count]),
    [
      ["contract", "利用契約書", false, 0],
      ["importantMatters", "重要事項説明書", false, 0],
      ["privacyConsent", "個人情報同意書", false, 0],
    ]
  );
  const summary = summarizeRequiredDocuments([
    { type: "contract", status: "notSubmitted" },
    { type: "contract", status: "submitted" },
    { type: "importantMatters", status: "notSubmitted" },
    { type: "other", status: "submitted" },
  ]);
  assert.deepEqual(summary.map((r) => [r.type, r.submitted, r.count]), [
    ["contract", true, 2],
    ["importantMatters", false, 1],
    ["privacyConsent", false, 0],
  ]);
});

test("書類：提出日・メモ・書類名の入力チェック", () => {
  const ok = { name: "利用契約書", status: "submitted" as const, submittedAt: "2026-10-01", memo: "原本は書庫" };
  assert.deepEqual(validateDocumentMeta(ok, "2026-10-04"), {});
  // 提出日は空でもよい（分からない場合）
  assert.deepEqual(validateDocumentMeta({ ...ok, submittedAt: "" }, "2026-10-04"), {});
  // 当日は可、未来は不可、実在しない日付は不可
  assert.deepEqual(validateDocumentMeta({ ...ok, submittedAt: "2026-10-04" }, "2026-10-04"), {});
  assert.match(validateDocumentMeta({ ...ok, submittedAt: "2026-10-05" }, "2026-10-04").submittedAt ?? "", /未来/);
  assert.match(validateDocumentMeta({ ...ok, submittedAt: "2026-02-30" }, "2026-10-04").submittedAt ?? "", /正しくありません/);
  assert.match(validateDocumentMeta({ ...ok, memo: "あ".repeat(DOCUMENT_MEMO_MAX_LENGTH + 1) }, "2026-10-04").memo ?? "", /文字以内/);
  assert.match(validateDocumentMeta({ ...ok, name: "あ".repeat(101) }, "2026-10-04").name ?? "", /文字以内/);
});

test("書類：保存する提出情報の整形（未提出なら提出日を残さない・前後の空白を除く）", () => {
  assert.deepEqual(
    normalizeDocumentMeta({ name: " 契約書 ", status: "submitted", submittedAt: "2026-10-01", memo: " メモ " }),
    { name: "契約書", status: "submitted", submittedAt: "2026-10-01", memo: "メモ" }
  );
  assert.deepEqual(
    normalizeDocumentMeta({ name: "契約書", status: "notSubmitted", submittedAt: "2026-10-01", memo: "" }),
    { name: "契約書", status: "notSubmitted", submittedAt: "", memo: "" }
  );
});

test("書類：種別の判定（未知の種別は documents の4種類に含めない）", () => {
  assert.equal(isDocumentType("contract"), true);
  assert.equal(isDocumentType("other"), true);
  assert.equal(isDocumentType("certificate"), false);
  assert.equal(isDocumentType(undefined), false);
});
