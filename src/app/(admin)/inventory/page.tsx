'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Warehouse, Plus, Search } from 'lucide-react'
import SkuMovementsModal from '@/components/inventory/SkuMovementsModal'
import StockMovementsView from '@/components/inventory/StockMovementsView'

const WAREHOUSES = ['T1', 'Central', 'Aged', 'Sample', 'Private']

const WH_COLORS: Record<string, string> = {
  T1:      'bg-blue-100 text-blue-700',
  Central: 'bg-purple-100 text-purple-700',
  Aged:    'bg-amber-100 text-amber-700',
  Sample:  'bg-green-100 text-green-700',
  Private: 'bg-red-100 text-red-700',
}

export default function InventoryPage() {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('All')
  const [showAddStock, setShowAddStock] = useState(false)
  const [addForm, setAddForm] = useState({ sku: '', product_name: '', brand: '', warehouse: 'T1', quantity_packs: 0, quantity_units: 0, notes: '' })
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

  const handleAddStock = async () => {
    if (!addForm.sku || addForm.quantity_packs <= 0) return
    setSaving(true)
    const { error } = await supabase.from('inventory_records').upsert({
      sku: addForm.sku,
      product_name: addForm.product_name,
      brand: addForm.brand,
      warehouse: addForm.warehouse,
      category: 'available',
      quantity_packs: addForm.quantity_packs,
      quantity_units: addForm.quantity_units,
    }, { onConflict: 'sku,warehouse,category' })

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setShowAddStock(false)
      setAddForm({ sku: '', product_name: '', brand: '', warehouse: 'T1', quantity_packs: 0, quantity_units: 0, notes: '' })
    }
    setSaving(false)
  }

  const totalPacks = inventory.reduce((s: number, r: any) => s + (r.packs_total ?? 0), 0)
  const totalUnits = inventory.reduce((s: number, r: any) => s + (r.units_total ?? 0), 0)

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {totalPacks.toLocaleString()} packs · {totalUnits.toLocaleString()} units total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => document.getElementById('stock-movements-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Stock Movements
          </button>
          <button
            onClick={() => setShowAddStock(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Stock
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search SKU, product, brand..."
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
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3 mb-6">
        {WAREHOUSES.map(wh => {
          const whKey = wh.toLowerCase()
          const packs = inventory.reduce((s: number, r: any) => s + (r[`packs_${whKey}`] ?? 0), 0)
          const units = inventory.reduce((s: number, r: any) => s + (r[`units_${whKey}`] ?? 0), 0)
          return (
            <div key={wh} className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${WH_COLORS[wh]}`}>{wh}</span>
              </div>
              <p className="text-lg md:text-2xl font-bold text-gray-900">{units.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">units</p>
              <p className="text-sm font-semibold text-gray-500 mt-1">{packs.toLocaleString()}</p>
              <p className="text-xs text-gray-400">packs</p>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Warehouse className="h-8 w-8 mb-2" />
            <p className="text-sm">No inventory records</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map((row: any) => {
                const stock = getStock(row)
                return (
                  <div
                    key={row.sku}
                    className="px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => setSelectedSku({ sku: row.sku, name: row.product_name })}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-mono text-xs text-gray-400">{row.sku}</span>
                      <span className={`text-sm font-bold ${stock.packs === 0 ? 'text-red-400' : stock.packs < 5 ? 'text-amber-500' : 'text-gray-900'}`}>
                        {stock.packs} pk
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{row.product_name}</p>
                        <p className="text-xs text-gray-500">{row.brand}</p>
                      </div>
                      <span className="text-xs text-gray-400">{stock.units} u</span>
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Brand</th>
                    {warehouseFilter === 'All' ? (
                      WAREHOUSES.map(w => (
                        <th key={w} className="text-right px-3 py-3 font-medium text-gray-600">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${WH_COLORS[w]}`}>{w}</span>
                        </th>
                      ))
                    ) : null}
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      {warehouseFilter === 'All' ? 'Total' : warehouseFilter}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((row: any) => {
                    const stock = getStock(row)
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
                                {p > 0 ? (
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
                            <span className={`font-semibold ${stock.packs === 0 ? 'text-red-400' : stock.packs < 5 ? 'text-amber-500' : 'text-gray-900'}`}>
                              {stock.packs} pk
                            </span>
                            <span className="text-xs text-gray-400">{stock.units} u</span>
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

      {/* Stock Movements Pivot */}
      <div id="stock-movements-section">
        <StockMovementsView />
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
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-gray-200 w-full sm:max-w-md p-6">
            <h2 className="font-semibold text-lg mb-4">Add Stock</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Product</label>
                <select
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none"
                  value={addForm.sku}
                  onChange={e => {
                    const p = (products as any[]).find((p: any) => p.sku === e.target.value)
                    setAddForm(f => ({ ...f, sku: e.target.value, product_name: p?.full_name ?? '', brand: p?.brand ?? '' }))
                  }}
                >
                  <option value="">Select a product...</option>
                  {(products as any[]).map((p: any) => (
                    <option key={p.sku} value={p.sku}>{p.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Warehouse</label>
                <select
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none"
                  value={addForm.warehouse}
                  onChange={e => setAddForm(f => ({ ...f, warehouse: e.target.value }))}
                >
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Packs</label>
                  <input
                    type="number"
                    min={0}
                    value={addForm.quantity_packs || ''}
                    onChange={e => setAddForm(f => ({ ...f, quantity_packs: parseInt(e.target.value) || 0 }))}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Units</label>
                  <input
                    type="number"
                    min={0}
                    value={addForm.quantity_units || ''}
                    onChange={e => setAddForm(f => ({ ...f, quantity_units: parseInt(e.target.value) || 0 }))}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setShowAddStock(false)} className="text-sm text-gray-500 hover:text-gray-900">Cancel</button>
              <button
                onClick={handleAddStock}
                disabled={saving || !addForm.sku}
                className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
