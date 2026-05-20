'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Users, Plus, Search, Upload } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  lead:     'bg-blue-100 text-blue-700',
  dying:    'bg-orange-100 text-orange-700',
  closed:   'bg-red-100 text-red-600',
}

export default function CustomersPage() {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [countryFilter, setCountryFilter] = useState('All')

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .order('legal_name')
      return data ?? []
    }
  })

  const countries = ['All', ...Array.from(new Set(customers.map((c: any) => c.country).filter(Boolean))).sort()]

  const filtered = customers.filter((c: any) => {
    const matchSearch = !search ||
      c.legal_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.country?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || c.status === statusFilter
    const matchCountry = countryFilter === 'All' || c.country === countryFilter
    return matchSearch && matchStatus && matchCountry
  })

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/import/customers', { method: 'POST', body: form })
    const data = await res.json()
    alert(`Imported ${data.imported} customers! ${data.errors?.length ? data.errors.length + ' errors' : ''}`)
    window.location.reload()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 text-sm mt-0.5">{customers.length} customers</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </label>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            <Plus className="h-4 w-4" />
            Add Customer
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, country..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          {countries.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option>All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="lead">Lead</option>
          <option value="dying">Dying</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Users className="h-8 w-8 mb-2" />
            <p className="text-sm">No customers found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Price List</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">T&T</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c: any) => {
                const primaryContact = c.contacts?.[0]
                return (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{c.legal_name}</p>
                      {c.trading_name && c.trading_name !== c.legal_name && (
                        <p className="text-xs text-gray-400">{c.trading_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.country}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 text-gray-700">
                        {c.assigned_price_list ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {primaryContact ? (
                        <div>
                          <p className="font-medium">{primaryContact.name}</p>
                          <p className="text-gray-400">{primaryContact.email}</p>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.track_trace_enabled ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">TT</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}