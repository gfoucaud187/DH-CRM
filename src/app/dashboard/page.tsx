'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ShoppingCart, Users, Package, Warehouse, TrendingUp, Clock } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const supabase = createClient()

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [orders, customers, products, inventory] = await Promise.all([
        supabase.from('sales_orders').select('id, total_amount, status, currency, created_at').eq('is_foc', false),
        supabase.from('customers').select('id, status'),
        supabase.from('products').select('id, status').eq('product_role', 'original'),
        supabase.from('v_inventory_by_warehouse').select('packs_total, units_total'),
      ])
      const allOrders = orders.data ?? []
      const activeOrders = allOrders.filter(o => !['completed','cancelled','deleted'].includes(o.status))
      const totalRevenue = allOrders.filter(o => o.status === 'completed').reduce((s, o) => s + (o.total_amount ?? 0), 0)
      const totalPacks = (inventory.data ?? []).reduce((s, r) => s + (r.packs_total ?? 0), 0)
      const totalUnits = (inventory.data ?? []).reduce((s, r) => s + (r.units_total ?? 0), 0)
      return {
        totalOrders: allOrders.length,
        activeOrders: activeOrders.length,
        totalCustomers: (customers.data ?? []).length,
        activeCustomers: (customers.data ?? []).filter(c => c.status === 'active').length,
        totalProducts: (products.data ?? []).length,
        totalPacks,
        totalUnits,
        totalRevenue,
        recentOrders: allOrders.slice(0, 5),
      }
    }
  })

  const statCards = [
    { label: 'Active Orders', value: stats?.activeOrders ?? 0, sub: `${stats?.totalOrders ?? 0} total`, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50', href: '/orders' },
    { label: 'Customers', value: stats?.activeCustomers ?? 0, sub: 'active', icon: Users, color: 'text-green-600', bg: 'bg-green-50', href: '/customers' },
    { label: 'Products', value: stats?.totalProducts ?? 0, sub: 'in catalogue', icon: Package, color: 'text-purple-600', bg: 'bg-purple-50', href: '/products' },
    { label: 'Total Stock', value: stats?.totalPacks ?? 0, sub: `${stats?.totalUnits ?? 0} units`, icon: Warehouse, color: 'text-amber-600', bg: 'bg-amber-50', href: '/inventory' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Welcome to DH Signature Trade Cockpit</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map(card => (
          <Link key={card.label} href={card.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">{card.label}</span>
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{card.value.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Orders</h2>
            <Link href="/orders" className="text-sm text-gray-500 hover:text-gray-900">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(stats?.recentOrders ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <ShoppingCart className="h-8 w-8 mb-2" />
                <p className="text-sm">No orders yet</p>
                <Link href="/orders/new" className="mt-2 text-sm text-gray-900 underline">Create first order</Link>
              </div>
            ) : (stats?.recentOrders ?? []).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium text-sm text-gray-900">{o.order_number ?? 'Draft'}</p>
                  <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-sm">{o.currency} {Number(o.total_amount).toFixed(2)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    o.status === 'completed' ? 'bg-green-100 text-green-700' :
                    o.status === 'draft' ? 'bg-gray-100 text-gray-500' :
                    'bg-amber-100 text-amber-700'
                  }`}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: 'New Order', href: '/orders/new', icon: ShoppingCart },
              { label: 'View Inventory', href: '/inventory', icon: Warehouse },
              { label: 'Price Lists', href: '/price-lists', icon: TrendingUp },
              { label: 'Tracking Log', href: '/tracking', icon: Clock },
            ].map(action => (
              <Link key={action.label} href={action.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <action.icon className="h-4 w-4 text-gray-400" />
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}