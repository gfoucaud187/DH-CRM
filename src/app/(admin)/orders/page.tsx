'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ShoppingCart, Plus, Search, RotateCcw, X, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
  approved:             'bg-green-100 text-green-700',
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
  return 'bg-gray-100 text-gray-600'
}

const DOC_FILTER_OPTIONS = [
  { label: 'All',        value: 'all' },
  { label: 'SO',         value: 'so' },
  { label: 'SO(DO)',     value: 'foc' },
  { label: 'SO(SAMPLE)', value: 'so_sample' },
  { label: 'SO(INT)',    value: 'so_int' },
  { label: 'INV',        value: 'invoice' },
  { label: 'INV(DO)',    value: 'inv_foc' },
  { label: 'Proforma',   value: 'proforma' },
]

export default function OrdersPage() {
  const supabase = createClient()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [docFilter, setDocFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [hoveredComment, setHoveredComment] = useState<string | null>(null)

  const { data: allOrders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*')
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  const pendingPOs  = allOrders.filter((o: any) => o.document_type === 'po' && o.status === 'pending_approval')
  const rejectedPOs = allOrders.filter((o: any) => o.document_type === 'po' && o.status === 'rejected')
  const active      = allOrders.filter((o: any) => o.status !== 'cancelled' && o.document_type !== 'po')
  const cancelled   = allOrders.filter((o: any) => o.status === 'cancelled')

  const applyFilters = (list: any[]) => list.filter((o: any) => {
    const matchDoc =
      docFilter === 'all' ? true :
      docFilter === 'foc' ? (o.is_foc && o.document_type !== 'invoice') :
      docFilter === 'inv_foc' ? (o.is_foc && o.document_type === 'invoice') :
      docFilter === 'so' ? (o.document_type === 'so' && !o.is_foc) :
      docFilter === 'invoice' ? (o.document_type === 'invoice' && !o.is_foc) :
      o.document_type === docFilter
    const matchSearch = !search ||
      o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase())
    return matchDoc && matchSearch
  })

  const filtered          = applyFilters(active)
  const filteredCancelled = applyFilters(cancelled)

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Cancel this order?')) return
    await supabase.from('sales_orders').update({ status: 'cancelled' }).eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  const handleRestore = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await supabase.from('sales_orders').update({ status: 'draft' }).eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  const OrderRow = ({ o, cancelled = false }: { o: any; cancelled?: boolean }) => (
    <tr onClick={() => router.push('/orders/' + o.id)}
      className={'cursor-pointer transition-colors ' + (cancelled ? 'opacity-50 bg-gray-50 hover:opacity-70' : 'hover:bg-gray-50')}>
      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{o.order_number ?? 'Draft'}</td>
      <td className="px-4 py-3 font-medium text-gray-900">{o.customer_name}</td>
      <td className="px-4 py-3">
        <span className={'text-xs px-2 py-0.5 rounded font-mono font-medium ' + getDocColor(o)}>{getDocLabel(o)}</span>
      </td>
      <td className="px-4 py-3 text-gray-600">{o.warehouse}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <span className="font-medium text-gray-900">{(o.total_units ?? 0).toLocaleString()} u</span>
          <span className="text-xs text-gray-400">{o.total_packs ?? 0} pk</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right font-medium text-gray-900">
        {o.is_foc || o.is_sample ? <span className="text-green-600 text-xs">FOC</span> : o.currency + ' ' + Number(o.total_amount).toFixed(2)}
      </td>
      <td className="px-4 py-3">
        <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500')}>
          {o.status?.replace(/_/g, ' ')}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        {cancelled ? (
          <button onClick={(e) => handleRestore(e, o.id)} title="Restore"
            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50">
            <RotateCcw className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={(e) => handleCancel(e, o.id)} title="Cancel"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50">
            <X className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  )

  const TableHead = () => (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="text-left px-4 py-3 font-medium text-gray-600">Order #</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">Warehouse</th>
        <th className="text-right px-4 py-3 font-medium text-gray-600">Units</th>
        <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
        <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
        <th className="px-4 py-3" />
      </tr>
    </thead>
  )

  const allPOs = [...pendingPOs, ...rejectedPOs]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} of {active.length} active documents</p>
        </div>
        <Link href="/orders/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" /> New Order
        </Link>
      </div>

      {/* Purchase Orders */}
      {allPOs.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            {pendingPOs.length > 0 && <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            <h2 className="font-semibold text-gray-900">Purchase Orders Received</h2>
            {pendingPOs.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-bold">{pendingPOs.length} pending</span>
            )}
            {rejectedPOs.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs">{rejectedPOs.length} rejected</span>
            )}
          </div>
          <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-orange-50 border-b border-orange-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-orange-800">PO #</th>
                  <th className="text-left px-4 py-3 font-medium text-orange-800">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-orange-800">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-orange-800">Units</th>
                  <th className="text-right px-4 py-3 font-medium text-orange-800">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-orange-800">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-50">
                {allPOs.map((po: any) => (
                  <tr key={po.id} className="hover:bg-orange-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{po.order_number}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{po.customer_name}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(po.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{po.total_units ?? 0} u</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{po.currency} {Number(po.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_COLORS[po.status] ?? 'bg-gray-100 text-gray-500')}>
                          {po.status?.replace(/_/g,' ')}
                        </span>
                        {po.requires_stock_review && po.status === 'pending_approval' && (
                          <span className="flex items-center gap-1 text-amber-600 text-xs">
                            <AlertTriangle className="h-3.5 w-3.5" /> Stock review
                          </span>
                        )}
                        {po.status === 'rejected' && po.rejection_comment && (
                          <div className="relative">
                            <button
                              onMouseEnter={() => setHoveredComment(po.id)}
                              onMouseLeave={() => setHoveredComment(null)}
                              className="text-gray-400 hover:text-gray-600">
                              <Info className="h-4 w-4" />
                            </button>
                            {hoveredComment === po.id && (
                              <div className="absolute left-6 top-0 z-10 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl">
                                <p className="font-semibold mb-1">Rejection reason:</p>
                                <p className="text-gray-300">{po.rejection_comment}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push('/orders/' + po.id)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors">
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search order or customer..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {DOC_FILTER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setDocFilter(opt.value)}
              className={'px-3 py-2 rounded-lg text-xs font-medium transition-colors border ' + (docFilter === opt.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active orders */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <ShoppingCart className="h-8 w-8 mb-2" />
            <p className="text-sm">No orders found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <TableHead />
            <tbody className="divide-y divide-gray-100">
              {filtered.map((o: any) => <OrderRow key={o.id} o={o} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* Cancelled */}
      {cancelled.length > 0 && (
        <div>
          <button onClick={() => setShowCancelled(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-3 transition-colors">
            <X className="h-4 w-4 text-red-400" />
            {showCancelled ? 'Hide' : 'Show'} cancelled orders
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">{filteredCancelled.length}</span>
          </button>
          {showCancelled && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden opacity-80">
              <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                <p className="text-sm font-medium text-red-700">Cancelled orders</p>
              </div>
              <table className="w-full text-sm">
                <TableHead />
                <tbody className="divide-y divide-gray-100">
                  {filteredCancelled.map((o: any) => <OrderRow key={o.id} o={o} cancelled />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}