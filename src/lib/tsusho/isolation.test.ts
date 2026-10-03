// 通所受給者証（tsusho）の接続範囲を固定するテスト。
//
// 【Phase 1-B3 で意図的に更新】
// Phase 1-B1/B2 では「どこにも接続されていない」ことを固定していた。
// Phase 1-B3 では種別定義・ページ定義・parser 基盤へ「非公開のまま」接続したため、
// 境界を次のように更新した：
//   - 接続してよいのは certPages.ts（種別・ページ定義）と parseCertText.ts（parser 登録）だけ
//   - tsusho は enabled / lineEnabled / adminVisible がすべて false（管理Web・LINE に出ない）
//   - 期限処理（certificateModel）・profile 保護（beneficiaries）・Functions・Rules には未接続
//   - currentCertificateId は単一のまま
// Phase 1-B4 以降で接続範囲を広げるときは、このテストを意図的に更新すること。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CERT_TYPES, PAGE_COUNT } from "../../app/t/[tenantId]/constants/certPages.ts";

const SRC_DIR = fileURLToPath(new URL("../../", import.meta.url));
const REPO_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const TSUSHO_DIR = fileURLToPath(new URL("./", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => /\.(ts|tsx)$/.test(p))
    .map((p) => join(dir, p));
}

function rel(file: string): string {
  return relative(SRC_DIR, file).split(sep).join("/");
}

function read(pathFromRepo: string): string {
  return readFileSync(join(REPO_DIR, pathFromRepo), "utf8");
}

test("境界：src/lib/tsusho を import してよいアプリのコードは certPages.ts と parseCertText.ts だけ（テストは除く）", () => {
  const importers = sourceFiles(SRC_DIR)
    .filter((file) => !file.startsWith(TSUSHO_DIR))
    .filter((file) => !/\.test\.ts$/.test(file))
    .filter((file) => /from\s+["'][^"']*lib\/tsusho\//.test(readFileSync(file, "utf8")))
    .map(rel)
    .sort();

  assert.deepEqual(importers, [
    "app/t/[tenantId]/constants/certPages.ts",
    "app/t/[tenantId]/lib/parsers/parseCertText.ts",
  ]);
});

test("境界：tsusho は内部の種別として存在するが、enabled / lineEnabled / adminVisible はすべて false", () => {
  const tsusho = CERT_TYPES.find((t) => t.id === "tsusho");
  assert.ok(tsusho, "tsusho が CERT_TYPES に存在すること");
  assert.equal(tsusho.enabled, false);
  assert.equal(tsusho.lineEnabled, false);
  assert.equal(tsusho.adminVisible, false);
});

test("境界：期限処理（certificateModel）と profile 保護（beneficiaries）には tsusho を接続していない", () => {
  for (const file of [
    "src/app/t/[tenantId]/lib/firestore/certificateModel.ts",
    "src/app/t/[tenantId]/lib/firestore/beneficiaries.ts",
  ]) {
    assert.equal(/tsusho/i.test(read(file)), false, file);
  }
});

test("境界：Functions・Firestore Rules・Storage Rules に tsusho の変更はない", () => {
  const functionsDir = join(REPO_DIR, "functions/src");
  for (const file of sourceFiles(functionsDir)) {
    assert.equal(/tsusho|通所受給者証/.test(readFileSync(file, "utf8")), false, file);
  }
  for (const file of ["firestore.rules", "storage.rules"]) {
    assert.equal(/tsusho|通所受給者証/.test(read(file)), false, file);
  }
});

test("境界：currentCertificateId は単一のまま（currentCertificateIds は導入していない）", () => {
  const offenders = sourceFiles(SRC_DIR)
    .filter((file) => /currentCertificateIds/.test(readFileSync(file, "utf8")))
    .filter((file) => file !== fileURLToPath(import.meta.url))
    .map(rel);
  assert.deepEqual(offenders, []);
});

test("境界：画面のページ数（PAGE_COUNT）は 8 のまま", () => {
  assert.equal(PAGE_COUNT, 8);
});

test("境界：管理Web・LINE の種別選択は、公開可能な種別だけを出す関数を通している", () => {
  const admin = read("src/app/t/[tenantId]/CertImportFlow.tsx");
  assert.match(admin, /adminCertTypeOptions\(\)\.map\(/);
  assert.equal(/CERT_TYPES\.map\(/.test(admin), false, "管理Webが CERT_TYPES を直接 map していないこと");

  const line = read("src/app/line/import/LineCertImportView.tsx");
  assert.match(line, /lineCertTypeOptions\(\)\.map\(/);
  assert.equal(/CERT_TYPES\.(filter|map)\(/.test(line), false, "LINE が CERT_TYPES を直接使っていないこと");
});
