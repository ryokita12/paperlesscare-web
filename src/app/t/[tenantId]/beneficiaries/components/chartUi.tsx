"use client";

// 利用者一覧・利用者カルテで使う小さなUI部品。
// 既存の管理画面（rounded-2xl の白カード、黒の主ボタン、枠線の副ボタン）に見た目を合わせる。
import type { ReactNode } from "react";
import type { CertificateStatusKind } from "@/lib/beneficiaryChart/certificateStatus";

export const primaryButtonClass =
  "rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
export const secondaryButtonClass =
  "rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50";
export const dangerButtonClass =
  "rounded-xl border border-red-200 bg-white px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50";
export const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-zinc-50";

const STATUS_STYLES: Record<CertificateStatusKind, string> = {
  valid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expiringSoon: "bg-amber-50 text-amber-800 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  unknownExpiry: "bg-zinc-50 text-zinc-600 border-zinc-200",
  none: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

export function CertificateStatusBadge({ kind, label }: { kind: CertificateStatusKind; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[kind]}`}
    >
      {label}
    </span>
  );
}

/**
 * 利用者の「要対応」の件数（Phase 1-C）。至急（期限切れ等）を含む場合は赤、それ以外はオレンジ。
 * 0件は目立たせない（一覧で対応が必要な利用者だけが目に入るように）。
 */
export function ActionCountBadge({ count, urgent }: { count: number; urgent: boolean }) {
  if (count === 0) {
    return <span className="whitespace-nowrap text-xs text-zinc-400">なし</span>;
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${
        urgent ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
      data-testid="action-count"
    >
      要対応 {count}
    </span>
  );
}

export function PlannedBadge() {
  return (
    <span className="ml-1 inline-flex shrink-0 items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
      開発中
    </span>
  );
}

/** 値が空のときは「未入力」を薄く表示する（undefined 等を出さない） */
export function DisplayValue({ value, empty = "未入力" }: { value?: string | null; empty?: string }) {
  const text = (value ?? "").trim();
  if (!text) return <span className="text-zinc-400">{empty}</span>;
  return <span className="whitespace-pre-wrap break-words">{text}</span>;
}

export function InfoGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

export function InfoItem({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function FormField({
  label,
  required = false,
  error,
  hint,
  wide = false,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  wide?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={htmlFor} className="mb-1 flex items-center gap-2 text-xs font-semibold text-zinc-700">
        {label}
        {required && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">必須</span>
        )}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

export type ResultMessage = { kind: "ok" | "error"; text: string } | null;

export function ResultNotice({ message }: { message: ResultMessage }) {
  if (!message) return null;
  return (
    <div
      role={message.kind === "error" ? "alert" : "status"}
      className={`rounded-xl px-4 py-3 text-sm ${
        message.kind === "ok"
          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {message.kind === "ok" ? "✓ " : ""}
      {message.text}
    </div>
  );
}

/**
 * 「閲覧」と「編集」を切り替えるカード。編集中は枠の色を変え、保存／キャンセルを下に出す。
 */
export function SectionCard({
  title,
  description,
  editing,
  canEdit,
  onEdit,
  onCancel,
  onSave,
  saving,
  message,
  children,
}: {
  title: string;
  description?: string;
  editing: boolean;
  // 別のカードを編集中などで「編集」を押せないとき false
  canEdit: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  message: ResultMessage;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 ${
        editing ? "border-indigo-300 ring-2 ring-indigo-100" : ""
      }`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold">
            {title}
            {editing && <span className="ml-2 text-xs font-semibold text-indigo-600">編集中</span>}
          </h2>
          {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            disabled={!canEdit}
            title={canEdit ? undefined : "編集中の項目を保存またはキャンセルしてください"}
            className={secondaryButtonClass}
          >
            編集
          </button>
        )}
      </div>

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          noValidate
        >
          {children}
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
            <button type="button" onClick={onCancel} disabled={saving} className={secondaryButtonClass}>
              キャンセル
            </button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving ? "保存中..." : "保存する"}
            </button>
          </div>
          {message && (
            <div className="mt-3">
              <ResultNotice message={message} />
            </div>
          )}
        </form>
      ) : (
        <>
          {children}
          {message && (
            <div className="mt-4">
              <ResultNotice message={message} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
