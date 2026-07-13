'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ShoppingCart, FileText, Gift, Package, ArrowRight } from 'lucide-react'
import { logActivity } from '@/lib/log-activity'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']

type OrderMode = 'so' | 'proforma' | 'foc' | 'sample' | 'int'

const MODE_CONFIG = {
  so:       { label: 'SO — Sales Order',              docType: 'so',        isFoc: false, isSample: false, isInt: false, btnLabel: 'Create SO',         activeClass: 'bg-blue-50 text-blue-800 border-blue-400 font-medium' },
  proforma: { label: 'Proforma',                      docType: 'proforma',  isFoc: false, isSample: false, isInt: false, btnLabel: 'Create Proforma',    activeClass: 'bg-amber-50 text-amber-800 border-amber-400 font-medium' },
  foc:      { label: 'SO(DO) — Free of charge',       docType: 'so',        isFoc: true,  isSample: false, isInt: false, btnLabel: 'Create SO(DO)',      activeClass: 'bg-green-50 text-green-800 border-green-400 font-medium' },
  sample:   { label: 'SO(SAMPLE) — Samples, value 0', docType: 'so_sample', isFoc: false, isSample: true,  isInt: false, btnLabel: 'Create SO(SAMPLE)',  activeClass: 'bg-orange-50 text-orange-800 border-orange-400 font-medium' },
  int:      { label: 'SO(INT) — Internal Transfer',   docType: 'so_int',    isFoc: false, isSample: false, isInt: true,  btnLabel: 'Create SO(INT)',     activeClass: 'bg-teal-50 text-teal-800 border-teal-400 font-medium' },
}

const MODE_ICONS = {
  so:       FileText,
  proforma: FileText,
  foc:      Gift,
  sample:   Package,
  int:      ArrowRight,
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
  fixmer_reference?: string | null
  diff_price_per_unit?: number | null
}

export default function NewOrderPage() {
  const supabase = createClient()
  const router = useRouter()

  const [mode, setMode] = useState<OrderMode>('so')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [warehouse, setWarehouse] = useState('T1')
  const [warehouseDestination, setWarehouseDestination] = useState('Central')
  const [currency, setCurrency] = useState('USD')
  const [incoterms, setIncoterms] = useState('EXW')
  const [paymentTerms, setPaymentTerms] = useState('Net 30')
  const [notes, setNotes] = useState('')
  const [shipmentDate, setShipmentDate] = useState('')
  const [lines, setLines] = useState<OrderLine[]>([])
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState('')

  const cfg = MODE_CONFIG[mode]
  const isFoc = cfg.isFoc
  const isSample = cfg.isSample
  const isInt = cfg.isInt
  const priceIsZero = isSample || isInt

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-simple'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, legal_name, assigned_price_list, currency, incoterms, payment_terms, eu_compliance_type, is_european, track_trace_enabled, manual_pricing_enabled, reference_price_list')
        .eq('status', 'active').order('legal_name')
      return data ?? []
    }
  })

  const { data: negotiatedPrices = [] } = useQuery({
    queryKey: ['negotiated-prices-all'],
    queryFn: async () => {
      const { data } = await supabase.from('customer_negotiated_prices').select('customer_id, sku, price_per_unit')
      return data ?? []
    }
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-with-prices'],
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
    queryKey: ['price-entries-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('price_list_entries')
        .select('sku, price_list, price_per_unit').limit(1000)
      return data ?? []
    }
  })

  const handleCustomerChange = (id: string) => {
    const c = (customers as any[]).find((c: any) => c.id === id)
    if (!c) return
    setCustomerId(id)
    setCustomerName(c.legal_name)
    setCurrency(c.currency ?? 'USD')
    setIncoterms(c.incoterms ?? 'EXW')
    setPaymentTerms(c.payment_terms ?? 'Net 30')
    if (c.track_trace_enabled || (c.is_european && c.eu_compliance_type === 'TT')) setWarehouse('Central')
    else if (c.is_european && c.eu_compliance_type === 'PR') setWarehouse('T1')
  }

  const getCustomerPriceList = () => {
    const c = (customers as any[]).find((c: any) => c.id === customerId)
    return c?.assigned_price_list ?? 'G'
  }

  const getPrice = (sku: string) => {
    if (priceIsZero) return 0
    const customer = (customers as any[]).find((c: any) => c.id === customerId)
    if (customer?.manual_pricing_enabled) {
      const negotiated = (negotiatedPrices as any[]).find((n: any) => n.customer_id === customerId && n.sku === sku)
      if (negotiated) return Number(negotiated.price_per_unit)
    }
    const entry = (priceEntries as any[]).find(
      (e: any) => e.sku === sku && e.price_list === getCustomerPriceList()
    )
    return entry?.price_per_unit ?? 0
  }

  // Frozen at line-creation time: the gap vs the customer's reference price list,
  // used later at promotion to bill the Service & Marketing invoice without
  // re-querying (and thus without drifting if the reference list changes later).
  const getFrozenGap = (sku: string): number | null => {
    if (priceIsZero) return null
    const customer = (customers as any[]).find((c: any) => c.id === customerId)
    if (!customer?.manual_pricing_enabled || !customer.reference_price_list) return null
    const negotiated = (negotiatedPrices as any[]).find((n: any) => n.customer_id === customerId && n.sku === sku)
    if (!negotiated) return null
    const referenceEntry = (priceEntries as any[]).find((e: any) => e.sku === sku && e.price_list === customer.reference_price_list)
    if (!referenceEntry) return null
    const gap = Number(referenceEntry.price_per_unit) - Number(negotiated.price_per_unit)
    return gap > 0.0001 ? gap : null
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
      fixmer_reference: product.fixmer_reference ?? null,
      diff_price_per_unit: getFrozenGap(product.sku),
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

  const total = lines.reduce((s, l) => s + l.line_total, 0)
  const totalPacks = lines.reduce((s, l) => s + l.quantity_packs, 0)
  const totalUnits = lines.reduce((s, l) => s + l.quantity_units, 0)

  const handleSubmit = async () => {
    if (!isInt && !customerId) return alert('Please select a customer')
    if (lines.length === 0) return alert('Please add at least one product')
    if (isInt && warehouse === warehouseDestination) return alert('FROM and TO warehouses must be different')
    setSaving(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: {
            document_type:         cfg.docType,
            is_foc:                isFoc,
            is_sample:             isSample,
            customer_id:           isInt ? null : customerId,
            customer_name:         isInt ? 'Internal Transfer' : customerName,
            currency:              isInt ? 'USD' : currency,
            warehouse:             isSample ? 'Sample' : warehouse,
            warehouse_destination: isInt ? warehouseDestination : null,
            incoterms:             isInt ? 'EXW' : incoterms,
            payment_terms:         isInt ? '—' : paymentTerms,
            notes,
            shipment_date:         shipmentDate || null,
            price_list:            priceIsZero ? null : getCustomerPriceList(),
            total_amount:          0,
            total_units:           totalUnits,
            total_packs:           totalPacks,
          },
          commercial_lines: lines.map(l => ({
            ...l,
            line_type: 'commercial',
          })),
          foc_lines: [],
        }),
      })
      const data = await res.json()
      if (data.success) {
        await logActivity({
          action: 'create_order',
          entityType: 'order',
          entityId: data.order.id,
          entityRef: data.order.order_number,
          metadata: { type: cfg.docType, customer: isInt ? 'Internal Transfer' : customerName },
        })
        router.push('/orders/' + data.order.id)
      } else alert('Error: ' + data.error)
    } catch { alert('Error creating order') }
    setSaving(false)
  }

  const filteredProducts = (products as any[]).filter((p: any) =>
    !productSearch ||
    p.full_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.brand?.toLowerCase().includes(productSearch.toLowerCase())
  )

  const availableWarehouses = isInt
    ? WAREHOUSES.filter(w => w !== warehouseDestination)
    : WAREHOUSES
  const availableDestinations = WAREHOUSES.filter(w => w !== warehouse)

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Sales Document</h1>
          <p className="text-gray-500 text-sm mt-0.5">Select document type below</p>
        </div>
        <button onClick={handleSubmit} disabled={saving || lines.length === 0}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <ShoppingCart className="h-4 w-4" />
          {saving ? 'Creating...' : cfg.btnLabel}
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(Object.entries(MODE_CONFIG) as [OrderMode, typeof MODE_CONFIG[OrderMode]][]).map(([key, c]) => {
          const Icon = MODE_ICONS[key]
          return (
            <button key={key}
              onClick={() => { setMode(key); setLines([]) }}
              className={'flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors ' + (mode === key ? c.activeClass : 'border-gray-200 text-gray-600 hover:bg-gray-50 font-normal')}>
              <Icon className="h-4 w-4" />
              {c.label}
            </button>
          )
        })}
      </div>

      {isSample && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
          Stock deducted from <strong>Sample</strong> warehouse.
        </div>
      )}
      {isInt && (
        <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800">
          <strong>Internal Transfer</strong> — no customer, no price. Stock will move from <strong>{warehouse}</strong> → <strong>{warehouseDestination}</strong> when status is set to <strong>Stock Transferred</strong>.
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-900">{isInt ? 'Transfer Details' : 'Order Details'}</h2>

            {!isInt && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Customer *</label>
                <div className="flex gap-2 mt-1 items-center">
                  <select value={customerId} onChange={e => handleCustomerChange(e.target.value)}
                    className="flex-1 h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="">Select customer...</option>
                    {(customers as any[]).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.legal_name}</option>
                    ))}
                  </select>
                  <button onClick={() => router.push('/clients/new?returnTo=/orders/new')}
                    title="Add new distributor"
                    className="h-9 w-9 flex items-center justify-center border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 flex-shrink-0">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">
                {isInt ? 'From Warehouse' : 'Warehouse'}
              </label>
              <select value={isSample ? 'Sample' : warehouse} onChange={e => setWarehouse(e.target.value)}
                disabled={isSample}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400">
                {availableWarehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>

            {isInt && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">To Warehouse</label>
                <select value={warehouseDestination} onChange={e => setWarehouseDestination(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                  {availableDestinations.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
                {warehouse === warehouseDestination && (
                  <p className="text-xs text-red-500 mt-1">FROM and TO must be different</p>
                )}
              </div>
            )}

            {isInt && (
              <div className="flex items-center justify-center gap-3 py-2">
                <span className="px-3 py-1.5 bg-teal-100 text-teal-800 rounded-lg text-sm font-semibold">{warehouse}</span>
                <ArrowRight className="h-5 w-5 text-teal-600" />
                <span className="px-3 py-1.5 bg-teal-100 text-teal-800 rounded-lg text-sm font-semibold">{warehouseDestination}</span>
              </div>
            )}

            {!isInt && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Currency</label>
                    <select value={currency} onChange={e => setCurrency(e.target.value)}
                      className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                      <option>USD</option><option>EUR</option><option>GBP</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Incoterms</label>
                    <select value={incoterms} onChange={e => setIncoterms(e.target.value)}
                      className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                      {['EXW','FOB','CIF','DAP','DDP'].map(i => <option key={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Payment Terms</label>
                  <input type="text" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Shipment Date</label>
                  <input type="date" value={shipmentDate} onChange={e => setShipmentDate(e.target.value)}
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

          {lines.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 text-white">
              <h3 className="font-semibold mb-3">Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Packs</span><span>{totalPacks}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Units</span><span>{totalUnits}</span></div>
                {isInt && (
                  <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between font-semibold">
                    <span>Transfer</span>
                    <span className="text-teal-400">{warehouse} → {warehouseDestination}</span>
                  </div>
                )}
                {!isInt && (
                  <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span>{priceIsZero ? 'FOC' : currency + ' ' + Number(total).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">
              Add Product — {(products as any[]).length} available
              {priceIsZero && <span className="ml-2 text-xs text-gray-400 font-normal">No price for this document type</span>}
            </h3>
            <input type="text" placeholder="Search products..."
              value={productSearch} onChange={e => setProductSearch(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none mb-3" />
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {filteredProducts.map((p: any) => {
                const price = getPrice(p.sku)
                const alreadyAdded = lines.some(l => l.sku === p.sku)
                return (
                  <button key={p.sku} onClick={() => addLine(p)} disabled={alreadyAdded}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-left">
                    <div>
                      <span className="font-medium">{p.full_name}</span>
                      <span className="ml-2 text-xs text-gray-400 font-mono">{p.sku}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {!priceIsZero && price > 0 && <span className="text-xs text-gray-500">{Number(price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} {currency}</span>}
                      {alreadyAdded ? <span className="text-xs text-gray-400">Added</span> : <Plus className="h-4 w-4 text-gray-400" />}
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
                    {!priceIsZero && (
                      <>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">Price/Unit</th>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">Total</th>
                      </>
                    )}
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
                      <td className="px-3 py-3 text-center">
                        <input type="number" min={0} value={line.quantity_packs || ''}
                          onChange={e => updateLine(idx, parseInt(e.target.value) || 0)}
                          className="w-20 h-8 rounded border border-gray-200 px-2 text-center text-sm" />
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">{line.quantity_units}</td>
                      {!priceIsZero && (
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