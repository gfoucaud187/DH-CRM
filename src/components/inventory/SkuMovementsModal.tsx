'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { X, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { warehouseLabel } from '@/lib/warehouse'

interface SkuMovementsModalProps {
  sku: string
  productName: string
  onClose: () => void
}

export default function SkuMovementsModal({ sku, productName, onClose }: SkuMovementsModalProps) {
  const supabase = createClient()
  const router = useRouter()

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['sku-movements', sku],
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('sku', sku)
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  // Fetch orders linked to these movements
  const referenceIds = Array.from(new Set((movements as any[]).map((m: any) => m.reference_id).filter(Boolean)))

  const { data: orders = [] } = useQuery({
    queryKey: ['sku-orders', sku],
    queryFn: async () => {
      if (referenceIds.length === 0) return []
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, document_type, is_foc, is_sample, customer_name, status, warehouse')
        .in('id', referenceIds)
      return data ?? []
    },
    enabled: referenceIds.length > 0
  })

  const orderMap: Record<string, any> = {}
  ;(orders as any[]).forEach((o: any) => { orderMap[o.id] = o })

  const getDocLabel = (o: any) => {
    if (!o) return '—'
    if (o.document_type === 'so_int') return 'SO(INT)'
    if (o.is_foc && o.document_type === 'invoice') return 'INV(DO)'
    if (o.is_foc) return 'SO(DO)'
    if (o.is_sample) return 'SO(SAMPLE)'
    if (o.document_type === 'so') return 'SO'
    if (o.document_type === 'invoice') return 'INV'
    if (o.document_type === 'proforma') return 'PF'
    return o.document_type?.toUpperCase()
  }

  const getDocColor = (o: any) => {
    if (!o) return 'bg-gray-100 text-gray-500'
    if (o.document_type === 'so_int') return 'bg-teal-100 text-teal-700'
    if (o.is_foc) return 'bg-green-100 text-green-700'
    if (o.document_type === 'invoice') return 'bg-purple-100 text-purple-700'
    if (o.is_sample) return 'bg-amber-100 text-amber-700'
    return 'bg-blue-100 text-blue-700'
  }

  // Running balance per warehouse
  const runningBalance: Record<string, number> = {}

  const enrichedMovements = [...(movements as any[])].reverse().map((m: any) => {
    if (!runningBalance[m.warehouse]) runningBalance[m.warehouse] = 0
    if (m.movement_type === 'in')  runningBalance[m.warehouse] += m.quantity_packs
    if (m.movement_type === 'out') runningBalance[m.warehouse] -= m.quantity_packs
    return { ...m, balance: runningBalance[m.warehouse] }
  }).reverse()

  const totalIn  = (movements as any[]).filter((m: any) => m.movement_type === 'in').reduce((s: number, m: any) => s + m.quantity_packs, 0)
  const totalOut = (movements as any[]).filter((m: any) => m.movement_type === 'out').reduce((s: number, m: any) => s + m.quantity_packs, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900">{sku}</h2>
            <p className="text-sm text-gray-500">{productName}</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total In</p>
              <p className="text-lg font-bold text-green-600">+{totalIn}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total Out</p>
              <p className="text-lg font-bold text-red-500">-{totalOut}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Balance</p>
              <p className={`text-lg font-bold ${totalIn - totalOut >= 0 ? 'text-gray-900' : 'text-red-500'}`}>{totalIn - totalOut}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Movements */}
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
          ) : enrichedMovements.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No movements found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Warehouse</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Packs</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Units</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Order</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enrichedMovements.map((m: any) => {
                  const order = orderMap[m.reference_id]
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(m.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3">
                        {m.movement_type === 'in'
                          ? <span className="flex items-center gap-1 text-green-600 text-xs font-semibold"><ArrowUp className="h-3 w-3" /> IN</span>
                          : <span className="flex items-center gap-1 text-red-500 text-xs font-semibold"><ArrowDown className="h-3 w-3" /> OUT</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{warehouseLabel(m.warehouse)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {m.movement_type === 'in' ? '+' : '-'}{m.quantity_packs}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">{m.quantity_units}</td>
                      <td className="px-4 py-3">
                        {order ? (
                          <button
                            onClick={() => { onClose(); router.push('/orders/' + order.id) }}
                            className="flex items-center gap-1.5 hover:underline"
                          >
                            <span className={'text-xs px-1.5 py-0.5 rounded font-medium ' + getDocColor(order)}>
                              {getDocLabel(order)}
                            </span>
                            <span className="font-mono text-xs text-gray-600">{order.order_number}</span>
                            <ExternalLink className="h-3 w-3 text-gray-300" />
                          </button>
                        ) : (
                          <span className="font-mono text-xs text-gray-400">{m.reference_number ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {order?.document_type === 'so_int' ? (
                          <span className="text-teal-600 text-xs">{order.warehouse} → {order.warehouse_destination ?? '?'}</span>
                        ) : (
                          order?.customer_name ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono text-xs font-semibold ${m.balance < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                          {m.balance}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}