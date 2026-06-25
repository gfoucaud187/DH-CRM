'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Trash2, Plus, Package, Wrench, Box } from 'lucide-react'
import Link from 'next/link'

const CURRENCIES = ['USD', 'EUR', 'GBP']

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
  const [lines, setLines]                       = useState<Line[]>([])
  const [saving, setSaving]                     = useState(false)

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

  useEffect(() => {
    if (!po) return
    setCurrency(po.currency ?? 'USD')
    setOrderDate(po.order_date ?? '')
    setExpectedDelivery(po.expected_delivery ?? '')
    setDeliveryTba(po.delivery_tba ?? false)
    setNotes(po.notes ?? '')
    setLines((po.purchase_order_lines ?? []).map((l: any) => ({
      id: l.id,
      sku: l.sku ?? '',
      description: l.description ?? '',
      quantity: l.quantity ?? 1,
      unit_price: l.unit_price ?? 0,
    })))
  }, [po])

  const addLine = () => setLines(l => [...l, { sku: '', description: '', quantity: 1, unit_price: 0 }])
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof Line, value: any) =>
    setLines(l => l.map((ln, idx) => idx === i ? { ...ln, [field]: value } : ln))

  const totalAmount = lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0)

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
    }).eq('id', id as string)

    // Delete existing lines and re-insert
    await supabase.from('purchase_order_lines').delete().eq('po_id', id as string)
    const linesPayload = lines
      .filter(l => l.description.trim())
      .map(l => ({
        po_id: id,
        sku: l.sku || null,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total: l.quantity * l.unit_price,
      }))
    await supabase.from('purchase_order_lines').insert(linesPayload)

    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
    queryClient.invalidateQueries({ queryKey: ['purchase_order', id] })
    setSaving(false)
  }

  const handleStatusChange = async (newStatus: string) => {
    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', id as string)
    queryClient.invalidateQueries({ queryKey: ['purchase_order', id] })
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
  }

  const handleDelete = async () => {
    if (!confirm('Delete this purchase order?')) return
    await supabase.from('purchase_orders').delete().eq('id', id as string)
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
    router.push('/purchase-orders')
  }

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!po) return <div className="text-center py-20 text-gray-400">Not found.</div>

  const TypeIcon = { cigars: Package, services: Wrench, goods: Box }[po.po_type as string] ?? Package

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/purchase-orders" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
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
                <button
                  onClick={() => handleStatusChange(s)}
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
            <button
              onClick={() => handleStatusChange('cancelled')}
              className={`ml-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors ${
                po.status === 'cancelled'
                  ? 'bg-red-600 text-white'
                  : 'border border-red-200 text-red-400 hover:bg-red-50'
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
                <input type="date" value={deliveryTba ? '' : expectedDelivery}
                  disabled={deliveryTba}
                  onChange={e => setExpectedDelivery(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
                <label className="flex items-center gap-1 text-sm text-gray-500 cursor-pointer">
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
            <h2 className="font-semibold text-gray-900">Line Items</h2>
            <button onClick={addLine}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" /> Add line
            </button>
          </div>

          <div className="space-y-2">
            <div className={`grid gap-2 text-xs font-medium text-gray-400 uppercase px-2 ${po.po_type === 'cigars' ? 'grid-cols-[80px_1fr_80px_100px_80px_32px]' : 'grid-cols-[1fr_80px_100px_80px_32px]'}`}>
              {po.po_type === 'cigars' && <span>SKU</span>}
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit Price</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {lines.map((line, i) => (
              <div key={i} className={`grid gap-2 items-center ${po.po_type === 'cigars' ? 'grid-cols-[80px_1fr_80px_100px_80px_32px]' : 'grid-cols-[1fr_80px_100px_80px_32px]'}`}>
                {po.po_type === 'cigars' && (
                  <input value={line.sku} onChange={e => updateLine(i, 'sku', e.target.value)}
                    className="h-8 rounded border border-gray-200 px-2 text-sm font-mono focus:outline-none" />
                )}
                <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)}
                  className="h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                <input type="number" min="1" value={line.quantity} onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)}
                  className="h-8 rounded border border-gray-200 px-2 text-sm text-right focus:outline-none" />
                <input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)}
                  className="h-8 rounded border border-gray-200 px-2 text-sm text-right focus:outline-none" />
                <div className="text-sm font-medium text-gray-700 text-right">
                  {(line.quantity * line.unit_price).toFixed(2)}
                </div>
                <button onClick={() => removeLine(i)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase">Total</div>
              <div className="text-xl font-bold text-gray-900 mt-0.5">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(totalAmount)}
              </div>
            </div>
          </div>
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