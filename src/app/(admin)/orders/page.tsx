'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ShoppingCart, Plus } from 'lucide-react'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  draft:                'bg-gray-100 text-gray-500',
  submitted_to_client:  'bg-blue-100 text-blue-700',
  in_preparation:       'bg-amber-100 text-amber-700',
  ready_for_shipment:   'bg-purple-100 text-purple-700',
  shipped:              'bg-green-100 text-green-700',
  completed:            'bg-green-200 text-green-800',
  cancelled:            'bg-red-100 text-red-600',
}

export default function OrdersPage() {
  const supabase = createClient()

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*')
        .eq('is_foc', false)
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 text-sm mt-0.5">{orders.length} orders</p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Order
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <ShoppingCart className="h-8 w-8 mb-2" />
            <p className="text-sm">No orders yet</p>
            <Link href="/orders/new" className="mt-2 text-sm text-gray-900 underline">Create your first order</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Order #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Warehouse</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o: any) => (
                <tr key={o.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{o.order_number}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{o.customer_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono uppercase">{o.document_type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.warehouse}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {o.currency} {Number(o.total_amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}