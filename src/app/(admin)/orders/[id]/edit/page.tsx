'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Trash2, Plus, ArrowRight } from 'lucide-react'
import { warehouseLabel } from '@/lib/warehouse'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']

const SERVICE_TYPES = [
  { value: 'consulting',     label: 'Consulting Services' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'marketing',      label: 'Marketing Services' },
  { value: 'other',          label: 'Other' },
]

interface OrderService {
  service_type: string
  description: string
  price: string
}

interface OrderLine {
  sku: string
  product_name: string
  brand: string
  units_per_pack: number
  quantity_packs: number
  quantity_units: number
  price_per_unit: number
  line_total: number
  line_type: string
  fixmer_reference?: string | null
  diff_price_per_unit?: number | null
  warehouse: string
}

export default function EditOrderPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [warehouse, setWarehouse] = useState('')
  const [warehouseDestination, setWarehouseDestination] = useState('')
  const [incoterms, setIncoterms] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [shipmentDate, setShipmentDate] = useState('')
  const [orderReceivedDate, setOrderReceivedDate] = useState('')
  const [clientReceivedDate, setClientReceivedDate] = useState('')
  const [paymentTermsDays, setPaymentTermsDays] = useState('')
  const [lines, setLines] = useState<OrderLine[]>([])
  const [services, setServices] = useState<OrderService[]>([])
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState('')

  const { data: order, isLoading } = useQuery({
    queryKey: ['order-edit', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*), services:sales_order_services(*)')
        .eq('id', id)
        .single()
      return data
    }
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-edit'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name, brand, units_per_pack, fixmer_reference')
        .in('product_role', ['original', 'aged']).eq('status', 'active')
        .order('brand').limit(500)
      return data ?? []
    }
  })

  const { data: priceEntries = [] } = useQuery({
    queryKey: ['price-entries-edit'],
    queryFn: async () => {
      const { data } = await supabase
        .from('price_list_entries')
        .select('sku, price_list, price_per_unit').limit(1000)
      return data ?? []
    }
  })

  const { data: customer } = useQuery({
    queryKey: ['order-customer', order?.customer_id],
    queryFn: async () => {
      const { data } = await supabase.from('customers')
        .select('manual_pricing_enabled, reference_price_list').eq('id', order.customer_id).single()
      return data
    },
    enabled: !!order?.customer_id,
  })

  const { data: negotiatedPrices = [] } = useQuery({
    queryKey: ['negotiated-prices-order', order?.customer_id],
    queryFn: async () => {
      const { data } = await supabase.from('customer_negotiated_prices')
        .select('sku, price_per_unit').eq('customer_id', order.customer_id)
      return data ?? []
    },
    enabled: !!order?.customer_id,
  })

  useEffect(() => {
    if (order) {
      setWarehouse(order.warehouse ?? 'T1')
      setWarehouseDestination(order.warehouse_destination ?? 'Central')
      setIncoterms(order.incoterms ?? '')
      setPaymentTerms(order.payment_terms ?? '')
      setNotes(order.notes ?? '')
      setShipmentDate(order.shipment_date ?? '')
      setOrderReceivedDate(order.order_received_date ?? '')
      setClientReceivedDate(order.client_received_date ?? '')
      // Best-effort default from the free-text payment terms (e.g. "Net 30") if not already set —
      // that field isn't a controlled vocabulary, so this is just a starting point to adjust.
      const parsedDays = order.payment_terms?.match(/\d+/)?.[0]
      setPaymentTermsDays(order.payment_terms_days != null ? String(order.payment_terms_days) : (parsedDays ?? ''))
      setLines(
        (order.lines ?? []).map((l: any) => ({
          sku: l.sku, product_name: l.product_name, brand: l.brand,
          units_per_pack: l.units_per_pack ?? 1,
          quantity_packs: l.quantity_packs, quantity_units: l.quantity_units,
          price_per_unit: l.price_per_unit, line_total: l.line_total,
          line_type: l.line_type, fixmer_reference: l.fixmer_reference ?? null,
          diff_price_per_unit: l.diff_price_per_unit ?? null,
          warehouse: l.warehouse ?? order.warehouse,
        }))
      )
      setServices(
        (order.services ?? []).map((s: any) => ({
          service_type: s.service_type, description: s.description, price: String(s.price),
        }))
      )
    }
  }, [order])

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!order) return <div className="text-center py-12 text-gray-400">Order not found</div>
  if (order.status !== 'draft') return (
    <div className="text-center py-12">
      <p className="text-gray-500 mb-4">Only draft orders can be edited</p>
      <Link href={'/orders/' + id} className="text-gray-900 underline">Back to order</Link>
    </div>
  )

  const isInt = order.document_type === 'so_int'

  const getPrice = (sku: string) => {
    if (order.is_foc || order.is_sample || isInt) return 0
    if (customer?.manual_pricing_enabled) {
      const negotiated = (negotiatedPrices as any[]).find((n: any) => n.sku === sku)
      if (negotiated) return Number(negotiated.price_per_unit)
    }
    const entry = (priceEntries as any[]).find(
      (e: any) => e.sku === sku && e.price_list === order.price_list
    )
    return entry?.price_per_unit ?? 0
  }

  // Frozen at line-creation time — see orders/new/page.tsx for the rationale
  const getFrozenGap = (sku: string): number | null => {
    if (order.is_foc || order.is_sample || isInt) return null
    if (!customer?.manual_pricing_enabled || !customer.reference_price_list) return null
    const negotiated = (negotiatedPrices as any[]).find((n: any) => n.sku === sku)
    if (!negotiated) return null
    const referenceEntry = (priceEntries as any[]).find((e: any) => e.sku === sku && e.price_list === customer.reference_price_list)
    if (!referenceEntry) return null
    const gap = Number(referenceEntry.price_per_unit) - Number(negotiated.price_per_unit)
    return gap > 0.0001 ? gap : null
  }

  const addLine = (product: any) => {
    if (lines.some(l => l.sku === product.sku)) return
    setLines(l => [...l, {
      sku: product.sku, product_name: product.full_name, brand: product.brand,
      units_per_pack: product.units_per_pack ?? 1,
      quantity_packs: 0, quantity_units: 0,
      price_per_unit: getPrice(product.sku), line_total: 0,
      line_type: order.is_foc ? 'foc' : 'commercial',
      fixmer_reference: product.fixmer_reference ?? null,
      diff_price_per_unit: getFrozenGap(product.sku),
      warehouse: order.is_sample ? 'Sample' : warehouse,
    }])
  }

  const updateLine = (idx: number, packs: number) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const units = packs * l.units_per_pack
      return { ...l, quantity_packs: packs, quantity_units: units, line_total: units * l.price_per_unit }
    }))
  }

  const updateLineWarehouse = (idx: number, wh: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, warehouse: wh } : l))
  }

  const removeLine = (idx: number) => setLines(l => l.filter((_, i) => i !== idx))

  const addService = () => setServices(s => [...s, { service_type: 'consulting', description: 'Consulting Services', price: '' }])
  const removeService = (idx: number) => setServices(s => s.filter((_, i) => i !== idx))
  const updateService = (idx: number, field: keyof OrderService, value: string) => {
    setServices(s => s.map((sv, i) => {
      if (i !== idx) return sv
      if (field === 'service_type') {
        const label = SERVICE_TYPES.find(t => t.value === value)?.label ?? ''
        return { ...sv, service_type: value, description: value === 'other' ? '' : label }
      }
      return { ...sv, [field]: value }
    }))
  }
  const servicesTotal = services.reduce((s, sv) => s + (parseFloat(sv.price) || 0), 0)

  const handleSave = async () => {
    if (isInt && warehouse === warehouseDestination) {
      alert('FROM and TO warehouses must be different')
      return
    }
    setSaving(true)
    try {
      const totalUnits = lines.reduce((s, l) => s + l.quantity_units, 0)
      const totalPacks = lines.reduce((s, l) => s + l.quantity_packs, 0)
      const totalAmount = isInt ? 0 : lines.reduce((s, l) => s + l.line_total, 0) + servicesTotal

      await supabase.from('sales_orders').update({
        warehouse,
        warehouse_destination: isInt ? warehouseDestination : null,
        incoterms: isInt ? null : incoterms,
        payment_terms: isInt ? null : paymentTerms,
        payment_terms_days: isInt ? null : (paymentTermsDays ? parseInt(paymentTermsDays) : null),
        notes, shipment_date: shipmentDate || null,
        order_received_date: isInt ? null : (orderReceivedDate || null),
        client_received_date: isInt ? null : (clientReceivedDate || null),
        total_amount: totalAmount, total_units: totalUnits, total_packs: totalPacks,
      }).eq('id', id as string)

      await supabase.from('sales_order_lines').delete().eq('order_id', id as string)
      if (lines.length > 0) {
        await supabase.from('sales_order_lines').insert(
          lines.map(l => ({
            order_id: id, line_type: l.line_type,
            sku: l.sku, product_name: l.product_name, brand: l.brand,
            units_per_pack: l.units_per_pack, quantity_packs: l.quantity_packs,
            quantity_units: l.quantity_units, price_per_unit: l.price_per_unit,
            line_total: l.line_total, fixmer_reference: l.fixmer_reference ?? null,
            diff_price_per_unit: l.diff_price_per_unit ?? null,
            warehouse: l.warehouse ?? null,
          }))
        )
      }

      await supabase.from('sales_order_services').delete().eq('order_id', id as string)
      if (!isInt && services.length > 0) {
        await supabase.from('sales_order_services').insert(
          services.filter(s => s.description && parseFloat(s.price) > 0).map(s => ({
            order_id: id, service_type: s.service_type, description: s.description,
            price: parseFloat(s.price), currency: order.currency,
          }))
        )
      }

      // Sync linked invoice (non-INT only)
      if (!isInt) {
        const { data: promotedInvoice } = await supabase
          .from('sales_orders')
          .select('id, status, document_type')
          .eq('promoted_from', id as string)
          .eq('document_type', 'invoice')
          .eq('status', 'draft')
          .maybeSingle()

        if (promotedInvoice) {
          await supabase.from('sales_orders').update({
            total_amount: totalAmount, total_units: totalUnits, total_packs: totalPacks,
          }).eq('id', promotedInvoice.id)
          await supabase.from('sales_order_lines').delete().eq('order_id', promotedInvoice.id)
          if (lines.length > 0) {
            await supabase.from('sales_order_lines').insert(
              lines.map(l => ({
                order_id: promotedInvoice.id, line_type: l.line_type,
                sku: l.sku, product_name: l.product_name, brand: l.brand,
                units_per_pack: l.units_per_pack, quantity_packs: l.quantity_packs,
                quantity_units: l.quantity_units, price_per_unit: l.price_per_unit,
                line_total: l.line_total, fixmer_reference: l.fixmer_reference ?? null,
            diff_price_per_unit: l.diff_price_per_unit ?? null,
                warehouse: l.warehouse ?? null,
              }))
            )
          }
          await supabase.from('sales_order_services').delete().eq('order_id', promotedInvoice.id)
          if (services.length > 0) {
            await supabase.from('sales_order_services').insert(
              services.filter(s => s.description && parseFloat(s.price) > 0).map(s => ({
                order_id: promotedInvoice.id, service_type: s.service_type, description: s.description,
                price: parseFloat(s.price), currency: order.currency,
              }))
            )
          }
        }
      }


      await logActivity({
        action: 'update_order',
        entityType: 'order',
        entityId: id as string,
        entityRef: order.order_number,
        metadata: { type: order.document_type, customer: order.customer_name },
      })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      router.push('/orders/' + id)
    } catch {
      alert('Error saving order')
    }
    setSaving(false)
  }

  const total = lines.reduce((s, l) => s + l.line_total, 0)
  const totalPacks = lines.reduce((s, l) => s + l.quantity_packs, 0)
  const totalUnits = lines.reduce((s, l) => s + l.quantity_units, 0)

  const filteredProducts = (products as any[]).filter((p: any) =>
    !productSearch ||
    p.full_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const availableFrom = WAREHOUSES.filter(w => w !== warehouseDestination)
  const availableTo   = WAREHOUSES.filter(w => w !== warehouse)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href={'/orders/' + id} className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Edit {order.order_number}</h1>
          {isInt ? (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-semibold text-teal-700">{warehouseLabel(warehouse)}</span>
              <ArrowRight className="h-4 w-4 text-teal-500" />
              <span className="text-sm font-semibold text-teal-700">{warehouseLabel(warehouseDestination)}</span>
              <span className="text-gray-400 text-sm">· Internal Transfer</span>
            </div>
          ) : (
            <p className="text-gray-500 text-sm mt-0.5">{order.customer_name} · {order.is_foc ? 'FOC' : 'Draft'}</p>
          )}
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-900">{isInt ? 'Transfer Details' : 'Order Details'}</h2>

            {isInt ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">From Warehouse</label>
                  <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                    {availableFrom.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowRight className="h-5 w-5 text-teal-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">To Warehouse</label>
                  <select value={warehouseDestination} onChange={e => setWarehouseDestination(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                    {availableTo.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-center gap-3 py-2 bg-teal-50 rounded-lg">
                  <span className="px-3 py-1 bg-white border border-teal-200 rounded text-sm font-bold text-teal-800">{warehouseLabel(warehouse)}</span>
                  <ArrowRight className="h-4 w-4 text-teal-500" />
                  <span className="px-3 py-1 bg-white border border-teal-200 rounded text-sm font-bold text-teal-800">{warehouseLabel(warehouseDestination)}</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Warehouse</label>
                  <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
                    disabled={order.document_type === 'invoice' && !!order.promoted_from}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400">
                    {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Incoterms</label>
                  <select value={incoterms} onChange={e => setIncoterms(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                    {['EXW','FOB','CIF','DAP','DDP'].map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Payment Terms</label>
                  <input type="text" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Payment Terms (days)</label>
                  <input type="number" min="0" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)}
                    placeholder="e.g. 30"
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                  <p className="text-xs text-gray-400 mt-1">Payment is due this many days after the Shipment Date</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Order Received Date</label>
                  <input type="date" value={orderReceivedDate} onChange={e => setOrderReceivedDate(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Shipment Date</label>
                  <input type="date" value={shipmentDate} onChange={e => setShipmentDate(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Received by Client</label>
                  <input type="date" value={clientReceivedDate} onChange={e => setClientReceivedDate(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
          </div>

          {(lines.length > 0 || services.length > 0) && (
            <div className="bg-gray-900 rounded-xl p-4 text-white">
              <h3 className="font-semibold mb-2">Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Packs</span><span>{totalPacks}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Units</span><span>{totalUnits}</span></div>
                {servicesTotal > 0 && (
                  <div className="flex justify-between"><span className="text-gray-400">Services</span><span>{order.currency} {servicesTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
                )}
                <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  {isInt
                    ? <span className="text-teal-400">{warehouseLabel(warehouse)} → {warehouseLabel(warehouseDestination)}</span>
                    : <span>{order.is_foc || order.is_sample ? 'FOC' : order.currency + ' ' + Number(total + servicesTotal).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  }
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="col-span-2 space-y-4">
          {!isInt && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">Additional Services</h3>
                <button onClick={addService}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  <Plus className="h-4 w-4" /> Add Service
                </button>
              </div>
              {services.length === 0 ? (
                <p className="text-sm text-gray-400">No additional services</p>
              ) : (
                <div className="space-y-2">
                  {services.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <select value={s.service_type} onChange={e => updateService(i, 'service_type', e.target.value)}
                        className="h-9 rounded-md border border-gray-200 px-2 text-sm w-44">
                        {SERVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <input value={s.description} onChange={e => updateService(i, 'description', e.target.value)}
                        placeholder="Description"
                        className="flex-1 min-w-40 h-9 rounded-md border border-gray-200 px-2 text-sm focus:outline-none" />
                      <input type="number" step="0.01" min="0" value={s.price} onChange={e => updateService(i, 'price', e.target.value)}
                        placeholder="Price"
                        className="w-28 h-9 rounded-md border border-gray-200 px-2 text-right text-sm focus:outline-none" />
                      <button onClick={() => removeService(i)} className="p-2 text-gray-300 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">
              {isInt ? 'Products to transfer' : 'Add Product'}
            </h3>
            <input type="text" placeholder="Search products..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none mb-3" />
            <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {filteredProducts.map((p: any) => {
                const added = lines.some(l => l.sku === p.sku)
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
          </div>

          {lines.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Product</th>
                    {!isInt && !order.is_sample && (
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Warehouse</th>
                    )}
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Packs</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">Units</th>
                    {!order.is_foc && !order.is_sample && !isInt && (
                      <>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Price/Unit</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
                      </>
                    )}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, idx) => (
                    <tr key={line.sku}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{line.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                      </td>
                      {!isInt && !order.is_sample && (
                        <td className="px-3 py-3">
                          <select value={line.warehouse} onChange={e => updateLineWarehouse(idx, e.target.value)}
                            className="h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none">
                            {WAREHOUSES.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
                          </select>
                        </td>
                      )}
                      <td className="px-3 py-3 text-center">
                        <input type="number" min={0} value={line.quantity_packs || ''}
                          onChange={e => updateLine(idx, parseInt(e.target.value) || 0)}
                          className="w-20 h-8 rounded border border-gray-200 px-2 text-center text-sm" />
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">{line.quantity_units}</td>
                      {!order.is_foc && !order.is_sample && !isInt && (
                        <>
                          <td className="px-3 py-3 text-right text-gray-600">{Number(line.price_per_unit).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                          <td className="px-3 py-3 text-right font-medium">{Number(line.line_total).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        </>
                      )}
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