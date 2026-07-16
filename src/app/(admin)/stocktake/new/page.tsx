'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import { ArrowLeft, Save, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'
import { warehouseLabel } from '@/lib/warehouse'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']

export default function NewStocktakePage() {
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  // counted[sku][warehouse] = string input value
  const [counted, setCounted] = useState<Record<string, Record<string, string>>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})

  const [ocrWarehouse, setOcrWarehouse] = useState('T1')
  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState('')

  const { data: products = [] } = useQuery({
    queryKey: ['products-stocktake'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name, brand, units_per_pack')
        .in('product_role', ['original', 'aged']).eq('status', 'active')
        .order('brand')
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

  const systemQty = useMemo(() => {
    const map: Record<string, Record<string, { packs: number; units: number }>> = {}
    ;(inventory as any[]).forEach((r: any) => {
      if (!map[r.sku]) map[r.sku] = {}
      map[r.sku][r.warehouse] = { packs: r.quantity_packs ?? 0, units: r.quantity_units ?? 0 }
    })
    return map
  }, [inventory])

  const getSystemPacks = (sku: string, wh: string) => systemQty[sku]?.[wh]?.packs ?? 0

  const setCell = (sku: string, wh: string, value: string) => {
    setCounted(prev => ({ ...prev, [sku]: { ...prev[sku], [wh]: value } }))
  }

  const filteredProducts = (products as any[]).filter((p: any) =>
    !search ||
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.brand?.toLowerCase().includes(search.toLowerCase())
  )

  // Rows that currently have at least one entered value differing from system — used for the reason field and submit count
  const changedSkus = useMemo(() => {
    const set = new Set<string>()
    Object.entries(counted).forEach(([sku, byWh]) => {
      Object.entries(byWh).forEach(([wh, val]) => {
        if (val === '') return
        const c = parseInt(val) || 0
        if (c !== getSystemPacks(sku, wh)) set.add(sku)
      })
    })
    return set
  }, [counted, systemQty])

  const guessSku = (skuGuess: string | null, description: string | null) => {
    const candidates = products as any[]
    if (skuGuess) {
      const exact = candidates.find(p => p.sku.toLowerCase() === skuGuess.toLowerCase())
      if (exact) return exact.sku
    }
    const desc = (description || '').toLowerCase()
    if (!desc) return null
    const byName = candidates.find(p => desc.includes(p.full_name.toLowerCase()) || p.full_name.toLowerCase().includes(desc))
    return byName?.sku ?? null
  }

  const handleOcrExtract = async () => {
    if (!ocrFile) return
    setOcrLoading(true)
    setOcrError('')
    try {
      const formData = new FormData()
      formData.append('file', ocrFile)
      const res = await fetch('/api/stocktake/ocr', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setOcrError(data.error ?? 'Extraction failed'); setOcrLoading(false); return }

      let matched = 0
      const updates: Record<string, Record<string, string>> = {}
      ;(data.lines ?? []).forEach((l: any) => {
        const sku = guessSku(l.sku_guess, l.description)
        if (!sku || l.counted_quantity == null) return
        if (!updates[sku]) updates[sku] = {}
        updates[sku][ocrWarehouse] = String(l.counted_quantity)
        matched++
      })
      setCounted(prev => {
        const next = { ...prev }
        Object.entries(updates).forEach(([sku, byWh]) => { next[sku] = { ...next[sku], ...byWh } })
        return next
      })
      setOcrFile(null)
      if (matched === 0) setOcrError('No lines could be matched to a product in the catalogue')
    } catch (err: any) {
      setOcrError(err.message)
    } finally {
      setOcrLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (changedSkus.size === 0) return alert('Enter at least one counted quantity that differs from the system quantity')
    setSaving(true)
    try {
      const { data: eventNumber } = await supabase.rpc('fn_generate_doc_number', { p_doc_type: 'stocktake_diff' })

      // One session per warehouse touched — group changed cells by warehouse
      const linesByWarehouse: Record<string, any[]> = {}
      changedSkus.forEach(sku => {
        const product = (products as any[]).find(p => p.sku === sku)
        if (!product) return
        WAREHOUSES.forEach(wh => {
          const val = counted[sku]?.[wh]
          if (val === undefined || val === '') return
          const countedPacks = parseInt(val) || 0
          const sysPacks = getSystemPacks(sku, wh)
          if (countedPacks === sysPacks) return
          const sysUnits = systemQty[sku]?.[wh]?.units ?? 0
          const countedUnits = countedPacks * (product.units_per_pack ?? 1)
          if (!linesByWarehouse[wh]) linesByWarehouse[wh] = []
          linesByWarehouse[wh].push({
            sku, product_name: product.full_name, brand: product.brand, warehouse: wh,
            units_per_pack: product.units_per_pack ?? 1,
            system_quantity_packs: sysPacks, system_quantity_units: sysUnits,
            counted_quantity_packs: countedPacks, counted_quantity_units: countedUnits,
            delta_packs: countedPacks - sysPacks, delta_units: countedUnits - sysUnits,
            reason: reasons[sku] || null,
          })
        })
      })

      const warehousesTouched = Object.keys(linesByWarehouse)
      if (warehousesTouched.length === 0) { setSaving(false); return }

      // The event itself needs one warehouse — use the first touched one as the primary reference,
      // per-line warehouse is what actually drives the stock adjustment
      const { data: event, error: eventErr } = await supabase
        .from('inventory_events')
        .insert({ event_number: eventNumber, warehouse: warehousesTouched[0], event_date: new Date().toISOString().split('T')[0], notes: notes || null, status: 'draft' })
        .select().single()

      if (eventErr || !event) { alert('Error: ' + eventErr?.message); setSaving(false); return }

      const allLines = warehousesTouched.flatMap(wh => linesByWarehouse[wh])
      const { error: linesErr } = await supabase.from('inventory_event_lines').insert(
        allLines.map(l => ({ ...l, event_id: event.id }))
      )

      if (linesErr) { alert('Error saving lines: ' + linesErr.message); setSaving(false); return }

      await logActivity({
        action: 'create_stocktake',
        entityType: 'inventory_event',
        entityId: event.id,
        entityRef: event.event_number,
        metadata: { type: 'stocktake_diff', warehouses: warehousesTouched, lines: allLines.length },
      })
      queryClient.invalidateQueries({ queryKey: ['stocktake-events'] })
      router.push('/stocktake/' + event.id)
    } catch (err: any) {
      alert('Error: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-7xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/stocktake" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">New Stocktake</h1>
          <p className="text-gray-500 text-sm mt-0.5">{changedSkus.size} product(s) with a counted quantity different from the system · issuing the report does not change stock yet — you'll push it separately from the report page</p>
        </div>
        <button onClick={handleSubmit} disabled={saving || changedSkus.size === 0}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Issue Report'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4" /> Extract from Warehouse Count Sheet</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={ocrWarehouse} onChange={e => setOcrWarehouse(e.target.value)}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
            {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
          </select>
          <input type="file" accept="application/pdf,image/*,.xlsx,.xls,.csv"
            onChange={e => setOcrFile(e.target.files?.[0] ?? null)}
            className="flex-1 min-w-64 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 file:text-sm" />
          <button onClick={handleOcrExtract} disabled={!ocrFile || ocrLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap">
            {ocrLoading ? 'Extracting...' : 'Extract & Fill'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Fills the "{warehouseLabel(ocrWarehouse)}" column below for matched products — review before submitting.</p>
        {ocrError && <p className="text-xs text-red-500 mt-2">{ocrError}</p>}
      </div>

      <div className="mb-4">
        <input type="text" placeholder="Search products (SKU, name, brand)..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 sticky left-0 bg-gray-50 min-w-56">Product</th>
                {WAREHOUSES.map(w => (
                  <th key={w} className="text-center px-3 py-3 font-medium text-gray-600 min-w-28">{warehouseLabel(w)}</th>
                ))}
                <th className="text-left px-3 py-3 font-medium text-gray-600 min-w-48">Reason</th>
              </tr>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-1 sticky left-0 bg-gray-50" />
                {WAREHOUSES.map(w => (
                  <th key={w} className="text-center px-3 py-1 text-xs font-normal text-gray-400">system → counted</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.map((p: any) => {
                const rowChanged = changedSkus.has(p.sku)
                return (
                  <tr key={p.sku} className={rowChanged ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-2 sticky left-0 bg-white" style={{ background: rowChanged ? '#FFFBEB' : '#fff' }}>
                      <p className="font-medium">{p.full_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
                    </td>
                    {WAREHOUSES.map(w => {
                      const sys = getSystemPacks(p.sku, w)
                      const val = counted[p.sku]?.[w] ?? ''
                      const isDiff = val !== '' && (parseInt(val) || 0) !== sys
                      return (
                        <td key={w} className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs text-gray-400 w-6 text-right">{sys}</span>
                            <input type="number" min={0} value={val}
                              onChange={e => setCell(p.sku, w, e.target.value)}
                              placeholder="—"
                              className={`w-16 h-8 rounded border px-2 text-center text-sm focus:outline-none ${isDiff ? 'border-amber-400 bg-amber-50 font-semibold' : 'border-gray-200'}`} />
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2">
                      {rowChanged && (
                        <input type="text" value={reasons[p.sku] ?? ''} onChange={e => setReasons(prev => ({ ...prev, [p.sku]: e.target.value }))}
                          placeholder="e.g. damaged, miscount..."
                          className="w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
        <label className="text-xs font-medium text-gray-500 uppercase">Session Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
      </div>
    </div>
  )
}
