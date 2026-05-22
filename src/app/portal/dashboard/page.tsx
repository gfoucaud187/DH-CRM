import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShoppingCart, Package, Clock, CheckCircle } from 'lucide-react'

export default async function PortalDashboardPage() {
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
    .limit(20)

  const active   = orders.filter((o: any) => !['completed','cancelled'].includes(o.status))
  const invoices = orders.filter((o: any) => o.document_type === 'invoice' && !o.is_foc)
  const totalRevenue = invoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const pendingPayment = invoices.filter((o: any) => ['draft','sent_to_customer'].includes(o.status))
    .reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)

  const STATUS_COLORS: Record<string, string> = {
    draft:                'bg-gray-100 text-gray-500',
    submitted_to_client:  'bg-blue-100 text-blue-700',
    in_preparation:       'bg-amber-100 text-amber-700',
    ready_for_shipment:   'bg-purple-100 text-purple-700',
    shipped:              'bg-green-100 text-green-700',
    completed:            'bg-green-200 text-green-800',
    sent_to_customer:     'bg-blue-100 text-blue-700',
    pending_approval:     'bg-orange-100 text-orange-700',
    rejected:             'bg-red-100 text-red-600',
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="text-gray-500 text-sm mt-0.5">Here's an overview of your account</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { icon: ShoppingCart, label: 'Active orders', value: active.length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { icon: Package,      label: 'Total orders',  value: orders.length, color: 'text-green-600', bg: 'bg-green-50' },
          { icon: Clock,        label: 'Pending payment', value: `$${(pendingPayment/1000).toFixed(1)}K`, color: 'text-amber-600', bg: 'bg-amber-50' },
          { icon: CheckCircle,  label: 'Total revenue', value: `$${(totalRevenue/1000).toFixed(1)}K`, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{label}</span>
              <div className={'p-2 rounded-lg ' + bg}><Icon className={'h-4 w-4 ' + color} /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Quick action */}
      <div className="mb-6">
        <Link href="/portal/orders/new"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors">
          <Package className="h-4 w-4" />
          Place a New Order
        </Link>
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Orders</h2>
          <Link href="/portal/orders" className="text-sm text-blue-600 hover:underline">View all</Link>
        </div>
        {orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ShoppingCart className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">No orders yet</p>
            <Link href="/portal/orders/new" className="text-sm text-gray-900 underline mt-2 block">Place your first order</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Order #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Units</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.slice(0,8).map((o: any) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={'/portal/orders/' + o.id} className="font-mono text-xs font-semibold text-blue-600 hover:underline">
                      {o.order_number ?? 'Pending'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-gray-100 text-gray-600">
                      {o.document_type === 'po' ? 'PO' : o.document_type?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{o.total_units ?? 0}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {o.is_foc ? <span className="text-green-600 text-xs">FOC</span> : `${o.currency} ${Number(o.total_amount).toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500')}>
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