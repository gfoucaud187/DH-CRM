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
      if (!user) { router.push('/login'); return }
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
    window.location.href = '/portal-login'
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
    <div className="min-h-screen bg-gray-50 flex">
      <div className="w-56 bg-gray-900 text-white flex flex-col fixed h-full">
        <div className="p-5 border-b border-gray-700">
          <div className="text-xl font-bold tracking-tight">dh. <span className="text-gray-400 text-sm font-normal">SIGNATURE</span></div>
          <div className="text-xs text-gray-500 mt-0.5">Client Portal</div>
        </div>
        {customerName && (
          <div className="p-4 border-b border-gray-700">
            <p className="text-xs text-gray-400">Logged in as</p>
            <p className="text-sm font-medium text-white truncate mt-0.5">{customerName}</p>
            {priceList && <span className="text-xs text-gray-500 font-mono">{priceList} price list</span>}
          </div>
        )}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== '/portal/dashboard' && pathname.startsWith(href))
            return (
              <Link key={href} href={href}
                className={'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ' + (
                  active ? 'bg-white text-gray-900 font-medium' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t border-gray-700">
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
      <div className="ml-56 flex-1 p-8">{children}</div>
    </div>
  )
}