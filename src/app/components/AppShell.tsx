// src/app/components/AppShell.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import SideNav from "./SideNav";

type Props = {
  tenantId: string;
  title?: string;
  subtitle?: string;
  currentPath?: string; // 任意：SideNav の active 判定に使う
  children: ReactNode;
};

export default function AppShell({
  tenantId,
  title = "PaperlessCare",
  subtitle,
  currentPath,
  children,
}: Props) {
  return (
    <div className="pcare-app">
      <header className="pcare-header">
        <div className="pcare-header__inner">
          <div className="pcare-brand">
            <div className="pcare-brand__title">{title}</div>
            <div className="pcare-brand__meta">
              tenant: {tenantId}
              {subtitle ? ` / ${subtitle}` : ""}
            </div>
          </div>

          {/* ログアウトは右上に集約 */}
          <nav className="pcare-header__actions" aria-label="Header actions">
            <Link className="pcare-link" href={`/t/${tenantId}`}>
              ホーム
            </Link>
            <Link className="pcare-link pcare-link--danger" href="/logout">
              ログアウト
            </Link>
          </nav>
        </div>
      </header>

      <div className="pcare-body">
        <SideNav tenantId={tenantId} currentPath={currentPath} />
        <main className="pcare-main">{children}</main>
      </div>

      <style>{`
        .pcare-app{
          min-height:100dvh;
          background:#f6f7fb;
          color:#111827;
        }
        .pcare-header{
          position:sticky;
          top:0;
          z-index:10;
          background:rgba(255,255,255,.85);
          backdrop-filter:saturate(180%) blur(10px);
          border-bottom:1px solid rgba(17,24,39,.08);
        }
        .pcare-header__inner{
          max-width:1200px;
          margin:0 auto;
          padding:14px 16px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
        }
        .pcare-brand__title{
          font-size:18px;
          font-weight:700;
          letter-spacing:.2px;
        }
        .pcare-brand__meta{
          font-size:12px;
          opacity:.7;
          margin-top:2px;
        }
        .pcare-header__actions{
          display:flex;
          align-items:center;
          gap:12px;
          flex-wrap:wrap;
          justify-content:flex-end;
        }
        .pcare-link{
          font-size:14px;
          text-decoration:none;
          padding:8px 10px;
          border-radius:10px;
          border:1px solid rgba(17,24,39,.10);
          background:#fff;
          color:#111827;
        }
        .pcare-link:hover{ filter:brightness(.98); }
        .pcare-link--danger{
          border-color:rgba(239,68,68,.25);
          color:#b91c1c;
        }

        .pcare-body{
          max-width:1200px;
          margin:0 auto;
          padding:16px;
          display:grid;
          grid-template-columns: 1fr;
          gap:16px;
        }
        .pcare-main{
          background:#fff;
          border:1px solid rgba(17,24,39,.10);
          border-radius:16px;
          padding:16px;
          box-shadow:0 10px 30px rgba(17,24,39,.06);
          min-height: calc(100dvh - 120px);
        }

        @media (min-width: 900px){
          .pcare-body{
            grid-template-columns: 260px 1fr;
            align-items:start;
          }
          .pcare-main{ padding:18px; }
        }

				.pcare-sidenav { display: none; }

				@media (min-width: 900px){
					.pcare-sidenav { display: block; }
				}
      `}</style>
    </div>
  );
}
