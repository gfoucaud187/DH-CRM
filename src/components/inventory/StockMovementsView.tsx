'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useState, useMemo } from 'react'
import { Download, Package } from 'lucide-react'

const WAREHOUSES = ['All', 'T1', 'Central', 'Aged', 'Sample', 'Private']

const getDocLabel = (o: any) => {
  if (o.document_type === 'so_int') return 'SO(INT)'
  if (o.is_foc && o.document_type === 'invoice') return 'INV(DO)'
  if (o.is_foc) return 'SO(DO)'
  if (o.is_sample) return 'SO(SAMPLE)'
  if (o.document_type === 'invoice') return 'INV'
  return o.document_type?.toUpperCase()
}

const getDocColor = (o: any) => {
  if (o.document_type === 'so_int') return '#0d9488'
  if (o.is_foc) return '#16a34a'
  if (o.document_type === 'invoice') return '#7c3aed'
  if (o.is_sample) return '#d97706'
  return '#2563eb'
}

export default function StockMovementsView() {
  const supabase = createClient()
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [dateFrom, setDateFrom] = useState(startOfYear)
  const [dateTo, setDateTo]     = useState(today)
  const [warehouse, setWarehouse] = useState('All')
  const [unit, setUnit]           = useState<'units' | 'packs'>('units')

  // Fetch stock movements in date range
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['stock-movements-range', dateFrom, dateTo, warehouse],
    queryFn: async () => {
      let q = supabase
        .from('stock_movements')
        .select('*')
        .gte('created_at', dateFrom + 'T00:00:00')
        .lte('created_at', dateTo + 'T23:59:59')
        .in('movement_type', ['out', 'transfer_out'])
        .order('created_at', { ascending: true })

      if (warehouse !== 'All') q = q.eq('warehouse', warehouse)
      const { data } = await q
      return data ?? []
    }
  })

  // Fetch orders for these movements
  const referenceIds = useMemo(() =>
    Array.from(new Set((movements as any[]).map((m: any) => m.reference_id).filter(Boolean))),
    [movements]
  )

  const { data: orders = [] } = useQuery({
    queryKey: ['movements-orders', referenceIds.join(',')],
    queryFn: async () => {
      if (referenceIds.length === 0) return []
      const { data } = await supabase
        .from('sales_orders')
        .select('id, order_number, document_type, is_foc, is_sample, customer_name, order_date, warehouse')
        .in('id', referenceIds)
      return data ?? []
    },
    enabled: referenceIds.length > 0
  })

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

  const orderMap = useMemo(() => {
    const m: Record<string, any> = {}
    ;(orders as any[]).forEach((o: any) => { m[o.id] = o })
    return m
  }, [orders])

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
      data[m.sku][m.reference_id] += unit === 'units' ? m.quantity_units : m.quantity_packs
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
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Stock Movements</h2>
        <button onClick={handleExport} disabled={movements.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition-colors">
          <Download className="h-4 w-4" /> Export Excel
        </button>
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
              {w}
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
        ) : skus.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Package className="h-8 w-8 mb-2" />
            <p className="text-sm">No movements in this period</p>
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
                  <th className="px-3 py-2 text-right min-w-24 bg-gray-100 font-semibold text-gray-700">TOTAL</th>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {skus.map((sku, idx) => {
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
                            {val ? <span className="text-gray-800 font-medium">{val.toLocaleString('en-US')}</span> : <span className="text-gray-200">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-right font-mono text-sm font-bold text-gray-900 bg-gray-50">
                        {total.toLocaleString('en-US')}
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
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}