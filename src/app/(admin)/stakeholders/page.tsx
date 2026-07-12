'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Search, Edit, Handshake, Download, ChevronDown, ChevronUp, Mail, Phone, MapPin } from 'lucide-react'
import { useT } from '@/lib/i18n/LanguageProvider'

const TYPE_COLORS: Record<string, string> = {
  supplier: 'bg-blue-100 text-blue-700',
  agent:    'bg-purple-100 text-purple-700',
  broker:   'bg-amber-100 text-amber-700',
}

export default function StakeholdersPage() {
  const supabase = createClient()
  const router = useRouter()
  const t = useT()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [showExport, setShowExport] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const TYPE_LABELS: Record<string, string> = {
    supplier: t('partners.type_supplier'),
    agent:    t('partners.type_agent'),
    broker:   t('partners.type_broker'),
  }

  const exportCSV = () => {
    const headers = ['Name', 'Type', 'Country', 'Contact', 'Email', 'Status']
    const rows = filtered.map((p: any) => [p.name, p.type, p.country, p.contact_name, p.contact_email, p.status])
    const csv = [headers, ...rows].map(r => r.map((v: any) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'stakeholders.csv'; a.click()
  }

  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const rows = filtered.map((p: any) => ({ Name: p.name, Type: TYPE_LABELS[p.type] ?? p.type, Country: p.country, Contact: p.contact_name, Email: p.contact_email, Status: p.status }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [25, 12, 15, 25, 30, 10].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stakeholders')
    XLSX.writeFile(wb, 'stakeholders.xlsx')
  }

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ['partners'],
    queryFn: async () => {
      const { data } = await supabase.from('partners').select('*').order('name')
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stakeholders</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} / {(partners as any[]).length} stakeholders</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="relative">
            <button onClick={() => setShowExport(v => !v)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              <Download className="h-4 w-4" /> Export
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
          <button onClick={() => router.push('/stakeholders/new')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            <Plus className="h-4 w-4" /> Add Stakeholder
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 md:gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder={t('partners.search_placeholder')}
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option value="All">{t('partners.filter_all_types')}</option>
          <option value="supplier">{t('partners.type_supplier')}</option>
          <option value="agent">{t('partners.type_agent')}</option>
          <option value="broker">{t('partners.type_broker')}</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
          <option value="All">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Handshake className="h-8 w-8 mb-2" />
            <p className="text-sm">{t('partners.no_partners')}</p>
          </div>
        ) : filtered.map((p: any) => {
          const isExpanded = expandedId === p.id
          const contacts: any[] = p.contacts ?? []
          return (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (TYPE_COLORS[p.type] ?? 'bg-gray-100 text-gray-500')}>
                      {TYPE_LABELS[p.type] ?? p.type}
                    </span>
                    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' + (p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {p.country && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[p.city, p.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {p.contact_name && <span className="text-xs text-gray-400">{p.contact_name}</span>}
                    {p.payment_terms && <span className="text-xs text-gray-400">· {p.payment_terms}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); router.push('/stakeholders/' + p.id + '/edit') }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  {isExpanded
                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                    : <ChevronDown className="h-4 w-4 text-gray-400" />
                  }
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                  {(p.address || p.postal_code) && (
                    <div className="flex items-start gap-2 text-sm text-gray-600">
                      <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <span>{[p.address, p.postal_code, p.city, p.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {contacts.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Contacts</p>
                      <div className="space-y-2">
                        {contacts.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-4 text-sm">
                            <span className="font-medium text-gray-800 w-36 truncate">{c.name || 'Contact ' + (i + 1)}</span>
                            {c.role && <span className="text-xs text-gray-400 w-20">{c.role}</span>}
                            {c.email && <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-gray-500 hover:text-gray-800"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
                            {c.phone && <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-gray-500 hover:text-gray-800"><Phone className="h-3.5 w-3.5" />{c.phone}</a>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">Notes</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
