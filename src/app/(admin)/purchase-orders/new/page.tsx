'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Save, Plus, Trash2, Package, Wrench, Box } from 'lucide-react'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'

const CURRENCIES = ['USD', 'EUR', 'GBP']
type POType = 'cigars' | 'services' | 'goods'

interface Line {
  sku: string
  description: string
  quantity: number
  unit_price: number
}

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const supabase = createClient()

  const [poType, setPoType] = useState<POType | null>(null)
  const [partnerId, setPartnerId]               = useState('')
  const [partnerName, setPartnerName]           = useState('')
  const [currency, setCurrency]                 = useState('USD')
  const [orderDate, setOrderDate]               = useState(() => new Date().toISOString().split('T')[0])
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [deliveryTba, setDeliveryTba]           = useState(false)
  const [notes, setNotes]                       = useState('')
  const [saving, setSaving]                     = useState(false)
  const [lines, setLines]                       = useState<Line[]>([{ sku: '', description: '', quantity: 0, unit_price: 0 }])
  const [productSearch, setProductSearch]       = useState('')

  const { data: partners } = useQuery({
    queryKey: ['partners_active'],
    queryFn: async () => {
      const { data } = await supabase.from('partners').select('id, name, category, currency').eq('status', 'active').order('name')
      return data ?? []
    }
  })

  const { data: products } = useQuery({
    queryKey: ['products_po'],
    enabled: poType === 'cigars',
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, sku, full_name, brand').order('full_name')
      return data ?? []
    }
  })

  const filteredPartners = (partners ?? []).filter((p: any) => !poType || !p.category || p.category === poType)
  const filteredProducts = (products ?? []).filter((p: any) =>
    !productSearch ||
    p.full_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const addLine = () => setLines(l => [...l, { sku: '', description: '', quantity: 0, unit_price: 0 }])
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof Line, value: any) =>
    setLines(l => l.map((ln, idx) => idx === i ? { ...ln, [field]: value } : ln))

  const addProductLine = (product: any) => {
    setLines(l => [...l, { sku: product.sku ?? '', description: product.full_name ?? '', quantity: 0, unit_price: 0 }])
    setProductSearch('')
  }

  const totalAmount = poType !== 'cigars' ? lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0) : 0

  const handleSave = async (status: 'draft' | 'sent') => {
    if (!poType) return
    if (!partnerName.trim()) { alert('Partner is required'); return }
    if (lines.length === 0 || lines.every(l => !l.description.trim())) { alert('Add at least one line item'); return }
    setSaving(true)

    const { data: poNumberData } = await supabase.rpc('fn_generate_po_number', { p_type: poType })

    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        po_number: poNumberData,
        po_type: poType,
        partner_id: partnerId || null,
        partner_name: partnerName,
        status,
        currency,
        total_amount: totalAmount,
        order_date: orderDate,
        expected_delivery: deliveryTba ? null : (expectedDelivery || null),
        delivery_tba: deliveryTba,
        notes: notes || null,
      })
      .select().single()

    if (poError) { alert('Error: ' + poError.message); setSaving(false); return }

    const linesPayload = lines
      .filter(l => l.description.trim())
      .map(l => ({
        po_id: po.id,
        sku: l.sku || null,
        description: l.description,
        quantity: l.quantity,
        unit_price: poType !== 'cigars' ? l.unit_price : null,
        line_total: poType !== 'cigars' ? l.quantity * l.unit_price : null,
      }))

    const { error: linesError } = await supabase.from('purchase_order_lines').insert(linesPayload)
    setSaving(false)
    if (linesError) { alert('Error saving lines: ' + linesError.message); return }
    await logActivity({
      action: 'create_purchase_order',
      entityType: 'purchase_order',
      entityId: po.id,
      entityRef: po.po_number,
      metadata: { type: poType, partner: partnerName, status },
    })
    router.push('/purchase-orders')
  }

  // ── Step 1: Choose type ──────────────────────────────────────────────
  if (!poType) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/purchase-orders" className="text-gray-400 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
        </div>
        <p className="text-gray-500 mb-6">Select the type of purchase order to create:</p>
        <div className="grid grid-cols-3 gap-4">
          {([
            { type: 'cigars',   label: 'Cigars',   icon: Package, desc: 'Order cigars from a supplier',  color: 'hover:border-amber-400 hover:bg-amber-50' },
            { type: 'services', label: 'Services', icon: Wrench,  desc: 'Service or consulting fees',    color: 'hover:border-blue-400 hover:bg-blue-50' },
            { type: 'goods',    label: 'Goods',    icon: Box,     desc: 'Non-cigar goods & supplies',    color: 'hover:border-green-400 hover:bg-green-50' },
          ] as const).map(({ type, label, icon: Icon, desc, color }) => (
            <button key={type} onClick={() => setPoType(type)}
              className={`p-6 bg-white border-2 border-gray-200 rounded-xl text-left transition-all ${color}`}>
              <Icon className="h-8 w-8 text-gray-400 mb-3" />
              <div className="font-semibold text-gray-900">{label}</div>
              <div className="text-xs text-gray-500 mt-1">{desc}</div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Step 2: Form ─────────────────────────────────────────────────────
  const TypeIcon = { cigars: Package, services: Wrench, goods: Box }[poType]

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setPoType(null)} className="text-gray-400 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600 capitalize">
              <TypeIcon className="h-3.5 w-3.5" />{poType}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">PO number will be assigned on save</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleSave('draft')} disabled={saving}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Save Draft
          </button>
          <button onClick={() => handleSave('sent')} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save & Send'}
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Order Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Partner *</label>
              <select value={partnerId} onChange={e => {
                const p = (partners ?? []).find((x: any) => x.id === e.target.value) as any
                setPartnerId(e.target.value)
                setPartnerName(p?.name ?? '')
                if (p?.currency) setCurrency(p.currency)
              }} className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">Select partner...</option>
                {filteredPartners.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {!partnerId && (
                <input value={partnerName} onChange={e => setPartnerName(e.target.value)}
                  placeholder="Or type partner name manually..."
                  className="mt-2 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-gray-600 placeholder-gray-300" />
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Order Date</label>
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Expected Delivery</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="date" value={deliveryTba ? '' : expectedDelivery} disabled={deliveryTba}
                  onChange={e => setExpectedDelivery(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
                <label className="flex items-center gap-1.5 text-sm text-gray-500 cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={deliveryTba} onChange={e => setDeliveryTba(e.target.checked)} className="rounded" />
                  TBA
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Line Items</h2>
              {poType === 'cigars' && (
                <p className="text-xs text-gray-400 mt-0.5">Unit prices will be captured upon receipt of supplier invoice</p>
              )}
            </div>
            <button onClick={addLine}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" /> Add line
            </button>
          </div>

          {/* Product search — cigars only */}
          {poType === 'cigars' && (
            <div className="mb-4">
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                placeholder="Search products to add (SKU, name, brand)..."
                className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              {productSearch && filteredProducts.length > 0 && (
                <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {filteredProducts.slice(0, 10).map((p: any) => (
                    <button key={p.id} onClick={() => addProductLine(p)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                      <span className="text-gray-900">{p.full_name}</span>
                      <span className="font-mono text-xs text-gray-400">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
              {productSearch && filteredProducts.length === 0 && (
                <p className="text-xs text-gray-400 mt-1 px-1">No products found — you can add a free-text line below.</p>
              )}
            </div>
          )}

          {/* Lines table */}
          <div className="space-y-2">
            <div className={`grid gap-2 text-xs font-medium text-gray-400 uppercase px-2 ${
              poType === 'cigars'
                ? 'grid-cols-[80px_1fr_80px_32px]'
                : 'grid-cols-[1fr_80px_100px_80px_32px]'
            }`}>
              {poType === 'cigars' && <span>SKU</span>}
              <span>Description</span>
              <span className="text-right">Qty</span>
              {poType !== 'cigars' && <span className="text-right">Unit Price</span>}
              {poType !== 'cigars' && <span className="text-right">Total</span>}
              <span />
            </div>

            {lines.map((line, i) => (
              <div key={i} className={`grid gap-2 items-center ${
                poType === 'cigars'
                  ? 'grid-cols-[80px_1fr_80px_32px]'
                  : 'grid-cols-[1fr_80px_100px_80px_32px]'
              }`}>
                {poType === 'cigars' && (
                  <input value={line.sku} onChange={e => updateLine(i, 'sku', e.target.value)}
                    placeholder="SKU"
                    className="h-8 rounded border border-gray-200 px-2 text-sm font-mono focus:outline-none" />
                )}
                <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)}
                  placeholder="Description"
                  className="h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                <input
                  type="number" min="1"
                  value={line.quantity === 0 ? '' : line.quantity}
                  onChange={e => updateLine(i, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  className="h-8 rounded border border-gray-200 px-2 text-sm text-right focus:outline-none" />
                {poType !== 'cigars' && (
                  <input
                    type="number" min="0" step="0.01"
                    value={line.unit_price === 0 ? '' : line.unit_price}
                    onChange={e => updateLine(i, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    className="h-8 rounded border border-gray-200 px-2 text-sm text-right focus:outline-none" />
                )}
                {poType !== 'cigars' && (
                  <div className="text-sm font-medium text-gray-700 text-right">
                    {(line.quantity * line.unit_price).toFixed(2)}
                  </div>
                )}
                <button onClick={() => removeLine(i)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Total — services/goods only */}
          {poType !== 'cigars' && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase">Total</div>
                <div className="text-xl font-bold text-gray-900 mt-0.5">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(totalAmount)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Notes</h2>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Internal notes, delivery instructions..."
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
        </div>
      </div>
    </div>
  )
}