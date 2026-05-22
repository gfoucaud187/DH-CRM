import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ShoppingCart, Package, User, LogOut, LayoutDashboard } from 'lucide-react'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('role, customer_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'client') redirect('/login')

  const { data: customer } = await supabase
    .from('customers').select('legal_name, assigned_price_list').eq('id', profile.customer_id).single()

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-56 bg-gray-900 text-white flex flex-col fixed h-full">
        <div className="p-5 border-b border-gray-700">
          <div className="text-xl font-bold tracking-tight">dh. <span className="text-gray-400 text-sm font-normal">SIGNATURE</span></div>
          <div className="text-xs text-gray-500 mt-0.5">Client Portal</div>
        </div>
        <div className="p-4 border-b border-gray-700">
          <p className="text-xs text-gray-400">Logged in as</p>
          <p className="text-sm font-medium text-white truncate mt-0.5">{customer?.legal_name ?? 'Client'}</p>
          <span className="text-xs text-gray-500 font-mono">{customer?.assigned_price_list} price list</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[
            { label: 'Dashboard',   href: '/portal/dashboard', icon: LayoutDashboard },
            { label: 'My Orders',   href: '/portal/orders',    icon: ShoppingCart },
            { label: 'New Order',   href: '/portal/orders/new',icon: Package },
            { label: 'My Profile',  href: '/portal/profile',   icon: User },
          ].map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-700">
          <form action="/api/portal/logout" method="POST">
            <button type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </div>
      {/* Main */}
      <div className="ml-56 flex-1 p-8">{children}</div>
    </div>
  )
}