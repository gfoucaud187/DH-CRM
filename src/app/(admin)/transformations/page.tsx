'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Repeat } from 'lucide-react'
import { warehouseLabel } from '@/lib/warehouse'

export default function TransformationsListPage() {
  const supabase = createClient()
  const router = useRouter()

  const { data: transformations = [], isLoading } = useQuery({
    queryKey: ['transformations-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transformations')
        .select('*')
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transformations</h1>
          <p className="text-sm text-gray-500 mt-0.5">{transformations.length} conversions</p>
        </div>
        <Link href="/transformations/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" /> New Transformation
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
      ) : transformations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Repeat className="h-8 w-8 mb-2" />
          <p className="text-sm">No transformations yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Number</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Warehouse</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Conversion</th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(transformations as any[]).map((tr: any) => (
                <tr key={tr.id} onClick={() => router.push('/transformations/' + tr.id)}
                  className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">{tr.transformation_number}</td>
                  <td className="px-3 py-3 text-gray-600">{warehouseLabel(tr.warehouse)}</td>
                  <td className="px-3 py-3 text-gray-700">
                    <span className="text-red-500 font-mono">-{tr.source_quantity_packs} {tr.source_sku}</span>
                    <span className="text-gray-300 mx-2">→</span>
                    <span className="text-green-600 font-mono">+{tr.destination_quantity_packs} {tr.destination_sku}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-500">{new Date(tr.transformation_date).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
