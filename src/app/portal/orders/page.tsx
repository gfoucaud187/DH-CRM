import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShoppingCart, Plus } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  draft:               'bg-gray-100 text-gray-500',
  pending_approval:    'bg-orange-100 text-orange-700',
  rejected:            'bg-red-100 text-red-600',
  submitted_to_client: 'bg-blue-100 text-blue-700',
  in_preparation:      'bg-amber-100 text-amber-700',
  ready_for_shipment:  'bg-purple-100 text-purple-700',
  shipped:             'bg-green-100 text-green-700',
  completed:           'bg-green-200 text-green-800',
  sent_to_customer:    'bg-blue-100 text-blue-700',
}

export default async function PortalOrdersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/portal/login')

  const { data: profile } = await supabase
    .from('user_profiles').select('customer_id').eq('id', user.id).single()

  const { data: orders = [] } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('customer_id', profile?.customer_id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
          <p className="text-gray-500 text-sm mt-0.5">{orders.length} documents</p>
        </div>
        <Link href="/portal/orders/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" /> New Order
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <ShoppingCart className="h-8 w-8 mb-2" />
            <p className="text-sm">No orders yet</p>
            <Link href="/portal/orders/new" className="mt-2 text-sm text-gray-900 underline">Place your first order</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Order #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Units</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o: any) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={'/portal/orders/' + o.id}
                      className="font-mono text-xs font-semibold text-blue-600 hover:underline">
                      {o.order_number ?? 'PO pending'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.total_units ?? 0} u</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {o.is_foc ? <span className="text-green-600 text-xs">FOC</span> : `${o.currency} ${Number(o.total_amount).toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500')}>
                      {o.status?.replace(/_/g,' ')}
                    </span>
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