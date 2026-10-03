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
//
// 【Phase 1-B5 で意図的に更新】
// 保存処理に tsusho を接続したため、境界を次のように更新した：
//   - certificateModel.ts：代表期間は Phase 1-B1 の extractTsushoValidity を呼ぶだけ（期間の計算を重複実装しない）
//   - beneficiaries.ts：新しい利用者のカルテ初期値（initialChart）と、profile の扱い（certificateModel）を呼ぶだけ
//   - OCR → カルテ反映の候補（candidates.ts）は、まだアプリから使わない（Phase 1-B7）
//   - tsusho は引き続き非公開
//
// 【Phase 1-B6 で意図的に更新】
// tsusho を管理Webにだけ公開した。境界を次のように更新した：
//   - enabled / adminVisible = true（管理Webで選択可能）、lineEnabled = false（LINE には出さない）
//   - LINE の取込画面は lineCertTypeOptions を通すため、tsusho は表示されない
//   - 見本画像（public/cert-samples/tsusho）は無いため、ページタブは getSampleImagePath（null）で 404 を出さない
//   - candidates は引き続き未接続（Phase 1-B7）
//
// 【Phase 1-B7 で意図的に更新】
// OCR → カルテ反映の候補（candidates.ts）を、管理Webの確認フローに接続した。境界を次のように更新した：
//   - candidates を使ってよいのは src/lib/beneficiaryChart/certificateReview.ts（純粋関数）だけ
//     （比較・状態の判定を重複実装しない。相対 import "../tsusho/" も検出する）
//   - 確認カードは管理Webの受給者証タブだけで使い、LINE（src/app/line）からは使わない
//   - 反映処理（chartStore の applyCertificateReview）は summary / currentCertificateId / status /
//     supersededBy / pages を書き込まない
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CERT_TYPES,
  getPageCount,
  lineCertTypeOptions,
  PAGE_COUNT,
} from "../../app/t/[tenantId]/constants/certPages.ts";

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

test("境界：src/lib/tsusho を import してよいアプリのコードは、種別・parser・保存モデル・反映候補の5ファイルだけ（テストは除く）", () => {
  const importers = sourceFiles(SRC_DIR)
    .filter((file) => !file.startsWith(TSUSHO_DIR))
    .filter((file) => !/\.test\.ts$/.test(file))
    .filter((file) => /from\s+["'][^"']*(lib|\.\.)\/tsusho\//.test(readFileSync(file, "utf8")))
    .map(rel)
    .sort();

  assert.deepEqual(importers, [
    "app/t/[tenantId]/constants/certPages.ts",
    "app/t/[tenantId]/lib/firestore/beneficiaries.ts",
    "app/t/[tenantId]/lib/firestore/certificateModel.ts",
    "app/t/[tenantId]/lib/parsers/parseCertText.ts",
    "lib/beneficiaryChart/certificateReview.ts",
  ]);
});

test("境界：OCR → カルテ反映の候補（candidates）を使うのは certificateReview.ts だけ（Phase 1-B7）", () => {
  const users = sourceFiles(SRC_DIR)
    .filter((file) => !file.startsWith(TSUSHO_DIR))
    .filter((file) => !/\.test\.ts$/.test(file))
    .filter((file) => /tsusho\/candidates/.test(readFileSync(file, "utf8")))
    .map(rel);
  assert.deepEqual(users, ["lib/beneficiaryChart/certificateReview.ts"]);
});

test("境界：反映候補の確認カードは管理Webの受給者証タブだけで使い、LINE からは使わない（Phase 1-B7）", () => {
  const users = sourceFiles(SRC_DIR)
    .filter((file) => !/\.test\.ts$/.test(file))
    .filter((file) => /CertificateReviewCard|applyCertificateReview|getCertificateReview|beneficiaryChart\/certificateReview/.test(readFileSync(file, "utf8")))
    .map(rel)
    .sort();
  assert.deepEqual(users, [
    "app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificateReviewCard.tsx",
    "app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx",
    "lib/beneficiaryChart/chartStore.ts",
  ]);
});

test("境界：反映処理は summary / currentCertificateId / status / supersededBy / pages を書き込まない（Phase 1-B7）", () => {
  const store = read("src/lib/beneficiaryChart/chartStore.ts");
  const start = store.indexOf("export async function applyCertificateReview");
  assert.ok(start > 0);
  const body = store.slice(start);
  // 書き込みは tx.update の2か所だけ（利用者doc：カルテの項目＋updatedAt/By、証doc：chartReview）
  assert.equal((body.match(/tx\.(update|set|delete)\(/g) ?? []).length, 2);
  assert.match(body, /tx\.update\(benRef, \{ \.\.\.fieldUpdates, updatedBy: actor, updatedAt: serverTimestamp\(\) \}\)/);
  assert.match(body, /tx\.update\(certRef, reviewUpdates\)/);
  // （pages は最新の証を読み直すためだけに使う。書き込み先は上の2か所に固定している）
  for (const key of ["summary", "currentCertificateId:", "status:", "supersededBy", "certificateCount"]) {
    assert.equal(body.includes(key), false, key);
  }
});

test("境界：tsusho は管理Webだけ公開（enabled / adminVisible = true）、LINE は非公開（lineEnabled = false）", () => {
  const tsusho = CERT_TYPES.find((t) => t.id === "tsusho");
  assert.ok(tsusho, "tsusho が CERT_TYPES に存在すること");
  assert.equal(tsusho.enabled, true);
  assert.equal(tsusho.adminVisible, true);
  assert.equal(tsusho.lineEnabled, false);
  assert.equal(lineCertTypeOptions().some((t) => t.id === "tsusho"), false);
});

test("境界：certificateModel の tsusho は extractTsushoValidity を呼ぶだけ、beneficiaries は保存モデルの関数を呼ぶだけ", () => {
  // コメント行（// … ／ * …）は説明文のため除いて、コードだけを確認する
  const codeOnly = (src: string) =>
    src
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");

  const model = read("src/app/t/[tenantId]/lib/firestore/certificateModel.ts");
  assert.match(model, /import \{ extractTsushoValidity \} from "[^"]*lib\/tsusho\/validity\.ts";/);
  // 二・三面のキーやサービスの区分を certificateModel で直接扱っていない（期間の計算を重複実装していない）
  assert.equal(/servicePeriod[2-4]|houkagoDay|放課後等デイサービス/.test(codeOnly(model)), false);

  const beneficiaries = read("src/app/t/[tenantId]/lib/firestore/beneficiaries.ts");
  assert.match(beneficiaries, /initialChartForNewBeneficiary\(certType, pages\)/);
  assert.match(beneficiaries, /resolveProfileOnCertificateAdd\(/);
  // mergeProfile を直接呼ばない（profile の扱いは resolveProfileOnCertificateAdd に集約）
  assert.equal(/mergeProfile\(/.test(codeOnly(beneficiaries)), false);
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

// 【Phase 1-B4 で意図的に更新】
// 以前は「画面のページ数は PAGE_COUNT = 8 のまま」を固定していた。
// Phase 1-B4 でページ数を種別ごと（getPageCount）にしたため、境界を次のように更新した：
//   - PAGE_COUNT は種別不明時の既定値として 8 のまま残る
//   - tsusho は 7 ページ、mobility / adult / child は 8 ページ
//   - 取込・LINE・受給者証タブの画面コードは PAGE_COUNT を使わない（種別のページ数を使う）
test("境界：ページ数は種別ごと（tsusho = 7、それ以外 = 8）。PAGE_COUNT は既定値 8 として残る", () => {
  assert.equal(PAGE_COUNT, 8);
  assert.equal(getPageCount("tsusho"), 7);
  for (const certType of ["mobility", "adult", "child"]) {
    assert.equal(getPageCount(certType), 8, certType);
  }
});

test("境界：取込・LINE・受給者証タブの画面コードは固定の PAGE_COUNT を使っていない", () => {
  for (const file of [
    "src/app/t/[tenantId]/CertImportFlow.tsx",
    "src/app/line/import/LineCertImportView.tsx",
    "src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx",
  ]) {
    assert.equal(/\bPAGE_COUNT\b/.test(read(file)), false, file);
  }
});

test("境界：管理Web・LINE の種別選択は、公開可能な種別だけを出す関数を通している", () => {
  const admin = read("src/app/t/[tenantId]/CertImportFlow.tsx");
  assert.match(admin, /adminCertTypeOptions\(\)\.map\(/);
  assert.equal(/CERT_TYPES\.map\(/.test(admin), false, "管理Webが CERT_TYPES を直接 map していないこと");

  const line = read("src/app/line/import/LineCertImportView.tsx");
  assert.match(line, /lineCertTypeOptions\(\)\.map\(/);
  assert.equal(/CERT_TYPES\.(filter|map)\(/.test(line), false, "LINE が CERT_TYPES を直接使っていないこと");
});
