"use client";

// 受給者証（tsusho）の内容をカルテへ反映するかの確認カード（Phase 1-B7）。
// 受給者証タブの上部に表示する。現在の証と現在のカルテを比べ、未確認の候補があるときだけ出る
// （候補 0 件・adult / child の証では何も表示しない）。
// OCR の値は候補で、スタッフがチェックした項目だけをカルテへ反映する。
import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  applyCertificateReview,
  CertificateReviewOutdatedError,
  getCertificateReview,
} from "@/lib/beneficiaryChart/chartStore";
import {
  initialSelection,
  reviewTargetLabel,
  type CertificateReview,
  type CertificateReviewCandidate,
  type ReviewTarget,
} from "@/lib/beneficiaryChart/certificateReview";
import { formatJapaneseDate } from "@/lib/beneficiaryChart/dates";
import { friendlyChartError } from "@/lib/beneficiaryChart/errors";
import {
  DisplayValue,
  primaryButtonClass,
  ResultNotice,
  secondaryButtonClass,
  type ResultMessage,
} from "../../components/chartUi";

const STALE_MESSAGE = "カルテが別の操作で更新されています。最新情報を確認してください。";

type Props = {
  tenantId: string;
  beneficiaryId: string;
  certificateId: string;
  user: User;
  // カルテを更新したとき（カルテ上部の氏名などを最新にする）
  onChartUpdated?: () => void;
};

function chartDisplay(c: CertificateReviewCandidate): string {
  return c.target === "personal.birthDate" ? formatJapaneseDate(c.chartValue) : c.chartValue;
}

function targetList(targets: readonly ReviewTarget[]): string {
  return targets.map(reviewTargetLabel).join("・");
}

export default function CertificateReviewCard({
  tenantId,
  beneficiaryId,
  certificateId,
  user,
  onChartUpdated,
}: Props) {
  const [review, setReview] = useState<CertificateReview | null>(null);
  const [selected, setSelected] = useState<Set<ReviewTarget>>(new Set());
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [message, setMessage] = useState<ResultMessage>(null);

  const load = useCallback(async () => {
    const next = await getCertificateReview({ tenantId, beneficiaryId, certificateId });
    setReview(next);
    setSelected(initialSelection(next.candidates));
  }, [tenantId, beneficiaryId, certificateId]);

  useEffect(() => {
    // 証が変わったときは親が key を変えて作り直す（閉じた状態・結果表示はここでは戻さない）
    let cancelled = false;
    getCertificateReview({ tenantId, beneficiaryId, certificateId })
      .then((next) => {
        if (cancelled) return;
        setReview(next);
        setSelected(initialSelection(next.candidates));
      })
      .catch(() => {
        // 候補を読めなくても受給者証タブの表示は止めない（次に開いたときに再表示される）
        if (!cancelled) setReview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, beneficiaryId, certificateId]);

  const candidates = review?.candidates ?? [];
  if (closed || (candidates.length === 0 && !message)) return null;

  const toggle = (target: ReviewTarget) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  };

  const submit = async (mode: "apply" | "dismiss") => {
    if (busy || candidates.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await applyCertificateReview({
        tenantId,
        beneficiaryId,
        certificateId,
        shown: candidates,
        selected,
        mode,
        user,
      });
      if (result.applied.length > 0) onChartUpdated?.();

      const parts: string[] = [];
      if (result.applied.length > 0) parts.push(`カルテへ反映しました（${targetList(result.applied)}）`);
      else if (mode === "dismiss") parts.push("今回はカルテへ反映しませんでした。受給者証は保存済みです");
      else parts.push("カルテは変更していません");

      if (result.stale.length > 0) {
        setMessage({
          kind: "error",
          text: `${STALE_MESSAGE}（${targetList(result.stale)}は反映していません）${parts.join("。")}。`,
        });
      } else {
        setMessage({ kind: "ok", text: `${parts.join("。")}。` });
      }
      await load();
    } catch (e: unknown) {
      if (e instanceof CertificateReviewOutdatedError) {
        setMessage({ kind: "error", text: e.message });
        setReview(null);
      } else {
        setMessage({ kind: "error", text: friendlyChartError(e, "save") });
      }
    } finally {
      setBusy(false);
    }
  };

  if (candidates.length === 0) {
    // すべて確認済み：結果だけを表示する
    return (
      <section className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm" data-testid="cert-review-done">
        <ResultNotice message={message} />
        <div className="flex justify-end">
          <button type="button" className={secondaryButtonClass} onClick={() => setClosed(true)}>
            閉じる
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-sm"
      aria-labelledby="cert-review-title"
      data-testid="cert-review"
    >
      <div>
        <div id="cert-review-title" className="text-base font-bold">
          受給者証の内容をカルテに反映しますか？
        </div>
        <div className="mt-1 text-xs text-zinc-600">
          受給者証から読み取った内容と、現在の利用者カルテを比較しました。反映する項目を確認してください。
          読み取りの誤りがあるかもしれないため、受給者証の写真と見比べてからチェックしてください。
        </div>
      </div>

      <ResultNotice message={message} />

      <ul className="space-y-3">
        {candidates.map((c) => {
          const checked = selected.has(c.target);
          const inputId = `cert-review-${c.reviewKey}`;
          return (
            <li
              key={c.target}
              className="rounded-xl border bg-white p-3"
              data-testid={`cert-review-item-${c.reviewKey}`}
              data-status={c.status}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{c.label}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                    c.status === "different"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600"
                  }`}
                >
                  {c.status === "different" ? "カルテと異なる" : "カルテが未入力"}
                </span>
              </div>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-zinc-500">現在のカルテ</dt>
                  <dd className="mt-0.5 text-sm">
                    <DisplayValue value={chartDisplay(c)} />
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-zinc-500">受給者証</dt>
                  <dd className="mt-0.5 text-sm">
                    <DisplayValue value={c.certValue} />
                    {c.target === "personal.birthDate" && (
                      <div className="text-xs text-zinc-500">
                        カルテには {formatJapaneseDate(c.proposedValue)} として保存します
                      </div>
                    )}
                  </dd>
                </div>
              </dl>
              {c.target === "guardian.address" && review?.guardianUsesBeneficiaryAddress && (
                <div className="mt-2 text-xs text-zinc-500">
                  ※ カルテでは「保護者の住所は利用者と同じ」が指定されているため、反映しても画面上の保護者住所は利用者の住所のまま表示されます
                </div>
              )}
              <label htmlFor={inputId} className="mt-2 flex items-center gap-2 text-sm">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  disabled={busy}
                  onChange={() => toggle(c.target)}
                />
                この内容をカルテへ反映
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => setClosed(true)}
          title="判断を記録せずに閉じます。次に受給者証タブを開いたときに再表示されます"
        >
          あとで確認する
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => void submit("dismiss")}
        >
          今回は反映しない
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={busy || selected.size === 0}
          onClick={() => void submit("apply")}
        >
          {busy ? "処理中..." : `選択した内容を反映（${selected.size}件）`}
        </button>
      </div>
    </section>
  );
}
