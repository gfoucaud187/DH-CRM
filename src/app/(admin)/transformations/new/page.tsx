'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, ArrowDown } from 'lucide-react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { logActivity } from '@/lib/log-activity'
import { warehouseLabel } from '@/lib/warehouse'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']

function ProductPicker({ label, value, onChange, products }: { label: string; value: string; onChange: (sku: string) => void; products: any[] }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const selected = products.find(p => p.sku === value)

  const filtered = products.filter(p =>
    !search ||
    p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.brand?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30)

  return (
    <div className="relative">
      <label className="text-xs font-medium text-gray-500 uppercase">{label}</label>
      {selected ? (
        <div className="mt-1 flex items-center justify-between rounded-md border border-gray-200 px-3 h-9 text-sm">
          <div>
            <span className="font-medium">{selected.full_name}</span>
            <span className="text-gray-400 font-mono ml-2">{selected.sku}</span>
          </div>
          <button onClick={() => { onChange(''); setSearch('') }} className="text-xs text-gray-400 hover:text-red-500">Change</button>
        </div>
      ) : (
        <input type="text" value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search SKU, name, brand..."
          className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
      )}
      {open && !selected && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
          {filtered.map(p => (
            <button key={p.sku} onMouseDown={() => { onChange(p.sku); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between">
              <span>{p.full_name}</span>
              <span className="text-gray-400 font-mono text-xs">{p.sku}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NewTransformationPage() {
  const router = useRouter()
  const supabase = createClient()

  const [warehouse, setWarehouse] = useState('Central')
  const [sourceSku, setSourceSku] = useState('')
  const [sourcePacks, setSourcePacks] = useState('')
  const [destSku, setDestSku] = useState('')
  const [destPacks, setDestPacks] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: products = [] } = useQuery({
    queryKey: ['products-transformation'],
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
    queryKey: ['inventory-records-transformation'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_records')
        .select('sku, warehouse, quantity_packs')
        .eq('category', 'available')
      return data ?? []
    }
  })

  const sourceProduct = (products as any[]).find(p => p.sku === sourceSku)
  const destProduct = (products as any[]).find(p => p.sku === destSku)

  const sourceStock = useMemo(() => {
    const row = (inventory as any[]).find(r => r.sku === sourceSku && r.warehouse === warehouse)
    return row?.quantity_packs ?? 0
  }, [inventory, sourceSku, warehouse])

  const sourcePacksNum = parseInt(sourcePacks) || 0
  const destPacksNum = parseInt(destPacks) || 0
  const wouldGoNegative = sourceSku && sourcePacksNum > 0 && sourcePacksNum > sourceStock

  const canSubmit = sourceSku && destSku && sourceSku !== destSku && sourcePacksNum > 0 && destPacksNum > 0

  const handleSubmit = async () => {
    if (!canSubmit || !sourceProduct || !destProduct) return
    setSaving(true)
    try {
      const { data: trNumber, error: numErr } = await supabase.rpc('fn_generate_doc_number', { p_doc_type: 'transformation' })
      if (numErr || !trNumber) { alert('Error: ' + numErr?.message); setSaving(false); return }

      const { data: tr, error } = await supabase
        .from('transformations')
        .insert({
          transformation_number: trNumber,
          warehouse,
          transformation_date: new Date().toISOString().split('T')[0],
          source_sku: sourceProduct.sku,
          source_product_name: sourceProduct.full_name,
          source_brand: sourceProduct.brand,
          source_quantity_packs: sourcePacksNum,
          source_quantity_units: sourcePacksNum * (sourceProduct.units_per_pack ?? 1),
          destination_sku: destProduct.sku,
          destination_product_name: destProduct.full_name,
          destination_brand: destProduct.brand,
          destination_quantity_packs: destPacksNum,
          destination_quantity_units: destPacksNum * (destProduct.units_per_pack ?? 1),
          notes: notes || null,
        })
        .select().single()

      if (error || !tr) { alert('Error: ' + error?.message); setSaving(false); return }

      await logActivity({
        action: 'create_transformation',
        entityType: 'transformation',
        entityId: tr.id,
        entityRef: tr.transformation_number,
        metadata: { source: `${sourcePacksNum}x ${sourceProduct.sku}`, destination: `${destPacksNum}x ${destProduct.sku}`, warehouse },
      })
      router.push('/transformations/' + tr.id)
    } catch (err: any) {
      alert('Error: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/transformations" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">New Transformation</h1>
          <p className="text-gray-500 text-sm mt-0.5">Convert stock from one SKU/pack format into another</p>
        </div>
        <button onClick={handleSubmit} disabled={saving || !canSubmit}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Create Transformation'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Warehouse</label>
          <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
            {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
          </select>
        </div>

        <div className="rounded-lg border border-red-100 bg-red-50/40 p-3 space-y-3">
          <ProductPicker label="Source SKU (deducted)" value={sourceSku} onChange={setSourceSku} products={products as any[]} />
          {sourceSku && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Quantity (boxes)</label>
              <input type="number" min={0} value={sourcePacks} onChange={e => setSourcePacks(e.target.value)}
                placeholder="0"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              <p className="text-xs text-gray-400 mt-1">System stock in {warehouseLabel(warehouse)}: {sourceStock} boxes</p>
              {wouldGoNegative && (
                <p className="text-xs text-amber-600 mt-1">⚠ This exceeds current stock — {warehouseLabel(warehouse)} will go negative for {sourceSku}.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <ArrowDown className="h-5 w-5 text-gray-300" />
        </div>

        <div className="rounded-lg border border-green-100 bg-green-50/40 p-3 space-y-3">
          <ProductPicker label="Destination SKU (credited)" value={destSku} onChange={setDestSku} products={products as any[]} />
          {destSku && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Quantity (boxes)</label>
              <input type="number" min={0} value={destPacks} onChange={e => setDestPacks(e.target.value)}
                placeholder="0"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          )}
        </div>

        {sourceSku && sourceSku === destSku && (
          <p className="text-xs text-red-500">Source and destination must be different SKUs.</p>
        )}

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
        </div>
      </div>
    </div>
  )
}
