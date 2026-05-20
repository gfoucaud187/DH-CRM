'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, Search } from 'lucide-react'

const LISTS = ['G', 'G1', 'A1', 'SPECIAL']
const LIST_COLORS: Record<string, string> = {
  G:       'bg-blue-100 text-blue-700',
  G1:      'bg-purple-100 text-purple-700',
  A1:      'bg-amber-100 text-amber-700',
  SPECIAL: 'bg-red-100 text-red-700',
}

export default function PriceListsPage() {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState('All')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['price-list-entries'],
    queryFn: async () => {
      const { data } = await supabase
        .from('price_list_entries')
        .select('*')
        .order('sku')
      return data ?? []
    }
  })

  const filtered = entries.filter((e: any) => {
    const matchSearch = !search ||
      e.sku?.toLowerCase().includes(search.toLowerCase()) ||
      e.product_name?.toLowerCase().includes(search.toLowerCase())
    const matchList = listFilter === 'All' || e.price_list === listFilter
    return matchSearch && matchList
  })

  // Group by SKU for display
  const grouped = filtered.reduce((acc: any, e: any) => {
    if (!acc[e.sku]) acc[e.sku] = { sku: e.sku, product_name: e.product_name, prices: {} }
    acc[e.sku].prices[e.price_list] = { price: e.price_per_unit, currency: e.currency }
    return acc
  }, {})

  const rows = Object.values(grouped)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Price Lists</h1>
          <p className="text-gray-500 text-sm mt-0.5">{rows.length} products with prices</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search SKU or product..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="flex gap-2">
          {['All', ...LISTS].map(l => (
            <button
              key={l}
              onClick={() => setListFilter(l)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                listFilter === l
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <DollarSign className="h-8 w-8 mb-2" />
            <p className="text-sm">No price entries found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                {LISTS.map(l => (
                  <th key={l} className="text-right px-4 py-3 font-medium text-gray-600">
                    <span className={`px-2 py-0.5 rounded text-xs ${LIST_COLORS[l]}`}>{l}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row: any) => (
                <tr key={row.sku} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.sku}</td>
                  <td className="px-4 py-3 text-gray-900">{row.product_name}</td>
                  {LISTS.map(l => (
                    <td key={l} className="px-4 py-3 text-right">
                      {row.prices[l] ? (
                        <span className="font-medium text-gray-900">
                          {Number(row.prices[l].price).toFixed(2)}
                          <span className="text-xs text-gray-400 ml-1">{row.prices[l].currency}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}