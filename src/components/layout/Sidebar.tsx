'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard, Package, Users, Handshake, DollarSign,
  ShoppingCart, Warehouse, BarChart3, FolderOpen, Settings,
  ListChecks, LogOut, Target, Store, ChevronLeft, ChevronRight,
  ShoppingBag, Menu, X
} from 'lucide-react';
import './sidebar.css';

const NAV_ITEMS = [
  { label: 'Dashboard',    href: '/dashboard',   icon: LayoutDashboard },
  { label: 'Products',     href: '/products',    icon: Package },
  { label: 'Clients',      href: '/clients',      icon: Users },
  { label: 'Retailers',    href: '/retailers',   icon: Store },
  { label: 'Partners',     href: '/partners',    icon: Handshake },
  { label: 'Price Lists',  href: '/price-lists', icon: DollarSign },
  { label: 'Orders',       href: '/orders',      icon: ShoppingCart, badge: true },
  { label: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingBag },{ label: 'Inventory',    href: '/inventory',   icon: Warehouse },
  { label: 'Finance',      href: '/finance',     icon: DollarSign },
  { label: 'Documents',    href: '/documents',   icon: FolderOpen },
  { label: 'Reports',      href: '/reports',     icon: BarChart3 },
  { label: 'Targets',      href: '/targets',     icon: Target },
  { label: 'Tracking Log', href: '/tracking',    icon: ListChecks },
  { label: 'Settings',     href: '/settings',    icon: Settings },
];

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

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const supabase = createClient();

  const { data: pendingPOCount = 0 } = useQuery({
    queryKey: ['pending-po-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('sales_orders')
        .select('*', { count: 'exact', head: true })
        .eq('document_type', 'po')
        .eq('status', 'pending_approval');
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const DH_LOGO = 'https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_dark_background.png';

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-[#0e1a2b] flex items-center px-4 z-40 md:hidden">
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="text-gray-300 hover:text-white p-1"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="ml-3 flex items-center gap-2">
          <StarLogo size={22} />
          <span className="text-white font-bold text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Stellar</span>
        </div>
      </div>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

    <aside className={`admin-sidebar ${collapsed ? 'collapsed' : 'expanded'} ${mobileOpen ? 'mobile-open' : ''}`}>

      {/* Header */}
      <div className="sb-header" style={{ padding: collapsed ? '0' : '4px 6px 0' }}>
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
        {NAV_ITEMS.map(({ label, href, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            className={`sb-item ${isActive(href) ? 'active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={20} style={{ flexShrink: 0 }} />
            <span className="sb-item-label">{label}</span>
            {badge && pendingPOCount > 0 && (
              <span className="sb-badge">{pendingPOCount}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="sb-logout-wrap">
        <button className="sb-logout" onClick={handleLogout} title={collapsed ? 'Sign out' : undefined}>
          <LogOut size={18} style={{ flexShrink: 0 }} />
          <span className="sb-item-label">Sign out</span>
        </button>
      </div>

      {/* Collapse toggle */}
      <button className="sb-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

    </aside>
    </>
  );
}