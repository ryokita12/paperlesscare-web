"use client";

// LINEスタッフ版の共通UI部品（スマートフォン専用・片手操作向けの大きめのボタン）

import Link from "next/link";
import type { ReactNode } from "react";

export function LineSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-zinc-500">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
      {label && <div className="text-sm">{label}</div>}
    </div>
  );
}

export function LineCenteredMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-2 text-center">
      <div className="w-full rounded-3xl border border-emerald-100 bg-white px-6 py-8 shadow-sm">
        <div className="text-lg font-bold text-zinc-900">{title}</div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-600">{body}</p>
        {action && (
          <LineButton className="mt-6" onClick={action.onClick}>
            {action.label}
          </LineButton>
        )}
      </div>
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
};

export function LineButton({
  children,
  onClick,
  href,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
}: ButtonProps) {
  const base =
    "flex w-full items-center justify-center gap-3 rounded-2xl px-5 py-4 text-base font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50";
  const look =
    variant === "primary"
      ? "bg-emerald-600 text-white shadow-md hover:bg-emerald-700"
      : "border border-emerald-200 bg-white text-emerald-800 shadow-sm hover:bg-emerald-50";
  const cls = `${base} ${look} ${className}`;

  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function LineBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-xl px-1 py-2 text-sm font-semibold text-emerald-700"
    >
      <span aria-hidden>‹</span>
      {label}
    </Link>
  );
}

export function LineCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

export function LineField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 py-3 last:border-b-0">
      <div className="shrink-0 text-sm text-zinc-500">{label}</div>
      <div className="min-w-0 break-words text-right text-sm font-semibold text-zinc-900">
        {value || <span className="font-normal text-zinc-400">未登録</span>}
      </div>
    </div>
  );
}
