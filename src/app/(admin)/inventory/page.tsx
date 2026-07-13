'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Warehouse, Plus, Search, Trash2, Download, Upload, ArrowLeftRight } from 'lucide-react'
import { logActivity } from '@/lib/log-activity'
import SkuMovementsModal from '@/components/inventory/SkuMovementsModal'
import { useT } from '@/lib/i18n/LanguageProvider'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']

const WH_COLORS: Record<string, string> = {
  T1:      'bg-blue-100 text-blue-700',
  Central: 'bg-purple-100 text-purple-700',
  Aged:    'bg-amber-100 text-amber-700',
  Sample:  'bg-green-100 text-green-700',
  Private: 'bg-red-100 text-red-700',
  Total:   'bg-gray-800 text-white',
}

const fmtMoney = (n: number) => `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const fmtUnit = (n: number) => `USD ${n.toFixed(2)}`

export default function InventoryPage() {
  const supabase = createClient()
  const t = useT()
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('All')
  const [showAddStock, setShowAddStock] = useState(false)
  const [addMode, setAddMode] = useState<'manual' | 'excel'>('manual')
  const blankStockRow = { sku: '', product_name: '', brand: '', warehouse: 'T1', quantity_packs: 0, quantity_units: 0 }
  const [stockRows, setStockRows] = useState([{ ...blankStockRow }])
  const [saving, setSaving] = useState(false)
  const [selectedSku, setSelectedSku] = useState<{ sku: string; name: string } | null>(null)
  const queryClient = useQueryClient()

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data } = await supabase
        .from('v_inventory_by_warehouse')
        .select('*')
        .order('brand')
      return data ?? []
    }
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-simple'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('sku, full_name, brand, units_per_pack')
        .eq('product_role', 'original')
        .eq('status', 'active')
        .order('brand')
      return data ?? []
    }
  })

  const { data: allCogs = [] } = useQuery({
    queryKey: ['product-cogs-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('product_cogs')
        .select('sku, cogs, currency')
        .order('created_at', { ascending: false })
      return data ?? []
    }
  })

  // Most recent COGS entry per SKU
  const currentCogs: Record<string, number> = {}
  for (const entry of allCogs as any[]) {
    if (currentCogs[entry.sku] === undefined) currentCogs[entry.sku] = Number(entry.cogs) || 0
  }

  const filtered = inventory.filter((r: any) => {
    const matchSearch = !search ||
      r.sku?.toLowerCase().includes(search.toLowerCase()) ||
      r.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.brand?.toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const getStock = (row: any) => {
    if (warehouseFilter === 'All') return { packs: row.packs_total, units: row.units_total }
    const wh = warehouseFilter.toLowerCase()
    return { packs: row[`packs_${wh}`] ?? 0, units: row[`units_${wh}`] ?? 0 }
  }

  const addStockRow = () => setStockRows(rows => [...rows, { ...blankStockRow }])
  const removeStockRow = (idx: number) => setStockRows(rows => rows.filter((_, i) => i !== idx))
  const updateStockRow = (idx: number, field: keyof typeof blankStockRow, value: string | number) => {
    setStockRows(rows => rows.map((r, i) => {
      if (i !== idx) return r
      if (field === 'sku') {
        const p = (products as any[]).find((p: any) => p.sku === value)
        return { ...r, sku: value as string, product_name: p?.full_name ?? '', brand: p?.brand ?? '' }
      }
      return { ...r, [field]: value }
    }))
  }
  const resetStockForm = () => {
    setStockRows([{ ...blankStockRow }])
    setAddMode('manual')
  }

  const handleSaveStockRows = async () => {
    const valid = stockRows.filter(r => r.sku && (r.quantity_packs > 0 || r.quantity_units > 0))
    if (!valid.length) return
    setSaving(true)
    const { error } = await supabase.from('inventory_records').upsert(
      valid.map(r => ({
        sku: r.sku, product_name: r.product_name, brand: r.brand, warehouse: r.warehouse,
        category: 'available', quantity_packs: r.quantity_packs, quantity_units: r.quantity_units,
      })),
      { onConflict: 'sku,warehouse,category' }
    )

    if (!error) {
      await logActivity({
        action: 'adjust_inventory',
        entityType: 'product',
        entityRef: valid.length === 1 ? valid[0].sku : `bulk (${valid.length})`,
        metadata: { rows: valid.map(r => ({ sku: r.sku, warehouse: r.warehouse, packs: r.quantity_packs, units: r.quantity_units })) },
      })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setShowAddStock(false)
      resetStockForm()
    }
    setSaving(false)
  }

  const downloadStockTemplate = async () => {
    const XLSX = await import('xlsx')
    const rows = (products as any[]).map((p: any) => ({
      'SKU': p.sku,
      [t('inventory.col_product')]: p.full_name,
      [t('inventory.col_brand')]: p.brand,
      [t('inventory.label_warehouse')]: '',
      [t('inventory.label_packs')]: 0,
      [t('inventory.label_units')]: 0,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [16, 32, 16, 14, 10, 10].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock')
    XLSX.writeFile(wb, 'inventory_template.xlsx')
  }

  const handleUploadStockFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(ws)

    const byId = new Map((products as any[]).map((p: any) => [p.sku, p]))
    const warehouseKey = t('inventory.label_warehouse')
    const packsKey = t('inventory.label_packs')
    const unitsKey = t('inventory.label_units')

    const upserts: any[] = []
    let skipped = 0
    for (const row of rows) {
      const sku = row['SKU']
      const product = byId.get(sku)
      const warehouse = WAREHOUSES.find(w => w.toLowerCase() === String(row[warehouseKey] ?? '').trim().toLowerCase())
      const packs = parseInt(row[packsKey]) || 0
      const units = parseInt(row[unitsKey]) || 0
      if (!product || !warehouse || (packs <= 0 && units <= 0)) { skipped++; continue }
      upserts.push({
        sku, product_name: product.full_name, brand: product.brand, warehouse,
        category: 'available', quantity_packs: packs, quantity_units: units,
      })
    }

    let error = null
    if (upserts.length) {
      const res = await supabase.from('inventory_records').upsert(upserts, { onConflict: 'sku,warehouse,category' })
      error = res.error
      if (!error) {
        await logActivity({
          action: 'adjust_inventory',
          entityType: 'product',
          entityRef: `bulk upload (${upserts.length})`,
          metadata: { rows: upserts.map(r => ({ sku: r.sku, warehouse: r.warehouse, packs: r.quantity_packs, units: r.quantity_units })) },
        })
        queryClient.invalidateQueries({ queryKey: ['inventory'] })
      }
    }

    alert(error ? `Error: ${error.message}` : `${upserts.length} / ${rows.length}${skipped ? ` (${skipped} skipped)` : ''}`)
    e.target.value = ''
    if (!error && upserts.length) { setShowAddStock(false); resetStockForm() }
  }

  const totalPacks = inventory.reduce((s: number, r: any) => s + (r.packs_total ?? 0), 0)
  const totalUnits = inventory.reduce((s: number, r: any) => s + (r.units_total ?? 0), 0)

  const handleExportInventory = async () => {
    const XLSX = await import('xlsx')
    const packsLabel = t('inventory.label_packs')
    const unitsLabel = t('inventory.label_units')
    const totalLabel = t('inventory.col_total')
    const rows = filtered.map((row: any) => {
      const unitCogs = currentCogs[row.sku] ?? 0
      const out: Record<string, string | number> = {
        'SKU': row.sku,
        [t('inventory.col_product')]: row.product_name,
        [t('inventory.col_brand')]: row.brand,
      }
      WAREHOUSES.forEach(w => {
        const wh = w.toLowerCase()
        out[`${w} ${packsLabel}`] = row[`packs_${wh}`] ?? 0
        out[`${w} ${unitsLabel}`] = row[`units_${wh}`] ?? 0
      })
      out[`${totalLabel} ${packsLabel}`] = row.packs_total ?? 0
      out[`${totalLabel} ${unitsLabel}`] = row.units_total ?? 0
      out['COGS/u'] = unitCogs
      out['COGS total'] = unitCogs * (row.units_total ?? 0)
      return out
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
    XLSX.writeFile(wb, 'inventory_export.xlsx')
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('inventory.page_title')}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportInventory}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            {t('inventory.export')}
          </button>
          <Link
            href="/stock_movements"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeftRight className="h-4 w-4" />
            {t('inventory.stock_movements')}
          </Link>
          <button
            onClick={() => setShowAddStock(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('inventory.add_stock')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('inventory.search_placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 flex-nowrap">
          {['All', ...WAREHOUSES].map(w => (
            <button
              key={w}
              onClick={() => setWarehouseFilter(w)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                warehouseFilter === w
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {w === 'All' ? t('common.all') : w}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 md:gap-3 mb-6">
        {[...WAREHOUSES, 'Total'].map(wh => {
          const whKey = wh.toLowerCase()
          const isTotal = wh === 'Total'
          const packs = isTotal ? totalPacks : inventory.reduce((s: number, r: any) => s + (r[`packs_${whKey}`] ?? 0), 0)
          const units = isTotal ? totalUnits : inventory.reduce((s: number, r: any) => s + (r[`units_${whKey}`] ?? 0), 0)
          const value = inventory.reduce((s: number, r: any) =>
            s + (currentCogs[r.sku] ?? 0) * (isTotal ? (r.units_total ?? 0) : (r[`units_${whKey}`] ?? 0)), 0)
          return (
            <div key={wh} className={`bg-white rounded-xl border p-3 md:p-4 ${isTotal ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${WH_COLORS[wh]}`}>{wh}</span>
              </div>
              <p className="text-lg md:text-2xl font-bold text-gray-900">{units.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('inventory.label_units')}</p>
              <p className="text-sm font-semibold text-gray-500 mt-1">{packs.toLocaleString()}</p>
              <p className="text-xs text-gray-400">{t('inventory.label_packs')}</p>
              {value > 0 && (
                <p className="text-xs font-semibold text-blue-600 mt-1.5 pt-1.5 border-t border-gray-100">{fmtMoney(value)}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Warehouse className="h-8 w-8 mb-2" />
            <p className="text-sm">{t('inventory.no_records')}</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map((row: any) => {
                const stock = getStock(row)
                const unitCogs = currentCogs[row.sku] ?? 0
                return (
                  <div
                    key={row.sku}
                    className="px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => setSelectedSku({ sku: row.sku, name: row.product_name })}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-mono text-xs text-gray-400">{row.sku}</span>
                      <span className={`text-sm font-bold ${stock.packs === 0 ? 'text-red-400' : stock.packs < 5 ? 'text-amber-500' : 'text-gray-900'}`}>
                        {stock.units} u
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{row.product_name}</p>
                        <p className="text-xs text-gray-500">{row.brand}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-gray-400 block">{stock.packs} SKU</span>
                        {unitCogs > 0 && (
                          <span className="text-[10px] text-gray-300">{fmtUnit(unitCogs)}/u · {fmtMoney(unitCogs * stock.units)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{t('inventory.col_sku')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{t('inventory.col_product')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{t('inventory.col_brand')}</th>
                    {warehouseFilter === 'All' ? (
                      WAREHOUSES.map(w => (
                        <th key={w} className="text-right px-3 py-3 font-medium text-gray-600">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${WH_COLORS[w]}`}>{w}</span>
                        </th>
                      ))
                    ) : null}
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      {warehouseFilter === 'All' ? t('inventory.col_total') : warehouseFilter}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((row: any) => {
                    const stock = getStock(row)
                    const unitCogs = currentCogs[row.sku] ?? 0
                    return (
                      <tr
                        key={row.sku}
                        className="hover:bg-blue-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedSku({ sku: row.sku, name: row.product_name })}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.sku}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.product_name}</td>
                        <td className="px-4 py-3 text-gray-600">{row.brand}</td>
                        {warehouseFilter === 'All' ? (
                          WAREHOUSES.map(w => {
                            const wh = w.toLowerCase()
                            const p = row[`packs_${wh}`] ?? 0
                            return (
                              <td key={w} className="px-3 py-3 text-right">
                                {p < 0 ? (
                                  <span className="font-medium text-red-500">{p}</span>
                                ) : p > 0 ? (
                                  <span className="font-medium text-gray-900">{p}</span>
                                ) : (
                                  <span className="text-gray-200">—</span>
                                )}
                              </td>
                            )
                          })
                        ) : null}
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`font-semibold ${stock.packs < 0 ? 'text-red-600 font-bold' : stock.packs === 0 ? 'text-red-400' : stock.packs < 5 ? 'text-amber-500' : 'text-gray-900'}`}>
                              {stock.units} u
                            </span>
                            <span className="text-xs text-gray-400">{stock.packs} SKU</span>
                            {unitCogs > 0 && (
                              <span className="text-[10px] text-gray-300">{fmtUnit(unitCogs)}/u · {fmtMoney(unitCogs * stock.units)}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* SKU Movements Modal */}
      {selectedSku && (
        <SkuMovementsModal
          sku={selectedSku.sku}
          productName={selectedSku.name}
          onClose={() => setSelectedSku(null)}
        />
      )}

      {/* Add Stock Modal */}
      {showAddStock && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-gray-200 w-full sm:max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">{t('inventory.add_stock')}</h2>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button onClick={() => setAddMode('manual')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${addMode === 'manual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
                  {t('inventory.manual_entry')}
                </button>
                <button onClick={() => setAddMode('excel')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${addMode === 'excel' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
                  {t('inventory.excel_import')}
                </button>
              </div>
            </div>

            {addMode === 'manual' ? (
              <>
                <div className="space-y-3">
                  {stockRows.map((row, idx) => (
                    <div key={idx} className="flex flex-wrap items-end gap-2 border border-gray-100 rounded-lg p-3">
                      <div className="flex-1 min-w-40">
                        <label className="text-xs font-medium text-gray-500 uppercase">{t('inventory.col_product')}</label>
                        <select
                          className="mt-1 w-full h-9 rounded-md border border-gray-200 px-2 text-sm focus:outline-none"
                          value={row.sku}
                          onChange={e => updateStockRow(idx, 'sku', e.target.value)}
                        >
                          <option value="">{t('inventory.select_product')}</option>
                          {(products as any[]).map((p: any) => (
                            <option key={p.sku} value={p.sku}>{p.full_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-28">
                        <label className="text-xs font-medium text-gray-500 uppercase">{t('inventory.label_warehouse')}</label>
                        <select
                          className="mt-1 w-full h-9 rounded-md border border-gray-200 px-2 text-sm focus:outline-none"
                          value={row.warehouse}
                          onChange={e => updateStockRow(idx, 'warehouse', e.target.value)}
                        >
                          {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                      <div className="w-20">
                        <label className="text-xs font-medium text-gray-500 uppercase">{t('inventory.label_packs')}</label>
                        <input
                          type="number" min={0} value={row.quantity_packs || ''}
                          onChange={e => updateStockRow(idx, 'quantity_packs', parseInt(e.target.value) || 0)}
                          className="mt-1 w-full h-9 rounded-md border border-gray-200 px-2 text-sm focus:outline-none"
                        />
                      </div>
                      <div className="w-20">
                        <label className="text-xs font-medium text-gray-500 uppercase">{t('inventory.label_units')}</label>
                        <input
                          type="number" min={0} value={row.quantity_units || ''}
                          onChange={e => updateStockRow(idx, 'quantity_units', parseInt(e.target.value) || 0)}
                          className="mt-1 w-full h-9 rounded-md border border-gray-200 px-2 text-sm focus:outline-none"
                        />
                      </div>
                      <button onClick={() => removeStockRow(idx)} disabled={stockRows.length === 1}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addStockRow}
                  className="flex items-center gap-1.5 mt-3 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> {t('inventory.add_row')}
                </button>
                <div className="flex justify-between mt-6">
                  <button onClick={() => { setShowAddStock(false); resetStockForm() }} className="text-sm text-gray-500 hover:text-gray-900">{t('common.cancel')}</button>
                  <button
                    onClick={handleSaveStockRows}
                    disabled={saving || !stockRows.some(r => r.sku && (r.quantity_packs > 0 || r.quantity_units > 0))}
                    className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
                  >
                    {saving ? t('common.saving') : t('inventory.save_all')}
                  </button>
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-4">{t('inventory.excel_import_hint')}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={downloadStockTemplate}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                    <Download className="h-4 w-4" /> {t('inventory.download_template')}
                  </button>
                  <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors">
                    <Upload className="h-4 w-4" /> {t('inventory.upload_excel')}
                    <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleUploadStockFile} />
                  </label>
                </div>
                <div className="flex justify-end mt-6">
                  <button onClick={() => { setShowAddStock(false); resetStockForm() }} className="text-sm text-gray-500 hover:text-gray-900">{t('common.cancel')}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
