'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { ShoppingCart, Package, User, LogOut, LayoutDashboard, FileText, BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [customerName, setCustomerName] = useState('')
  const [priceList, setPriceList] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/portal/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles').select('role, customer_id').eq('id', user.id).single()
      if (!profile || profile.role !== 'client') { router.push('/login'); return }
      const { data: customer } = await supabase
        .from('customers').select('legal_name, assigned_price_list').eq('id', profile.customer_id).single()
      if (customer) { setCustomerName(customer.legal_name); setPriceList(customer.assigned_price_list ?? '') }
    }
    load()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const navItems = [
    { label: 'Dashboard', href: '/portal/dashboard', icon: LayoutDashboard },
    { label: 'My Orders',  href: '/portal/orders',    icon: ShoppingCart },
    { label: 'Invoices',   href: '/portal/invoices',  icon: FileText },
    { label: 'Analytics',  href: '/portal/analytics', icon: BarChart3 },
    { label: 'New Order',  href: '/portal/orders/new',icon: Package },
    { label: 'My Profile', href: '/portal/profile',   icon: User },
  ]

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f8f7ff' }}>
      {/* Sidebar */}
      <div style={{
        width: '224px',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100%',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          <img
            src="https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_dark_background.png"
            alt="DH Signature"
            style={{ height: '48px', width: 'auto' }}
          />
        </div>

        {/* Customer info */}
        {customerName && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>Logged in as</p>
            <p style={{ fontSize: '14px', fontWeight: 500, color: '#fff', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customerName}</p>
            {priceList && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{priceList}</span>}
          </div>
        )}

        {/* Nav */}
        <div style={{ flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== '/portal/dashboard' && pathname.startsWith(href))
            return (
              <Link key={href} href={href} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '12px',
                fontSize: '14px',
                textDecoration: 'none',
                transition: 'all 0.15s',
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                fontWeight: active ? 500 : 400,
                background: active ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))' : 'transparent',
                border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
              }}>
                <Icon style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Logout */}
        <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 12px',
              borderRadius: '12px',
              fontSize: '14px',
              color: 'rgba(255,255,255,0.3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'transparent' }}
          >
            <LogOut style={{ width: '16px', height: '16px' }} />
            Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: '224px', flex: 1, padding: '32px' }}>{children}</div>
    </div>
  )
}