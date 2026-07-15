'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'
import { warehouseLabel } from '@/lib/warehouse'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']

interface StocktakeLine {
  sku: string
  product_name: string
  brand: string
  units_per_pack: number
  warehouse: string
  system_quantity_packs: number
  system_quantity_units: number
  counted_quantity_packs: number | ''
  reason: string
}

export default function NewStocktakePage() {
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [warehouse, setWarehouse] = useState('T1')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<StocktakeLine[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: products = [] } = useQuery({
    queryKey: ['products-stocktake'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name, brand, units_per_pack')
        .in('product_role', ['original', 'aged']).eq('status', 'active')
        .order('brand').limit(500)
      return data ?? []
    }
  })

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory-records-stocktake'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_records')
        .select('sku, warehouse, quantity_packs, quantity_units')
        .eq('category', 'available')
      return data ?? []
    }
  })

  const getSystemQty = (sku: string, wh: string) => {
    const rec = (inventory as any[]).find((r: any) => r.sku === sku && r.warehouse === wh)
    return { packs: rec?.quantity_packs ?? 0, units: rec?.quantity_units ?? 0 }
  }

  const addLine = (product: any) => {
    if (lines.some(l => l.sku === product.sku && l.warehouse === warehouse)) return
    const sys = getSystemQty(product.sku, warehouse)
    setLines(l => [...l, {
      sku: product.sku, product_name: product.full_name, brand: product.brand,
      units_per_pack: product.units_per_pack ?? 1,
      warehouse,
      system_quantity_packs: sys.packs, system_quantity_units: sys.units,
      counted_quantity_packs: '',
      reason: '',
    }])
    setProductSearch('')
  }

  const updateLineWarehouse = (idx: number, wh: string) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const sys = getSystemQty(l.sku, wh)
      return { ...l, warehouse: wh, system_quantity_packs: sys.packs, system_quantity_units: sys.units }
    }))
  }

  const updateLineCounted = (idx: number, value: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, counted_quantity_packs: value === '' ? '' : parseInt(value) || 0 } : l))
  }

  const updateLineReason = (idx: number, value: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, reason: value } : l))
  }

  const removeLine = (idx: number) => setLines(l => l.filter((_, i) => i !== idx))

  const filteredProducts = (products as any[]).filter((p: any) =>
    !productSearch ||
    p.full_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const getDelta = (l: StocktakeLine) => (l.counted_quantity_packs === '' ? 0 : l.counted_quantity_packs) - l.system_quantity_packs

  const handleSubmit = async () => {
    const validLines = lines.filter(l => l.counted_quantity_packs !== '' && getDelta(l) !== 0)
    if (validLines.length === 0) return alert('Enter a counted quantity that differs from the system quantity for at least one line')
    setSaving(true)
    try {
      const { data: eventNumber } = await supabase.rpc('fn_generate_doc_number', { p_doc_type: 'stocktake_diff' })

      const { data: event, error: eventErr } = await supabase
        .from('inventory_events')
        .insert({ event_number: eventNumber, warehouse, event_date: new Date().toISOString().split('T')[0], notes: notes || null })
        .select().single()

      if (eventErr || !event) { alert('Error: ' + eventErr?.message); setSaving(false); return }

      const { error: linesErr } = await supabase.from('inventory_event_lines').insert(
        validLines.map(l => {
          const countedPacks = l.counted_quantity_packs as number
          const countedUnits = countedPacks * l.units_per_pack
          const deltaPacks = countedPacks - l.system_quantity_packs
          const deltaUnits = countedUnits - l.system_quantity_units
          return {
            event_id: event.id, sku: l.sku, product_name: l.product_name, brand: l.brand,
            warehouse: l.warehouse, units_per_pack: l.units_per_pack,
            system_quantity_packs: l.system_quantity_packs, system_quantity_units: l.system_quantity_units,
            counted_quantity_packs: countedPacks, counted_quantity_units: countedUnits,
            delta_packs: deltaPacks, delta_units: deltaUnits,
            reason: l.reason || null,
          }
        })
      )

      if (linesErr) { alert('Error saving lines: ' + linesErr.message); setSaving(false); return }

      await logActivity({
        action: 'create_stocktake',
        entityType: 'inventory_event',
        entityId: event.id,
        entityRef: event.event_number,
        metadata: { type: 'stocktake_diff', warehouse, lines: validLines.length },
      })
      queryClient.invalidateQueries({ queryKey: ['stocktake-events'] })
      router.push('/stocktake/' + event.id)
    } catch (err: any) {
      alert('Error: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/stocktake" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">New Stocktake</h1>
          <p className="text-gray-500 text-sm mt-0.5">Physical count reconciliation</p>
        </div>
        <button onClick={handleSubmit} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Submit Stocktake'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-900">Session Details</h2>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Default Warehouse</label>
              <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Used for new lines — override per line below</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
          </div>
        </div>

        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">Add Product</h3>
            <input type="text" placeholder="Search products (SKU, name, brand)..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none mb-3" />
            {productSearch && (
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {filteredProducts.slice(0, 15).map((p: any) => {
                  const added = lines.some(l => l.sku === p.sku && l.warehouse === warehouse)
                  return (
                    <button key={p.sku} onClick={() => addLine(p)} disabled={added}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-left">
                      <div>
                        <span className="font-medium">{p.full_name}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">{p.sku}</span>
                      </div>
                      {added ? <span className="text-xs text-gray-400">Added</span> : <Plus className="h-4 w-4 text-gray-400" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Warehouse</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">System Qty</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Counted Qty</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Delta</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Reason</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, idx) => {
                    const delta = getDelta(line)
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{line.product_name}</p>
                          <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                        </td>
                        <td className="px-3 py-3">
                          <select value={line.warehouse} onChange={e => updateLineWarehouse(idx, e.target.value)}
                            className="h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none">
                            {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-3 text-center text-gray-500">{line.system_quantity_packs}</td>
                        <td className="px-3 py-3 text-center">
                          <input type="number" min={0} value={line.counted_quantity_packs}
                            onChange={e => updateLineCounted(idx, e.target.value)}
                            className="w-20 h-8 rounded border border-gray-200 px-2 text-center text-sm" />
                        </td>
                        <td className="px-3 py-3 text-center font-medium">
                          {line.counted_quantity_packs === '' ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <span className={delta === 0 ? 'text-gray-400' : delta > 0 ? 'text-green-600' : 'text-red-500'}>
                              {delta > 0 ? '+' : ''}{delta}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <input type="text" value={line.reason} onChange={e => updateLineReason(idx, e.target.value)}
                            placeholder="e.g. damaged, miscount..."
                            className="w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
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
      </div>
    </div>
  )
}
