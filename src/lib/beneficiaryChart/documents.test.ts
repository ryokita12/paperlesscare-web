import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultDocumentName,
  documentStoragePath,
  documentTypeLabel,
  formatFileSize,
  MAX_DOCUMENT_BYTES,
  resolveDocumentContentType,
  validateDocumentFile,
} from "./documents.ts";
import { extractCertificateHighlights } from "./certificateHighlights.ts";

test("書類：PDF・JPEG・PNG のみ受け付ける（typeが空なら拡張子で判断）", () => {
  assert.equal(resolveDocumentContentType({ name: "a.pdf", type: "application/pdf" }), "application/pdf");
  assert.equal(resolveDocumentContentType({ name: "a.JPG", type: "" }), "image/jpeg");
  assert.equal(resolveDocumentContentType({ name: "a.png", type: "" }), "image/png");
  assert.equal(resolveDocumentContentType({ name: "a.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), null);
  assert.equal(resolveDocumentContentType({ name: "a.heic", type: "image/heic" }), null);
  assert.equal(resolveDocumentContentType({ name: "a.pdf", type: "text/plain" }), null);
});

test("書類：サイズ上限（10MB）と空ファイル", () => {
  assert.equal(MAX_DOCUMENT_BYTES, 10 * 1024 * 1024);
  assert.equal(validateDocumentFile({ name: "a.pdf", type: "application/pdf", size: MAX_DOCUMENT_BYTES }), null);
  assert.match(validateDocumentFile({ name: "a.pdf", type: "application/pdf", size: MAX_DOCUMENT_BYTES + 1 }) ?? "", /大きすぎます/);
  assert.match(validateDocumentFile({ name: "a.pdf", type: "application/pdf", size: 0 }) ?? "", /空/);
  assert.match(validateDocumentFile({ name: "a.gif", type: "image/gif", size: 10 }) ?? "", /PDF・JPEG・PNG/);
});

test("書類：Storageの保存先は受給者証画像と同じ recipients/{利用者ID} 配下", () => {
  assert.equal(
    documentStoragePath({ tenantId: "t1", beneficiaryId: "b1", documentId: "d1", contentType: "application/pdf" }),
    "tenants/t1/recipients/b1/documents/d1/file.pdf"
  );
  assert.equal(
    documentStoragePath({ tenantId: "t1", beneficiaryId: "b1", documentId: "d1", contentType: "image/jpeg" }),
    "tenants/t1/recipients/b1/documents/d1/file.jpg"
  );
});

test("書類：表示用のヘルパー", () => {
  assert.equal(documentTypeLabel("contract"), "利用契約書");
  assert.equal(documentTypeLabel("unknown"), "その他");
  assert.equal(defaultDocumentName("利用契約書_山田.pdf"), "利用契約書_山田");
  assert.equal(formatFileSize(500), "500B");
  assert.equal(formatFileSize(2048), "2KB");
  assert.equal(formatFileSize(1.5 * 1024 * 1024), "1.5MB");
});

test("受給者証の要点：既存のformDataから読むだけで、無い値は空のまま", () => {
  const empty = extractCertificateHighlights([]);
  assert.deepEqual(empty, {
    number: "",
    cityName: "",
    services: [],
    burdenLimitAmount: "",
    burdenPeriod: "",
    managementTargetStatus: "",
    managementOfficeName: "",
  });

  const h = extractCertificateHighlights([
    { pageNo: 1, formData: { number: "1234567890", cityName: "名古屋市" } },
    { pageNo: 2, formData: { serviceType1: "放課後等デイサービス", servicePeriod1: "令和7年4月1日から令和8年3月31日まで", serviceAmount1: "23日/月" } },
    { pageNo: 3, formData: {} },
    { pageNo: 4, formData: { serviceType6: "", serviceAmount6: "" } },
    { pageNo: 5, formData: {} },
    { pageNo: 6, formData: {} },
    { pageNo: 7, formData: { burdenLimitAmount: "4,600円", managementTargetStatus: "対象者", managementOfficeName: "" } },
    { pageNo: 8, formData: { managementOfficeName: "〇〇事業所" } },
  ]);
  assert.equal(h.number, "1234567890");
  assert.equal(h.cityName, "名古屋市");
  assert.deepEqual(h.services, [
    { type: "放課後等デイサービス", period: "令和7年4月1日から令和8年3月31日まで", amount: "23日/月" },
  ]);
  assert.equal(h.burdenLimitAmount, "4,600円");
  assert.equal(h.managementTargetStatus, "対象者");
  assert.equal(h.managementOfficeName, "〇〇事業所");
});

test("受給者証の要点：pageNo が欠けた旧データは配列の位置で判断する", () => {
  const h = extractCertificateHighlights([{ formData: { number: "999" } }]);
  assert.equal(h.number, "999");
});
