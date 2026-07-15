'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Trash2, Plus } from 'lucide-react'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'
import { warehouseLabel } from '@/lib/warehouse'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']

interface ReturnLine {
  sku: string
  product_name: string
  brand: string
  units_per_pack: number
  quantity_packs: number
  quantity_units: number
  price_per_unit: number
  line_total: number
  warehouse: string
  fixmer_reference?: string | null
}

export default function NewClientReturnPage() {
  const params = useParams()
  const sourceId = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [warehouse, setWarehouse] = useState('T1')
  const [lines, setLines] = useState<ReturnLine[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: sourceOrder, isLoading } = useQuery({
    queryKey: ['return-source-order', sourceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*)')
        .eq('id', sourceId)
        .single()
      return data
    }
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-return'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name, brand, units_per_pack, fixmer_reference')
        .in('product_role', ['original', 'aged']).eq('status', 'active')
        .order('brand').limit(500)
      return data ?? []
    }
  })

  useEffect(() => {
    if (sourceOrder) {
      setWarehouse(sourceOrder.warehouse ?? 'T1')
    }
  }, [sourceOrder])

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!sourceOrder) return <div className="text-center py-12 text-gray-400">Order not found</div>

  const sourceLines = (sourceOrder.lines ?? []).filter((l: any) => l.line_type === 'commercial')

  const addLineFromSource = (srcLine: any) => {
    if (lines.some(l => l.sku === srcLine.sku)) return
    setLines(l => [...l, {
      sku: srcLine.sku, product_name: srcLine.product_name, brand: srcLine.brand,
      units_per_pack: srcLine.units_per_pack ?? 1,
      quantity_packs: 0, quantity_units: 0,
      price_per_unit: srcLine.price_per_unit ?? 0, line_total: 0,
      warehouse: srcLine.warehouse ?? warehouse,
      fixmer_reference: srcLine.fixmer_reference ?? null,
    }])
  }

  const addLineFromProduct = (product: any) => {
    if (lines.some(l => l.sku === product.sku)) return
    setLines(l => [...l, {
      sku: product.sku, product_name: product.full_name, brand: product.brand,
      units_per_pack: product.units_per_pack ?? 1,
      quantity_packs: 0, quantity_units: 0,
      price_per_unit: 0, line_total: 0,
      warehouse,
      fixmer_reference: product.fixmer_reference ?? null,
    }])
    setProductSearch('')
  }

  const updateLine = (idx: number, field: 'quantity_packs' | 'price_per_unit' | 'warehouse', value: number | string) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === 'quantity_packs') {
        const packs = Number(value)
        const units = packs * l.units_per_pack
        return { ...l, quantity_packs: packs, quantity_units: units, line_total: units * l.price_per_unit }
      }
      if (field === 'price_per_unit') {
        const price = Number(value)
        return { ...l, price_per_unit: price, line_total: l.quantity_units * price }
      }
      return { ...l, warehouse: value as string }
    }))
  }

  const removeLine = (idx: number) => setLines(l => l.filter((_, i) => i !== idx))

  const totalPacks = lines.reduce((s, l) => s + l.quantity_packs, 0)
  const totalUnits = lines.reduce((s, l) => s + l.quantity_units, 0)
  const totalCredit = lines.reduce((s, l) => s + l.line_total, 0)

  const filteredProducts = (products as any[]).filter((p: any) =>
    !productSearch ||
    p.full_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const handleSubmit = async () => {
    const validLines = lines.filter(l => l.quantity_packs > 0)
    if (validLines.length === 0) return alert('Add at least one returned product with a quantity')
    setSaving(true)
    try {
      const { data: returnNumber } = await supabase.rpc('fn_generate_doc_number', { p_doc_type: 'client_return' })

      const { data: created, error: createErr } = await supabase
        .from('sales_orders')
        .insert({
          order_number: returnNumber,
          document_type: 'client_return',
          is_foc: false,
          promoted_from: sourceOrder.id,
          linked_order_id: sourceOrder.id,
          customer_id: sourceOrder.customer_id,
          customer_name: sourceOrder.customer_name,
          price_list: sourceOrder.price_list,
          currency: sourceOrder.currency,
          status: 'completed',
          warehouse,
          total_amount: totalCredit,
          total_units: totalUnits,
          total_packs: totalPacks,
          order_date: new Date().toISOString().split('T')[0],
          notes: `Client Return for ${sourceOrder.order_number}`,
        })
        .select().single()

      if (createErr || !created) { alert('Error: ' + createErr?.message); setSaving(false); return }

      await supabase.from('sales_order_lines').insert(
        validLines.map(l => ({
          order_id: created.id, line_type: 'commercial',
          sku: l.sku, product_name: l.product_name, brand: l.brand,
          units_per_pack: l.units_per_pack, quantity_packs: l.quantity_packs, quantity_units: l.quantity_units,
          price_per_unit: l.price_per_unit, line_total: l.line_total,
          warehouse: l.warehouse, fixmer_reference: l.fixmer_reference ?? null,
        }))
      )

      await logActivity({
        action: 'create_client_return',
        entityType: 'order',
        entityId: created.id,
        entityRef: created.order_number,
        metadata: { source_order: sourceOrder.order_number, customer: sourceOrder.customer_name },
      })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      router.push('/orders/' + created.id)
    } catch (err: any) {
      alert('Error: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href={'/orders/' + sourceId} className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Register Return</h1>
          <p className="text-gray-500 text-sm mt-0.5">{sourceOrder.customer_name} · from {sourceOrder.order_number}</p>
        </div>
        <button onClick={handleSubmit} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Create Return'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-900">Return Details</h2>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Default Warehouse</label>
              <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">Where returned stock is reintegrated — override per line below</p>
            </div>
          </div>

          {(lines.length > 0) && (
            <div className="bg-gray-900 rounded-xl p-4 text-white">
              <h3 className="font-semibold mb-3">Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Packs</span><span>{totalPacks}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Units</span><span>{totalUnits}</span></div>
                <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between font-semibold text-lg">
                  <span>Credit</span>
                  <span>{sourceOrder.currency} {totalCredit.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="col-span-2 space-y-4">
          {sourceLines.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-3">Products on {sourceOrder.order_number}</h3>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {sourceLines.map((l: any) => {
                  const added = lines.some(x => x.sku === l.sku)
                  return (
                    <button key={l.sku} onClick={() => addLineFromSource(l)} disabled={added}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-left">
                      <div>
                        <span className="font-medium">{l.product_name}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">{l.sku}</span>
                      </div>
                      {added ? <span className="text-xs text-gray-400">Added</span> : <Plus className="h-4 w-4 text-gray-400" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">Add Other Product</h3>
            <input type="text" placeholder="Search products..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none mb-3" />
            {productSearch && (
              <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {filteredProducts.slice(0, 10).map((p: any) => {
                  const added = lines.some(l => l.sku === p.sku)
                  return (
                    <button key={p.sku} onClick={() => addLineFromProduct(p)} disabled={added}
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
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Packs</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Units</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Price/Unit</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Credit</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, idx) => (
                    <tr key={line.sku}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{line.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                      </td>
                      <td className="px-3 py-3">
                        <select value={line.warehouse} onChange={e => updateLine(idx, 'warehouse', e.target.value)}
                          className="h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none">
                          {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input type="number" min={0} value={line.quantity_packs || ''}
                          onChange={e => updateLine(idx, 'quantity_packs', parseInt(e.target.value) || 0)}
                          className="w-20 h-8 rounded border border-gray-200 px-2 text-center text-sm" />
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">{line.quantity_units}</td>
                      <td className="px-3 py-3 text-right">
                        <input type="number" min={0} step="0.01" value={line.price_per_unit || ''}
                          onChange={e => updateLine(idx, 'price_per_unit', parseFloat(e.target.value) || 0)}
                          className="w-24 h-8 rounded border border-gray-200 px-2 text-right text-sm" />
                      </td>
                      <td className="px-3 py-3 text-right font-medium">{Number(line.line_total).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                      <td className="px-3 py-3">
                        <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
