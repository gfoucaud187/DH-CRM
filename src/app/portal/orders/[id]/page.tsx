'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Edit, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

const STATUS_COLORS: Record<string, string> = {
  draft:            'bg-gray-100 text-gray-500',
  pending_approval: 'bg-orange-100 text-orange-700',
  approved:         'bg-green-100 text-green-700',
  rejected:         'bg-red-100 text-red-600',
  shipped:          'bg-indigo-100 text-indigo-700',
  completed:        'bg-green-200 text-green-800',
  cancelled:        'bg-red-100 text-red-600',
}

const STATUS_LABELS: Record<string, string> = {
  draft:            'Draft',
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  rejected:         'Rejected',
  shipped:          'Shipped',
  completed:        'Completed',
  cancelled:        'Cancelled',
}

export default function PortalOrderDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const supabase = createClient()
  const router = useRouter()

  const { data: order, isLoading } = useQuery({
    queryKey: ['portal-order-detail', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*)')
        .eq('id', id)
        .single()
      return data
    },
    enabled: !!id
  })

  const { data: customer } = useQuery({
    queryKey: ['portal-order-customer', order?.customer_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('legal_name, currency, incoterms, payment_terms, assigned_price_list')
        .eq('id', order!.customer_id)
        .single()
      return data
    },
    enabled: !!order?.customer_id
  })

  const handleExport = async () => {
    if (!order) return
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // Header info
    const headerRows = [
      ['Purchase Order', order.order_number ?? ''],
      ['Date', order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB') : new Date(order.created_at).toLocaleDateString('en-GB')],
      ['Customer', customer?.legal_name ?? order.customer_name],
      ['Status', STATUS_LABELS[order.status] ?? order.status],
      ['Currency', customer?.currency ?? order.currency],
      ['Incoterms', customer?.incoterms ?? ''],
      ['Payment Terms', customer?.payment_terms ?? ''],
      ['Price List', customer?.assigned_price_list ?? ''],
      ['Notes', order.notes ?? ''],
      [],
      ['SKU', 'Product', 'Brand', 'Units/Pack', 'Packs', 'Units', 'Price/Unit', 'Total'],
    ]

    const lineRows = (order.lines ?? []).map((l: any) => [
      l.sku,
      l.product_name,
      l.brand,
      l.units_per_pack,
      l.quantity_packs,
      l.quantity_units,
      l.price_per_unit,
      l.line_total,
    ])

    const totalRow = ['', '', '', '', '', '', 'TOTAL', order.total_amount]

    const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...lineRows, [], totalRow])

    // Column widths
    ws['!cols'] = [
      { wch: 20 }, { wch: 35 }, { wch: 15 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Purchase Order')
    XLSX.writeFile(wb, `${order.order_number ?? 'PO'}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!order) return <div className="flex items-center justify-center h-48 text-gray-400">Order not found</div>

  const lines = order.lines ?? []
  const canEdit = order.status === 'draft' || order.status === 'rejected'
  const total = lines.reduce((s: number, l: any) => s + (l.line_total ?? 0), 0)
  const totalUnits = lines.reduce((s: number, l: any) => s + (l.quantity_units ?? 0), 0)
  const totalPacks = lines.reduce((s: number, l: any) => s + (l.quantity_packs ?? 0), 0)

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/portal/orders" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{order.order_number ?? 'Draft'}</h1>
            <span className={'inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ' + (STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-500')}>
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">
            {customer?.legal_name ?? order.customer_name} · {order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB') : new Date(order.created_at).toLocaleDateString('en-GB')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> Export Excel
          </button>
          {canEdit && (
            <Link href={`/portal/orders/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
              <Edit className="h-4 w-4" />
              {order.status === 'rejected' ? 'Edit & Resubmit' : 'Continue Editing'}
            </Link>
          )}
        </div>
      </div>

      {/* Rejection notice */}
      {order.status === 'rejected' && order.rejection_comment && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-800 mb-1">Order rejected — reason from DH Signature:</p>
          <p className="text-sm text-red-700">{order.rejection_comment}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Order info */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Order Details</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              { label: 'Currency',      value: customer?.currency ?? order.currency },
              { label: 'Incoterms',     value: customer?.incoterms ?? '—' },
              { label: 'Payment Terms', value: customer?.payment_terms ?? '—' },
              { label: 'Price List',    value: customer?.assigned_price_list ?? '—' },
              { label: 'Warehouse',     value: order.warehouse ?? '—' },
              { label: 'Order Date',    value: order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB') : '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="font-medium text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
            {order.notes && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Notes</p>
                <p className="font-medium text-gray-900 mt-0.5">{order.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-xl p-4 text-white">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total</p>
            <p className="text-2xl font-bold">{order.currency} {Number(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Packs</span>
              <span className="font-semibold text-gray-900">{totalPacks.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Units</span>
              <span className="font-semibold text-gray-900">{totalUnits.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Order Lines</h2>
          <span className="text-xs text-gray-400 ml-1">{lines.length} products</span>
        </div>
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">No lines</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Product</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Packs</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Units</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Price/Unit</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{l.product_name}</p>
                    <p className="text-xs text-gray-400">{l.brand}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.sku}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{l.quantity_packs}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{l.quantity_units}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {Number(l.price_per_unit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">
                    {Number(l.line_total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={5} className="px-5 py-3 text-right font-semibold text-gray-900">Total</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900 text-base">
                  {order.currency} {Number(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}