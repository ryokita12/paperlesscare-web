"use client";

// src/app/components/AppShell.tsx
import { useState, type ReactNode } from "react";
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
  subtitle = "受給者証スキャニングシステム",
  currentPath,
  children,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="pcare-app">
      <header className="pcare-header">
        <div className="pcare-header__inner">
          <div className="pcare-brand">
            <div className="pcare-brand__icon">▣</div>
            <div>
              <div className="pcare-brand__title">{title}</div>
              <div className="pcare-brand__meta">{subtitle}</div>
            </div>
          </div>

          <div className="pcare-tenant">テナント： {tenantId}</div>

          <div className="pcare-user">
            <div className="pcare-user__icon">⌾</div>
            <span>{tenantId}さん</span>
            <span className="pcare-user__arrow">⌄</span>
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <div
            className="pcare-mobile-overlay"
            onClick={() => setMenuOpen(false)}
          />
          <div className="pcare-mobile-drawer">
            <SideNav
              tenantId={tenantId}
              currentPath={currentPath}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        </>
      )}

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
          max-width:1440px;
          margin:0 auto;
          padding:14px 16px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
        }
        .pcare-brand{
          display:flex;
          align-items:center;
          gap:10px;
        }

        .pcare-brand__icon{
          color:#4f46e5;
          font-size:26px;
          line-height:1;
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

        .pcare-header__right{
          display:flex;
          align-items:center;
          gap:12px;
        }

        .pcare-tenant{
          font-size:13px;
          color:#6b7280;
          font-weight:600;
        }

        .pcare-user{
          display:flex;
          align-items:center;
          gap:8px;
          font-size:13px;
          font-weight:600;
        }

        .pcare-user__icon{
          width:36px;
          height:36px;
          border-radius:999px;
          border:1px solid rgba(17,24,39,.18);
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:18px;
          background:#fff;
        }

        .pcare-user__arrow{
          color:#6b7280;
        }

        .pcare-menu-button{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          width:42px;
          height:42px;
          border-radius:10px;
          border:1px solid rgba(17,24,39,.10);
          background:#fff;
          color:#111827;
          font-size:20px;
          cursor:pointer;
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

        .pcare-mobile-overlay{
          position:fixed;
          inset:0;
          background:rgba(17,24,39,.35);
          z-index:39;
        }

        .pcare-mobile-drawer{
          position:fixed;
          top:0;
          left:0;
          width:min(320px, 88vw);
          height:100dvh;
          padding:16px;
          background:#f6f7fb;
          z-index:40;
          overflow:auto;
          box-shadow:0 20px 50px rgba(17,24,39,.18);
        }

        .pcare-mobile-drawer .pcare-sidenav{
          display:block;
        }

        .pcare-body{
          width:100%;
          max-width:100%;
          margin:0 auto;
          padding:12px;
          box-sizing:border-box;
          display:grid;
          grid-template-columns: 1fr;
          gap:16px;
        }
        .pcare-main{
          width:100%;
          max-width:100%;
          box-sizing:border-box;
          overflow:hidden;
          background:transparent;
          border:none;
          border-radius:0;
          padding:0;
          box-shadow:none;
          min-height: calc(100dvh - 120px);
        }

        @media (min-width: 900px){
          .pcare-body{
            max-width:1440px;
            padding:16px 24px;
            grid-template-columns: 220px 1fr;
            align-items:start;
          }
          .pcare-main{ padding:18px; }
        }

				@media (max-width: 899px){
          .pcare-header__actions,
          .pcare-tenant,
          .pcare-user{
            display:none;
          }

          .pcare-body > .pcare-sidenav{
            display:none;
          }
        }

        @media (min-width: 900px){
        .pcare-body > .pcare-sidenav{
          display:block;
        }

        .pcare-menu-button{
          display:none;
        }

        .pcare-mobile-overlay,
        .pcare-mobile-drawer{
          display:none;
        }
      }
      `}</style>
    </div>
  );
}
