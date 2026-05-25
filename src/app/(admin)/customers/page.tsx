'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Users, Plus, Search, Upload, X, Edit, Mail, Phone, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  lead:     'bg-blue-100 text-blue-700',
  dying:    'bg-orange-100 text-orange-700',
  closed:   'bg-red-100 text-red-600',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active', inactive: 'Inactive', lead: 'Lead', dying: 'Dying', closed: 'Closed',
}

const FIELD_LABELS: Record<string, string> = {
  legal_name: 'Legal Name', trading_name: 'Trading Name', country: 'Country',
  region: 'Region', vat_number: 'VAT Number', excise_number: 'Excise Number',
  payment_terms: 'Payment Terms', incoterms: 'Incoterms',
  is_european: 'European Client', eu_compliance_type: 'EU Compliance Type',
  track_trace_enabled: 'Track & Trace', primary_repository: 'Primary Repository',
  fiscal_warehouse_number: 'Fiscal Warehouse Number', notes: 'Notes',
  contacts: 'Contacts', addresses: 'Addresses',
}

function FieldDiff({ fieldKey, current, requested }: { fieldKey: string; current: any; requested: any }) {
  const label = FIELD_LABELS[fieldKey] ?? fieldKey

  if (typeof requested === 'boolean') return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 w-44 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400 line-through bg-red-50 px-1.5 py-0.5 rounded">{current ? 'Yes' : 'No'}</span>
        <span className="text-gray-400">→</span>
        <span className={`font-semibold px-1.5 py-0.5 rounded ${requested ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{requested ? 'Yes' : 'No'}</span>
      </div>
    </div>
  )

  if (fieldKey === 'contacts') return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-xs font-semibold text-gray-500 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1.5 font-medium">Current</p>
          {!(current ?? []).length ? <p className="text-xs text-gray-300 italic">None</p> :
            (current ?? []).map((c: any, i: number) => (
              <div key={i} className="text-xs bg-gray-50 rounded-lg p-2.5 mb-1.5 border border-gray-100">
                <p className="font-semibold text-gray-800">{[c.first_name ?? c.name, c.last_name].filter(Boolean).join(' ') || '—'}</p>
                <p className="text-gray-400 mt-0.5">{[c.role, c.email].filter(Boolean).join(' · ')}</p>
                {c.phone && <p className="text-gray-400">{c.phone_type} {c.phone}</p>}
              </div>
            ))}
        </div>
        <div>
          <p className="text-xs text-green-600 mb-1.5 font-semibold">Requested</p>
          {!(requested ?? []).length ? <p className="text-xs text-gray-300 italic">None</p> :
            (requested ?? []).map((c: any, i: number) => (
              <div key={i} className="text-xs bg-green-50 rounded-lg p-2.5 mb-1.5 border border-green-200">
                <p className="font-semibold text-gray-900">{[c.first_name ?? c.name, c.last_name].filter(Boolean).join(' ') || '—'}</p>
                <p className="text-gray-500 mt-0.5">{[c.role, c.email].filter(Boolean).join(' · ')}</p>
                {c.phone && <p className="text-gray-500">{c.phone_type} {c.phone}</p>}
              </div>
            ))}
        </div>
      </div>
    </div>
  )

  if (fieldKey === 'addresses') return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-xs font-semibold text-gray-500 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-400 mb-1.5 font-medium">Current</p>
          {!(current ?? []).length ? <p className="text-xs text-gray-300 italic">None</p> :
            (current ?? []).map((a: any, i: number) => (
              <div key={i} className="text-xs bg-gray-50 rounded-lg p-2.5 mb-1.5 border border-gray-100">
                <p className="font-semibold text-gray-700 capitalize">{a.type}</p>
                <p className="text-gray-400 mt-0.5">{[a.street1, a.city, a.postal_code, a.country].filter(Boolean).join(', ')}</p>
              </div>
            ))}
        </div>
        <div>
          <p className="text-xs text-green-600 mb-1.5 font-semibold">Requested</p>
          {!(requested ?? []).length ? <p className="text-xs text-gray-300 italic">None</p> :
            (requested ?? []).map((a: any, i: number) => (
              <div key={i} className="text-xs bg-green-50 rounded-lg p-2.5 mb-1.5 border border-green-200">
                <p className="font-semibold text-gray-900 capitalize">{a.type}</p>
                <p className="text-gray-500 mt-0.5">{[a.street1, a.city, a.postal_code, a.country].filter(Boolean).join(', ')}</p>
              </div>
            ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-500 w-44 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 text-xs flex-1 min-w-0">
        <span className="text-gray-400 line-through bg-red-50 px-2 py-0.5 rounded truncate max-w-32">{current || '—'}</span>
        <span className="text-gray-400 flex-shrink-0">→</span>
        <span className="font-semibold text-gray-900 bg-green-50 px-2 py-0.5 rounded truncate max-w-40">{requested || '—'}</span>
      </div>
    </div>
  )
}

function ModificationRequestsSection() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(true)
  const [expandedReq, setExpandedReq] = useState<string | null>(null)

  const { data: requests = [] } = useQuery({
    queryKey: ['modification-requests'],
    queryFn: async () => {
      const { data } = await supabase.from('profile_change_requests')
        .select('*').eq('status', 'pending').order('created_at', { ascending: false })
      return data ?? []
    },
    refetchInterval: 30000,
  })

  const handleApprove = async (req: any) => {
    await supabase.from('customers').update(req.requested_changes).eq('id', req.customer_id)
    await supabase.from('profile_change_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', req.id)
    queryClient.invalidateQueries({ queryKey: ['modification-requests'] })
    queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  const handleReject = async (req: any) => {
    await supabase.from('profile_change_requests').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', req.id)
    queryClient.invalidateQueries({ queryKey: ['modification-requests'] })
  }

  if (requests.length === 0) return null

  return (
    <div className="mb-6">
      <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-2 mb-3 w-full text-left">
        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="font-semibold text-gray-900">Modification Requests</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{requests.length} pending</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400 ml-auto" /> : <ChevronDown className="h-4 w-4 text-gray-400 ml-auto" />}
      </button>

      {expanded && (
        <div className="space-y-3">
          {requests.map((req: any) => (
            <div key={req.id} className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm">
              {/* Request header */}
              <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-100">
                <div>
                  <p className="font-semibold text-gray-900">{req.customer_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className="font-medium text-amber-700">{Object.keys(req.requested_changes ?? {}).length} field(s)</span> to review
                    · Submitted {new Date(req.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedReq(expandedReq === req.id ? null : req.id)}
                    className="px-3 py-1.5 border border-amber-200 bg-white rounded-lg text-xs text-gray-700 hover:bg-amber-50 transition-colors">
                    {expandedReq === req.id ? '▲ Hide' : '▼ View changes'}
                  </button>
                  <button onClick={() => handleApprove(req)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors">
                    <CheckCircle className="h-3.5 w-3.5" /> Approve all
                  </button>
                  <button onClick={() => handleReject(req)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors">
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>

              {/* Expandable detail */}
              {expandedReq === req.id && (
                <div className="px-5 py-2">
                  {Object.keys(req.requested_changes ?? {}).map(key => (
                    <FieldDiff
                      key={key}
                      fieldKey={key}
                      current={req.current_values?.[key]}
                      requested={req.requested_changes?.[key]}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LogoAvatar({ customer }: { customer: any }) {
  if (customer.logo_url) {
    return <img src={customer.logo_url} alt={customer.legal_name} className="w-8 h-8 rounded-lg object-contain border border-gray-100 bg-white flex-shrink-0" />
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-gray-500">{customer.legal_name?.charAt(0)?.toUpperCase() ?? '?'}</span>
    </div>
  )
}

function DistributorPopup({ customer, onClose, onEdit }: { customer: any; onClose: () => void; onEdit: () => void }) {
  const primaryContact = customer.contacts?.[0]
  const address = customer.addresses?.[0]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {customer.logo_url
              ? <img src={customer.logo_url} alt={customer.legal_name} className="w-12 h-12 rounded-xl object-contain border border-gray-100 bg-white" />
              : <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center"><span className="text-lg font-bold text-gray-400">{customer.legal_name?.charAt(0)}</span></div>
            }
            <div>
              <h2 className="font-bold text-xl text-gray-900">{customer.legal_name}</h2>
              {customer.trading_name && customer.trading_name !== customer.legal_name && (
                <p className="text-sm text-gray-400 mt-0.5">aka {customer.trading_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Edit className="h-3.5 w-3.5" /> Edit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[customer.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABELS[customer.status] ?? customer.status}</span>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 text-gray-700">{customer.assigned_price_list ?? '—'}</span>
            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{customer.currency ?? 'USD'}</span>
            {customer.eu_compliance_type === 'TT' && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">T&T</span>}
            {customer.eu_compliance_type === 'PR' && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">PR</span>}
            {customer.is_european && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">EU</span>}
          </div>
          <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
            {[
              { label: 'Country', value: customer.country }, { label: 'Region', value: customer.region },
              { label: 'Incoterms', value: customer.incoterms }, { label: 'Payment', value: customer.payment_terms },
              { label: 'VAT', value: customer.vat_number }, { label: 'Excise', value: customer.excise_number },
            ].filter(r => r.value).map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-400">{label}</span>
                <span className="font-medium text-gray-900">{value}</span>
              </div>
            ))}
          </div>
          {address && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-1">Address</p>
              <p className="text-sm text-gray-700">{[address.street1, address.city, address.postal_code, address.country].filter(Boolean).join(', ')}</p>
            </div>
          )}
          {primaryContact && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-2">Primary contact</p>
              <p className="font-medium text-sm text-gray-900">{[primaryContact.first_name ?? primaryContact.name, primaryContact.last_name].filter(Boolean).join(' ')}</p>
              {primaryContact.role && <p className="text-xs text-gray-400">{primaryContact.role}</p>}
              <div className="flex flex-col gap-1 mt-2">
                {primaryContact.email && <a href={'mailto:' + primaryContact.email} className="flex items-center gap-2 text-sm text-blue-600 hover:underline"><Mail className="h-3.5 w-3.5" />{primaryContact.email}</a>}
                {primaryContact.phone && <span className="flex items-center gap-2 text-sm text-gray-600"><Phone className="h-3.5 w-3.5" />{primaryContact.phone_type && <span className="text-xs text-gray-400">{primaryContact.phone_type}</span>}{primaryContact.phone}</span>}
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
    const matchSearch = !search || c.legal_name?.toLowerCase().includes(search.toLowerCase()) || c.country?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || c.status === statusFilter
    const matchCountry = countryFilter === 'All' || c.country === countryFilter
    return matchSearch && matchStatus && matchCountry
  })

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const form = new FormData(); form.append('file', file)
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
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer">
            <Upload className="h-4 w-4" /> Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={() => router.push('/customers/new')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
            <Plus className="h-4 w-4" /> Add Distributor
          </button>
        </div>
      </div>

      <ModificationRequestsSection />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search name, country..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none" />
        </div>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          {countries.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option>All</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Users className="h-8 w-8 mb-2" /><p className="text-sm">No distributors found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Price List</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Compliance</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c: any) => {
                const primaryContact = c.contacts?.[0]
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <LogoAvatar customer={c} />
                        <div>
                          <button onClick={() => setSelectedCustomer(c)} className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-left">{c.legal_name}</button>
                          {c.trading_name && c.trading_name !== c.legal_name && <p className="text-xs text-gray-400">{c.trading_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      {c.country ?? '—'}
                      {c.region && <p className="text-xs text-gray-400">{c.region}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-mono font-semibold bg-gray-100 text-gray-700">{c.assigned_price_list ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {primaryContact ? (
                        <div>
                          <p className="font-medium text-gray-900">{[primaryContact.first_name ?? primaryContact.name, primaryContact.last_name].filter(Boolean).join(' ')}</p>
                          <p className="text-gray-400">{primaryContact.email}</p>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {c.eu_compliance_type === 'TT' && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">TT</span>}
                        {c.eu_compliance_type === 'PR' && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">PR</span>}
                        {c.is_european && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">EU</span>}
                        {!c.is_european && <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Export</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABELS[c.status] ?? c.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => router.push('/customers/' + c.id + '/edit')} className="text-gray-400 hover:text-gray-900 p-1 rounded hover:bg-gray-100">
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
        <DistributorPopup customer={selectedCustomer} onClose={() => setSelectedCustomer(null)}
          onEdit={() => { router.push('/customers/' + selectedCustomer.id + '/edit'); setSelectedCustomer(null) }} />
      )}
    </div>
  )
}