'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Users, Handshake, DollarSign,
  ShoppingCart, Warehouse, BarChart3, FolderOpen, Settings,
  ListChecks, LogOut, ExternalLink, Target
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

const nav = [
  { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard },
  { label: 'Products',     href: '/products',     icon: Package },
  { label: 'Distributors', href: '/customers',    icon: Users },
  { label: 'Partners',     href: '/partners',     icon: Handshake },
  { label: 'Price Lists',  href: '/price-lists',  icon: DollarSign },
  { label: 'Orders',       href: '/orders',       icon: ShoppingCart, badge: true },
  { label: 'Inventory',    href: '/inventory',    icon: Warehouse },
  { label: 'Finance',      href: '/finance',      icon: DollarSign },
  { label: 'Documents',    href: '/documents',    icon: FolderOpen },
  { label: 'Reports',      href: '/reports',      icon: BarChart3 },
  { label: 'Targets',      href: '/targets',      icon: Target },
  { label: 'Tracking Log', href: '/tracking',     icon: ListChecks },
  { label: 'Settings',     href: '/settings',     icon: Settings },
  { label: 'Client Portal', href: '/portal-login', icon: ExternalLink },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const { data: pendingPOCount = 0 } = useQuery({
    queryKey: ['pending-po-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('sales_orders')
        .select('*', { count: 'exact', head: true })
        .eq('document_type', 'po')
        .eq('status', 'pending_approval')
      return count ?? 0
    },
    refetchInterval: 30000,
  })

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="px-5 py-5 border-b border-gray-700">
        <h1 className="font-bold text-lg tracking-tight">DH Signature</h1>
        <p className="text-gray-400 text-xs mt-0.5">Trade Cockpit</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ label, href, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-white text-gray-900 font-medium' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}>
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {badge && pendingPOCount > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold">
                  {pendingPOCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 py-4 border-t border-gray-700">
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors w-full">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
