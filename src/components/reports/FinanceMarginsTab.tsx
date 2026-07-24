'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useMemo, useState } from 'react'
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react'
import { fetchAllRows } from '@/lib/fetchAllRows'

function fmt(n: number) {
  return `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
function fmtPct(n: number) {
  return `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}%`
}

// Margin tiers mirror the Targets page's Late/Good/Excellent/Amazing convention — a consistent
// "how good is this number" color language across the app instead of a one-off scale here.
function marginColor(pct: number) {
  if (pct < 0) return '#EF4444'
  if (pct < 20) return '#F97316'
  if (pct < 40) return '#22C55E'
  return '#A855F7'
}

interface Row { key: string; label: string; sub?: string; revenue: number; cost: number; units?: number }

function MarginBar({ row, maxProfit }: { row: Row & { profit: number; marginPct: number }; maxProfit: number }) {
  const color = marginColor(row.marginPct)
  const widthPct = Math.max((Math.abs(row.profit) / maxProfit) * 100, 10)
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-28 md:w-36 flex-shrink-0">
        <p className="text-sm text-gray-700 truncate" title={row.label}>{row.label}</p>
        {row.sub && <p className="text-xs text-gray-400 truncate">{row.sub}</p>}
      </div>
      <div className="flex-1 h-5 bg-gray-100 rounded-full relative">
        <div className="h-full rounded-full flex items-center px-2"
          style={{ width: `${widthPct}%`, background: `${color}33` }}>
          <span className="text-gray-900 font-semibold whitespace-nowrap" style={{ fontSize: '10px' }}>
            {fmtPct(row.marginPct)}
          </span>
        </div>
      </div>
      <span className="text-xs text-gray-400 w-20 md:w-24 text-right whitespace-nowrap">{fmt(row.revenue)}</span>
      <span className="text-xs font-semibold w-20 md:w-24 text-right whitespace-nowrap" style={{ color }}>{fmt(row.profit)}</span>
    </div>
  )
}

export default function FinanceMarginsTab({ periodInvoiceIds }: { periodInvoiceIds: Set<string> }) {
  const supabase = createClient()
  const [productSort, setProductSort] = useState<'profit' | 'margin_desc' | 'margin_asc'>('profit')

  // Same query key as the Overview/Products tabs (reports/page.tsx) — react-query dedupes this
  // against whatever's already cached there, no extra network round-trip in the common case of
  // switching tabs rather than loading this one first. Which invoices count (real sales, within
  // the page's selected period) is decided by the parent and passed in as periodInvoiceIds, so
  // this tab honors the same YTD/12M/etc. selector as every other tab instead of always showing
  // all-time totals.
  const { data: lines = [] } = useQuery({
    queryKey: ['report-lines'],
    // sales_order_lines is already past Supabase/PostgREST's 1000-row unpaginated cap — must
    // match the same fetchAllRows-paginated queryFn as reports/page.tsx's own 'report-lines'
    // query, since react-query caches by key and whichever mounts first wins otherwise.
    queryFn: () => fetchAllRows((from, to) => supabase.from('sales_order_lines')
      .select('order_id, sku, product_name, brand, quantity_units, quantity_packs, line_total, line_type')
      .eq('line_type', 'commercial')
      .range(from, to))
  })

  // product_cogs is an append-only history log (a new row per edit, keyed by sku, not a live
  // "current cost" column) — the newest row per sku is the effective cost right now.
  const { data: cogsRows = [] } = useQuery({
    queryKey: ['margins-cogs'],
    queryFn: async () => {
      const { data } = await supabase.from('product_cogs')
        .select('sku, cogs, created_at')
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  // Supplier isn't a product attribute anywhere in the schema — only purchase_orders has a
  // partner_name, and a given SKU can come from different suppliers on different POs over time.
  // "Margin by supplier" below is therefore an approximation: each SKU is tagged with whichever
  // supplier most recently sold it to us, then product-level margin (from product_cogs, not
  // tied to any one PO) is rolled up under that tag.
  const { data: poLines = [] } = useQuery({
    queryKey: ['margins-po-lines'],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_order_lines').select('po_id, sku')
      return data ?? []
    }
  })

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['margins-purchase-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('purchase_orders')
        .select('id, partner_name, order_date')
        .neq('status', 'cancelled')
      return data ?? []
    }
  })

  const costBySku = useMemo(() => {
    const map: Record<string, number> = {}
    // cogsRows is already sorted created_at desc, so the first row seen per sku is the latest.
    ;(cogsRows as any[]).forEach(r => { if (!(r.sku in map)) map[r.sku] = Number(r.cogs) })
    return map
  }, [cogsRows])

  const supplierBySku = useMemo(() => {
    const poMap: Record<string, { partner_name: string; order_date: string }> = {}
    ;(purchaseOrders as any[]).forEach(po => { poMap[po.id] = po })
    const latest: Record<string, { partner: string; date: string }> = {}
    ;(poLines as any[]).forEach((l: any) => {
      const po = poMap[l.po_id]
      if (!po?.partner_name) return
      const date = po.order_date ?? ''
      if (!latest[l.sku] || date > latest[l.sku].date) latest[l.sku] = { partner: po.partner_name, date }
    })
    const out: Record<string, string> = {}
    Object.entries(latest).forEach(([sku, v]) => { out[sku] = v.partner })
    return out
  }, [poLines, purchaseOrders])

  const {
    productMargins, brandMargins, supplierMargins,
    totalRevenue, coveredRevenue, totalCost, totalProfit, overallMarginPct, costCoveragePct, skusMissingCost,
  } = useMemo(() => {
    const productMap: Record<string, { name: string; brand: string; revenue: number; cost: number; units: number }> = {}
    let totalRevenue = 0, coveredRevenue = 0, totalCost = 0
    const missingSkus = new Set<string>()

    ;(lines as any[]).forEach((l: any) => {
      if (!periodInvoiceIds.has(l.order_id)) return
      const revenue = l.line_total ?? 0
      totalRevenue += revenue
      const cost = costBySku[l.sku]
      if (cost == null) { missingSkus.add(l.sku); return }
      coveredRevenue += revenue
      if (!productMap[l.sku]) productMap[l.sku] = { name: l.product_name, brand: l.brand ?? 'Unknown', revenue: 0, cost: 0, units: 0 }
      const p = productMap[l.sku]
      const lineCost = cost * (l.quantity_units ?? 0)
      p.revenue += revenue
      p.cost += lineCost
      p.units += l.quantity_units ?? 0
      totalCost += lineCost
    })

    const productMargins = Object.entries(productMap)
      .map(([sku, p]) => ({
        key: sku, label: p.name, sub: sku, revenue: p.revenue, cost: p.cost, units: p.units,
        profit: p.revenue - p.cost, marginPct: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
      }))
      .filter(p => p.revenue > 0)

    const rollup = (getGroup: (p: typeof productMargins[number]) => string) => {
      const map: Record<string, { revenue: number; cost: number }> = {}
      productMargins.forEach(p => {
        const g = getGroup(p)
        if (!map[g]) map[g] = { revenue: 0, cost: 0 }
        map[g].revenue += p.revenue
        map[g].cost += p.cost
      })
      return Object.entries(map)
        .map(([key, v]) => ({
          key, label: key, revenue: v.revenue, cost: v.cost, profit: v.revenue - v.cost,
          marginPct: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0,
        }))
        .sort((a, b) => b.profit - a.profit)
    }

    const brandMargins = rollup(p => productMap[p.sub as string]?.brand ?? 'Unknown')
    const supplierMargins = rollup(p => supplierBySku[p.sub as string] ?? 'Unknown supplier')

    const totalProfit = coveredRevenue - totalCost
    const overallMarginPct = coveredRevenue > 0 ? (totalProfit / coveredRevenue) * 100 : 0
    const costCoveragePct = totalRevenue > 0 ? (coveredRevenue / totalRevenue) * 100 : 0

    return {
      productMargins, brandMargins, supplierMargins,
      totalRevenue, coveredRevenue, totalCost, totalProfit, overallMarginPct, costCoveragePct,
      skusMissingCost: missingSkus.size,
    }
  }, [lines, periodInvoiceIds, costBySku, supplierBySku])

  const sortedProducts = useMemo(() => {
    const list = [...productMargins]
    if (productSort === 'profit') list.sort((a, b) => b.profit - a.profit)
    else if (productSort === 'margin_desc') list.sort((a, b) => b.marginPct - a.marginPct)
    else list.sort((a, b) => a.marginPct - b.marginPct)
    return list
  }, [productMargins, productSort])

  const maxBrandProfit = Math.max(...brandMargins.map(b => Math.abs(b.profit)), 1)
  const maxSupplierProfit = Math.max(...supplierMargins.map(s => Math.abs(s.profit)), 1)
  const lowMarginProducts = [...productMargins].filter(p => p.revenue >= 200).sort((a, b) => a.marginPct - b.marginPct).slice(0, 8)

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Revenue', value: fmt(totalRevenue), icon: DollarSign, accent: false },
          { label: 'COGS', value: fmt(totalCost), icon: TrendingDown, accent: false },
          { label: 'Gross profit', value: fmt(totalProfit), icon: TrendingUp, accent: true },
          { label: 'Avg. margin', value: fmtPct(overallMarginPct), icon: TrendingUp, accent: true },
          { label: 'Cost data coverage', value: fmtPct(costCoveragePct), icon: Info, accent: false },
        ].map((k, i) => (
          <div key={i} className={`rounded-xl border p-4 ${k.accent ? 'border-gray-900 bg-gray-900' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon size={13} className={k.accent ? 'text-gray-400' : 'text-gray-400'} />
              <p className={`text-xs font-medium uppercase tracking-wide ${k.accent ? 'text-gray-400' : 'text-gray-500'}`}>{k.label}</p>
            </div>
            <p className={`text-lg font-bold ${k.accent ? 'text-white' : 'text-gray-900'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {skusMissingCost > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <p>
            {skusMissingCost} SKU{skusMissingCost > 1 ? 's' : ''} sold in this period have no cost recorded in Products
            (USD {(totalRevenue - coveredRevenue).toLocaleString('en-US', { maximumFractionDigits: 0 })} of revenue, excluded from
            every figure below rather than guessed at). Add their cost on the product page to sharpen this report.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Margin by brand</h2>
          <p className="text-xs text-gray-400 mb-4">Bar length = profit contribution · color = margin tier</p>
          {brandMargins.length === 0
            ? <p className="text-sm text-gray-400">No data yet</p>
            : brandMargins.map(b => <MarginBar key={b.key} row={b} maxProfit={maxBrandProfit} />)}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">Margin by supplier</h2>
          </div>
          <p className="text-xs text-gray-400 mb-4" title="Each SKU is tagged with whichever supplier most recently sold it to us — a product's cost isn't tracked per-supplier, so this approximates rather than exactly attributes.">
            Approximate — tagged by each SKU's most recent supplier
          </p>
          {supplierMargins.length === 0
            ? <p className="text-sm text-gray-400">No purchase history yet</p>
            : supplierMargins.map(s => <MarginBar key={s.key} row={s} maxProfit={maxSupplierProfit} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Products</h2>
            <select value={productSort} onChange={e => setProductSort(e.target.value as any)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none">
              <option value="profit">Sort: biggest profit</option>
              <option value="margin_desc">Sort: highest margin %</option>
              <option value="margin_asc">Sort: lowest margin %</option>
            </select>
          </div>
          <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
            {sortedProducts.slice(0, 20).map(p => (
              <div key={p.key} className="flex items-center justify-between px-4 md:px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate" title={p.label}>{p.label}</p>
                  <p className="text-xs text-gray-400 font-mono">{p.sub}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-sm font-semibold" style={{ color: marginColor(p.marginPct) }}>{fmtPct(p.marginPct)}</p>
                  <p className="text-xs text-gray-400">{fmt(p.profit)} profit</p>
                </div>
              </div>
            ))}
            {sortedProducts.length === 0 && <p className="text-sm text-gray-400 px-4 md:px-5 py-6 text-center">No priced sales yet</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Watch list — lowest margin</h2>
            <p className="text-xs text-gray-400 mt-0.5">Products with at least USD 200 of revenue this period, worst margin first</p>
          </div>
          <div className="divide-y divide-gray-50">
            {lowMarginProducts.map(p => (
              <div key={p.key} className="flex items-center justify-between px-4 md:px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate" title={p.label}>{p.label}</p>
                  <p className="text-xs text-gray-400 font-mono">{p.sub}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-sm font-semibold" style={{ color: marginColor(p.marginPct) }}>{fmtPct(p.marginPct)}</p>
                  <p className="text-xs text-gray-400">{fmt(p.revenue)} revenue</p>
                </div>
              </div>
            ))}
            {lowMarginProducts.length === 0 && <p className="text-sm text-gray-400 px-4 md:px-5 py-6 text-center">Nothing below the revenue threshold</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
