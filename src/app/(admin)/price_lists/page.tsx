'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, Search, Save, Check, History, Plus, X, Download } from 'lucide-react'
import { logActivity } from '@/lib/log-activity'
import { useT } from '@/lib/i18n/LanguageProvider'

const LISTS = ['G', 'G1', 'A1', 'SPECIAL']
const LIST_COLORS: Record<string, string> = {
  G:       'bg-blue-100 text-blue-700',
  G1:      'bg-purple-100 text-purple-700',
  A1:      'bg-amber-100 text-amber-700',
  SPECIAL: 'bg-red-100 text-red-700',
}

function fmtDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── COGS History Modal ───────────────────────────────────────────────────────

interface CogsEntry {
  id: string
  sku: string
  cogs: number
  currency: string
  notes: string | null
  created_at: string
}

function CogsHistoryModal({
  sku,
  productName,
  history,
  onClose,
  onAdded,
}: {
  sku: string
  productName: string
  history: CogsEntry[]
  onClose: () => void
  onAdded: () => void
}) {
  const supabase = createClient()
  const [newCogs, setNewCogs] = useState('')
  const [newCurrency, setNewCurrency] = useState('USD')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    const val = parseFloat(newCogs)
    if (isNaN(val) || val < 0) return
    setSaving(true)
    await supabase.from('product_cogs').insert({
      sku,
      cogs: val,
      currency: newCurrency,
      notes: newNotes || null,
    })
    setSaving(false)
    setNewCogs('')
    setNewNotes('')
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">COGS History</h2>
            <p className="text-xs text-gray-400 mt-0.5">{productName} · {sku}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No COGS recorded yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs uppercase">Date</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs uppercase">COGS</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((entry, i) => (
                  <tr key={entry.id} className={i === 0 ? 'bg-green-50' : ''}>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      {fmtDate(entry.created_at)}
                      {i === 0 && <span className="ml-1.5 text-xs text-green-600 font-medium">current</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium font-mono">
                      {Number(entry.cogs).toFixed(2)} <span className="text-gray-400 text-xs font-sans">{entry.currency}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{entry.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 uppercase mb-3">Add new COGS</p>
          <div className="flex items-center gap-2">
            <input
              type="number" step="0.0001" min="0"
              value={newCogs} onChange={e => setNewCogs(e.target.value)}
              placeholder="0.00"
              className="w-28 h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-right focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <select value={newCurrency} onChange={e => setNewCurrency(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 px-2 text-sm focus:outline-none">
              {['USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none"
            />
            <button onClick={handleAdd} disabled={saving || !newCogs}
              className="h-9 px-3 flex items-center gap-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PriceListsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useT()
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState('All')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [cogsModal, setCogsModal] = useState<{ sku: string; productName: string } | null>(null)
  const [showExport, setShowExport] = useState(false)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['price-list-entries'],
    queryFn: async () => {
      const { data } = await supabase.from('price_list_entries').select('*').order('sku')
      return data ?? []
    }
  })

  const { data: allCogs = [] } = useQuery({
    queryKey: ['product-cogs-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('product_cogs')
        .select('*')
        .order('created_at', { ascending: false })
      return (data ?? []) as CogsEntry[]
    }
  })

  // Current COGS per SKU (most recent entry)
  const currentCogs: Record<string, CogsEntry> = {}
  for (const entry of allCogs) {
    if (!currentCogs[entry.sku]) currentCogs[entry.sku] = entry
  }

  // All history per SKU
  const cogsHistory: Record<string, CogsEntry[]> = {}
  for (const entry of allCogs) {
    if (!cogsHistory[entry.sku]) cogsHistory[entry.sku] = []
    cogsHistory[entry.sku].push(entry)
  }

  const filtered = (entries as any[]).filter((e: any) => {
    const matchSearch = !search ||
      e.sku?.toLowerCase().includes(search.toLowerCase()) ||
      e.product_name?.toLowerCase().includes(search.toLowerCase())
    const matchList = listFilter === 'All' || e.price_list === listFilter
    return matchSearch && matchList
  })

  const grouped = filtered.reduce((acc: any, e: any) => {
    if (!acc[e.sku]) acc[e.sku] = { sku: e.sku, product_name: e.product_name, prices: {} }
    acc[e.sku].prices[e.price_list] = { id: e.id, price: e.price_per_unit, currency: e.currency }
    return acc
  }, {})

  const rows = Object.values(grouped) as any[]
  const listsToShow = listFilter === 'All' ? LISTS : [listFilter]

  const editKey = (sku: string, list: string) => `${sku}__${list}`

  const getEditValue = (sku: string, list: string, fallback: number) => {
    const key = editKey(sku, list)
    return edits[key] !== undefined ? edits[key] : fallback.toString()
  }

  const handleEdit = (sku: string, list: string, value: string) => {
    setEdits(prev => ({ ...prev, [editKey(sku, list)]: value }))
  }

  const handleSave = async (sku: string, list: string, row: any) => {
    const key = editKey(sku, list)
    const newPrice = parseFloat(edits[key])
    if (isNaN(newPrice) || newPrice < 0) return
    setSaving(key)
    const existing = row.prices[list]
    if (existing?.id) {
      await supabase.from('price_list_entries').update({ price_per_unit: newPrice }).eq('id', existing.id)
    } else {
      await supabase.from('price_list_entries').insert({
        sku, product_name: row.product_name, price_list: list, price_per_unit: newPrice, currency: 'USD',
      })
    }
    await logActivity({
      action: 'update_price', entityType: 'product', entityRef: `${sku} · ${list}`,
      oldValue: existing?.id ? { price: existing.price_per_unit } : undefined,
      newValue: { price: newPrice },
      metadata: { sku, price_list: list, product: row.product_name },
    })
    setEdits(prev => { const n = { ...prev }; delete n[key]; return n })
    queryClient.invalidateQueries({ queryKey: ['price-list-entries'] })
    queryClient.invalidateQueries({ queryKey: ['price-entries-all'] })
    setSaving(null)
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }

  const hasEdit = (sku: string, list: string) => {
    const key = editKey(sku, list)
    const row = rows.find((r: any) => r.sku === sku)
    if (!row) return false
    const current = row.prices[list]?.price ?? 0
    return edits[key] !== undefined && parseFloat(edits[key]) !== current
  }

  // ── Exports ────────────────────────────────────────────────────────────────

  function dlBlob(content: string, mime: string, filename: string) {
    const blob = new Blob([content], { type: mime })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
  }

  const toCSV = (headers: string[], data: (string | number | null)[][]) =>
    [headers, ...data].map(r => r.map(v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')

  const exportFullCSV = () => {
    const headers = ['SKU', 'Product', ...LISTS.map(l => `Price ${l}`), 'Currency', 'COGS', 'COGS Date']
    const data = rows.map((row: any) => {
      const cog = currentCogs[row.sku]
      return [row.sku, row.product_name, ...LISTS.map(l => row.prices[l]?.price ?? ''),
        row.prices[LISTS[0]]?.currency ?? 'USD', cog?.cogs ?? '', cog ? fmtDate(cog.created_at) : '']
    })
    dlBlob(toCSV(headers, data), 'text/csv', 'price_lists_full.csv')
  }

  const exportFullExcel = async () => {
    const XLSX = await import('xlsx')
    const data = rows.map((row: any) => {
      const cog = currentCogs[row.sku]
      const obj: any = { SKU: row.sku, Product: row.product_name }
      LISTS.forEach(l => { obj[`Price ${l}`] = row.prices[l]?.price ?? null })
      obj.Currency = row.prices[LISTS[0]]?.currency ?? 'USD'
      obj.COGS = cog ? Number(cog.cogs) : null
      obj['COGS Date'] = cog ? fmtDate(cog.created_at) : null
      return obj
    })
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [12, 30, 10, 10, 10, 10, 10, 10, 14].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Price Lists')
    XLSX.writeFile(wb, 'price_lists_full.xlsx')
  }

  const exportCogsCSV = () => {
    const headers = ['SKU', 'Product', 'COGS', 'Currency', 'Date', 'Notes']
    const data = allCogs.map(e => [
      e.sku,
      rows.find((r: any) => r.sku === e.sku)?.product_name ?? e.sku,
      e.cogs, e.currency, fmtDate(e.created_at), e.notes ?? '',
    ])
    dlBlob(toCSV(headers, data), 'text/csv', 'cogs_history.csv')
  }

  const exportCogsExcel = async () => {
    const XLSX = await import('xlsx')
    const data = allCogs.map(e => ({
      SKU: e.sku,
      Product: rows.find((r: any) => r.sku === e.sku)?.product_name ?? e.sku,
      COGS: Number(e.cogs), Currency: e.currency,
      Date: fmtDate(e.created_at), Notes: e.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [12, 30, 10, 10, 14, 30].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'COGS History')
    XLSX.writeFile(wb, 'cogs_history.xlsx')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {cogsModal && (
        <CogsHistoryModal
          sku={cogsModal.sku}
          productName={cogsModal.productName}
          history={cogsHistory[cogsModal.sku] ?? []}
          onClose={() => setCogsModal(null)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['product-cogs-all'] })}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('price_lists.page_title')}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{rows.length} products · tap any price to edit</p>
        </div>
        <div className="relative">
          <button onClick={() => setShowExport(v => !v)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> Export
          </button>
          {showExport && (
            <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1">
              <p className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase">Full export</p>
              <button onClick={() => { exportFullExcel(); setShowExport(false) }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">All prices + COGS (.xlsx)</button>
              <button onClick={() => { exportFullCSV(); setShowExport(false) }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">All prices + COGS (.csv)</button>
              <div className="border-t border-gray-100 my-1" />
              <p className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase">COGS history</p>
              <button onClick={() => { exportCogsExcel(); setShowExport(false) }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">COGS changes + dates (.xlsx)</button>
              <button onClick={() => { exportCogsCSV(); setShowExport(false) }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">COGS changes + dates (.csv)</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder={t('price_lists.search_placeholder')}
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 flex-nowrap">
          {['All', ...LISTS].map(l => (
            <button key={l} onClick={() => setListFilter(l)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                listFilter === l ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <DollarSign className="h-8 w-8 mb-2" />
            <p className="text-sm">{t('price_lists.no_entries')}</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {rows.map((row: any) => {
                const cog = currentCogs[row.sku]
                return (
                  <div key={row.sku} className="px-4 py-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{row.product_name}</p>
                        <p className="font-mono text-xs text-gray-400">{row.sku}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="text-right">
                          {cog ? (
                            <>
                              <p className="text-xs font-medium text-gray-700">{Number(cog.cogs).toFixed(2)} {cog.currency}</p>
                              <p className="text-xs text-gray-400">{fmtDate(cog.created_at)}</p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-300">—</p>
                          )}
                        </div>
                        <button
                          onClick={() => setCogsModal({ sku: row.sku, productName: row.product_name })}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="COGS history">
                          <History className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {listsToShow.map(l => {
                        const key = editKey(row.sku, l)
                        const current = row.prices[l]?.price ?? 0
                        const currency = row.prices[l]?.currency ?? 'USD'
                        const isEdited = hasEdit(row.sku, l)
                        const isSaving = saving === key
                        const isSaved = saved === key
                        return (
                          <div key={l} className="flex items-center gap-2">
                            <span className={`w-14 flex-shrink-0 text-center px-1.5 py-1 rounded text-xs font-medium ${LIST_COLORS[l]}`}>{l}</span>
                            <input type="number" step="0.01" min="0"
                              value={getEditValue(row.sku, l, current)}
                              onChange={e => handleEdit(row.sku, l, e.target.value)}
                              className={`flex-1 min-w-0 h-9 rounded border px-2 text-right text-sm font-medium focus:outline-none transition-colors ${
                                isEdited ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-900'
                              } ${current === 0 && !isEdited ? 'text-gray-300' : ''}`} />
                            <span className="text-xs text-gray-400 w-8 flex-shrink-0">{currency}</span>
                            {isEdited ? (
                              <button onClick={() => handleSave(row.sku, l, row)} disabled={isSaving}
                                className="h-9 w-9 flex items-center justify-center rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 flex-shrink-0">
                                {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                              </button>
                            ) : <div className="w-9 flex-shrink-0" />}
                          </div>
                        )
                      })}
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{t('price_lists.col_sku')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{t('price_lists.col_product')}</th>
                    {LISTS.map(l => (
                      <th key={l} className="text-right px-4 py-3 font-medium text-gray-600">
                        <span className={`px-2 py-0.5 rounded text-xs ${LIST_COLORS[l]}`}>{l}</span>
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 font-medium text-gray-600">COGS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row: any) => {
                    const cog = currentCogs[row.sku]
                    return (
                      <tr key={row.sku} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.sku}</td>
                        <td className="px-4 py-3 text-gray-900">{row.product_name}</td>
                        {LISTS.map(l => {
                          const key = editKey(row.sku, l)
                          const current = row.prices[l]?.price ?? 0
                          const currency = row.prices[l]?.currency ?? 'USD'
                          const isEdited = hasEdit(row.sku, l)
                          const isSaving = saving === key
                          const isSaved = saved === key
                          return (
                            <td key={l} className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <input type="number" step="0.01" min="0"
                                  value={getEditValue(row.sku, l, current)}
                                  onChange={e => handleEdit(row.sku, l, e.target.value)}
                                  className={`w-24 h-8 rounded border px-2 text-right text-sm font-medium focus:outline-none transition-colors ${
                                    isEdited ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-gray-200 text-gray-900'
                                  } ${current === 0 && !isEdited ? 'text-gray-300' : ''}`} />
                                <span className="text-xs text-gray-400 w-7">{currency}</span>
                                {isEdited && (
                                  <button onClick={() => handleSave(row.sku, l, row)} disabled={isSaving}
                                    className="h-8 w-8 flex items-center justify-center rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 flex-shrink-0">
                                    {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </div>
                            </td>
                          )
                        })}
                        {/* COGS column */}
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <div className="text-right min-w-[80px]">
                              {cog ? (
                                <>
                                  <p className="text-sm font-medium text-gray-800 font-mono">
                                    {Number(cog.cogs).toFixed(2)} <span className="text-xs text-gray-400 font-sans">{cog.currency}</span>
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">{fmtDate(cog.created_at)}</p>
                                </>
                              ) : (
                                <p className="text-xs text-gray-300">—</p>
                              )}
                            </div>
                            <button
                              onClick={() => setCogsModal({ sku: row.sku, productName: row.product_name })}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                              title="View / add COGS history">
                              <History className="h-4 w-4" />
                            </button>
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
      <p className="text-xs text-gray-400 mt-3 text-center">{t('price_lists.edit_hint')}</p>
    </div>
  )
}
