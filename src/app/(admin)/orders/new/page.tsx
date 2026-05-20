'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ShoppingCart } from 'lucide-react'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']
const DOC_TYPES = ['proforma', 'so', 'invoice']

interface OrderLine {
  sku: string
  product_name: string
  brand: string
  units_per_pack: number
  quantity_packs: number
  quantity_units: number
  price_per_unit: number
  line_total: number
  line_type: 'commercial' | 'foc'
}

export default function NewOrderPage() {
  const supabase = createClient()
  const router = useRouter()
  const [docType, setDocType] = useState('invoice')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [warehouse, setWarehouse] = useState('T1')
  const [currency, setCurrency] = useState('USD')
  const [incoterms, setIncoterms] = useState('EXW')
  const [paymentTerms, setPaymentTerms] = useState('Net 30')
  const [notes, setNotes] = useState('')
  const [shipmentDate, setShipmentDate] = useState('')
  const [lines, setLines] = useState<OrderLine[]>([])
  const [focLines, setFocLines] = useState<OrderLine[]>([])
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'commercial' | 'foc'>('commercial')
  const [productSearch, setProductSearch] = useState('')

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('customers')
        .select('id, legal_name, assigned_price_list, currency, incoterms, payment_terms, eu_compliance_type, is_european')
        .eq('status', 'active').order('legal_name')
      return data ?? []
    }
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-with-prices'],
    queryFn: async () => {
      const { data } = await supabase.from('products')
        .select('sku, full_name, brand, units_per_pack')
        .eq('product_role', 'original').eq('status', 'active')
        .order('brand').limit(500)
      return data ?? []
    }
  })

  const { data: priceEntries = [] } = useQuery({
    queryKey: ['price-entries-all'],
    queryFn: async () => {
      const { data } = await supabase.from('price_list_entries')
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
    if (c.is_european && c.eu_compliance_type === 'TT') setWarehouse('Central')
    else if (c.is_european && c.eu_compliance_type === 'PR') setWarehouse('T1')
  }

  const getCustomerPriceList = () => {
    const c = (customers as any[]).find((c: any) => c.id === customerId)
    return c?.assigned_price_list ?? 'G'
  }

  const getPrice = (sku: string, priceList: string) => {
    const entry = (priceEntries as any[]).find((e: any) => e.sku === sku && e.price_list === priceList)
    return entry?.price_per_unit ?? 0
  }

  const addLine = (product: any, type: 'commercial' | 'foc') => {
    const price = type === 'foc' ? 0 : getPrice(product.sku, getCustomerPriceList())
    const newLine: OrderLine = {
      sku: product.sku, product_name: product.full_name, brand: product.brand,
      units_per_pack: product.units_per_pack ?? 1,
      quantity_packs: 0, quantity_units: 0, price_per_unit: price, line_total: 0, line_type: type,
    }
    if (type === 'commercial') setLines(l => [...l, newLine])
    else setFocLines(l => [...l, newLine])
  }

  const updateLine = (idx: number, packs: number, type: 'commercial' | 'foc') => {
    const update = (lines: OrderLine[]) => lines.map((l, i) => {
      if (i !== idx) return l
      const units = packs * l.units_per_pack
      return { ...l, quantity_packs: packs, quantity_units: units, line_total: units * l.price_per_unit }
    })
    if (type === 'commercial') setLines(update)
    else setFocLines(update)
  }

  const removeLine = (idx: number, type: 'commercial' | 'foc') => {
    if (type === 'commercial') setLines(l => l.filter((_, i) => i !== idx))
    else setFocLines(l => l.filter((_, i) => i !== idx))
  }

  const total = lines.reduce((s, l) => s + l.line_total, 0)
  const totalPacks = lines.reduce((s, l) => s + l.quantity_packs, 0)
  const totalUnits = lines.reduce((s, l) => s + l.quantity_units, 0)

  const handleSubmit = async () => {
    if (!customerId || lines.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: { document_type: docType, customer_id: customerId, customer_name: customerName,
            currency, warehouse, incoterms, payment_terms: paymentTerms, notes,
            shipment_date: shipmentDate || null, price_list: getCustomerPriceList() },
          commercial_lines: lines, foc_lines: focLines,
        }),
      })
      const data = await res.json()
      if (data.success) router.push('/orders')
      else alert('Error: ' + data.error)
    } catch { alert('Error creating order') }
    setSaving(false)
  }

  const currentLines = activeTab === 'commercial' ? lines : focLines
  const filteredProducts = (products as any[]).filter((p: any) =>
    !productSearch ||
    p.full_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.brand?.toLowerCase().includes(productSearch.toLowerCase())
  )

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Order</h1>
          <p className="text-gray-500 text-sm mt-0.5">Create a sales order</p>
        </div>
        <button onClick={handleSubmit} disabled={saving || !customerId || lines.length === 0}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <ShoppingCart className="h-4 w-4" />
          {saving ? 'Creating...' : 'Create Order'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-900">Order Details</h2>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Document Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {DOC_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Customer *</label>
              <select value={customerId} onChange={e => handleCustomerChange(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">Select customer...</option>
                {(customers as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Warehouse</label>
              <select value={warehouse} onChange={e => setWarehouse(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
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
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
          </div>

          {lines.length > 0 && (
            <div className="bg-gray-900 rounded-xl p-4 text-white">
              <h3 className="font-semibold mb-3">Order Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Total Packs</span><span>{totalPacks}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Total Units</span><span>{totalUnits}</span></div>
                {focLines.length > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>FOC Packs</span><span>{focLines.reduce((s, l) => s + l.quantity_packs, 0)}</span>
                  </div>
                )}
                <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between font-semibold text-lg">
                  <span>Total</span><span>{currency} {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="col-span-2 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('commercial')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'commercial' ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              Commercial Lines ({lines.length})
            </button>
            <button onClick={() => setActiveTab('foc')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'foc' ? 'bg-green-700 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              FOC Lines ({focLines.length})
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-medium text-gray-900 mb-3">Add Product — {(products as any[]).length} available</h3>
            <input type="text" placeholder="Search products..." value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none mb-3" />
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-gray-400 px-3 py-3">No products found</p>
              ) : filteredProducts.map((p: any) => {
                const price = getPrice(p.sku, getCustomerPriceList())
                const alreadyAdded = currentLines.some(l => l.sku === p.sku)
                return (
                  <button key={p.sku} onClick={() => !alreadyAdded && addLine(p, activeTab)}
                    disabled={alreadyAdded}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-left">
                    <div>
                      <span className="font-medium">{p.full_name}</span>
                      <span className="ml-2 text-xs text-gray-400 font-mono">{p.sku}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {activeTab === 'commercial' && price > 0 && (
                        <span className="text-xs font-medium text-gray-600">{price.toFixed(2)} {currency}</span>
                      )}
                      {activeTab === 'foc' && <span className="text-xs font-medium text-green-600">FOC</span>}
                      {alreadyAdded ? <span className="text-xs text-gray-400">Added</span> : <Plus className="h-4 w-4 text-gray-400" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {currentLines.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Packs</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">Units</th>
                    {activeTab === 'commercial' && (
                      <>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">Price/Unit</th>
                        <th className="text-right px-3 py-3 font-medium text-gray-600">Total</th>
                      </>
                    )}
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentLines.map((line, idx) => (
                    <tr key={line.sku}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{line.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{line.sku}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input type="number" min={0} value={line.quantity_packs || ''}
                          onChange={e => updateLine(idx, parseInt(e.target.value) || 0, activeTab)}
                          className="w-20 h-8 rounded border border-gray-200 px-2 text-center text-sm" />
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">{line.quantity_units}</td>
                      {activeTab === 'commercial' && (
                        <>
                          <td className="px-3 py-3 text-right text-gray-600">{line.price_per_unit.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right font-medium">{line.line_total.toFixed(2)}</td>
                        </>
                      )}
                      <td className="px-3 py-3">
                        <button onClick={() => removeLine(idx, activeTab)} className="text-gray-300 hover:text-red-500">
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
