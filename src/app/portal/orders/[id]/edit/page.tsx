'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Trash2, ShoppingCart, AlertTriangle, ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

interface POLine {
  sku: string
  product_name: string
  brand: string
  units_per_pack: number
  quantity_packs: number
  quantity_units: number
  price_per_unit: number
  line_total: number
  stock_available: number
  fixmer_reference?: string | null
}

export default function PortalEditOrderPage() {
  const { id } = useParams()
  const supabase = createClient()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [lines, setLines] = useState<POLine[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [productSearch, setProductSearch] = useState('')

  const { data: profile } = useQuery({
    queryKey: ['portal-profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase
        .from('user_profiles').select('customer_id').eq('id', user.id).single()
      return data
    }
  })

  const { data: order } = useQuery({
    queryKey: ['portal-order', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*)')
        .eq('id', id)
        .single()
      return data
    },
    refetchOnMount: true,
    staleTime: 0,
  })

  const { data: customer } = useQuery({
    queryKey: ['portal-customer', profile?.customer_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, legal_name, assigned_price_list, currency, incoterms, payment_terms, track_trace_enabled, eu_compliance_type')
        .eq('id', profile!.customer_id)
        .single()
      return data
    },
    enabled: !!profile?.customer_id
  })

  const { data: products = [] } = useQuery({
    queryKey: ['portal-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name, brand, units_per_pack, fixmer_reference')
        .eq('product_role', 'original').eq('status', 'active')
        .order('brand').limit(500)
      return data ?? []
    }
  })

  const { data: priceEntries = [] } = useQuery({
    queryKey: ['portal-prices', customer?.assigned_price_list],
    queryFn: async () => {
      const { data } = await supabase
        .from('price_list_entries')
        .select('sku, price_per_unit')
        .eq('price_list', customer!.assigned_price_list)
      return data ?? []
    },
    enabled: !!customer?.assigned_price_list
  })

  const { data: stockRecords = [] } = useQuery({
    queryKey: ['portal-stock'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_records')
        .select('sku, quantity_packs, warehouse, category')
        .eq('category', 'available')
      return data ?? []
    }
  })

  useEffect(() => {
    if (order && products.length > 0 && !initialized) {
      setNotes(order.notes ?? '')
      const existingLines = (order.lines ?? []).map((l: any) => ({
        sku: l.sku,
        product_name: l.product_name,
        brand: l.brand,
        units_per_pack: l.units_per_pack ?? 1,
        quantity_packs: l.quantity_packs,
        quantity_units: l.quantity_units,
        price_per_unit: l.price_per_unit,
        line_total: l.line_total,
        stock_available: getStock(l.sku),
        fixmer_reference: l.fixmer_reference ?? null,
      }))
      setLines(existingLines)
      setInitialized(true)
    }
  }, [order, products, initialized])

  const getPrice = (sku: string) => {
    const entry = (priceEntries as any[]).find((e: any) => e.sku === sku)
    return entry?.price_per_unit ?? 0
  }

  const getStock = (sku: string) => {
    return (stockRecords as any[])
      .filter((r: any) => r.sku === sku && !['Sample','Private'].includes(r.warehouse))
      .reduce((s: number, r: any) => s + (r.quantity_packs ?? 0), 0)
  }

  const addLine = (product: any) => {
    if (lines.some(l => l.sku === product.sku)) return
    setLines(l => [...l, {
      sku: product.sku,
      product_name: product.full_name,
      brand: product.brand,
      units_per_pack: product.units_per_pack ?? 1,
      quantity_packs: 0,
      quantity_units: 0,
      price_per_unit: getPrice(product.sku),
      line_total: 0,
      stock_available: getStock(product.sku),
      fixmer_reference: product.fixmer_reference ?? null,
    }])
  }

  const updateLine = (idx: number, packs: number) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const units = packs * l.units_per_pack
      return { ...l, quantity_packs: packs, quantity_units: units, line_total: units * l.price_per_unit }
    }))
  }

  const removeLine = (idx: number) => setLines(l => l.filter((_, i) => i !== idx))

  const total      = lines.reduce((s, l) => s + l.line_total, 0)
  const totalUnits = lines.reduce((s, l) => s + l.quantity_units, 0)
  const totalPacks = lines.reduce((s, l) => s + l.quantity_packs, 0)
  const hasLines   = lines.length > 0 && lines.some(l => l.quantity_packs > 0)
  const hasStockWarning = lines.some(l => l.quantity_packs > l.stock_available && l.quantity_packs > 0)

  const saveLines = async () => {
    await supabase.from('sales_order_lines').delete().eq('order_id', id as string)
    if (lines.length > 0) {
      await supabase.from('sales_order_lines').insert(
        lines.map(l => ({
          order_id: id, line_type: 'commercial',
          sku: l.sku, product_name: l.product_name, brand: l.brand,
          units_per_pack: l.units_per_pack, quantity_packs: l.quantity_packs,
          quantity_units: l.quantity_units, price_per_unit: l.price_per_unit,
          line_total: l.line_total, fixmer_reference: l.fixmer_reference ?? null,
        }))
      )
    }
  }

  const handleSaveDraft = async () => {
    setSavingDraft(true)
    try {
      await supabase.from('sales_orders').update({
        notes, total_amount: total, total_units: totalUnits, total_packs: totalPacks,
        status: 'draft',
      }).eq('id', id as string)
      await saveLines()
      queryClient.invalidateQueries({ queryKey: ['portal-order', id] })
      setInitialized(false)
      router.push('/portal/orders')
    } catch { alert('Error saving draft') }
    setSavingDraft(false)
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const requiresStockReview = lines.some(l => l.quantity_packs > l.stock_available)
      await supabase.from('sales_orders').update({
        status: 'pending_approval',
        notes, total_amount: total, total_units: totalUnits, total_packs: totalPacks,
        rejection_comment: null,
        requires_stock_review: requiresStockReview,
      }).eq('id', id as string)
      await saveLines()
      queryClient.invalidateQueries({ queryKey: ['portal-order', id] })
      setInitialized(false)
      router.push('/portal/orders')
    } catch { alert('Error submitting order') }
    setSaving(false)
  }

  const filteredProducts = (products as any[]).filter((p: any) =>
    !productSearch ||
    p.full_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.brand?.toLowerCase().includes(productSearch.toLowerCase())
  )

  if (!order) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  const isDraft    = order.status === 'draft'
  const isRejected = order.status === 'rejected'

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/portal/orders" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {isDraft ? 'Continue Order' : 'Edit & Resubmit'} — {order.order_number}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {customer?.legal_name} · {customer?.assigned_price_list} price list · {customer?.currency}
          </p>
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <button onClick={handleSaveDraft} disabled={savingDraft}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              <Save className="h-4 w-4" />
              {savingDraft ? 'Saving...' : 'Save draft'}
            </button>
          )}
          <button onClick={handleSubmit}
            disabled={saving || !hasLines}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            <ShoppingCart className="h-4 w-4" />
            {saving ? 'Submitting...' : isDraft ? 'Submit Order' : 'Resubmit Order'}
          </button>
        </div>
      </div>

      {isRejected && order.rejection_comment && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-800 mb-1">Rejected — reason from DH Signature:</p>
          <p className="text-sm text-red-700">{order.rejection_comment}</p>
        </div>
      )}

      {hasStockWarning && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">Some quantities exceed current stock. Your order will be flagged for review.</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-900">Order Details</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Currency',      value: customer?.currency },
                { label: 'Incoterms',     value: customer?.incoterms },
                { label: 'Payment terms', value: customer?.payment_terms },
                { label: 'Price list',    value: customer?.assigned_price_list },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-medium text-gray-900">{value ?? '—'}</span>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
          </div>

          {lines.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 text-white">
              <h3 className="font-semibold mb-3">Summary</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Packs</span><span>{totalPacks}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Units</span><span>{totalUnits.toLocaleString()}</span></div>
                <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>{customer?.currency} {Number(total).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">Add / Edit Products</h3>
            <input type="text" placeholder="Search products..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none mb-3" />
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {filteredProducts.map((p: any) => {
                const price = getPrice(p.sku)
                const stock = getStock(p.sku)
                const added = lines.some(l => l.sku === p.sku)
                return (
                  <button key={p.sku} onClick={() => addLine(p)} disabled={added}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-left gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.full_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {price > 0 && <span className="text-sm font-semibold text-gray-900">{Number(price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} {customer?.currency}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stock === 0 ? 'bg-red-100 text-red-600' : stock < 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                        {stock === 0 ? 'Out' : `${stock} pk`}
                      </span>
                      {added ? <span className="text-xs text-gray-400">Added</span> : <Plus className="h-4 w-4 text-gray-400" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {lines.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Packs</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Units</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Price/Unit</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Total</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Stock</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, idx) => {
                    const overStock = line.quantity_packs > line.stock_available && line.quantity_packs > 0
                    return (
                      <tr key={line.sku} className={overStock ? 'bg-amber-50' : ''}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{line.product_name}</p>
                          <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input type="number" min={0} value={line.quantity_packs || ''}
                            onChange={e => updateLine(idx, parseInt(e.target.value) || 0)}
                            className={`w-20 h-8 rounded border px-2 text-center text-sm ${overStock ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`} />
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600">{line.quantity_units}</td>
                        <td className="px-3 py-3 text-right text-gray-600">{Number(line.price_per_unit).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td className="px-3 py-3 text-right font-semibold text-gray-900">{Number(line.line_total).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td className="px-3 py-3 text-center">
                          {overStock ? (
                            <span className="text-xs text-amber-600 flex items-center justify-center gap-1">
                              <AlertTriangle className="h-3 w-3" />{line.stock_available}pk
                            </span>
                          ) : (
                            <span className="text-xs text-green-600">{line.stock_available} pk</span>
                          )}
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
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right font-semibold text-gray-900">Total</td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900">{customer?.currency} {Number(total).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}