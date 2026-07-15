'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, UploadCloud, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { warehouseLabel } from '@/lib/warehouse'
import { logActivity } from '@/lib/log-activity'
import StocktakePDF from '@/components/pdf/StocktakePDF'

export default function StocktakeDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [pushing, setPushing] = useState(false)

  const { data: event, isLoading } = useQuery({
    queryKey: ['stocktake-event', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_events')
        .select('*, lines:inventory_event_lines(*)')
        .eq('id', id)
        .single()
      return data
    }
  })

  const handlePushToStock = async () => {
    if (!event) return
    if (!confirm('Push these counted quantities as the new system stock? This cannot be undone from here.')) return
    setPushing(true)
    try {
      const { error } = await supabase.from('inventory_events').update({ status: 'applied' }).eq('id', event.id)
      if (error) { alert('Error: ' + error.message); setPushing(false); return }
      await logActivity({
        action: 'update_stocktake', entityType: 'inventory_event', entityId: event.id, entityRef: event.event_number,
        metadata: { pushed_to_stock: true },
      })
      queryClient.invalidateQueries({ queryKey: ['stocktake-event', id] })
      queryClient.invalidateQueries({ queryKey: ['stocktake-events-list'] })
    } finally {
      setPushing(false)
    }
  }

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!event) return <div className="text-center py-12 text-gray-400">Stocktake not found</div>

  const lines = event.lines ?? []
  const totalSurplus = lines.filter((l: any) => l.delta_packs > 0).reduce((s: number, l: any) => s + l.delta_packs, 0)
  const totalShortage = lines.filter((l: any) => l.delta_packs < 0).reduce((s: number, l: any) => s + Math.abs(l.delta_packs), 0)
  const warehousesTouched = Array.from(new Set(lines.map((l: any) => l.warehouse))) as string[]

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/stocktake" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{event.event_number}</h1>
            <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-700 uppercase">Stocktake</span>
            {event.status === 'applied' ? (
              <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 uppercase">
                <CheckCircle2 className="h-3 w-3" /> Applied
              </span>
            ) : (
              <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500 uppercase">Draft</span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-0.5">
            {warehousesTouched.length > 0 ? warehousesTouched.map(w => warehouseLabel(w)).join(', ') : warehouseLabel(event.warehouse)}
            {' · '}{new Date(event.event_date).toLocaleDateString('en-GB')}
          </p>
        </div>
        {event.status !== 'applied' && (
          <button onClick={handlePushToStock} disabled={pushing}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            <UploadCloud className="h-4 w-4" />{pushing ? 'Pushing...' : 'Push to Stock'}
          </button>
        )}
      </div>

      {event.status !== 'applied' && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-4 text-sm text-amber-800">
          This report has not been pushed to stock yet — system quantities are unchanged. Click "Push to Stock" once the counts are validated.
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-600">+{totalSurplus}</p>
              <p className="text-xs text-gray-400 mt-1">Surplus (boxes)</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-red-500">-{totalShortage}</p>
              <p className="text-xs text-gray-400 mt-1">Shortage (boxes)</p>
            </div>
          </div>

          {event.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-2 text-sm">Notes</h2>
              <p className="text-sm text-gray-600">{event.notes}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Document</h2>
            <StocktakePDF event={event} lines={lines} />
          </div>
        </div>

        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Product</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Warehouse</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">System</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Counted</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Delta</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{l.product_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{l.sku}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-600">{warehouseLabel(l.warehouse)}</td>
                    <td className="px-3 py-3 text-right text-gray-500">{l.system_quantity_packs}</td>
                    <td className="px-3 py-3 text-right text-gray-700 font-medium">{l.counted_quantity_packs}</td>
                    <td className={'px-3 py-3 text-right font-semibold ' + (l.delta_packs >= 0 ? 'text-green-600' : 'text-red-500')}>
                      {l.delta_packs > 0 ? '+' : ''}{l.delta_packs}
                    </td>
                    <td className="px-3 py-3 text-gray-600">{l.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
