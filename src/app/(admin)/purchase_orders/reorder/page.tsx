'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useMemo, Fragment } from 'react'
import { ArrowLeft, Sparkles, Save, AlertTriangle, Info } from 'lucide-react'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'

const REORDER_WAREHOUSES = ['T1', 'Central'] // Aged excluded on purpose — not part of the regular replenishment cycle

function monthsBetween(a: Date, b: Date): number {
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()))
}

export default function ReorderAnalysisPage() {
  const supabase = createClient()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [annualGrowth, setAnnualGrowth] = useState('10')
  const [ordersPerYear, setOrdersPerYear] = useState('2')
  const [leadTimeMonths, setLeadTimeMonths] = useState('6.25')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [insights, setInsights] = useState<Record<string, string>>({})
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [showPoModal, setShowPoModal] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedSku, setExpandedSku] = useState<string | null>(null)
  const [showFormulaInfo, setShowFormulaInfo] = useState(false)

  const { data: earliestSoDate } = useQuery({
    queryKey: ['reorder-earliest-so'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('order_date')
        .eq('document_type', 'so').eq('is_foc', false).eq('is_sample', false)
        .order('order_date', { ascending: true }).limit(1).maybeSingle()
      return data?.order_date ?? null
    }
  })

  const today = new Date()
  const twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate())
  const windowStart = earliestSoDate
    ? (new Date(earliestSoDate) > twelveMonthsAgo ? earliestSoDate : twelveMonthsAgo.toISOString().split('T')[0])
    : twelveMonthsAgo.toISOString().split('T')[0]
  const windowMonths = earliestSoDate ? monthsBetween(new Date(windowStart), today) : 12

  const { data: salesLines = [] } = useQuery({
    queryKey: ['reorder-sales-lines', windowStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_order_lines')
        .select('sku, quantity_packs, sales_orders!inner(document_type, is_foc, is_sample, order_date)')
        .eq('line_type', 'commercial')
        .eq('sales_orders.document_type', 'so')
        .eq('sales_orders.is_foc', false)
        .eq('sales_orders.is_sample', false)
        .gte('sales_orders.order_date', windowStart)
      return data ?? []
    },
    enabled: !!earliestSoDate
  })

  const { data: inventory = [] } = useQuery({
    queryKey: ['reorder-inventory'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_records')
        .select('sku, warehouse, quantity_packs')
        .in('warehouse', REORDER_WAREHOUSES)
        .eq('category', 'available')
      return data ?? []
    }
  })

  const { data: products = [] } = useQuery({
    queryKey: ['reorder-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name, brand, units_per_pack')
        .eq('product_role', 'original').eq('status', 'active')
        .order('brand')
      return data ?? []
    }
  })

  const { data: partners = [] } = useQuery({
    queryKey: ['reorder-partners'],
    queryFn: async () => {
      const { data } = await supabase.from('partners').select('id, name').eq('category', 'cigars').eq('status', 'active').order('name')
      return data ?? []
    }
  })

  const factors = useMemo(() => {
    const growth = (parseFloat(annualGrowth) || 0) / 100
    const lt = parseFloat(leadTimeMonths) || 0
    const opy = parseFloat(ordersPerYear) || 1
    const coverage = 12 / opy
    const midpoint = lt + coverage / 2
    const growthFactor = Math.pow(1 + growth, midpoint / 12)
    return { growth, lt, opy, coverage, midpoint, growthFactor }
  }, [annualGrowth, ordersPerYear, leadTimeMonths])

  const rows = useMemo(() => {
    const salesBySku: Record<string, number> = {}
    ;(salesLines as any[]).forEach(l => { salesBySku[l.sku] = (salesBySku[l.sku] ?? 0) + (l.quantity_packs ?? 0) })

    const stockBySku: Record<string, number> = {}
    ;(inventory as any[]).forEach(r => { stockBySku[r.sku] = (stockBySku[r.sku] ?? 0) + (r.quantity_packs ?? 0) })

    const { lt, coverage, growthFactor } = factors

    return (products as any[])
      .map(p => {
        const totalSold = salesBySku[p.sku] ?? 0
        const avgMonthly = totalSold / windowMonths
        const currentStock = stockBySku[p.sku] ?? 0
        const adjustedMonthly = avgMonthly * growthFactor
        const targetDemand = adjustedMonthly * (lt + coverage)
        const rawQty = targetDemand - currentStock
        const recommendedQty = Math.max(0, Math.ceil(rawQty))
        return {
          sku: p.sku, full_name: p.full_name, brand: p.brand, units_per_pack: p.units_per_pack ?? 1,
          totalSold, avgMonthly, currentStock, adjustedMonthly, targetDemand, rawQty, recommendedQty,
        }
      })
      .filter(r => r.totalSold > 0 || r.currentStock > 0 || r.recommendedQty > 0)
      .sort((a, b) => b.recommendedQty - a.recommendedQty)
  }, [products, salesLines, inventory, factors, windowMonths])

  const getQty = (sku: string, defaultQty: number) => {
    const ov = overrides[sku]
    return ov !== undefined ? (parseInt(ov) || 0) : defaultQty
  }

  const handleGetInsights = async () => {
    setInsightsLoading(true)
    try {
      const payload = rows.filter(r => !excluded.has(r.sku)).map(r => ({
        sku: r.sku, product: r.full_name,
        avg_monthly_sales_packs: Math.round(r.avgMonthly * 10) / 10,
        months_of_data: windowMonths,
        current_stock_packs: r.currentStock,
        recommended_qty_packs: getQty(r.sku, r.recommendedQty),
      }))
      const res = await fetch('/api/purchase_orders/reorder_insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: payload }),
      })
      const data = await res.json()
      if (res.ok) {
        const map: Record<string, string> = {}
        ;(data.flags ?? []).forEach((f: any) => { map[f.sku] = f.comment })
        setInsights(map)
      }
    } finally {
      setInsightsLoading(false)
    }
  }

  const toggleExcluded = (sku: string) => setExcluded(prev => {
    const next = new Set(prev)
    if (next.has(sku)) next.delete(sku); else next.add(sku)
    return next
  })

  const handleCreatePO = async () => {
    if (!selectedPartnerId) return alert('Select a supplier')
    const partner = (partners as any[]).find(p => p.id === selectedPartnerId)
    if (!partner) return
    const linesToCreate = rows.filter(r => !excluded.has(r.sku) && getQty(r.sku, r.recommendedQty) > 0)
    if (linesToCreate.length === 0) return alert('No lines with a quantity greater than 0')

    setCreating(true)
    try {
      const { data: poNumber } = await supabase.rpc('fn_generate_po_number', { p_type: 'cigars' })
      const { data: po, error } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber, po_type: 'cigars', partner_id: partner.id, partner_name: partner.name,
          status: 'draft', currency: 'USD', order_date: new Date().toISOString().split('T')[0],
          notes: `Generated from Reorder Analysis (growth ${annualGrowth}%, ${ordersPerYear}/yr, lead time ${leadTimeMonths}mo)`,
        })
        .select().single()
      if (error || !po) { alert('Error: ' + error?.message); setCreating(false); return }

      await supabase.from('purchase_order_lines').insert(
        linesToCreate.map(r => ({
          po_id: po.id, sku: r.sku, description: r.full_name, quantity: getQty(r.sku, r.recommendedQty),
        }))
      )

      await logActivity({
        action: 'create_purchase_order', entityType: 'purchase_order', entityId: po.id, entityRef: po.po_number,
        metadata: { type: 'cigars', partner: partner.name, source: 'reorder_analysis', lines: linesToCreate.length },
      })
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
      router.push('/purchase_orders/' + po.id)
    } catch (err: any) {
      alert('Error: ' + err.message)
      setCreating(false)
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/purchase_orders" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Reorder Analysis</h1>
            <button onClick={() => setShowFormulaInfo(s => !s)} title="How is this calculated?"
              className="text-gray-300 hover:text-gray-600">
              <Info className="h-4 w-4" />
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">
            Based on {windowMonths} month{windowMonths > 1 ? 's' : ''} of sales history · original stock only (T1 + Central)
          </p>
        </div>
        <button onClick={handleGetInsights} disabled={insightsLoading || rows.length === 0}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
          <Sparkles className="h-4 w-4" />{insightsLoading ? 'Analyzing...' : 'Get AI Insights'}
        </button>
        <button onClick={() => setShowPoModal(true)} disabled={rows.length === 0}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" /> Generate Purchase Order
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Expected Annual Growth</label>
          <div className="flex items-center gap-2 mt-1">
            <input type="number" step="1" value={annualGrowth} onChange={e => setAnnualGrowth(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            <span className="text-sm text-gray-400">%</span>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Orders per Year</label>
          <input type="number" step="1" min="1" value={ordersPerYear} onChange={e => setOrdersPerYear(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase">Lead Time (months)</label>
          <input type="number" step="0.25" value={leadTimeMonths} onChange={e => setLeadTimeMonths(e.target.value)}
            className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
          <p className="text-xs text-gray-400 mt-1">Default 6.25 = 6 months production + 1 week transport</p>
        </div>
      </div>

      {showFormulaInfo && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-4 text-sm text-blue-900 space-y-2">
          <p className="font-semibold">Formula</p>
          <p className="font-mono text-xs bg-white/60 rounded px-2 py-1.5 inline-block">
            recommended_qty = avg_monthly_sales × growth_factor × (lead_time + coverage) − current_stock
          </p>
          <ul className="text-xs space-y-1 mt-2 list-disc list-inside text-blue-800">
            <li><strong>avg_monthly_sales</strong>: total boxes sold over the last {windowMonths} month{windowMonths > 1 ? 's' : ''} ÷ {windowMonths}</li>
            <li><strong>coverage</strong> = 12 ÷ orders per year = {factors.coverage.toFixed(2)} months (how long this order must last until the next one)</li>
            <li><strong>lead_time + coverage</strong> = {factors.lt.toFixed(2)} + {factors.coverage.toFixed(2)} = {(factors.lt + factors.coverage).toFixed(2)} months of demand this order must cover</li>
            <li><strong>growth_factor</strong> = (1 + {annualGrowth}%) ^ (midpoint ÷ 12), midpoint = lead_time + coverage/2 = {factors.midpoint.toFixed(2)} months → factor = {factors.growthFactor.toFixed(3)}×</li>
            <li>Click the <Info className="h-3 w-3 inline" /> icon on any product row to see its own numbers plugged into this formula</li>
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Avg/Month (boxes)</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Current Stock</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Recommended Qty</th>
              <th className="px-3 py-3" />
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => {
              const isExcluded = excluded.has(r.sku)
              const insight = insights[r.sku]
              const isExpanded = expandedSku === r.sku
              return (
                <Fragment key={r.sku}>
                <tr className={isExcluded ? 'opacity-40' : ''}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.full_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{r.sku}</p>
                    {insight && (
                      <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" /> {insight}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-500">{r.avgMonthly.toFixed(1)}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{r.currentStock}</td>
                  <td className="px-3 py-3 text-right">
                    <input type="number" min={0} disabled={isExcluded}
                      value={getQty(r.sku, r.recommendedQty)}
                      onChange={e => setOverrides(prev => ({ ...prev, [r.sku]: e.target.value }))}
                      className="w-24 h-8 rounded border border-gray-200 px-2 text-right text-sm disabled:bg-gray-50" />
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => setExpandedSku(isExpanded ? null : r.sku)} title="See calculation"
                      className={isExpanded ? 'text-gray-700' : 'text-gray-300 hover:text-gray-600'}>
                      <Info className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => toggleExcluded(r.sku)}
                      className="text-xs text-gray-400 hover:text-red-500 underline">
                      {isExcluded ? 'Include' : 'Exclude'}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-gray-50">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="text-xs text-gray-600 font-mono space-y-1">
                        <div>avg_monthly_sales = {r.totalSold} boxes ÷ {windowMonths} months = {r.avgMonthly.toFixed(2)}</div>
                        <div>growth_factor = {factors.growthFactor.toFixed(3)}× → adjusted_monthly = {r.avgMonthly.toFixed(2)} × {factors.growthFactor.toFixed(3)} = {r.adjustedMonthly.toFixed(2)}</div>
                        <div>target_demand = {r.adjustedMonthly.toFixed(2)} × ({factors.lt.toFixed(2)} + {factors.coverage.toFixed(2)}) = {r.targetDemand.toFixed(2)} boxes</div>
                        <div>recommended_qty = {r.targetDemand.toFixed(2)} − current_stock ({r.currentStock}) = {r.rawQty.toFixed(2)} → rounded up to {r.recommendedQty}</div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No sales history or stock found for active original products</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showPoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPoModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-gray-900 mb-4">Generate Purchase Order</h2>
            <label className="text-xs font-medium text-gray-500 uppercase">Supplier</label>
            <select value={selectedPartnerId} onChange={e => setSelectedPartnerId(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none mb-4">
              <option value="">Select supplier...</option>
              {(partners as any[]).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-xs text-gray-500 mb-4">
              {rows.filter(r => !excluded.has(r.sku) && getQty(r.sku, r.recommendedQty) > 0).length} line(s) will be added to the new draft PO.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowPoModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreatePO} disabled={creating || !selectedPartnerId}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Draft PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
