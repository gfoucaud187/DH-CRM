'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, Search, Save, Check } from 'lucide-react'

const LISTS = ['G', 'G1', 'A1', 'SPECIAL']
const LIST_COLORS: Record<string, string> = {
  G:       'bg-blue-100 text-blue-700',
  G1:      'bg-purple-100 text-purple-700',
  A1:      'bg-amber-100 text-amber-700',
  SPECIAL: 'bg-red-100 text-red-700',
}

export default function PriceListsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState('All')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

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

  const filtered = (entries as any[]).filter((e: any) => {
    const matchSearch = !search ||
      e.sku?.toLowerCase().includes(search.toLowerCase()) ||
      e.product_name?.toLowerCase().includes(search.toLowerCase())
    const matchList = listFilter === 'All' || e.price_list === listFilter
    return matchSearch && matchList
  })

  const grouped = filtered.reduce((acc: any, e: any) => {
    if (!acc[e.sku]) acc[e.sku] = { sku: e.sku, product_name: e.product_name, prices: {} }
    acc[e.sku].prices[e.price_list] = { id: e.id, price: e.price_per_unit, currency: e.currency }
    return acc
  }, {})

  const rows = Object.values(grouped)

  const editKey = (sku: string, list: string) => `${sku}__${list}`

  const getEditValue = (sku: string, list: string, fallback: number) => {
    const key = editKey(sku, list)
    return edits[key] !== undefined ? edits[key] : fallback.toString()
  }

  const handleEdit = (sku: string, list: string, value: string) => {
    setEdits(prev => ({ ...prev, [editKey(sku, list)]: value }))
  }

  const handleSave = async (sku: string, list: string, row: any) => {
    const key = editKey(sku, list)
    const newPrice = parseFloat(edits[key])
    if (isNaN(newPrice) || newPrice < 0) return
    setSaving(key)

    const existing = row.prices[list]
    if (existing?.id) {
      await supabase.from('price_list_entries')
        .update({ price_per_unit: newPrice })
        .eq('id', existing.id)
    } else {
      await supabase.from('price_list_entries').insert({
        sku,
        product_name: row.product_name,
        price_list: list,
        price_per_unit: newPrice,
        currency: 'USD',
      })
    }

    setEdits(prev => { const n = { ...prev }; delete n[key]; return n })
    queryClient.invalidateQueries({ queryKey: ['price-list-entries'] })
    queryClient.invalidateQueries({ queryKey: ['price-entries-all'] })
    setSaving(null)
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  const hasEdit = (sku: string, list: string) => {
    const key = editKey(sku, list)
    const row = (rows as any[]).find((r: any) => r.sku === sku)
    if (!row) return false
    const current = row.prices[list]?.price ?? 0
    return edits[key] !== undefined && parseFloat(edits[key]) !== current
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Price Lists</h1>
          <p className="text-gray-500 text-sm mt-0.5">{rows.length} products · click any price to edit</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search SKU or product..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none" />
        </div>
        <div className="flex gap-2">
          {['All', ...LISTS].map(l => (
            <button key={l} onClick={() => setListFilter(l)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                listFilter === l ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
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
              {(rows as any[]).map((row: any) => (
                <tr key={row.sku} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.sku}</td>
                  <td className="px-4 py-3 text-gray-900">{row.product_name}</td>
                  {LISTS.map(l => {
                    const key = editKey(row.sku, l)
                    const current = row.prices[l]?.price ?? 0
                    const currency = row.prices[l]?.currency ?? 'USD'
                    const isEdited = hasEdit(row.sku, l)
                    const isSaving = saving === key
                    const isSaved = saved === key

                    return (
                      <td key={l} className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={getEditValue(row.sku, l, current)}
                            onChange={e => handleEdit(row.sku, l, e.target.value)}
                            className={`w-24 h-8 rounded border px-2 text-right text-sm font-medium focus:outline-none transition-colors ${
                              isEdited ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-900'
                            } ${current === 0 && !isEdited ? 'text-gray-300' : ''}`}
                          />
                          <span className="text-xs text-gray-400 w-7">{currency}</span>
                          {isEdited && (
                            <button
                              onClick={() => handleSave(row.sku, l, row)}
                              disabled={isSaving}
                              className="h-8 w-8 flex items-center justify-center rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 flex-shrink-0">
                              {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3 text-center">Click any price field to edit · Save button appears when a value is changed</p>
    </div>
  )
}