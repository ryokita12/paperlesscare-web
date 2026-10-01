"use client";

// 初回登録：利用方法の選択 → （スタッフ）認証キーと氏名で登録
import { useState, type FormEvent } from "react";
import { useLineSession } from "../LineSessionProvider";
import { LineButton, LineCard } from "../ui";

type Choice = "guardian" | "staff";
type Step = "choose" | "guardian" | "staff";

function errorMessage(e: unknown): string {
  // Functions（HttpsError）のメッセージは利用者向けの日本語文
  const message = e instanceof Error ? e.message : String(e);
  return message || "登録に失敗しました。時間をおいて再度お試しください。";
}

export default function LineRegisterPage() {
  const { registerStaff } = useLineSession();
  const [step, setStep] = useState<Step>("choose");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [staffName, setStaffName] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // 成功するとスタッフTOPへ自動で移動する
      await registerStaff({ authKey, staffName });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (step === "guardian") {
    return (
      <div className="space-y-4">
        <LineCard className="py-10 text-center">
          <div className="text-lg font-bold">PaperlessCare</div>
          <p className="mt-4 text-sm leading-relaxed text-zinc-600">
            利用者・保護者向け機能は
            <br />
            現在準備中です。
          </p>
        </LineCard>
        <LineButton variant="secondary" onClick={() => setStep("choose")}>
          戻る
        </LineButton>
      </div>
    );
  }

  if (step === "staff") {
    return (
      <form className="space-y-5" onSubmit={onSubmit}>
        <div>
          <h1 className="text-xl font-bold">スタッフ認証</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            所属する事業所から案内された認証キーと、氏名を入力してください。
          </p>
        </div>

        <LineCard className="space-y-5">
          <label className="block">
            <span className="text-sm font-semibold">氏名</span>
            <input
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-base outline-none focus:border-emerald-400 focus:bg-white"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="例：山田 花子"
              autoComplete="name"
              maxLength={40}
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">スタッフ認証キー</span>
            <input
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-base outline-none focus:border-emerald-400 focus:bg-white"
              value={authKey}
              onChange={(e) => setAuthKey(e.target.value)}
              placeholder="認証キー"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={64}
              required
            />
          </label>
        </LineCard>

        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-3">
          <LineButton type="submit" disabled={busy || !staffName.trim() || !authKey.trim()}>
            {busy ? "確認しています..." : "認証して登録"}
          </LineButton>
          <LineButton variant="secondary" onClick={() => setStep("choose")} disabled={busy}>
            戻る
          </LineButton>
        </div>
      </form>
    );
  }

  const options: { id: Choice; label: string; description: string }[] = [
    { id: "guardian", label: "利用者・保護者", description: "サービスを利用されている方・ご家族" },
    { id: "staff", label: "スタッフ", description: "事業所で働いている方" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">はじめてのご利用</h1>
        <p className="mt-2 text-sm text-zinc-600">ご利用方法を選択してください</p>
      </div>

      <div className="space-y-3" role="radiogroup" aria-label="ご利用方法">
        {options.map((opt) => {
          const active = choice === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setChoice(opt.id)}
              className={`flex w-full items-center gap-4 rounded-3xl border-2 bg-white px-5 py-5 text-left shadow-sm transition ${
                active ? "border-emerald-500 bg-emerald-50" : "border-zinc-100"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? "border-emerald-600" : "border-zinc-300"
                }`}
              >
                {active && <span className="h-3 w-3 rounded-full bg-emerald-600" />}
              </span>
              <span>
                <span className="block text-base font-bold">{opt.label}</span>
                <span className="mt-1 block text-xs text-zinc-500">{opt.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <LineButton disabled={!choice} onClick={() => choice && setStep(choice)}>
        次へ
      </LineButton>
    </div>
  );
}
