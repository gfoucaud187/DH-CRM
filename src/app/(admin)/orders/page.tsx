'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ShoppingCart, Plus, Search } from 'lucide-react'
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
}

const getDocLabel = (o: any) => {
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
  if (o.is_foc) return 'bg-green-100 text-green-700'
  if (o.document_type === 'invoice') return 'bg-purple-100 text-purple-700'
  if (o.document_type === 'so') return 'bg-blue-100 text-blue-700'
  if (o.document_type === 'proforma') return 'bg-gray-100 text-gray-600'
  if (o.document_type === 'so_sample') return 'bg-amber-100 text-amber-700'
  if (o.document_type === 'so_int') return 'bg-teal-100 text-teal-700'
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
  const [docFilter, setDocFilter] = useState('all')
  const [search, setSearch] = useState('')

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*')
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  const filtered = orders.filter((o: any) => {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} of {orders.length} documents</p>
        </div>
        <Link href="/orders/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" />
          New Order
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search order or customer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {DOC_FILTER_OPTIONS.map(opt => (
            <button key={opt.value}
              onClick={() => setDocFilter(opt.value)}
              className={'px-3 py-2 rounded-lg text-xs font-medium transition-colors border ' + (docFilter === opt.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <ShoppingCart className="h-8 w-8 mb-2" />
            <p className="text-sm">No orders found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((o: any) => (
                <tr key={o.id}
                  onClick={() => router.push('/orders/' + o.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">
                    {o.order_number ?? 'Draft'}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{o.customer_name}</td>
                  <td className="px-4 py-3">
                    <span className={'text-xs px-2 py-0.5 rounded font-mono font-medium ' + getDocColor(o)}>
                      {getDocLabel(o)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.warehouse}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-medium text-gray-900">{(o.total_units ?? 0).toLocaleString()} u</span>
                      <span className="text-xs text-gray-400">{o.total_packs ?? 0} pk</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {o.is_foc || o.is_sample
                      ? <span className="text-green-600 text-xs font-medium">FOC</span>
                      : o.currency + ' ' + Number(o.total_amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500')}>
                      {o.status?.replace(/_/g, ' ')}
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