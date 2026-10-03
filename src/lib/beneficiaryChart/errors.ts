// Firebase のエラーを、施設スタッフ向けの「次に何をすればよいか」が分かる文に変える。

function codeOf(e: unknown): string {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
}

export function friendlyChartError(e: unknown, action: "load" | "save" | "upload" | "delete" | "open"): string {
  const code = codeOf(e);

  if (/permission-denied|unauthorized|unauthenticated/.test(code)) {
    return action === "load"
      ? "この情報を表示する権限がありません。ログインし直してください。解決しない場合は事業所の管理者にお問い合わせください。"
      : "この操作を行う権限がありません。ログインし直してください。解決しない場合は事業所の管理者にお問い合わせください。";
  }
  if (/unavailable|deadline-exceeded|retry-limit-exceeded|network/.test(code)) {
    return "通信できませんでした。ネットワークを確認して、もう一度お試しください。";
  }
  if (/object-not-found|not-found/.test(code)) {
    return action === "open"
      ? "ファイルが見つかりません。すでに削除された可能性があります。画面を再読み込みしてください。"
      : "データが見つかりません。画面を再読み込みしてください。";
  }
  if (/quota-exceeded/.test(code)) {
    return "保存容量の上限に達しました。事業所の管理者にお問い合わせください。";
  }
  if (!code && e instanceof Error && e.message) {
    // アプリ側で作った日本語のメッセージ（ファイル形式の誤り等）はそのまま表示する
    return e.message;
  }

  const verb = { load: "読み込み", save: "保存", upload: "アップロード", delete: "削除", open: "ファイルの表示" }[action];
  return `${verb}に失敗しました。時間をおいてもう一度お試しください。${code ? `（${code}）` : ""}`;
}
