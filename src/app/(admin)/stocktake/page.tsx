'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ClipboardList } from 'lucide-react'
import { warehouseLabel } from '@/lib/warehouse'

export default function StocktakeListPage() {
  const supabase = createClient()
  const router = useRouter()

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['stocktake-events-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_events')
        .select('*, lines:inventory_event_lines(delta_packs, warehouse)')
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stocktake</h1>
          <p className="text-sm text-gray-500 mt-0.5">{events.length} sessions</p>
        </div>
        <Link href="/stocktake/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" /> New Stocktake
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ClipboardList className="h-8 w-8 mb-2" />
          <p className="text-sm">No stocktake sessions yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Session</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Warehouse</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Date</th>
                <th className="text-center px-3 py-3 font-medium text-gray-600">Lines</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Surplus</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Shortage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(events as any[]).map((ev: any) => {
                const lines = ev.lines ?? []
                const surplus = lines.filter((l: any) => l.delta_packs > 0).reduce((s: number, l: any) => s + l.delta_packs, 0)
                const shortage = lines.filter((l: any) => l.delta_packs < 0).reduce((s: number, l: any) => s + Math.abs(l.delta_packs), 0)
                const warehousesTouched = Array.from(new Set(lines.map((l: any) => l.warehouse).filter(Boolean)))
                return (
                  <tr key={ev.id} onClick={() => router.push('/stocktake/' + ev.id)}
                    className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{ev.event_number}</td>
                    <td className="px-3 py-3 text-gray-600">
                      {warehousesTouched.length > 0 ? warehousesTouched.map((w: any) => warehouseLabel(w)).join(', ') : warehouseLabel(ev.warehouse)}
                    </td>
                    <td className="px-3 py-3 text-gray-500">{new Date(ev.event_date).toLocaleDateString('en-GB')}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{lines.length}</td>
                    <td className="px-3 py-3 text-right text-green-600 font-medium">{surplus > 0 ? '+' + surplus : '—'}</td>
                    <td className="px-4 py-3 text-right text-red-500 font-medium">{shortage > 0 ? '-' + shortage : '—'}</td>
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
