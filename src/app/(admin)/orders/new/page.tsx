'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ShoppingCart, FileText, Gift, Package, ArrowRight, Sparkles } from 'lucide-react'
import { logActivity } from '@/lib/log-activity'
import { warehouseLabel } from '@/lib/warehouse'

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
  warehouse: string
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
  const [paymentTermsDays, setPaymentTermsDays] = useState('30')
  const [notes, setNotes] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [shipmentDate, setShipmentDate] = useState('')
  const [orderReceivedDate, setOrderReceivedDate] = useState('')
  const [lines, setLines] = useState<OrderLine[]>([])
  const [services, setServices] = useState<OrderService[]>([])
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState('')

  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [ocrDetectedNumber, setOcrDetectedNumber] = useState('')

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
        .in('product_role', ['original', 'aged']).eq('status', 'active')
        .order('brand').limit(500)
      return data ?? []
    }
  })

  // Scoped to just the lists the selected customer can actually price against — a blanket
  // fetch of all price lists combined risks silently truncating on Supabase's row cap as the
  // catalogue grows (SPECIAL entries disappearing from orders was exactly this).
  const selectedCustomerForPricing = (customers as any[]).find((c: any) => c.id === customerId)
  const neededPriceLists = Array.from(new Set([
    selectedCustomerForPricing?.assigned_price_list || 'G',
    ...(selectedCustomerForPricing?.manual_pricing_enabled && selectedCustomerForPricing?.reference_price_list
      ? [selectedCustomerForPricing.reference_price_list] : []),
  ]))

  const { data: priceEntries = [] } = useQuery({
    queryKey: ['price-entries', neededPriceLists.join(',')],
    queryFn: async () => {
      const { data } = await supabase
        .from('price_list_entries')
        .select('sku, price_list, price_per_unit')
        .in('price_list', neededPriceLists)
      return data ?? []
    },
  })

  const handleCustomerChange = (id: string) => {
    const c = (customers as any[]).find((c: any) => c.id === id)
    if (!c) return
    setCustomerId(id)
    setCustomerName(c.legal_name)
    setCurrency(c.currency ?? 'USD')
    setIncoterms(c.incoterms ?? 'EXW')
    setPaymentTerms(c.payment_terms ?? 'Net 30')
    // Best-effort default from the free-text terms — that field isn't a controlled vocabulary,
    // so this is just a starting point the user can adjust.
    setPaymentTermsDays(c.payment_terms?.match(/\d+/)?.[0] ?? '30')
    if (c.is_european && (c.track_trace_enabled || c.eu_compliance_type === 'TT')) setWarehouse('Central')
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

  // Frozen at line-creation time: the gap vs the customer's reference price list, used later
  // at promotion without re-querying (avoids drift if the reference list changes later).
  // Positive gap (reference > client price) bills the shortfall as a Service & Marketing
  // invoice; negative gap (client price > reference) becomes a Credit Note owed to the client.
  const getFrozenGap = (sku: string): number | null => {
    if (priceIsZero) return null
    const customer = (customers as any[]).find((c: any) => c.id === customerId)
    if (!customer?.manual_pricing_enabled || !customer.reference_price_list) return null
    const negotiated = (negotiatedPrices as any[]).find((n: any) => n.customer_id === customerId && n.sku === sku)
    if (!negotiated) return null
    const referenceEntry = (priceEntries as any[]).find((e: any) => e.sku === sku && e.price_list === customer.reference_price_list)
    if (!referenceEntry) return null
    const gap = Number(referenceEntry.price_per_unit) - Number(negotiated.price_per_unit)
    return Math.abs(gap) > 0.0001 ? gap : null
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
      warehouse: isSample ? 'Sample' : warehouse,
    }])
  }

  const updateLine = (idx: number, packs: number) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const units = packs * l.units_per_pack
      return { ...l, quantity_packs: packs, quantity_units: units, line_total: units * l.price_per_unit }
    }))
  }

  const updateLinePrice = (idx: number, price: number) => {
    setLines(prev => prev.map((l, i) =>
      i !== idx ? l : { ...l, price_per_unit: price, line_total: l.quantity_units * price }
    ))
  }

  const updateLineWarehouse = (idx: number, wh: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, warehouse: wh } : l))
  }

  const removeLine = (idx: number) => setLines(l => l.filter((_, i) => i !== idx))

  const guessCustomer = (nameGuess: string | null): any | null => {
    if (!nameGuess) return null
    const needle = nameGuess.toLowerCase().trim()
    const list = customers as any[]
    const exact = list.find(c => c.legal_name?.toLowerCase() === needle)
    if (exact) return exact
    return list.find(c => c.legal_name?.toLowerCase().includes(needle) || needle.includes(c.legal_name?.toLowerCase() ?? ' ')) ?? null
  }

  const guessProduct = (skuGuess: string | null, description: string | null, fixmerGuess: string | null = null): any | null => {
    const list = products as any[]
    // Fixmer code is the most reliable match: many source documents reference cigars by their
    // Fixmer catalogue code rather than DH's internal SKU, so it's checked first.
    if (fixmerGuess) {
      const exact = list.find(p => p.fixmer_reference?.toLowerCase() === fixmerGuess.toLowerCase())
      if (exact) return exact
    }
    if (skuGuess) {
      const exact = list.find(p => p.sku.toLowerCase() === skuGuess.toLowerCase())
      if (exact) return exact
    }
    const desc = (description || '').toLowerCase()
    if (!desc) return null
    return list.find(p => desc.includes(p.full_name.toLowerCase()) || p.full_name.toLowerCase().includes(desc)) ?? null
  }

  const handleOcrExtract = async () => {
    if (!ocrFile) return
    setOcrLoading(true)
    setOcrError('')
    setOcrDetectedNumber('')
    try {
      const formData = new FormData()
      formData.append('file', ocrFile)
      const res = await fetch('/api/orders/ocr', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setOcrError(data.error ?? 'Extraction failed'); setOcrLoading(false); return }

      const matchedCustomer = guessCustomer(data.customer_name_guess)
      if (matchedCustomer) handleCustomerChange(matchedCustomer.id)

      if (data.warehouse_guess && WAREHOUSES.includes(data.warehouse_guess)) setWarehouse(data.warehouse_guess)
      if (data.order_date_guess) setOrderDate(data.order_date_guess)
      if (data.incoterms_guess) setIncoterms(data.incoterms_guess)
      if (data.order_number_guess) setOcrDetectedNumber(data.order_number_guess)

      let matched = 0
      // Keyed by SKU: if the document (or the model) lists the same product on more than
      // one line, merge them into a single line with combined quantity instead of creating
      // duplicate rows.
      const newLinesBySku = new Map<string, OrderLine>()
      for (const l of (data.lines ?? [])) {
        const product = guessProduct(l.sku_guess, l.description, l.fixmer_code_guess)
        if (!product || !l.quantity_packs) continue
        matched++
        const packs = Number(l.quantity_packs)
        const units = packs * (product.units_per_pack ?? 1)
        // Prefer deriving price from the line total (line_total_guess / units) using the
        // catalogue's known units_per_pack — more reliable than trusting the model's own
        // unit_price arithmetic, which has been observed to divide by packs instead of units.
        const price = l.line_total_guess != null && units > 0
          ? Number(l.line_total_guess) / units
          : l.unit_price != null ? Number(l.unit_price) : getPrice(product.sku)

        const existing = newLinesBySku.get(product.sku)
        if (existing) {
          existing.quantity_packs += packs
          existing.quantity_units += units
          existing.line_total += units * price
        } else {
          newLinesBySku.set(product.sku, {
            sku: product.sku,
            product_name: product.full_name,
            brand: product.brand,
            units_per_pack: product.units_per_pack ?? 1,
            quantity_packs: packs,
            quantity_units: units,
            price_per_unit: price,
            line_total: units * price,
            fixmer_reference: product.fixmer_reference ?? null,
            diff_price_per_unit: null,
            warehouse: isSample ? 'Sample' : (data.warehouse_guess && WAREHOUSES.includes(data.warehouse_guess) ? data.warehouse_guess : warehouse),
          })
        }
      }
      const newLines = Array.from(newLinesBySku.values())
      setLines(prev => {
        const existingSkus = new Set(prev.map(l => l.sku))
        return [...prev, ...newLines.filter(l => !existingSkus.has(l.sku))]
      })
      setOcrFile(null)
      if (matched === 0) setOcrError('No line items could be matched to a product in the catalogue — add them manually below.')
    } catch (err: any) {
      setOcrError(err.message)
    } finally {
      setOcrLoading(false)
    }
  }

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
            order_number_override: ocrDetectedNumber.trim() || undefined,
            is_foc:                isFoc,
            is_sample:             isSample,
            customer_id:           isInt ? null : customerId,
            customer_name:         isInt ? 'Internal Transfer' : customerName,
            currency:              isInt ? 'USD' : currency,
            warehouse:             isSample ? 'Sample' : warehouse,
            warehouse_destination: isInt ? warehouseDestination : null,
            incoterms:             isInt ? 'EXW' : incoterms,
            payment_terms:         isInt ? '—' : paymentTerms,
            payment_terms_days:    isInt ? null : (paymentTermsDays ? parseInt(paymentTermsDays) : null),
            notes,
            order_date:            orderDate || null,
            shipment_date:         shipmentDate || null,
            order_received_date:   isInt ? null : (orderReceivedDate || null),
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
          services: services
            .filter(s => s.description && parseFloat(s.price) > 0)
            .map(s => ({ service_type: s.service_type, description: s.description, price: parseFloat(s.price), currency: isInt ? 'USD' : currency })),
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
    p.brand?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.fixmer_reference?.toLowerCase().includes(productSearch.toLowerCase())
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

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4" /> Extract from Existing Document</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="file" accept="application/pdf,image/*,.xlsx,.xls,.csv"
            onChange={e => setOcrFile(e.target.files?.[0] ?? null)}
            className="flex-1 min-w-64 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 file:text-sm" />
          <button onClick={handleOcrExtract} disabled={!ocrFile || ocrLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap">
            {ocrLoading ? 'Extracting...' : 'Extract & Fill'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Upload an existing SO/Invoice (PDF or photo) — pre-fills the customer, warehouse, date, and matched product lines below. Useful when re-entering historical orders.</p>
        {ocrError && <p className="text-xs text-red-500 mt-2">{ocrError}</p>}
        {ocrDetectedNumber && (
          <div className="flex items-center gap-2 bg-amber-50 rounded px-2 py-1 mt-2">
            <label className="text-xs text-amber-700 whitespace-nowrap">Original document number (will be used instead of auto-numbering):</label>
            <input
              type="text"
              value={ocrDetectedNumber}
              onChange={e => setOcrDetectedNumber(e.target.value)}
              className="text-xs font-mono font-medium border border-amber-200 rounded px-2 py-0.5 bg-white"
            />
          </div>
        )}
      </div>

      {isSample && (
        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
          Stock deducted from <strong>Sample</strong> warehouse.
        </div>
      )}
      {isInt && (
        <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800">
          <strong>Internal Transfer</strong> — no customer, no price. Stock will move from <strong>{warehouseLabel(warehouse)}</strong> → <strong>{warehouseLabel(warehouseDestination)}</strong> when status is set to <strong>Stock Transferred</strong>.
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
                {availableWarehouses.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
              </select>
              {!isInt && !isSample && (
                <p className="text-xs text-gray-400 mt-1">Default for new lines — override per line below if needed</p>
              )}
            </div>

            {isInt && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">To Warehouse</label>
                <select value={warehouseDestination} onChange={e => setWarehouseDestination(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                  {availableDestinations.map(w => <option key={w} value={w}>{warehouseLabel(w)}</option>)}
                </select>
                {warehouse === warehouseDestination && (
                  <p className="text-xs text-red-500 mt-1">FROM and TO must be different</p>
                )}
              </div>
            )}

            {isInt && (
              <div className="flex items-center justify-center gap-3 py-2">
                <span className="px-3 py-1.5 bg-teal-100 text-teal-800 rounded-lg text-sm font-semibold">{warehouseLabel(warehouse)}</span>
                <ArrowRight className="h-5 w-5 text-teal-600" />
                <span className="px-3 py-1.5 bg-teal-100 text-teal-800 rounded-lg text-sm font-semibold">{warehouseLabel(warehouseDestination)}</span>
              </div>
            )}

            {isInt && (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Order Date</label>
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                <p className="text-xs text-gray-400 mt-1">Defaults to today — backdate when re-entering a historical transfer</p>
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
                  <label className="text-xs font-medium text-gray-500 uppercase">Payment Terms (days)</label>
                  <input type="number" min="0" value={paymentTermsDays} onChange={e => setPaymentTermsDays(e.target.value)}
                    placeholder="e.g. 30"
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                  <p className="text-xs text-gray-400 mt-1">Payment is due this many days after the Shipment Date</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Order Date</label>
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
                  <p className="text-xs text-gray-400 mt-1">Defaults to today — backdate when re-entering a historical order</p>
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
              </>
            )}

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
          </div>

          {/* Additional Services */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Additional Services</h2>
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

          {(lines.length > 0 || services.length > 0) && (
            <div className="bg-gray-900 rounded-xl p-4 text-white">
              <h3 className="font-semibold mb-3">Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Packs</span><span>{totalPacks}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Units</span><span>{totalUnits}</span></div>
                {servicesTotal > 0 && (
                  <div className="flex justify-between"><span className="text-gray-400">Services</span><span>{currency} {servicesTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
                )}
                {isInt && (
                  <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between font-semibold">
                    <span>Transfer</span>
                    <span className="text-teal-400">{warehouseLabel(warehouse)} → {warehouseLabel(warehouseDestination)}</span>
                  </div>
                )}
                {!isInt && (
                  <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span>{priceIsZero && servicesTotal === 0 ? 'FOC' : currency + ' ' + Number(total + servicesTotal).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
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
            <input type="text" placeholder="Search products... (name, SKU, or Fixmer code)"
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
                      {p.fixmer_reference && <span className="ml-2 text-xs text-gray-400 font-mono">Fixmer: {p.fixmer_reference}</span>}
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
                    {!isInt && !isSample && (
                      <th className="text-left px-3 py-3 font-medium text-gray-600">Warehouse</th>
                    )}
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
                      {!isInt && !isSample && (
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
                      {!priceIsZero && (
                        <>
                          <td className="px-3 py-3 text-right">
                            <input type="number" min={0} step="0.01" value={line.price_per_unit}
                              onChange={e => updateLinePrice(idx, parseFloat(e.target.value) || 0)}
                              className="w-24 h-8 rounded border border-gray-200 px-2 text-right text-sm" />
                          </td>
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