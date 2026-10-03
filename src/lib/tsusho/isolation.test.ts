// Phase 1-B1/B2 の「未接続」を固定するテスト。
// 通所受給者証のコードは、PaperlessCare 本体からまだ参照されてはいけない。
// Phase 1-B3 で接続するときは、このテストを意図的に更新すること。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CERT_TYPES } from "../../app/t/[tenantId]/constants/certPages.ts";
import { getCertPageParser } from "../../app/t/[tenantId]/lib/parsers/parseCertText.ts";
import type { CertTypeId } from "../../app/t/[tenantId]/constants/certPages.ts";

const SRC_DIR = fileURLToPath(new URL("../../", import.meta.url));
const TSUSHO_DIR = fileURLToPath(new URL("./", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => /\.(ts|tsx)$/.test(p))
    .map((p) => join(dir, p));
}

test("未接続：src/lib/tsusho 以外のファイルから tsusho のコードを import していない", () => {
  const offenders = sourceFiles(SRC_DIR)
    .filter((file) => !file.startsWith(TSUSHO_DIR))
    .filter((file) => /from\s+["'][^"']*\/tsusho(?:\/|["'])/.test(readFileSync(file, "utf8")))
    .map((file) => relative(SRC_DIR, file).split(sep).join("/"));

  assert.deepEqual(offenders, []);
});

test("未接続：tsusho は CERT_TYPES（取込画面・LINE の選択肢）に登録されていない", () => {
  assert.equal(CERT_TYPES.some((t) => (t.id as string) === "tsusho"), false);
});

test("未接続：tsusho は CERT_PAGE_PARSERS に登録されていない", () => {
  for (let pageIndex = 0; pageIndex < 8; pageIndex++) {
    assert.equal(getCertPageParser("tsusho" as CertTypeId, pageIndex), null, `pageIndex=${pageIndex}`);
  }
});
