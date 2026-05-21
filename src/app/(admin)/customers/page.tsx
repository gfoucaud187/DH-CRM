'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Users, Plus, Search, Upload, X, Edit, ExternalLink, Mail, Phone } from 'lucide-react'
import { useRouter } from 'next/navigation'

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  lead:     'bg-blue-100 text-blue-700',
  dying:    'bg-orange-100 text-orange-700',
  closed:   'bg-red-100 text-red-600',
}

function DistributorPopup({ customer, onClose, onEdit }: { customer: any; onClose: () => void; onEdit: () => void }) {
  const primaryContact = customer.contacts?.[0]
  const address = customer.addresses?.[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-bold text-xl text-gray-900">{customer.legal_name}</h2>
            {customer.trading_name && customer.trading_name !== customer.legal_name && (
              <p className="text-sm text-gray-400 mt-0.5">aka {customer.trading_name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[customer.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {customer.status}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 text-gray-700">
              {customer.assigned_price_list ?? '—'}
            </span>
            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
              {customer.currency ?? 'USD'}
            </span>
            {customer.track_trace_enabled && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">T&T</span>
            )}
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Country</span>
              <span className="font-medium text-gray-900">{customer.country ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Incoterms</span>
              <span className="font-medium text-gray-900">{customer.incoterms ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Payment terms</span>
              <span className="font-medium text-gray-900">{customer.payment_terms ?? '—'}</span>
            </div>
            {customer.vat_number && (
              <div className="flex justify-between">
                <span className="text-gray-400">VAT</span>
                <span className="font-medium text-gray-900">{customer.vat_number}</span>
              </div>
            )}
            {customer.excise_number && (
              <div className="flex justify-between">
                <span className="text-gray-400">Excise #</span>
                <span className="font-medium text-gray-900">{customer.excise_number}</span>
              </div>
            )}
          </div>

          {address && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-1">Address</p>
              <p className="text-sm text-gray-700">
                {[address.street1, address.city, address.postal_code, address.country].filter(Boolean).join(', ')}
              </p>
            </div>
          )}

          {primaryContact && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-2">Primary contact</p>
              <p className="font-medium text-sm text-gray-900">{primaryContact.name}</p>
              {primaryContact.role && <p className="text-xs text-gray-400">{primaryContact.role}</p>}
              <div className="flex flex-col gap-1 mt-2">
                {primaryContact.email && (
                  <a href={'mailto:' + primaryContact.email}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <Mail className="h-3.5 w-3.5" />
                    {primaryContact.email}
                  </a>
                )}
                {primaryContact.phone && (
                  <a href={'tel:' + primaryContact.phone}
                    className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-3.5 w-3.5" />
                    {primaryContact.phone}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const supabase = createClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [countryFilter, setCountryFilter] = useState('All')
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').order('legal_name')
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
    alert(`Imported ${data.imported} distributors!`)
    window.location.reload()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Distributors</h1>
          <p className="text-gray-500 text-sm mt-0.5">{customers.length} distributors</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </label>
          <button
            onClick={() => router.push('/customers/new')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            <Plus className="h-4 w-4" />
            Add Distributor
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
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          {countries.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
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
            <p className="text-sm">No distributors found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Price List</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Flags</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c: any) => {
                const primaryContact = c.contacts?.[0]
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedCustomer(c)}
                        className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-left">
                        {c.legal_name}
                      </button>
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
                    <td className="px-4 py-3 text-xs">
                      {primaryContact ? (
                        <div>
                          <p className="font-medium text-gray-900">{primaryContact.name}</p>
                          <p className="text-gray-400">{primaryContact.email}</p>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {c.track_trace_enabled && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">TT</span>
                        )}
                        {c.is_european && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">EU</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push('/customers/' + c.id + '/edit')}
                        className="text-gray-400 hover:text-gray-900 p-1 rounded hover:bg-gray-100">
                        <Edit className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedCustomer && (
        <DistributorPopup
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onEdit={() => { router.push('/customers/' + selectedCustomer.id + '/edit'); setSelectedCustomer(null) }}
        />
      )}
    </div>
  )
}