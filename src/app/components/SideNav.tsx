// src/app/components/SideNav.tsx
import Link from "next/link";

type Props = {
  tenantId: string;
  currentPath?: string; // 任意：選択中ハイライト用
};

export default function SideNav({ tenantId, currentPath = "" }: Props) {
  const items = [
    { href: `/t/${tenantId}`, label: "受給者証取込＆送信" },
    { href: `/t/${tenantId}/settings`, label: "システム設定" },
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
            className={[
              "pcare-sidenav__item",
              isActive(it.href) ? "pcare-sidenav__item--active" : "",
            ].join(" ")}
          >
            {it.label}
          </Link>
        ))}
      </div>

      <div className="pcare-sidenav__section">
        <div className="pcare-sidenav__label">アカウント</div>
        <Link className="pcare-sidenav__item pcare-sidenav__item--danger" href="/logout">
          ログアウト
        </Link>
      </div>

      <style>{`
        .pcare-sidenav{
          background:#fff;
          border:1px solid rgba(17,24,39,.10);
          border-radius:16px;
          padding:14px;
          box-shadow:0 10px 30px rgba(17,24,39,.06);
        }
        .pcare-sidenav__section + .pcare-sidenav__section{
          margin-top:14px;
          padding-top:14px;
          border-top:1px solid rgba(17,24,39,.08);
        }
        .pcare-sidenav__label{
          font-size:12px;
          opacity:.7;
          margin-bottom:10px;
        }
        .pcare-sidenav__item{
          display:block;
          text-decoration:none;
          color:#111827;
          padding:10px 10px;
          border-radius:12px;
          border:1px solid rgba(17,24,39,.08);
          background:#fff;
          margin-top:8px;
          font-size:14px;
        }
        .pcare-sidenav__item:hover{ filter:brightness(.98); }
        .pcare-sidenav__item--danger{
          border-color:rgba(239,68,68,.25);
          color:#b91c1c;
        }
        .pcare-sidenav__item--active{
          border-color:rgba(59,130,246,.35);
          box-shadow:0 0 0 3px rgba(59,130,246,.12);
        }
      `}</style>
    </aside>
  );
}
