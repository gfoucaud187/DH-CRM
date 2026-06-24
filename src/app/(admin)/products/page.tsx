'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Package, Plus, Search, Upload, Edit } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ProductsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')

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

  const filtered = (products as any[]).filter((p: any) => {
    const matchSearch = !search ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.brand?.toLowerCase().includes(search.toLowerCase())
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} / {(products as any[]).length} products</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const headers = 'sku,full_name,brand,line,vitola,shape,wrapper,binder,filler,units_per_pack,pack_type,fixmer_reference,eu_ceg_id,length_inches,ring_gauge,net_weight_g,status,notes,price_g,price_g1,price_a1,price_special,currency'
              const example = 'NI-ROBUS-B10,Nicarao Exclusivo Robusto B10,Nicarao,Exclusivo,Robusto,Robusto,Ecuador Connecticut,Nicaragua,Nicaragua,10,Box,REF001,,5.0,50,12.5,active,,85.00,90.00,95.00,,USD'
              const csv = headers + '\n' + example
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = 'products-template.csv'; a.click()
              URL.revokeObjectURL(url)
            }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            📥 CSV Template
          </button>
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />
            Import CSV
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
          <button
            onClick={() => router.push('/products/new')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search SKU, name, brand..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          {brands.map(b => <option key={b}>{b}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option>All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option value="All">All Roles</option>
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
                    <button
                      onClick={() => router.push('/products/' + p.id + '/edit')}
                      className="text-gray-400 hover:text-gray-900 p-1 rounded hover:bg-gray-100">
                      <Edit className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}