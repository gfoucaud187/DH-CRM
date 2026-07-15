'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { TrendingUp, Package, ShoppingCart, AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { warehouseLabel } from '@/lib/warehouse'

const STATUS_COLORS: Record<string, string> = {
  draft:                'bg-gray-100 text-gray-500',
  submitted_to_client:  'bg-blue-100 text-blue-700',
  in_preparation:       'bg-amber-100 text-amber-700',
  ready_for_shipment:   'bg-purple-100 text-purple-700',
  shipped:              'bg-green-100 text-green-700',
  completed:            'bg-green-200 text-green-800',
  cancelled:            'bg-red-100 text-red-600',
  sent_to_customer:     'bg-blue-100 text-blue-700',
  pending_approval:     'bg-orange-100 text-orange-700',
  rejected:             'bg-red-100 text-red-600',
  stock_transferred:    'bg-teal-100 text-teal-700',
}

const getDocLabel = (o: any) => {
  if (o.document_type === 'po') return 'PO'
  if (o.is_foc && o.document_type === 'invoice') return 'INV(DO)'
  if (o.is_foc) return 'SO(DO)'
  if (o.document_type === 'so') return 'SO'
  if (o.document_type === 'invoice') return 'INV'
  if (o.document_type === 'proforma') return 'PF'
  if (o.document_type === 'so_sample') return 'SO(SAMPLE)'
  if (o.document_type === 'so_int') return 'SO(INT)'
  return o.document_type?.toUpperCase()
}

const getDocColor = (o: any) => {
  if (o.document_type === 'po') return 'bg-orange-100 text-orange-700'
  if (o.is_foc) return 'bg-green-100 text-green-700'
  if (o.document_type === 'invoice') return 'bg-purple-100 text-purple-700'
  if (o.document_type === 'so') return 'bg-blue-100 text-blue-700'
  if (o.document_type === 'proforma') return 'bg-gray-100 text-gray-600'
  if (o.document_type === 'so_sample') return 'bg-amber-100 text-amber-700'
  if (o.document_type === 'so_int') return 'bg-teal-100 text-teal-700'
  return 'bg-gray-100 text-gray-600'
}

const fmt = (n: number) => `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()

  const { data: orders = [] } = useQuery({
    queryKey: ['dashboard-orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*')
        .order('order_date', { ascending: false })
      return data ?? []
    }
  })

  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const activeOrders   = orders.filter((o: any) => !['completed','cancelled'].includes(o.status) && o.document_type !== 'po')
  const pendingPOs     = orders.filter((o: any) => o.document_type === 'po' && o.status === 'pending_approval')
  const allInvoices    = orders.filter((o: any) => o.document_type === 'invoice' && !o.is_foc)

  const invoicesYTD    = allInvoices.filter((o: any) => {
    const d = new Date(o.order_date ?? o.created_at)
    return d >= startOfYear && d <= now
  })

  const revenueYTD     = invoicesYTD.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const pendingPayment = allInvoices
    .filter((o: any) => ['draft','sent_to_customer'].includes(o.status))
    .reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const readyToShip    = orders.filter((o: any) => o.status === 'ready_for_shipment').length

  const recent = orders
    .filter((o: any) => o.document_type !== 'po')
    .slice(0, 8)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Welcome back — here&apos;s what&apos;s happening</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {[
          { icon: TrendingUp,   label: 'Revenue YTD',     value: fmt(revenueYTD),    sub: `${invoicesYTD.length} invoices this year`,  color: 'text-blue-600',   bg: 'bg-blue-50' },
          { icon: ShoppingCart, label: 'Active orders',   value: activeOrders.length, sub: `${readyToShip} ready to ship`,              color: 'text-purple-600', bg: 'bg-purple-50' },
          { icon: AlertCircle,  label: 'Pending payment', value: fmt(pendingPayment), sub: 'outstanding invoices',                       color: 'text-amber-600',  bg: 'bg-amber-50' },
          { icon: Package,      label: 'POs awaiting',    value: pendingPOs.length,   sub: 'purchase orders to review',                  color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(({ icon: Icon, label, value, sub, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="text-xs md:text-sm text-gray-500">{label}</span>
              <div className={'p-1.5 rounded-lg ' + bg}><Icon className={'h-4 w-4 ' + color} /></div>
            </div>
            <p className="text-xl md:text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Orders</h2>
          <Link href="/orders" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {recent.map((o: any) => (
            <div key={o.id} onClick={() => router.push('/orders/' + o.id)}
              className="px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-semibold text-gray-900">{o.order_number ?? 'Draft'}</span>
                <span className={'text-xs px-2 py-0.5 rounded font-mono font-medium ' + getDocColor(o)}>{getDocLabel(o)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{o.customer_name}</span>
                <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500')}>
                  {o.status?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-400">{new Date(o.order_date ?? o.created_at).toLocaleDateString()}</span>
                <span className="text-xs font-medium text-gray-700">
                  {o.is_foc || o.is_sample
                    ? <span className="text-green-600">FOC</span>
                    : o.document_type === 'so_int'
                    ? <span className="text-teal-600">INT</span>
                    : `${o.currency} ${Number(o.total_amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Order #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Warehouse</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Units</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recent.map((o: any) => (
                <tr key={o.id} onClick={() => router.push('/orders/' + o.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-900">{o.order_number ?? 'Draft'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{o.customer_name}</td>
                  <td className="px-4 py-3">
                    <span className={'text-xs px-2 py-0.5 rounded font-mono font-medium ' + getDocColor(o)}>{getDocLabel(o)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{warehouseLabel(o.warehouse) || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-medium text-gray-900">{(o.total_units ?? 0).toLocaleString()} u</span>
                      <span className="text-xs text-gray-400">{o.total_packs ?? 0} pk</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {o.is_foc || o.is_sample
                      ? <span className="text-green-600 text-xs">FOC</span>
                      : o.document_type === 'so_int'
                      ? <span className="text-teal-600 text-xs">INT</span>
                      : `${o.currency} ${Number(o.total_amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500')}>
                      {o.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(o.order_date ?? o.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
