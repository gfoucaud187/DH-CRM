'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ShoppingCart, Package, User, LogOut, LayoutDashboard, FileText, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function StarLogo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible', filter: 'drop-shadow(0 0 8px rgba(124,92,255,.55))' }}>
      <defs>
        <linearGradient id="portalStar" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#B89CFF" />
          <stop offset="1" stopColor="#7C5CFF" />
        </linearGradient>
      </defs>
      <path d="M50 3 C53.5 35 64 46.5 97 50 C64 53.5 53.5 64 50 97 C46.5 64 36 53.5 3 50 C36 46.5 46.5 35 50 3 Z" fill="url(#portalStar)" />
    </svg>
  )
}

const DH_LOGO = 'https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_dark_background.png'

const navItems = [
  { label: 'Dashboard', href: '/portal/dashboard', icon: LayoutDashboard },
  { label: 'My Orders',  href: '/portal/orders',    icon: ShoppingCart },
  { label: 'Invoices',   href: '/portal/invoices',  icon: FileText },
  { label: 'Analytics',  href: '/portal/analytics', icon: BarChart3 },
  { label: 'New Order',  href: '/portal/orders/new',icon: Package },
  { label: 'My Profile', href: '/portal/profile',   icon: User },
]

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [customerName, setCustomerName] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/portal/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles').select('role, customer_id').eq('id', user.id).single()
      if (!profile || profile.role !== 'client') { router.push('/login'); return }
      const { data: customer } = await supabase
        .from('customers').select('legal_name').eq('id', profile.customer_id).single()
      if (customer) { setCustomerName(customer.legal_name) }
    }
    load()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/portal/dashboard' && pathname.startsWith(href))

  const sidebarWidth = collapsed ? 72 : 248

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f8f7ff' }}>

      {/* Sidebar */}
      <aside style={{
        width: `${sidebarWidth}px`,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100%',
        overflow: 'hidden',
        background: '#0e1a2b',
        transition: 'width 0.25s ease',
        flexShrink: 0,
        padding: collapsed ? '22px 0' : '24px 18px 22px',
        alignItems: collapsed ? 'center' : 'stretch',
      }}>

        {/* Header */}
        <div style={{ marginBottom: '20px', padding: collapsed ? '0' : '4px 6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: collapsed ? 0 : '9px' }}>
            <StarLogo size={30} />
            {!collapsed && (
              <span style={{ font: '700 22px/1 Space Grotesk, sans-serif', letterSpacing: '-0.02em', color: '#fff', whiteSpace: 'nowrap' }}>
                Stellar
              </span>
            )}
          </div>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '1px' }}>
              <span style={{ font: '500 11px/1 Space Grotesk, sans-serif', letterSpacing: '0.04em', color: '#6b7689', whiteSpace: 'nowrap' }}>by</span>
              <Image src={DH_LOGO} alt="DH Signature" width={80} height={15} style={{ height: 15, width: 'auto', display: 'block', opacity: 0.95 }} />
            </div>
          )}
        </div>

        {/* Customer info */}
        {customerName && !collapsed && (
          <div style={{ padding: '10px 8px', marginBottom: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
            <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Logged in as</p>
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#fff', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customerName}</p>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,.08)', marginBottom: '14px', flexShrink: 0, width: collapsed ? '42px' : '100%' }} />

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflowY: 'auto' }}>
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link key={href} href={href} title={collapsed ? label : undefined} style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : '13px',
                height: collapsed ? '52px' : '40px',
                width: collapsed ? '52px' : '100%',
                padding: collapsed ? '0' : '0 14px',
                borderRadius: collapsed ? '14px' : '12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                font: '500 14px/1 Space Grotesk, sans-serif',
                color: active ? '#0c1320' : '#9aa5ba',
                textDecoration: 'none',
                transition: 'background 0.15s, color 0.15s',
                background: active ? '#fff' : 'transparent',
                fontWeight: active ? 600 : 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                flexShrink: 0,
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.color = '#cfd6e3' } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9aa5ba' } }}
              >
                <Icon size={20} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ overflow: 'hidden' }}>{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ flexShrink: 0, paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,.08)', marginTop: '8px', display: 'flex', justifyContent: collapsed ? 'center' : 'stretch' }}>
          <button onClick={handleLogout} title={collapsed ? 'Sign out' : undefined} style={{
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : '13px',
            height: collapsed ? '52px' : '40px',
            width: collapsed ? '52px' : '100%',
            padding: collapsed ? '0' : '0 14px',
            borderRadius: collapsed ? '14px' : '12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            font: '500 14px/1 Space Grotesk, sans-serif',
            color: '#6b7689',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)'; e.currentTarget.style.color = '#cfd6e3' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7689' }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,.1)',
          background: 'transparent',
          color: '#6b7689',
          cursor: 'pointer',
          marginTop: '8px',
          alignSelf: collapsed ? 'center' : 'flex-end',
          flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#9aa5ba' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7689' }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

      </aside>

      {/* Main content */}
      <div style={{ marginLeft: `${sidebarWidth}px`, flex: 1, padding: '32px', transition: 'margin-left 0.25s ease' }}>
        {children}
      </div>

    </div>
  )
}