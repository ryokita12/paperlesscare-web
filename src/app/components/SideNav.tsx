"use client";

// src/app/components/SideNav.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  tenantId: string;
  currentPath?: string;
  onNavigate?: () => void;
};

type NavLinkItem = {
  kind: "link";
  href: string;
  label: string;
  icon?: string;
  // 子項目（受給者証の取込など）として字下げ表示する
  nested?: boolean;
  isActive: (path: string) => boolean;
};

// 開発中の機能。リンクにせず、押せない表示にする
type NavPlannedItem = { kind: "planned"; label: string };

type NavItem = NavLinkItem | NavPlannedItem;

export default function SideNav({ tenantId, currentPath, onNavigate }: Props) {
  const pathname = usePathname();
  const path = currentPath || pathname || "";

  const base = `/t/${tenantId}`;
  const beneficiariesPath = `${base}/beneficiaries`;
  const settingsPath = `${base}/settings`;
  const todayPath = `${base}/today`;
  const schedulePath = `${base}/schedule`;
  const usagePath = `${base}/usage`;

  const mainItems: NavItem[] = [
    {
      // Phase 2：日常業務の中心（ログイン後のメイン画面）
      kind: "link",
      href: todayPath,
      label: "今日の利用",
      icon: "/icons/icon-calendar.svg",
      isActive: (p) => p === todayPath,
    },
    {
      kind: "link",
      href: beneficiariesPath,
      label: "利用者管理",
      icon: "/icons/icon-user.svg",
      isActive: (p) => p === beneficiariesPath || p.startsWith(`${beneficiariesPath}/`),
    },
    {
      // 既存の「受給者証取込＆送信」（/t/{tenantId}）。URL・機能はそのまま、利用者管理の下に置く
      kind: "link",
      href: base,
      label: "受給者証を取り込む",
      icon: "/icons/icon-upload.svg",
      nested: true,
      isActive: (p) => p === base || p === `${base}/capture`,
    },
    {
      kind: "link",
      href: schedulePath,
      label: "利用予定",
      icon: "/icons/icon-schedule.svg",
      isActive: (p) => p === schedulePath,
    },
    {
      kind: "link",
      href: usagePath,
      label: "実績",
      icon: "/icons/icon-report.svg",
      isActive: (p) => p === usagePath,
    },
    { kind: "planned", label: "支援記録" },
    { kind: "planned", label: "支援計画" },
    { kind: "planned", label: "帳票" },
  ];

  const adminItems: NavItem[] = [
    { kind: "planned", label: "スタッフ管理" },
    {
      kind: "link",
      href: settingsPath,
      label: "システム設定",
      icon: "/icons/icon-settings.svg",
      isActive: (p) => p === settingsPath,
    },
  ];

  const renderItem = (it: NavItem) => {
    if (it.kind === "planned") {
      return (
        <div
          key={it.label}
          className="pcare-sidenav__item pcare-sidenav__item--planned"
          aria-disabled="true"
          title="この機能は現在開発中です"
        >
          <span className="pcare-sidenav__icon pcare-sidenav__icon--blank" aria-hidden="true" />
          <span>{it.label}</span>
          <span className="pcare-sidenav__badge">開発中</span>
        </div>
      );
    }

    const active = it.isActive(path);
    return (
      <Link
        key={it.href}
        href={it.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={[
          "pcare-sidenav__item",
          it.nested ? "pcare-sidenav__item--nested" : "",
          active ? "pcare-sidenav__item--active" : "",
        ].join(" ")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={it.icon} alt="" className="pcare-sidenav__icon" />
        <span>{it.label}</span>
      </Link>
    );
  };

  return (
    <aside className="pcare-sidenav" aria-label="Side menu">
      <div className="pcare-sidenav__section">
        <div className="pcare-sidenav__label">メニュー</div>
        {mainItems.map(renderItem)}
      </div>

      <div className="pcare-sidenav__section">
        <div className="pcare-sidenav__label">管理</div>
        {adminItems.map(renderItem)}
      </div>

      <div className="pcare-sidenav__section">
        <div className="pcare-sidenav__label">アカウント</div>
        <Link
          className="pcare-sidenav__item pcare-sidenav__item--danger"
          href="/logout"
          onClick={onNavigate}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-logout.svg" alt="" className="pcare-sidenav__icon" />
          <span>ログアウト</span>
        </Link>
      </div>

      <style>{`
        .pcare-sidenav{
          background:transparent;
          border:none;
          border-radius:0;
          padding:8px 0;
          box-shadow:none;
        }

        .pcare-sidenav__section + .pcare-sidenav__section{
          margin-top:18px;
          padding-top:18px;
          border-top:1px solid rgba(17,24,39,.08);
        }

        .pcare-sidenav__label{
          font-size:13px;
          color:#6b7280;
          margin-bottom:10px;
        }

        .pcare-sidenav__item{
          display:flex;
          align-items:center;
          gap:8px;
          text-decoration:none;
          color:#374151;
          padding:10px 12px;
          border-radius:10px;
          border:none;
          background:transparent;
          margin-top:4px;
          font-size:14px;
        }

        .pcare-sidenav__item:hover{
          background:#e5e7eb;
        }

        .pcare-sidenav__item--nested{
          margin-left:16px;
          padding-top:8px;
          padding-bottom:8px;
          font-size:13px;
        }

        .pcare-sidenav__item--active{
          background:#eef2ff;
          color:#4f46e5;
          font-weight:600;
        }

        .pcare-sidenav__item--planned{
          color:#9ca3af;
          cursor:not-allowed;
          user-select:none;
        }

        .pcare-sidenav__item--planned:hover{
          background:transparent;
        }

        .pcare-sidenav__badge{
          margin-left:auto;
          flex-shrink:0;
          font-size:11px;
          font-weight:600;
          color:#6b7280;
          background:#f3f4f6;
          border:1px solid #e5e7eb;
          border-radius:999px;
          padding:1px 8px;
        }

        .pcare-sidenav__icon{
          width:18px;
          height:18px;
          opacity:.75;
          flex-shrink:0;
        }

        .pcare-sidenav__icon--blank{
          display:inline-block;
        }

        .pcare-sidenav__item--active .pcare-sidenav__icon{
          opacity:1;
        }

        .pcare-sidenav__item--danger{
          border:1px solid rgba(239,68,68,.25);
          color:#dc2626;
          background:#fff;
        }

        .pcare-sidenav__item--danger:hover{
          background:#fff5f5;
        }
      `}</style>
    </aside>
  );
}
