// src/app/components/SideNav.tsx
import Link from "next/link";

type Props = {
  tenantId: string;
  currentPath?: string;
  onNavigate?: () => void;
};

export default function SideNav({
  tenantId,
  currentPath = "",
  onNavigate,
}: Props) {
  const items = [
    { href: `/t/${tenantId}`, label: "受給者証取込＆送信", icon: "/icons/icon-upload.svg" },
    { href: `/t/${tenantId}/beneficiaries`, label: "受給者管理", icon: "/icons/icon-user.svg" },
    { href: `/t/${tenantId}/settings`, label: "システム設定", icon: "/icons/icon-settings.svg" },
  ];

  const isActive = (href: string) => currentPath === href;

  return (
    <aside className="pcare-sidenav" aria-label="Side menu">
      <div className="pcare-sidenav__section">
        <div className="pcare-sidenav__label">メニュー</div>

        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            className={[
              "pcare-sidenav__item",
              isActive(it.href) ? "pcare-sidenav__item--active" : "",
            ].join(" ")}
          >
            <img src={it.icon} alt="" className="pcare-sidenav__icon" />
            <span>{it.label}</span>
          </Link>
        ))}
      </div>

      <div className="pcare-sidenav__section">
        <div className="pcare-sidenav__label">アカウント</div>
        <Link
          className="pcare-sidenav__item pcare-sidenav__item--danger"
          href="/logout"
          onClick={onNavigate}
        >
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

        .pcare-sidenav__item--active{
          background:#eef2ff;
          color:#4f46e5;
          font-weight:600;
        }

        .pcare-sidenav__icon{
          width:18px;
          height:18px;
          opacity:.75;
          flex-shrink:0;
        }

        .pcare-sidenav__item--active .pcare-sidenav__icon{
          opacity:1;
        }

        .pcare-sidenav__logout-icon{
          width:18px;
          text-align:center;
          font-size:15px;
          opacity:.85;
          flex-shrink:0;
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