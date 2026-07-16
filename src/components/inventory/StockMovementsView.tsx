'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useState, useMemo } from 'react'
import { Download, Package, Search } from 'lucide-react'
import { useT } from '@/lib/i18n/LanguageProvider'

const WAREHOUSES = ['All', 'T1', 'Central', 'Aged', 'Sample', 'Private']
// "Aged" stays the DB/data key — only the on-screen label changes
const WAREHOUSE_LABELS: Record<string, string> = { Aged: 'Central Ageing' }

const getDocLabel = (o: any) => {
  if (o.document_type === 'stock_inbound') return 'STOCK IN'
  if (o.document_type === 'client_return') return 'RETURN'
  if (o.document_type === 'stocktake_diff') return 'STOCKTAKE'
  if (o.document_type === 'transformation') return 'TRANSFORM'
  if (o.document_type === 'so_int') return 'SO(INT)'
  if (o.is_foc && o.document_type === 'invoice') return 'INV(DO)'
  if (o.is_foc) return 'SO(DO)'
  if (o.is_sample) return 'SO(SAMPLE)'
  if (o.document_type === 'invoice') return 'INV'
  return o.document_type?.toUpperCase()
}

// Movement types that INCREASE stock — everything else (out, transfer_out, *_reversed) decreases it.
// Used to sign the pivot so the Opening/Closing stock math (opening = current + net change) stays correct
// now that inbound movements (Stock Inbound, Client Return, Stocktake surplus) show up alongside sales.
const INBOUND_MOVEMENT_TYPES = new Set(['in', 'stock_inbound', 'client_return_in', 'stocktake_in', 'transformation_in', 'transfer_in'])

const getDocColor = (o: any) => {
  if (o.document_type === 'stock_inbound') return '#0891b2'
  if (o.document_type === 'client_return') return '#db2777'
  if (o.document_type === 'stocktake_diff') return '#ca8a04'
  if (o.document_type === 'transformation') return '#4f46e5'
  if (o.document_type === 'so_int') return '#0d9488'
  if (o.is_foc) return '#16a34a'
  if (o.document_type === 'invoice') return '#7c3aed'
  if (o.is_sample) return '#d97706'
  return '#2563eb'
}

export default function StockMovementsView() {
  const supabase = createClient()
  const t = useT()
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [dateFrom, setDateFrom] = useState(startOfYear)
  const [dateTo, setDateTo]     = useState(today)
  const [warehouse, setWarehouse] = useState('All')
  const [unit, setUnit]           = useState<'units' | 'packs'>('units')
  const [search, setSearch]       = useState('')

  // Fetch stock movements in date range — joined with order data via view
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['stock-movements-range', dateFrom, dateTo, warehouse],
    queryFn: async () => {
      let q = supabase
        .from('v_stock_movements_full')
        .select('*')
        .gte('created_at', dateFrom + 'T00:00:00')
        .lte('created_at', dateTo + 'T23:59:59')
        .order('created_at', { ascending: true })

      if (warehouse !== 'All') q = q.eq('warehouse', warehouse)
      const { data } = await q
      return data ?? []
    }
  })

  // Order data is now embedded in each movement row via the view
  const orders: any[] = []

  // Fetch current stock levels
  const { data: currentStock = [] } = useQuery({
    queryKey: ['inventory-current'],
    queryFn: async () => {
      const { data } = await supabase
        .from('v_inventory_by_warehouse')
        .select('sku, packs_total, units_total, packs_t1, packs_central, packs_aged, packs_sample, packs_private')
      return data ?? []
    }
  })

  const stockMap = useMemo(() => {
    const m: Record<string, any> = {}
    ;(currentStock as any[]).forEach((r: any) => { m[r.sku] = r })
    return m
  }, [currentStock])

  // Fetch products for SKU names
  const { data: products = [] } = useQuery({
    queryKey: ['products-stock'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name, brand, line, vitola')
        .eq('product_role', 'original')
      return data ?? []
    }
  })

  // Build orderMap from embedded view data (no secondary query needed)
  const orderMap = useMemo(() => {
    const m: Record<string, any> = {}
    ;(movements as any[]).forEach((mv: any) => {
      if (mv.reference_id && !m[mv.reference_id]) {
        m[mv.reference_id] = {
          id: mv.reference_id,
          order_number: mv.so_order_number ?? mv.reference_number,
          document_type: mv.document_type,
          is_foc: mv.is_foc,
          is_sample: mv.is_sample,
          customer_name: mv.customer_name,
          order_date: mv.order_date,
        }
      }
    })
    return m
  }, [movements])

  const productMap = useMemo(() => {
    const m: Record<string, any> = {}
    ;(products as any[]).forEach((p: any) => { m[p.sku] = p })
    return m
  }, [products])

  // Build pivot: rows = SKUs, columns = orders
  const { skus, orderedCols, pivot } = useMemo(() => {
    const skuSet = new Set<string>()
    const orderSet = new Set<string>()
    const data: Record<string, Record<string, number>> = {}

    ;(movements as any[]).forEach((m: any) => {
      skuSet.add(m.sku)
      if (m.reference_id) orderSet.add(m.reference_id)
      if (!data[m.sku]) data[m.sku] = {}
      if (!data[m.sku][m.reference_id]) data[m.sku][m.reference_id] = 0
      const qty = unit === 'units' ? m.quantity_units : m.quantity_packs
      data[m.sku][m.reference_id] += INBOUND_MOVEMENT_TYPES.has(m.movement_type) ? -qty : qty
    })

    // Sort orders by date
    const orderedCols = Array.from(orderSet).sort((a, b) => {
      const oa = orderMap[a]?.order_date ?? ''
      const ob = orderMap[b]?.order_date ?? ''
      return oa.localeCompare(ob)
    })

    // Sort SKUs by brand
    const skus = Array.from(skuSet).sort((a, b) => {
      const pa = productMap[a]?.brand ?? a
      const pb = productMap[b]?.brand ?? b
      return pa.localeCompare(pb) || a.localeCompare(b)
    })

    return { skus, orderedCols, pivot: data }
  }, [movements, orderMap, productMap, unit])

  // Row totals
  const rowTotal = (sku: string) =>
    orderedCols.reduce((s, col) => s + (pivot[sku]?.[col] ?? 0), 0)

  // Col totals
  const colTotal = (col: string) =>
    skus.reduce((s, sku) => s + (pivot[sku]?.[col] ?? 0), 0)

  const grandTotal = skus.reduce((s, sku) => s + rowTotal(sku), 0)

  const closingTotal = skus.reduce((s, sku) => {
    const st = stockMap[sku]
    return s + (unit === 'units' ? (st?.units_total ?? 0) : (st?.packs_total ?? 0))
  }, 0)
  const openingTotal = closingTotal + grandTotal

  // Row-level search — filters which SKUs are shown, doesn't affect column/footer totals
  const filteredSkus = skus.filter(sku => {
    if (!search) return true
    const p = productMap[sku]
    const q = search.toLowerCase()
    return sku.toLowerCase().includes(q) || p?.full_name?.toLowerCase().includes(q) || p?.brand?.toLowerCase().includes(q)
  })

  // Export to Excel
  const handleExport = async () => {
    const XLSX = await import('xlsx')

    // Group movements by warehouse for tabs
    const warehouseGroups: Record<string, any[]> = {}
    ;(movements as any[]).forEach((m: any) => {
      if (!warehouseGroups[m.warehouse]) warehouseGroups[m.warehouse] = []
      warehouseGroups[m.warehouse].push(m)
    })

    const wb = XLSX.utils.book_new()

    Object.entries(warehouseGroups).forEach(([wh, whMovements]) => {
      const whSkus = Array.from(new Set(whMovements.map((m: any) => m.sku))).sort()
      const whOrders = Array.from(new Set(whMovements.map((m: any) => m.reference_id).filter(Boolean)))
        .sort((a, b) => (orderMap[a]?.order_date ?? '').localeCompare(orderMap[b]?.order_date ?? ''))

      // Build pivot for this warehouse
      const whPivot: Record<string, Record<string, number>> = {}
      whMovements.forEach((m: any) => {
        if (!whPivot[m.sku]) whPivot[m.sku] = {}
        if (!whPivot[m.sku][m.reference_id]) whPivot[m.sku][m.reference_id] = 0
        whPivot[m.sku][m.reference_id] += m.quantity_units
      })

      // Header rows
      const row1 = ['SKU', 'Brand', 'Product', ...whOrders.map(id => {
        const o = orderMap[id]
        return o ? `${o.order_number} (${o.customer_name ?? ''})` : id
      }), 'TOTAL']
      const row2 = ['', '', '', ...whOrders.map(id => {
        const o = orderMap[id]
        return o ? getDocLabel(o) : ''
      }), '']
      const row3 = ['', '', '', ...whOrders.map(id => {
        const o = orderMap[id]
        return o?.order_date ?? ''
      }), '']

      const dataRows = whSkus.map(sku => {
        const p = productMap[sku]
        const total = whOrders.reduce((s, id) => s + (whPivot[sku]?.[id] ?? 0), 0)
        return [
          sku,
          p?.brand ?? '',
          p?.full_name ?? sku,
          ...whOrders.map(id => whPivot[sku]?.[id] ?? 0),
          total
        ]
      })

      const totalRow = ['', '', 'TOTAL', ...whOrders.map(id =>
        whSkus.reduce((s, sku) => s + (whPivot[sku]?.[id] ?? 0), 0)
      ), whSkus.reduce((s, sku) => s + whOrders.reduce((ss, id) => ss + (whPivot[sku]?.[id] ?? 0), 0), 0)]

      const ws = XLSX.utils.aoa_to_sheet([row1, row2, row3, ...dataRows, totalRow])
      ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 35 }, ...whOrders.map(() => ({ wch: 18 })), { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, ws, wh.substring(0, 31))
    })

    const fileName = `stock_movements_${dateFrom}_${dateTo}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Stock Movements</h2>
        <button onClick={handleExport} disabled={movements.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition-colors">
          <Download className="h-4 w-4" /> Export Excel
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder={t('inventory.search_placeholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 uppercase">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-8 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 uppercase">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-8 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
        </div>
        <div className="flex gap-1.5">
          {WAREHOUSES.map(w => (
            <button key={w} onClick={() => setWarehouse(w)}
              className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ' +
                (warehouse === w ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
              {WAREHOUSE_LABELS[w] ?? w}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-auto bg-gray-100 rounded-lg p-1">
          <button onClick={() => setUnit('units')}
            className={'px-3 py-1 rounded-md text-xs font-medium transition-colors ' +
              (unit === 'units' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900')}>
            Units
          </button>
          <button onClick={() => setUnit('packs')}
            className={'px-3 py-1 rounded-md text-xs font-medium transition-colors ' +
              (unit === 'packs' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900')}>
            Packs
          </button>
        </div>
      </div>

      {/* Pivot Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filteredSkus.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Package className="h-8 w-8 mb-2" />
            <p className="text-sm">{skus.length === 0 ? 'No movements in this period' : `No results for "${search}"`}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse" style={{ minWidth: '100%' }}>
              <thead>
                {/* Row 1: doc type badges */}
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-2 font-medium text-gray-600 min-w-48 border-r border-gray-200">Product</th>
                  <th className="sticky left-48 z-10 bg-gray-50 text-left px-3 py-2 font-medium text-gray-600 min-w-24 border-r border-gray-200">SKU</th>
                  {orderedCols.map(col => {
                    const o = orderMap[col]
                    return (
                      <th key={col} className="px-3 py-2 text-center min-w-32 border-r border-gray-100">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium text-white" style={{ backgroundColor: o ? getDocColor(o) : '#6b7280' }}>
                          {o ? getDocLabel(o) : '?'}
                        </span>
                      </th>
                    )
                  })}
                  <th className="px-3 py-2 text-right min-w-24 bg-gray-100">
                    <div className="font-semibold text-gray-700">TOTAL</div>
                    <div className="font-mono text-xs font-bold text-gray-900">{grandTotal.toLocaleString('en-US')}</div>
                  </th>
                  <th className="px-3 py-2 text-right min-w-24 bg-blue-50">
                    <div className="font-semibold text-blue-700">OPENING</div>
                    <div className="font-mono text-xs font-bold text-blue-700">{openingTotal.toLocaleString('en-US')}</div>
                  </th>
                  <th className="px-3 py-2 text-right min-w-24 bg-green-50">
                    <div className="font-semibold text-green-700">CLOSING</div>
                    <div className="font-mono text-xs font-bold text-green-700">{closingTotal.toLocaleString('en-US')}</div>
                  </th>
                </tr>
                {/* Row 2: order numbers */}
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-gray-50 border-r border-gray-200" />
                  <th className="sticky left-48 z-10 bg-gray-50 border-r border-gray-200" />
                  {orderedCols.map(col => {
                    const o = orderMap[col]
                    return (
                      <th key={col} className="px-3 py-1.5 text-center border-r border-gray-100">
                        <div className="font-mono text-xs text-gray-700 font-semibold">{o?.order_number ?? '—'}</div>
                        <div className="text-xs text-gray-400 truncate max-w-28">{o?.customer_name ?? ''}</div>
                      </th>
                    )
                  })}
                  <th className="bg-gray-100" />
                  <th className="bg-blue-50" />
                  <th className="bg-green-50" />
                </tr>
                {/* Row 3: dates */}
                <tr className="bg-gray-50 border-b border-gray-300">
                  <th className="sticky left-0 z-10 bg-gray-50 border-r border-gray-200 px-4 py-1.5 text-left text-xs text-gray-400">Brand · Vitola</th>
                  <th className="sticky left-48 z-10 bg-gray-50 border-r border-gray-200 px-3 py-1.5 text-xs text-gray-400">SKU</th>
                  {orderedCols.map(col => {
                    const o = orderMap[col]
                    return (
                      <th key={col} className="px-3 py-1.5 text-center border-r border-gray-100 text-xs text-gray-400 font-normal">
                        {o?.order_date ? new Date(o.order_date).toLocaleDateString('en-GB') : ''}
                      </th>
                    )
                  })}
                  <th className="bg-gray-100" />
                  <th className="bg-blue-50 px-3 py-1.5 text-xs text-blue-400 font-normal text-right">start</th>
                  <th className="bg-green-50 px-3 py-1.5 text-xs text-green-400 font-normal text-right">end</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSkus.map((sku, idx) => {
                  const p = productMap[sku]
                  const total = rowTotal(sku)
                  return (
                    <tr key={sku} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="sticky left-0 z-10 px-4 py-2.5 border-r border-gray-200 min-w-48"
                        style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <div className="font-medium text-gray-900 text-xs">{p?.brand ?? sku}</div>
                        <div className="text-gray-400 text-xs">{p?.vitola ?? ''}</div>
                      </td>
                      <td className="sticky left-48 z-10 px-3 py-2.5 font-mono text-xs text-gray-500 border-r border-gray-200 min-w-24"
                        style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        {sku}
                      </td>
                      {orderedCols.map(col => {
                        const val = pivot[sku]?.[col]
                        return (
                          <td key={col} className="px-3 py-2.5 text-right border-r border-gray-100 font-mono text-xs">
                            {val ? <span className="text-gray-800 font-medium">{Math.abs(val).toLocaleString('en-US')}</span> : <span className="text-gray-200">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-gray-900 bg-gray-50">
                        {total.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-blue-600 bg-blue-50/50">
                        {(() => {
                          const s = stockMap[sku]
                          const cur = unit === 'units' ? (s?.units_total ?? 0) : (s?.packs_total ?? 0)
                          return (cur + total).toLocaleString('en-US')
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-green-700 bg-green-50/50">
                        {(() => {
                          const s = stockMap[sku]
                          return unit === 'units' ? (s?.units_total ?? 0).toLocaleString('en-US') : (s?.packs_total ?? 0).toLocaleString('en-US')
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-300">
                  <td className="sticky left-0 z-10 bg-gray-100 px-4 py-2.5 font-bold text-gray-900 text-xs border-r border-gray-200">TOTAL</td>
                  <td className="sticky left-48 z-10 bg-gray-100 border-r border-gray-200" />
                  {orderedCols.map(col => (
                    <td key={col} className="px-3 py-2.5 text-right font-mono text-xs font-bold text-gray-900 border-r border-gray-200">
                      {colTotal(col).toLocaleString('en-US')}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-gray-900 bg-gray-200">
                    {grandTotal.toLocaleString('en-US')}
                  </td>
                  <td className="bg-gray-100" />
                  <td className="bg-gray-100" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}