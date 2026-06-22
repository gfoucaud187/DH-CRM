'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import InvoicePDF from '@/components/pdf/InvoicePDF'

export default function PortalInvoiceDetailPage() {
  const { id } = useParams()
  const supabase = createClient()

  const { data: order, isLoading } = useQuery({
    queryKey: ['portal-invoice', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*), customer:customers(legal_name, contacts, addresses, vat_number, track_trace_enabled)')
        .eq('id', id)
        .single()
      return data
    }
  })

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', 'main')
        .single()
      return data
    }
  })

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!order) return <div className="text-center py-12 text-gray-400">Invoice not found</div>

  const lines = (order.lines ?? []).filter((l: any) => l.line_type === 'commercial' || l.line_type === 'foc')

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/portal/invoices" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{order.order_number}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {order.currency} {Number(order.total_amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ·{' '}
            {new Date(order.order_date ?? order.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <InvoicePDF
          order={order}
          lines={lines}
          customer={order.customer}
          appSettings={appSettings}
        />
      </div>

      {/* Lines summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Order lines</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-2 font-medium text-gray-600">Product</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Packs</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Units</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Price/Unit</th>
              <th className="text-right px-5 py-2 font-medium text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lines.map((line: any) => (
              <tr key={line.id}>
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900">{line.product_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                </td>
                <td className="px-3 py-3 text-center text-gray-600">{line.quantity_packs}</td>
                <td className="px-3 py-3 text-center text-gray-600">{line.quantity_units}</td>
                <td className="px-3 py-3 text-right text-gray-600">{Number(line.price_per_unit).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                <td className="px-5 py-3 text-right font-semibold text-gray-900">{Number(line.line_total).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td colSpan={4} className="px-5 py-3 text-right font-semibold text-gray-900">Total</td>
              <td className="px-5 py-3 text-right font-bold text-gray-900">
                {order.currency} {Number(order.total_amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}