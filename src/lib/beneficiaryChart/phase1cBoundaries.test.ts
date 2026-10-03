// Phase 1-C（カルテ運用強化）の境界をソースコードから確認するテスト。
//   - 変更履歴（chartHistory）を書くのは chartStore だけ。受給者証の保存（beneficiaries.ts）は変更履歴を作らない
//     （受給者証の更新は既存の受給者証の履歴で追えるため、重複して残さない）
//   - カルテの保存（本人情報・各セクション・受給者証からの反映）はすべて変更履歴つきの writeChartUpdate を通る
//   - 要対応・変更履歴は管理Webのカルテだけで使い、LINE には新しい機能を追加しない
//   - 変更履歴は追記のみ（firestore.rules で更新・削除を禁止）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC_DIR = join(REPO_DIR, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(join(REPO_DIR, path), "utf8");
const rel = (file: string) => relative(SRC_DIR, file);

test("境界：変更履歴のコレクションを扱うのは chartHistory.ts（定義）と chartStore.ts（読み書き）だけ", () => {
  const users = sourceFiles(SRC_DIR)
    .filter((file) => /CHART_HISTORY_COLLECTION|["'`]chartHistory["'`]/.test(readFileSync(file, "utf8")))
    .map(rel)
    .sort();
  assert.deepEqual(users, ["lib/beneficiaryChart/chartHistory.ts", "lib/beneficiaryChart/chartStore.ts"]);
});

test("境界：受給者証の保存（beneficiaries.ts）は変更履歴を作らない（受給者証の履歴と重複させない）", () => {
  const beneficiaries = read("src/app/t/[tenantId]/lib/firestore/beneficiaries.ts");
  assert.equal(/chartHistory|lastChartHistoryId/.test(beneficiaries), false);
});

test("境界：カルテの保存はすべて writeChartUpdate（変更履歴つき）を通り、updateDoc で直接書かない", () => {
  const store = read("src/lib/beneficiaryChart/chartStore.ts");
  assert.equal(/\bupdateDoc\b/.test(store), false);
  // saveChartPersonal・saveChartSection・applyCertificateReview の3か所
  assert.equal((store.match(/writeChartUpdate\(\{/g) ?? []).length, 3);
  // 変更が無い保存では履歴を作らない・作成時刻はサーバー時刻
  assert.match(store, /const historyRef = changes\.length > 0 \?/);
  assert.match(store, /createdAt: serverTimestamp\(\)/);
});

test("境界：要対応・変更履歴・書類の提出管理は LINE から使わない（LINE に新機能を追加しない）", () => {
  const lineFiles = sourceFiles(join(SRC_DIR, "app/line"));
  for (const file of lineFiles) {
    const code = readFileSync(file, "utf8");
    assert.equal(/beneficiaryChart\/(actionItems|chartHistory|documents|documentsStore|chartStore)/.test(code), false, rel(file));
  }
});

test("境界：要対応は保存しない（派生データ）。Firestore へ書き込むコードから actionItems を参照しない", () => {
  for (const path of ["src/lib/beneficiaryChart/chartStore.ts", "src/lib/beneficiaryChart/documentsStore.ts", "src/app/t/[tenantId]/lib/firestore/beneficiaries.ts"]) {
    assert.equal(/actionItems/.test(read(path)), false, path);
  }
});

test("境界：変更履歴は追記のみ（firestore.rules で更新・削除を禁止し、actor・作成時刻・利用者docとの同時書き込みを確認）", () => {
  const rules = read("firestore.rules");
  const start = rules.indexOf("match /chartHistory/{historyId}");
  assert.ok(start > 0);
  const block = rules.slice(start, rules.indexOf("}", rules.indexOf("allow update, delete", start)) + 1);
  assert.match(block, /allow update, delete: if false;/);
  assert.match(block, /request\.resource\.data\.actor\.uid == request\.auth\.uid/);
  assert.match(block, /request\.resource\.data\.createdAt == request\.time/);
  assert.match(block, /\.data\.lastChartHistoryId == historyId/);
});
