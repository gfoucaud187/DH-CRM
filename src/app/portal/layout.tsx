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
    <div className="min-h-screen flex" style={{ background: '#f8f7ff' }}>
      {/* Sidebar */}
      <div className="w-56 flex flex-col fixed h-full"
        style={{ background: 'linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <img src="https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_dark_background.png" alt="DH Signature" style={{ height: '48px', width: 'auto' }} />
        </div>

        {/* Customer info */}
        {customerName && (
          <div className="px-5 py-3 border-b border-white/10">
            <p className="text-xs text-white/30">Logged in as</p>
            <p className="text-sm font-medium text-white truncate mt-0.5">{customerName}</p>
            {priceList && <span className="text-xs text-white/30 font-mono">{priceList}</span>}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== '/portal/dashboard' && pathname.startsWith(href))
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  active
                    ? 'text-white font-medium'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                }`}
                style={active ? { background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))', border: '1px solid rgba(99,102,241,0.3)' } : {}}>
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/10">
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/30 hover:text-white/70 hover:bg-white/5 transition-all w-full">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-56 flex-1 p-8">{children}</div>
    </div>
  )
}