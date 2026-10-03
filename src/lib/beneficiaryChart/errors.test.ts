import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyChartError } from "./errors.ts";

test("権限エラーは「ログインし直す・管理者に問い合わせる」と案内する", () => {
  assert.match(friendlyChartError({ code: "permission-denied" }, "save"), /権限がありません/);
  assert.match(friendlyChartError({ code: "storage/unauthorized" }, "upload"), /管理者/);
  assert.match(friendlyChartError({ code: "permission-denied" }, "load"), /表示する権限/);
});

test("通信エラー・見つからない場合の案内", () => {
  assert.match(friendlyChartError({ code: "unavailable" }, "save"), /ネットワーク/);
  assert.match(friendlyChartError({ code: "storage/object-not-found" }, "open"), /ファイルが見つかりません/);
});

test("アプリ側の日本語メッセージはそのまま、その他はコード付きの汎用文", () => {
  assert.equal(friendlyChartError(new Error("PDF・JPEG・PNG のファイルを選んでください。"), "upload"), "PDF・JPEG・PNG のファイルを選んでください。");
  assert.match(friendlyChartError({ code: "internal" }, "delete"), /削除に失敗しました.*internal/);
  assert.match(friendlyChartError(null, "save"), /保存に失敗しました/);
});
