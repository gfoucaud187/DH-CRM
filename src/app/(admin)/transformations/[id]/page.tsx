'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { ArrowLeft, ArrowDown } from 'lucide-react'
import Link from 'next/link'
import { warehouseLabel } from '@/lib/warehouse'
import TransformationPDF from '@/components/pdf/TransformationPDF'

export default function TransformationDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const supabase = createClient()

  const { data: tr, isLoading } = useQuery({
    queryKey: ['transformation', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('transformations')
        .select('*')
        .eq('id', id)
        .single()
      return data
    }
  })

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!tr) return <div className="text-center py-12 text-gray-400">Transformation not found</div>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/transformations" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{tr.transformation_number}</h1>
            <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 uppercase">Transformation</span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">
            {warehouseLabel(tr.warehouse)} · {new Date(tr.transformation_date).toLocaleDateString('en-GB')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          {tr.notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-2 text-sm">Notes</h2>
              <p className="text-sm text-gray-600">{tr.notes}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Document</h2>
            <TransformationPDF transformation={tr} />
          </div>
        </div>

        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600"></th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Product</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Boxes</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr>
                  <td className="px-4 py-3 font-semibold text-red-500">FROM</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{tr.source_product_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{tr.source_sku}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-red-500 font-semibold">-{tr.source_quantity_packs}</td>
                  <td className="px-4 py-3 text-right text-red-500 font-semibold">-{tr.source_quantity_units}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-center text-gray-300"><ArrowDown className="h-4 w-4 inline" /></td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold text-green-600">TO</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{tr.destination_product_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{tr.destination_sku}</p>
                  </td>
                  <td className="px-3 py-3 text-right text-green-600 font-semibold">+{tr.destination_quantity_packs}</td>
                  <td className="px-4 py-3 text-right text-green-600 font-semibold">+{tr.destination_quantity_units}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
