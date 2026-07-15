'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Trash2, Plus, Package, Wrench, Box } from 'lucide-react'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'
import { warehouseLabel } from '@/lib/warehouse'
import StockInboundPDF from '@/components/pdf/StockInboundPDF'
import SupplierPOPDF from '@/components/pdf/SupplierPOPDF'

const CURRENCIES = ['USD', 'EUR', 'GBP']
const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']
const STATUS_FLOW = ['draft', 'sent', 'confirmed', 'received', 'cancelled']
const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  confirmed: 'bg-yellow-100 text-yellow-700',
  received:  'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
}

interface Line {
  id?: string
  sku: string
  description: string
  quantity: number
  unit_price: number
  received_unit_price: number | null
}

export default function PurchaseOrderDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [currency, setCurrency]                 = useState('USD')
  const [orderDate, setOrderDate]               = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [deliveryTba, setDeliveryTba]           = useState(false)
  const [notes, setNotes]                       = useState('')
  const [warehouse, setWarehouse]               = useState('T1')
  const [lines, setLines]                       = useState<Line[]>([])
  const [saving, setSaving]                     = useState(false)
  const [ocrFile, setOcrFile]                   = useState<File | null>(null)
  const [ocrLoading, setOcrLoading]             = useState(false)
  const [ocrError, setOcrError]                 = useState('')

  const { data: po, isLoading } = useQuery({
    queryKey: ['purchase_order', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('purchase_orders')
        .select('*, purchase_order_lines(*)')
        .eq('id', id)
        .single()
      return data
    }
  })

  const { data: partner } = useQuery({
    queryKey: ['po-partner', po?.partner_id],
    queryFn: async () => {
      const { data } = await supabase.from('partners').select('*').eq('id', po.partner_id).single()
      return data
    },
    enabled: !!po?.partner_id
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-po-ocr'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name')
        .in('product_role', ['original', 'aged']).eq('status', 'active')
      return data ?? []
    }
  })

  useEffect(() => {
    if (!po) return
    setCurrency(po.currency ?? 'USD')
    setOrderDate(po.order_date ?? '')
    setExpectedDelivery(po.expected_delivery ?? '')
    setDeliveryTba(po.delivery_tba ?? false)
    setNotes(po.notes ?? '')
    setWarehouse(po.warehouse ?? 'T1')
    setLines((po.purchase_order_lines ?? []).map((l: any) => ({
      id: l.id,
      sku: l.sku ?? '',
      description: l.description ?? '',
      quantity: l.quantity ?? 1,
      unit_price: l.unit_price ?? 0,
      received_unit_price: l.received_unit_price ?? null,
    })))
  }, [po])

  const addLine = () => setLines(l => [...l, { sku: '', description: '', quantity: 0, unit_price: 0, received_unit_price: null }])
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof Line, value: any) =>
    setLines(l => l.map((ln, idx) => idx === i ? { ...ln, [field]: value } : ln))

  // Best-effort match against our catalogue — the user still reviews/corrects every line before saving
  const guessSku = (skuGuess: string | null, description: string) => {
    const candidates = products as any[]
    if (skuGuess) {
      const exact = candidates.find(p => p.sku.toLowerCase() === skuGuess.toLowerCase())
      if (exact) return exact.sku
    }
    const desc = (description || '').toLowerCase()
    const byName = candidates.find(p => desc.includes(p.full_name.toLowerCase()) || p.full_name.toLowerCase().includes(desc))
    return byName?.sku ?? (skuGuess ?? '')
  }

  const handleOcrExtract = async () => {
    if (!ocrFile) return
    setOcrLoading(true)
    setOcrError('')
    try {
      const formData = new FormData()
      formData.append('file', ocrFile)
      const res = await fetch('/api/purchase_orders/ocr', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setOcrError(data.error ?? 'Extraction failed'); setOcrLoading(false); return }

      const extracted: Line[] = (data.lines ?? []).map((l: any) => ({
        sku: guessSku(l.sku_guess, l.description ?? ''),
        description: l.description ?? l.sku_guess ?? '',
        quantity: Number(l.quantity) || 0,
        unit_price: 0,
        received_unit_price: l.unit_price != null ? Number(l.unit_price) : null,
      }))
      setLines(prev => [...prev, ...extracted])
      setOcrFile(null)
    } catch (err: any) {
      setOcrError(err.message)
    } finally {
      setOcrLoading(false)
    }
  }

  const isCigars = po?.po_type === 'cigars'
  const isReceived = po?.status === 'received'

  const totalAmount = isCigars
    ? lines.reduce((s, l) => s + (l.quantity * (l.received_unit_price ?? 0)), 0)
    : lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0)

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('purchase_orders').update({
      currency,
      order_date: orderDate,
      expected_delivery: deliveryTba ? null : (expectedDelivery || null),
      delivery_tba: deliveryTba,
      notes: notes || null,
      total_amount: totalAmount,
      updated_at: new Date().toISOString(),
      ...(isCigars && !isReceived ? { warehouse } : {}),
    }).eq('id', id as string)

    await supabase.from('purchase_order_lines').delete().eq('po_id', id as string)
    const linesPayload = lines
      .filter(l => l.description.trim())
      .map(l => ({
        po_id: id,
        sku: l.sku || null,
        description: l.description,
        quantity: l.quantity,
        unit_price: isCigars ? null : l.unit_price,
        line_total: isCigars
          ? (l.received_unit_price != null ? l.quantity * l.received_unit_price : null)
          : l.quantity * l.unit_price,
        received_unit_price: l.received_unit_price,
        received_total: l.received_unit_price != null ? l.quantity * l.received_unit_price : null,
      }))
    await supabase.from('purchase_order_lines').insert(linesPayload)

    await logActivity({
      action: 'update_purchase_order',
      entityType: 'purchase_order',
      entityId: id as string,
      entityRef: po?.po_number,
      metadata: { type: po?.po_type, partner: po?.partner_name },
    })
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
    queryClient.invalidateQueries({ queryKey: ['purchase_order', id] })
    setSaving(false)
  }

  const handleStatusChange = async (newStatus: string) => {
    const oldStatus = po?.status
    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', id as string)
    await logActivity({
      action: 'update_purchase_order_status',
      entityType: 'purchase_order',
      entityId: id as string,
      entityRef: po?.po_number,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
    })
    queryClient.invalidateQueries({ queryKey: ['purchase_order', id] })
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
  }

  const handleDelete = async () => {
    if (!confirm('Delete this purchase order?')) return
    await logActivity({
      action: 'delete_purchase_order',
      entityType: 'purchase_order',
      entityId: id as string,
      entityRef: po?.po_number,
      metadata: { type: po?.po_type, partner: po?.partner_name },
    })
    await supabase.from('purchase_orders').delete().eq('id', id as string)
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
    router.push('/purchase_orders')
  }

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!po) return <div className="text-center py-20 text-gray-400">Not found.</div>

  const TypeIcon = { cigars: Package, services: Wrench, goods: Box }[po.po_type as string] ?? Package

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/purchase_orders" className="text-gray-400 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{po.po_number}</h1>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-100 rounded-full text-xs font-medium text-gray-600 capitalize">
              <TypeIcon className="h-3.5 w-3.5" />{po.po_type}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[po.status]}`}>
              {po.status}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{po.partner_name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDelete}
            className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="space-y-5">

        {/* Status stepper */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Status</h2>
          <div className="flex items-center gap-1">
            {STATUS_FLOW.filter(s => s !== 'cancelled').map((s, i, arr) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <button onClick={() => handleStatusChange(s)}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors text-center ${
                    po.status === s
                      ? 'bg-gray-900 text-white'
                      : STATUS_FLOW.indexOf(po.status) > STATUS_FLOW.indexOf(s)
                        ? 'bg-gray-100 text-gray-500'
                        : 'border border-gray-200 text-gray-400 hover:bg-gray-50'
                  }`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
                {i < arr.length - 1 && <div className="w-4 h-px bg-gray-200 flex-shrink-0" />}
              </div>
            ))}
            <button onClick={() => handleStatusChange('cancelled')}
              className={`ml-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                po.status === 'cancelled' ? 'bg-red-600 text-white' : 'border border-red-200 text-red-400 hover:bg-red-50'
              }`}>
              Cancel
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Order Details</h2>
          <div className="grid grid-cols-3 gap-4">
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
                <label className="flex items-center gap-1 text-sm text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={deliveryTba} onChange={e => setDeliveryTba(e.target.checked)} className="rounded" />
                  TBA
                </label>
              </div>
            </div>
            {isCigars && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Receiving Warehouse</label>
                <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
                  disabled={isReceived}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400">
                  {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Document</h2>
          <p className="text-xs text-gray-500 mb-3">Generates a PDF showing DH Signature as buyer and {po.partner_name} as supplier.</p>
          <SupplierPOPDF po={po} lines={lines} partner={partner} />
        </div>

        {isCigars && isReceived && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Stock Inbound Document</h2>
            <p className="text-xs text-gray-500 mb-3">
              Stock was credited to {warehouseLabel(po.warehouse)} and logged in Stock Movements. Generate the receipt document below.
            </p>
            <StockInboundPDF po={po} lines={po.purchase_order_lines ?? []} />
          </div>
        )}

        {isCigars && !isReceived && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Extract Lines from Supplier Document</h2>
            <p className="text-xs text-gray-500 mb-3">
              Upload the supplier's invoice or packing list (PDF or photo) — lines are extracted for you to review, correct, and add below before saving.
            </p>
            <div className="flex items-center gap-2">
              <input type="file" accept="application/pdf,image/*"
                onChange={e => setOcrFile(e.target.files?.[0] ?? null)}
                className="flex-1 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 file:text-sm" />
              <button onClick={handleOcrExtract} disabled={!ocrFile || ocrLoading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                {ocrLoading ? 'Extracting...' : 'Extract Lines'}
              </button>
            </div>
            {ocrError && <p className="text-xs text-red-500 mt-2">{ocrError}</p>}
          </div>
        )}

        {/* Lines */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Line Items</h2>
              {isCigars && !isReceived && (
                <p className="text-xs text-gray-400 mt-0.5">Unit prices will be captured upon receipt of supplier invoice</p>
              )}
              {isCigars && isReceived && (
                <p className="text-xs text-amber-600 mt-0.5">Enter received unit prices from supplier invoice</p>
              )}
            </div>
            <button onClick={addLine}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" /> Add line
            </button>
          </div>

          <div className="space-y-2">
            <div className={`grid gap-2 text-xs font-medium text-gray-400 uppercase px-2 ${
              isCigars
                ? isReceived
                  ? 'grid-cols-[80px_1fr_80px_110px_80px_32px]'
                  : 'grid-cols-[80px_1fr_80px_32px]'
                : 'grid-cols-[1fr_80px_100px_80px_32px]'
            }`}>
              {isCigars && <span>SKU</span>}
              <span>Description</span>
              <span className="text-right">Qty</span>
              {!isCigars && <span className="text-right">Unit Price</span>}
              {isCigars && isReceived && <span className="text-right">Received Price</span>}
              {(isCigars && isReceived) || !isCigars ? <span className="text-right">Total</span> : null}
              <span />
            </div>

            {lines.map((line, i) => (
              <div key={i} className={`grid gap-2 items-center ${
                isCigars
                  ? isReceived
                    ? 'grid-cols-[80px_1fr_80px_110px_80px_32px]'
                    : 'grid-cols-[80px_1fr_80px_32px]'
                  : 'grid-cols-[1fr_80px_100px_80px_32px]'
              }`}>
                {isCigars && (
                  <input value={line.sku} onChange={e => updateLine(i, 'sku', e.target.value)}
                    className="h-8 rounded border border-gray-200 px-2 text-sm font-mono focus:outline-none" />
                )}
                <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)}
                  className="h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                <input
                  type="number" min="1"
                  value={line.quantity === 0 ? '' : line.quantity}
                  onChange={e => updateLine(i, 'quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                  className="h-8 rounded border border-gray-200 px-2 text-sm text-right focus:outline-none" />
                {!isCigars && (
                  <input
                    type="number" min="0" step="0.01"
                    value={line.unit_price === 0 ? '' : line.unit_price}
                    onChange={e => updateLine(i, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                    className="h-8 rounded border border-gray-200 px-2 text-sm text-right focus:outline-none" />
                )}
                {isCigars && isReceived && (
                  <input
                    type="number" min="0" step="0.01"
                    value={line.received_unit_price === null || line.received_unit_price === 0 ? '' : line.received_unit_price}
                    onChange={e => updateLine(i, 'received_unit_price', e.target.value === '' ? null : parseFloat(e.target.value))}
                    placeholder="0.00"
                    className="h-8 rounded border border-amber-200 bg-amber-50 px-2 text-sm text-right focus:outline-none focus:border-amber-400" />
                )}
                {(isCigars && isReceived) || !isCigars ? (
                  <div className="text-sm font-medium text-gray-700 text-right">
                    {isCigars
                      ? (line.received_unit_price != null ? (line.quantity * line.received_unit_price).toFixed(2) : '—')
                      : (line.quantity * line.unit_price).toFixed(2)
                    }
                  </div>
                ) : null}
                <button onClick={() => removeLine(i)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Total */}
          {(!isCigars || isReceived) && (
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
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
        </div>

      </div>
    </div>
  )
}