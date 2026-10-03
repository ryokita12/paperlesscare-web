"use client";

// LINEスタッフ版の共通UI部品。
// スマートフォン・片手操作が前提：1カラム、大きなタップ領域、短い文言、色は緑系＋グレーに絞る。

import Link from "next/link";
import type { ReactNode, SVGProps } from "react";

// globals.css の `a { color: inherit }` はレイヤー外のため、Link に付けた text-* が効かない。
// Link で描画する部品は、文字色を内側の span（display: contents）に付ける。
function LinkWithColor({ href, className, color, children }: { href: string; className: string; color: string; children: ReactNode }) {
  return (
    <Link href={href} className={className}>
      <span className={`contents ${color}`}>{children}</span>
    </Link>
  );
}

// ---------- アイコン（線画。色は currentColor） ----------

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 14.2a4.5 4.5 0 0 1 4.5 4.8" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Svg>
);

export const IconUserPlus = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3 20a7 7 0 0 1 12.5-4.3" />
    <path d="M18.5 14v6M15.5 17h6" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 17 5-4.5 4 3.5 2.5-2 4.5 3.5" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="m9 15 2 2 4-4" />
  </Svg>
);

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11 12 4.5 20 11" />
    <path d="M6 9.5V19.5h12V9.5" />
  </Svg>
);

// ---------- 画面の骨組み ----------

/** 各画面の上部：戻る＋画面タイトル（＋短い補足） */
export function LinePageHeader({
  back,
  title,
  subtitle,
}: {
  back?: { href: string; label?: string } | { onClick: () => void; label?: string };
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {back && <LineBackLink {...back} />}
      <div className="px-1">
        <h1 className="text-[1.6rem] font-bold leading-snug tracking-tight text-zinc-900 break-words">{title}</h1>
        {subtitle && <p className="mt-1.5 text-base leading-relaxed text-zinc-600">{subtitle}</p>}
      </div>
    </div>
  );
}

export function LineBackLink(
  props: ({ href: string } | { onClick: () => void }) & { label?: string }
) {
  const color = "text-emerald-700";
  const cls =
    "-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-base font-semibold active:bg-emerald-100/70";
  const content = (
    <>
      <IconChevronLeft className="h-5 w-5" />
      {props.label ?? "戻る"}
    </>
  );
  if ("href" in props) {
    return (
      <LinkWithColor href={props.href} className={cls} color={color}>
        {content}
      </LinkWithColor>
    );
  }
  return (
    <button type="button" onClick={props.onClick} className={`${cls} ${color}`}>
      {content}
    </button>
  );
}

export function LineSpinner({ label, fullHeight = true }: { label?: string; fullHeight?: boolean }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center gap-4 text-zinc-500 ${
        fullHeight ? "min-h-[55dvh]" : "py-12"
      }`}
    >
      <div className="h-11 w-11 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-500" />
      <div className="text-base">{label ?? "読み込んでいます"}</div>
    </div>
  );
}

type Action = { label: string; onClick?: () => void; href?: string };

export function LineCenteredMessage({
  title,
  body,
  tone = "neutral",
  action,
  secondaryAction,
}: {
  title: string;
  body: ReactNode;
  tone?: "neutral" | "error";
  action?: Action;
  secondaryAction?: Action;
}) {
  return (
    <div className="flex min-h-[55dvh] flex-col items-center justify-center px-2 text-center">
      {tone === "error" && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-500">
          <IconAlert className="h-8 w-8" />
        </div>
      )}
      <div className="text-xl font-bold text-zinc-900">{title}</div>
      <div className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-zinc-600">{body}</div>
      {(action || secondaryAction) && (
        <div className="mt-8 w-full space-y-3">
          {action && (
            <LineButton onClick={action.onClick} href={action.href}>
              {action.label}
            </LineButton>
          )}
          {secondaryAction && (
            <LineButton variant="secondary" onClick={secondaryAction.onClick} href={secondaryAction.href}>
              {secondaryAction.label}
            </LineButton>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- ボタン ----------

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
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
    "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-[1.05rem] font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";
  const look =
    variant === "primary"
      ? "bg-emerald-600 shadow-sm shadow-emerald-600/20 active:bg-emerald-700"
      : variant === "secondary"
        ? "bg-emerald-50 active:bg-emerald-100"
        : "active:bg-zinc-100";
  const color = variant === "primary" ? "text-white" : variant === "secondary" ? "text-emerald-800" : "text-zinc-600";
  const cls = `${base} ${look} ${className}`;

  if (href && !disabled) {
    return (
      <LinkWithColor href={href} className={cls} color={color}>
        {children}
      </LinkWithColor>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${cls} ${color}`}>
      {children}
    </button>
  );
}

/** 大きな選択肢（TOPのメニュー、新規／既存の選択など）。アイコン＋見出し＋短い説明 */
export function LineChoiceTile({
  href,
  onClick,
  icon,
  title,
  description,
  emphasis = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  emphasis?: boolean;
}) {
  const cls = `flex w-full items-center gap-4 rounded-3xl px-5 py-6 text-left transition active:scale-[0.98] ${
    emphasis
      ? "bg-emerald-600 shadow-lg shadow-emerald-600/20 active:bg-emerald-700"
      : "bg-white shadow-sm ring-1 ring-zinc-200/70 active:bg-emerald-50"
  }`;
  const color = emphasis ? "text-white" : "text-zinc-900";
  const content = (
    <>
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
          emphasis ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold leading-snug">{title}</span>
        <span className={`mt-1 block text-[0.95rem] ${emphasis ? "text-emerald-50" : "text-zinc-500"}`}>
          {description}
        </span>
      </span>
      <IconChevronRight className={`h-6 w-6 shrink-0 ${emphasis ? "text-white/80" : "text-zinc-300"}`} />
    </>
  );
  if (href) {
    return (
      <LinkWithColor href={href} className={cls} color={color}>
        {content}
      </LinkWithColor>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${cls} ${color}`}>
      {content}
    </button>
  );
}

// ---------- 表示部品 ----------

export function LineCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/60 ${className}`}>{children}</section>;
}

export function LineField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-0.5 break-words text-base font-semibold text-zinc-900">
        {value || <span className="font-normal text-zinc-400">未登録</span>}
      </div>
    </div>
  );
}

export function LineNotice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "error";
}) {
  const look =
    tone === "error"
      ? "bg-red-50 text-red-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-800"
        : "bg-emerald-50 text-emerald-800";
  return (
    <div role={tone === "info" ? "status" : "alert"} className={`flex gap-3 rounded-2xl px-4 py-3.5 text-[0.95rem] leading-relaxed ${look}`}>
      {tone !== "info" && <IconAlert className="mt-0.5 h-5 w-5 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Functions・Firestore 等のエラーを、現場スタッフ向けの日本語に置き換える */
export function friendlyErrorMessage(e: unknown, fallback = "うまくいきませんでした。もう一度お試しください。"): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code.endsWith("permission-denied")) {
    return "この操作を行う権限がありません。事業所の管理者にお問い合わせください。";
  }
  if (code.endsWith("unavailable") || code.endsWith("deadline-exceeded") || code === "auth/network-request-failed") {
    return "通信がうまくいきませんでした。電波の良い場所で、もう一度お試しください。";
  }
  if (code.endsWith("unauthenticated")) {
    return "ログインの有効期限が切れました。LINEからもう一度開いてください。";
  }
  return fallback;
}
