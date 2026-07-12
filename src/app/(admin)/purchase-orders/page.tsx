'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Package, Wrench, Box, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n/LanguageProvider'

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  confirmed: 'bg-yellow-100 text-yellow-700',
  received:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

const TYPE_ICONS: Record<string, any> = {
  cigars:   Package,
  services: Wrench,
  goods:    Box,
}

const TYPE_LABELS: Record<string, string> = {
  cigars:   'Cigars',
  services: 'Services',
  goods:    'Goods',
}

export default function PurchaseOrdersPage() {
  const t = useT()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const { data: pos, isLoading } = useQuery({
    queryKey: ['purchase_orders'],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  const handleDelete = async (id: string, poNumber: string) => {
    if (!confirm(`Delete ${poNumber}?`)) return
    await supabase.from('purchase_orders').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('purchase_orders.page_title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pos?.length ?? 0} orders</p>
        </div>
        <Link href="/purchase-orders/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" /> {t('purchase_orders.new_po')}
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">{t('common.loading')}</div>
      ) : pos?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">{t('purchase_orders.no_purchase_orders')}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t('purchase_orders.col_po_number')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t('purchase_orders.col_partner')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t('purchase_orders.col_delivery')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t('purchase_orders.col_total')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pos?.map((po: any) => {
                const Icon = TYPE_ICONS[po.po_type] ?? Package
                return (
                  <tr key={po.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/purchase-orders/${po.id}`}
                        className="font-mono font-medium text-gray-900 hover:text-blue-600 transition-colors">
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Icon className="h-3.5 w-3.5" />
                        {TYPE_LABELS[po.po_type]}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{po.partner_name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(po.order_date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {po.delivery_tba ? (
                        <span className="text-gray-400 italic">TBA</span>
                      ) : po.expected_delivery ? (
                        new Date(po.expected_delivery).toLocaleDateString('en-GB')
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {po.total_amount > 0
                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: po.currency ?? 'USD' }).format(po.total_amount)
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[po.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t('purchase_orders.status_' + po.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(po.id, po.po_number)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}