import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 旧ソースのスナップショット。next build の対象外だがlint/tscには拾われ、
    // 現行コードの指摘が埋もれるため対象外にする（tsconfig.json の exclude と対）。
    "src_20260514_1/**",
    "src_20260519_1/**",
    // ビルド成果物・ベンダー配布物（いずれもgit管理外）。
    // functions/src は引き続きlint対象。
    "functions/lib/**",
    "google-cloud-sdk/**",
  ]),
]);

export default eslintConfig;
