"use client";

// システム設定 > LINEスタッフ設定（事業所のスタッフ認証キー）
// 認証キーはサーバー側でハッシュ化して保存され、画面には「設定済み／未設定」だけを表示する。
// 設定・変更は Functions（updateStaffAuthKey）が users/{uid}.tenantId の事業所に対してのみ行う。

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useRequireAuth } from "@/lib/auth";

type StaffAuthKeyStatus = {
  tenantId: string;
  tenantName: string;
  configured: boolean;
  enabled: boolean;
  updatedAt: string | null;
  lineStaffCount: number;
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ja-JP");
}

export default function LineStaffSettings() {
  const { user, loading } = useRequireAuth();
  const [status, setStatus] = useState<StaffAuthKeyStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // 設定済みのキーを変更する場合は、影響を説明してから確定させる
  const [confirming, setConfirming] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const fn = httpsCallable<Record<string, never>, StaffAuthKeyStatus>(functions, "getStaffAuthKeyStatus");
      const res = await fn({});
      setStatus(res.data);
      setLoadError("");
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    void Promise.resolve().then(loadStatus);
  }, [loading, user, loadStatus]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !newKey.trim()) return;

    if (status?.configured && !confirming) {
      setConfirming(true);
      return;
    }

    setConfirming(false);
    setSaving(true);
    setMessage(null);
    try {
      const fn = httpsCallable<{ authKey: string }, { ok: true }>(functions, "updateStaffAuthKey");
      await fn({ authKey: newKey });
      setNewKey("");
      setMessage({ kind: "ok", text: "認証キーを更新しました。スタッフには新しい認証キーを案内してください。" });
      await loadStatus();
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">LINEスタッフ設定</h2>

      <div className="mt-4">
        <div className="text-sm font-semibold">スタッフ認証キー</div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">
          スタッフがLINEから初回登録する際に使用する、事業所専用の認証キーです。
          セキュリティのため、設定済みのキーは表示されません。変更する場合のみ新しいキーを入力してください。
        </p>
      </div>

      <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm">
        {loadError ? (
          <span className="text-red-600">状態を取得できませんでした：{loadError}</span>
        ) : !status ? (
          <span className="text-zinc-500">読み込み中...</span>
        ) : (
          <div className="space-y-1">
            <div>
              現在の状態：
              {status.configured && status.enabled ? (
                <span className="font-semibold text-emerald-700">設定済み</span>
              ) : status.configured ? (
                <span className="font-semibold text-amber-700">停止中</span>
              ) : (
                <span className="font-semibold text-zinc-500">未設定</span>
              )}
              {status.updatedAt && (
                <span className="ml-2 text-xs text-zinc-500">（最終更新 {formatDateTime(status.updatedAt)}）</span>
              )}
            </div>
            <div className="text-xs text-zinc-500">LINE登録済みスタッフ：{status.lineStaffCount}名</div>
          </div>
        )}
      </div>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-semibold">新しい認証キー</span>
          <input
            className="mt-1 w-full max-w-md rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            value={newKey}
            onChange={(e) => {
              setNewKey(e.target.value);
              setConfirming(false);
            }}
            placeholder="6文字以上（空白不可）"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
          />
        </label>
        <p className="text-xs text-zinc-500">
          大文字・小文字、全角・半角は区別しません。推測されにくいキーを設定してください。
        </p>

        {confirming && (
          <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            認証キーを変更すると、以前のキーでは新しいスタッフを登録できなくなります
            （登録済みのスタッフはそのまま利用できます）。よろしければ「変更を確定」を押してください。
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || !newKey.trim() || !user}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {saving ? "更新中..." : confirming ? "変更を確定" : "認証キーを更新"}
          </button>
          {confirming && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-xl border px-5 py-2.5 text-sm"
            >
              キャンセル
            </button>
          )}
        </div>

        {message && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </form>
    </section>
  );
}
