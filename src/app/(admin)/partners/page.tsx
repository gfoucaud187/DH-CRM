'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Search, Edit, Handshake } from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  supplier: 'bg-blue-100 text-blue-700',
  agent:    'bg-purple-100 text-purple-700',
  broker:   'bg-amber-100 text-amber-700',
}

const TYPE_LABELS: Record<string, string> = {
  supplier: 'Supplier',
  agent:    'Agent',
  broker:   'Broker',
}

export default function PartnersPage() {
  const supabase = createClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ['partners'],
    queryFn: async () => {
      const { data } = await supabase
        .from('partners')
        .select('*')
        .order('name')
      return data ?? []
    }
  })

  const filtered = (partners as any[]).filter((p: any) => {
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.country?.toLowerCase().includes(search.toLowerCase())
    const matchType   = typeFilter   === 'All' || p.type   === typeFilter
    const matchStatus = statusFilter === 'All' || p.status === statusFilter
    return matchSearch && matchType && matchStatus
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Partners</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} / {(partners as any[]).length} partners</p>
        </div>
        <button onClick={() => router.push('/partners/new')}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" /> Add Partner
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search name, contact, country..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option value="All">All Types</option>
          <option value="supplier">Supplier</option>
          <option value="agent">Agent</option>
          <option value="broker">Broker</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option value="All">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Handshake className="h-8 w-8 mb-2" />
            <p className="text-sm">No partners found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Payment Terms</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push('/partners/' + p.id + '/edit')}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (TYPE_COLORS[p.type] ?? 'bg-gray-100 text-gray-500')}>
                      {TYPE_LABELS[p.type] ?? p.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{p.contact_name ?? '—'}</div>
                    {p.contact_email && <div className="text-xs text-gray-400">{p.contact_email}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.country ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.payment_terms ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={e => { e.stopPropagation(); router.push('/partners/' + p.id + '/edit') }}
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