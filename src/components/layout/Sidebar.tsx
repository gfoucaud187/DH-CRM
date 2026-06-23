'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <rect x="3"  y="3"  width="7" height="7" rx="1.5" />
        <rect x="14" y="3"  width="7" height="7" rx="1.5" />
        <rect x="3"  y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: 'Products',
    href: '/products',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M21 8 L12 3 L3 8 L12 13 Z" />
        <path d="M3 8 V16 L12 21 V13" />
        <path d="M21 8 V16 L12 21" />
      </svg>
    ),
  },
  {
    label: 'Customers',
    href: '/customers',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.6 19 C3.6 15.4 6.1 13.8 9 13.8 C11.9 13.8 14.4 15.4 14.4 19" />
        <circle cx="17" cy="8.6" r="2.5" />
        <path d="M16.2 14 C19.1 14 20.6 15.6 20.6 19" />
      </svg>
    ),
  },
  {
    label: 'Orders',
    href: '/orders',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M4 10 V20 H20 V10" />
        <path d="M3 10 L4.6 5 H19.4 L21 10 Z" />
        <path d="M9.5 20 V14.5 H14.5 V20" />
      </svg>
    ),
  },
  {
    label: 'Price Lists',
    href: '/price-lists',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3.5 12 L12 3.5 H20 V11.5 L11.5 20 Z" />
        <circle cx="16.4" cy="7.6" r="1.4" />
      </svg>
    ),
  },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7 V5 A2 2 0 0 0 8 5 V7" />
        <path d="M12 12 V16" />
        <path d="M10 14 H14" />
      </svg>
    ),
  },
];

// ─── Logo star SVG ─────────────────────────────────────────────────────────────
function StarLogo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible', filter: 'drop-shadow(0 0 8px rgba(124,92,255,.55))' }}>
      <defs>
        <linearGradient id="navStar" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B89CFF" />
          <stop offset="1" stopColor="#7C5CFF" />
        </linearGradient>
      </defs>
      <path d="M50 3 C53.5 35 64 46.5 97 50 C64 53.5 53.5 64 50 97 C46.5 64 36 53.5 3 50 C36 46.5 46.5 35 50 3 Z" fill="url(#navStar)" />
    </svg>
  );
}

// ─── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const DH_LOGO = 'https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_dark_background.png';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

        .sidebar {
          flex-shrink: 0;
          background: #0e1a2b;
          display: flex;
          flex-direction: column;
          transition: width 0.25s ease;
          height: 100vh;
          position: sticky;
          top: 0;
          overflow: hidden;
        }
        .sidebar.expanded { width: 248px; padding: 24px 18px 22px; }
        .sidebar.collapsed { width: 72px;  padding: 22px 0;        align-items: center; }

        /* ── Header ── */
        .sb-header {
          margin-bottom: 20px;
        }
        .sidebar.collapsed .sb-header { display: flex; flex-direction: column; align-items: center; gap: 0; }

        .sb-brand-row {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 9px;
        }
        .sidebar.collapsed .sb-brand-row { margin-bottom: 0; }

        .sb-brand-title {
          font: 700 22px/1 'Space Grotesk', sans-serif;
          letter-spacing: -0.02em;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          transition: opacity 0.2s, max-width 0.25s;
        }
        .sidebar.collapsed .sb-brand-title { opacity: 0; max-width: 0; }

        .sb-by-row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding-left: 1px;
          overflow: hidden;
          transition: opacity 0.2s, max-height 0.25s;
          max-height: 30px;
        }
        .sidebar.collapsed .sb-by-row { opacity: 0; max-height: 0; pointer-events: none; }

        .sb-by-text {
          font: 500 11px/1 'Space Grotesk', sans-serif;
          letter-spacing: 0.04em;
          color: #6b7689;
          white-space: nowrap;
        }

        /* ── Divider ── */
        .sb-divider {
          height: 1px;
          background: rgba(255,255,255,.08);
          margin-bottom: 14px;
          transition: opacity 0.2s;
        }
        .sidebar.collapsed .sb-divider { width: 42px; }

        /* ── Nav ── */
        .sb-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .sb-item {
          display: flex;
          align-items: center;
          gap: 13px;
          height: 48px;
          padding: 0 14px;
          border-radius: 12px;
          font: 500 15px 'Space Grotesk', sans-serif;
          color: #9aa5ba;
          text-decoration: none;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
          white-space: nowrap;
          overflow: hidden;
          cursor: pointer;
        }
        .sidebar.collapsed .sb-item {
          width: 52px;
          height: 52px;
          padding: 0;
          justify-content: center;
          border-radius: 14px;
          gap: 0;
        }

        .sb-item:hover:not(.active) {
          background: rgba(255,255,255,.05);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.07);
          color: #cfd6e3;
        }

        .sb-item.active {
          background: #fff;
          color: #0c1320;
          font-weight: 600;
        }
        .sidebar.collapsed .sb-item.active {
          background: #fff;
          color: #0c1320;
        }

        .sb-item-label {
          transition: opacity 0.2s, max-width 0.25s;
          overflow: hidden;
        }
        .sidebar.collapsed .sb-item-label { opacity: 0; max-width: 0; }

        /* ── Toggle button ── */
        .sb-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,.1);
          background: transparent;
          color: #6b7689;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          margin-top: 8px;
          align-self: flex-end;
          flex-shrink: 0;
        }
        .sidebar.collapsed .sb-toggle { align-self: center; margin-top: 14px; }
        .sb-toggle:hover { background: rgba(255,255,255,.06); color: #9aa5ba; }
      `}</style>

      <aside className={`sidebar ${collapsed ? 'collapsed' : 'expanded'}`}>
        {/* Header */}
        <div className="sb-header" style={{ padding: collapsed ? '0 0 0 0' : '4px 6px 0' }}>
          <div className="sb-brand-row">
            <StarLogo size={30} />
            <span className="sb-brand-title">Stellar</span>
          </div>
          <div className="sb-by-row">
            <span className="sb-by-text">by</span>
            <Image
              src={DH_LOGO}
              alt="DH Signature"
              width={80}
              height={15}
              style={{ height: 15, width: 'auto', display: 'block', opacity: 0.95 }}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="sb-divider" />

        {/* Nav */}
        <nav className="sb-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sb-item ${isActive(item.href) ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              <span className="sb-item-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button className="sb-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {collapsed ? (
              // Chevrons right
              <>
                <path d="M9 18 L15 12 L9 6" />
              </>
            ) : (
              // Chevrons left
              <>
                <path d="M15 18 L9 12 L15 6" />
              </>
            )}
          </svg>
        </button>
      </aside>
    </>
  );
}