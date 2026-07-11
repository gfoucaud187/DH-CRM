'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Package, Plus, Search, Upload, Edit, Download, ChevronDown, Cigarette, ShoppingBag, BookOpen, Eye } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ProductSheet from '@/components/products/ProductSheet'

export default function ProductsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [sheetProduct, setSheetProduct] = useState<any>(null)

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .order('brand')
      return data ?? []
    }
  })

  const brands = ['All', ...Array.from(new Set((products as any[]).map((p: any) => p.brand))).sort() as string[]]

  const exportCSV = () => {
    const headers = ['SKU','Full Name','Brand','Line','Vitola','Shape','Wrapper','Units/Pack','Pack Type','Fixmer Ref','EU-CEG ID','GTIN','Length (in)','Ring Gauge','Weight (g)','Status','Role','Notes']
    const rows = (products as any[]).map((p: any) => [
      p.sku, p.full_name, p.brand, p.line, p.vitola, p.shape, p.wrapper,
      p.units_per_pack, p.pack_type, p.fixmer_reference, p.eu_ceg_id, p.gtin,
      p.length_inches, p.ring_gauge, p.net_weight_g, p.status, p.product_role, p.notes
    ])
    const csv = [headers, ...rows].map(r => r.map((v: any) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'products.csv'; a.click()
  }

  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const rows = (products as any[]).map((p: any) => ({
      SKU: p.sku, 'Full Name': p.full_name, Brand: p.brand, Line: p.line,
      Vitola: p.vitola, Shape: p.shape, Wrapper: p.wrapper,
      'Units/Pack': p.units_per_pack, 'Pack Type': p.pack_type,
      'Fixmer Ref': p.fixmer_reference, 'EU-CEG ID': p.eu_ceg_id, GTIN: p.gtin,
      'Length (in)': p.length_inches, 'Ring Gauge': p.ring_gauge, 'Weight (g)': p.net_weight_g,
      Status: p.status, Role: p.product_role, Notes: p.notes,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [10,30,15,15,12,12,15,10,10,15,15,15,10,10,10,10,10,25].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, 'products.xlsx')
  }

  const filtered = (products as any[]).filter((p: any) => {
    const matchSearch = !search ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.brand?.toLowerCase().includes(search.toLowerCase()) ||
      p.fixmer_reference?.toLowerCase().includes(search.toLowerCase()) ||
      p.eu_ceg_id?.toLowerCase().includes(search.toLowerCase())
    const matchBrand  = brandFilter  === 'All' || p.brand        === brandFilter
    const matchStatus = statusFilter === 'All' || p.status       === statusFilter
    const matchRole   = roleFilter   === 'All' || p.product_role === roleFilter
    return matchSearch && matchBrand && matchStatus && matchRole
  })

  const ROLE_COLORS: Record<string, string> = {
    original: 'bg-blue-100 text-blue-700',
    aged:     'bg-amber-100 text-amber-700',
    sample:   'bg-purple-100 text-purple-700',
    foc:      'bg-green-100 text-green-700',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} / {(products as any[]).length} products</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export dropdown */}
          <div className="relative hidden md:block">
            <button onClick={() => setShowExport(v => !v)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              <Download className="h-4 w-4" />Export<ChevronDown className="h-3 w-3" />
            </button>
            {showExport && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button onClick={() => { exportExcel(); setShowExport(false) }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-t-lg">Excel (.xlsx)</button>
                <button onClick={() => { exportCSV(); setShowExport(false) }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-b-lg">CSV (.csv)</button>
              </div>
            )}
          </div>
          <label className="hidden md:flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const form = new FormData()
              form.append('file', file)
              const res = await fetch('/api/import/products', { method: 'POST', body: form })
              const data = await res.json()
              alert('Imported ' + data.imported + ' products!')
              window.location.reload()
            }} />
          </label>
          <button onClick={() => setShowTypeModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            <Plus className="h-4 w-4" />Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 md:gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search SKU, name, brand, Fixmer, EU-CEG..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          {brands.map(b => <option key={b} value={b}>{b === 'All' ? 'Brands' : b}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option value="All">Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option value="All">Inventory</option>
          <option value="original">Original</option>
          <option value="aged">Aged</option>
          <option value="sample">Sample</option>
          <option value="foc">FOC</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Package className="h-8 w-8 mb-2" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map((p: any) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-gray-400">{p.sku}</span>
                      <span className={'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ' + (ROLE_COLORS[p.product_role] ?? 'bg-gray-100 text-gray-500')}>
                        {p.product_role}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{p.full_name}</p>
                    <p className="text-xs text-gray-500">{p.brand}{p.vitola ? ` · ${p.vitola}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {p.status}
                    </span>
                    <button onClick={() => setSheetProduct(p)}
                      className="text-gray-400 hover:text-gray-900 p-1 rounded hover:bg-gray-100">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button onClick={() => router.push('/products/' + p.id + '/edit')}
                      className="text-gray-400 hover:text-gray-900 p-1 rounded hover:bg-gray-100">
                      <Edit className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Brand</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Vitola</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Units/Pack</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((p: any) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.full_name}</td>
                      <td className="px-4 py-3 text-gray-600">{p.brand}</td>
                      <td className="px-4 py-3 text-gray-600">{p.vitola ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{p.units_per_pack ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (ROLE_COLORS[p.product_role] ?? 'bg-gray-100 text-gray-500')}>
                          {p.product_role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSheetProduct(p)}
                            className="text-gray-400 hover:text-gray-900 p-1 rounded hover:bg-gray-100" title="Product Sheet">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button onClick={() => router.push('/products/' + p.id + '/edit')}
                            className="text-gray-400 hover:text-gray-900 p-1 rounded hover:bg-gray-100" title="Edit">
                            <Edit className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {/* Product Sheet modal */}
      {sheetProduct && (
        <ProductSheet product={sheetProduct} onClose={() => setSheetProduct(null)} />
      )}

      {/* Add Product type modal */}
      {showTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTypeModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Add Product</h2>
            <p className="text-sm text-gray-500 mb-6">Choose the type of product to add</p>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => { setShowTypeModal(false); router.push('/products/new?type=cigar') }}
                className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all group">
                <Cigarette className="h-8 w-8 text-gray-400 group-hover:text-gray-900 transition-colors" />
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Cigars</span>
              </button>
              <button onClick={() => { setShowTypeModal(false); router.push('/products/new?type=accessory') }}
                className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all group">
                <ShoppingBag className="h-8 w-8 text-gray-400 group-hover:text-gray-900 transition-colors" />
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Accessories</span>
              </button>
              <button onClick={() => { setShowTypeModal(false); router.push('/products/new?type=book') }}
                className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all group">
                <BookOpen className="h-8 w-8 text-gray-400 group-hover:text-gray-900 transition-colors" />
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Books</span>
              </button>
            </div>
            <button onClick={() => setShowTypeModal(false)}
              className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
