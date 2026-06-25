'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react'

const sgd = (n: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(n)

const STATUS_COLORS: Record<string, string> = {
  draft:  'bg-gray-100 text-gray-600',
  posted: 'bg-emerald-100 text-emerald-700',
  void:   'bg-red-100 text-red-600',
}

const SOURCE_LABELS: Record<string, string> = {
  manual:         'Manual',
  expense:        'Expense',
  payroll:        'Payroll',
  bank:           'Bank',
  sales_order:    'Sales Order',
  purchase_order: 'Purchase Order',
}

export default function JournalPage() {
  const supabase = createClient()
  const now = new Date()
  const [dateFrom, setDateFrom] = useState(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(now.toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [accountFilter, setAccountFilter] = useState('')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['journal', dateFrom, dateTo, statusFilter, sourceFilter],
    queryFn: async () => {
      let q = supabase
        .from('journal_entries')
        .select('*, journal_lines(*)')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false })
        .order('entry_number', { ascending: false })
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      if (sourceFilter !== 'all') q = q.eq('source_type', sourceFilter)
      const { data } = await q
      return (data ?? []) as any[]
    },
  })

  const filteredEntries = accountFilter
    ? entries.filter(e => e.journal_lines?.some((l: any) => l.account_code.startsWith(accountFilter)))
    : entries

  const toggleRow = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const totalDebits = filteredEntries
    .filter(e => e.status === 'posted')
    .reduce((s, e) => s + (e.journal_lines ?? []).reduce((ls: number, l: any) => ls + Number(l.debit ?? 0), 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">General Ledger</h1>
          <p className="text-sm text-gray-500 mt-0.5">All journal entries · Double-entry accounting</p>
        </div>
        <div className="text-sm text-gray-500">
          {filteredEntries.filter(e => e.status === 'posted').length} posted · {sgd(totalDebits)} total
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-500">From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="text-sm border-0 focus:outline-none" />
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-500">To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="text-sm border-0 focus:outline-none" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="posted">Posted</option>
          <option value="void">Void</option>
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none">
          <option value="all">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input value={accountFilter} onChange={e => setAccountFilter(e.target.value)}
          placeholder="Filter by account code (e.g. 6)"
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none w-52" />
      </div>

      {/* Journal entries */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading…</div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No journal entries found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-3 font-medium w-8"></th>
                <th className="text-left px-4 py-3 font-medium">Entry #</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-right px-4 py-3 font-medium">Debits</th>
                <th className="text-right px-4 py-3 font-medium">Credits</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((je: any) => {
                const lines: any[] = je.journal_lines ?? []
                const totDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0)
                const totCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0)
                const isExpanded = expanded[je.id]

                return [
                  <tr key={je.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => toggleRow(je.id)}>
                    <td className="px-4 py-3 text-gray-400">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{je.entry_number}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{new Date(je.date).toLocaleDateString('en-SG')}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{je.description ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{SOURCE_LABELS[je.source_type] ?? je.source_type ?? 'Manual'}</td>
                    <td className="px-4 py-3 text-right font-mono">{sgd(totDebit)}</td>
                    <td className="px-4 py-3 text-right font-mono">{sgd(totCredit)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[je.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {je.status}
                      </span>
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={je.id + '-lines'} className="border-b border-gray-100 bg-gray-50/50">
                      <td colSpan={8} className="px-4 pb-3 pt-1">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400 uppercase">
                              <th className="text-left py-1 font-medium">Account</th>
                              <th className="text-left py-1 font-medium">Description</th>
                              <th className="text-right py-1 font-medium">Debit</th>
                              <th className="text-right py-1 font-medium">Credit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {lines.sort((a, b) => a.sort_order - b.sort_order).map((l: any) => (
                              <tr key={l.id} className="text-gray-700">
                                <td className="py-1.5">
                                  <span className="font-mono text-gray-500 mr-2">{l.account_code}</span>
                                  {l.account_name}
                                </td>
                                <td className="py-1.5 text-gray-400">{l.description ?? ''}</td>
                                <td className="py-1.5 text-right font-mono">{l.debit > 0 ? sgd(l.debit) : ''}</td>
                                <td className="py-1.5 text-right font-mono">{l.credit > 0 ? sgd(l.credit) : ''}</td>
                              </tr>
                            ))}
                            <tr className="font-medium text-gray-900 border-t border-gray-200">
                              <td className="pt-2 text-gray-500">Total</td>
                              <td></td>
                              <td className="pt-2 text-right font-mono">{sgd(totDebit)}</td>
                              <td className="pt-2 text-right font-mono">{sgd(totCredit)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ].filter(Boolean)
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
