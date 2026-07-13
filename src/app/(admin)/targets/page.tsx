'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, TrendingUp, TrendingDown, Download, Upload, Plus, Trash2, Search } from 'lucide-react'
import { useT } from '@/lib/i18n/LanguageProvider'

const CURRENT_YEAR = new Date().getFullYear()

const getStatus = (actual: number, standard: number, push: number, stretch: number, monthsElapsed: number) => {
  if (standard === 0) return null
  const prorata = monthsElapsed / 12
  const stdPro = standard * prorata
  const pushPro = push * prorata
  const stretchPro = stretch * prorata

  if (actual === 0) return { key: 'urgent', color: 'bg-red-100 text-red-700', dot: 'bg-red-500', pct: 0 }
  if (actual < stdPro) {
    const pct = Math.round((actual / stdPro) * 100)
    return { key: 'late', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', pct }
  }
  if (actual < pushPro) {
    const pct = Math.round((actual / stdPro) * 100)
    return { key: 'good', color: 'bg-green-100 text-green-700', dot: 'bg-green-500', pct }
  }
  if (actual < stretchPro) {
    const pct = Math.round((actual / stdPro) * 100)
    return { key: 'excellent', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', pct }
  }
  const pct = Math.round((actual / stdPro) * 100)
  return { key: 'amazing', color: 'bg-gray-900 text-white', dot: 'bg-gray-900', pct }
}

const fmt = (n: number) => {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n/1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const thClass = "px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500"

export default function TargetsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = useT()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [saving, setSaving] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, { standard: string; push: string; stretch: string }>>({})
  const [showAddClient, setShowAddClient] = useState(false)
  const [addSearch, setAddSearch] = useState('')

  const now = new Date()
  const monthsElapsed = now.getMonth() + (now.getDate() / 31)

  const { data: customers = [] } = useQuery({
    queryKey: ['targets-customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers')
        .select('id, legal_name, currency, region, country')
        .eq('status', 'active').order('legal_name')
      return data ?? []
    }
  })

  const { data: targets = [] } = useQuery({
    queryKey: ['customer-targets', year],
    queryFn: async () => {
      const { data } = await supabase.from('customer_targets')
        .select('*').eq('year', year)
      return data ?? []
    }
  })

  const { data: revenues = [] } = useQuery({
    queryKey: ['targets-revenues', year],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders')
        .select('customer_id, total_amount, order_date')
        .eq('document_type', 'invoice')
        .eq('is_foc', false)
        .neq('status', 'cancelled')
        .gte('order_date', `${year}-01-01`)
        .lte('order_date', `${year}-12-31`)
      return data ?? []
    }
  })

  const { data: prevYearRevenues = [] } = useQuery({
    queryKey: ['targets-prev-revenues', year],
    queryFn: async () => {
      const cutoff = new Date(year - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10)
      const { data } = await supabase.from('sales_orders')
        .select('customer_id, total_amount, order_date')
        .eq('document_type', 'invoice')
        .eq('is_foc', false)
        .neq('status', 'cancelled')
        .gte('order_date', `${year - 1}-01-01`)
        .lte('order_date', cutoff)
      return data ?? []
    }
  })

  const getTarget = (customerId: string) =>
    targets.find((tg: any) => tg.customer_id === customerId)

  const sumRevenue = (list: any[], customerId: string) =>
    list.filter((r: any) => r.customer_id === customerId).reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0)

  const getRevenue = (customerId: string) => sumRevenue(revenues, customerId)

  const getEdit = (customerId: string, field: 'standard' | 'push' | 'stretch', fallback: number) => {
    if (edits[customerId]?.[field] !== undefined) return edits[customerId][field]
    return fallback ? fallback.toString() : ''
  }

  const setEdit = (customerId: string, field: 'standard' | 'push' | 'stretch', value: string) => {
    setEdits(prev => ({
      ...prev,
      [customerId]: { ...prev[customerId], standard: getEdit(customerId, 'standard', 0), push: getEdit(customerId, 'push', 0), stretch: getEdit(customerId, 'stretch', 0), [field]: value }
    }))
  }

  const handleSave = async (customerId: string) => {
    const edit = edits[customerId]
    if (!edit) return
    setSaving(customerId)

    const standard = parseFloat(edit.standard) || 0
    const push = parseFloat(edit.push) || 0
    const stretch = parseFloat(edit.stretch) || 0

    const existing = getTarget(customerId)
    if (existing) {
      await supabase.from('customer_targets').update({ standard_target: standard, push_target: push, stretch_target: stretch })
        .eq('id', existing.id)
    } else {
      await supabase.from('customer_targets').insert({
        customer_id: customerId, year, standard_target: standard, push_target: push, stretch_target: stretch,
      })
    }

    setEdits(prev => { const n = { ...prev }; delete n[customerId]; return n })
    queryClient.invalidateQueries({ queryKey: ['customer-targets', year] })
    setSaving(null)
  }

  const handleRemove = async (customerId: string) => {
    if (!confirm(t('common.confirm_delete'))) return
    setSaving(customerId)
    const existing = getTarget(customerId)
    if (existing) {
      await supabase.from('customer_targets').update({ excluded: true }).eq('id', existing.id)
    } else {
      await supabase.from('customer_targets').insert({
        customer_id: customerId, year, standard_target: 0, push_target: 0, stretch_target: 0, excluded: true,
      })
    }
    setEdits(prev => { const n = { ...prev }; delete n[customerId]; return n })
    queryClient.invalidateQueries({ queryKey: ['customer-targets', year] })
    setSaving(null)
  }

  const handleAddToForecast = async (customerId: string) => {
    setShowAddClient(false)
    setAddSearch('')
    setSaving(customerId)
    const existing = getTarget(customerId)
    if (existing) {
      await supabase.from('customer_targets').update({ excluded: false }).eq('id', existing.id)
    } else {
      await supabase.from('customer_targets').insert({
        customer_id: customerId, year, standard_target: 0, push_target: 0, stretch_target: 0, excluded: false,
      })
    }
    queryClient.invalidateQueries({ queryKey: ['customer-targets', year] })
    setSaving(null)
  }

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const rows = forecastCustomers.map((c: any) => {
      const target = getTarget(c.id)
      return {
        'ID': c.id,
        [t('targets.col_distributor')]: c.legal_name,
        [t('targets.col_country')]: c.country,
        [t('targets.col_standard')]: target?.standard_target ?? 0,
        [t('targets.col_push')]: target?.push_target ?? 0,
        [t('targets.col_stretch')]: target?.stretch_target ?? 0,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [30, 28, 12, 14, 14, 14].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Targets')
    XLSX.writeFile(wb, `targets_${year}.xlsx`)
  }

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(ws)

    const byId = new Map((customers as any[]).map((c: any) => [c.id, c]))
    const byName = new Map((customers as any[]).map((c: any) => [c.legal_name, c]))
    const distributorKey = t('targets.col_distributor')
    const standardKey = t('targets.col_standard')
    const pushKey = t('targets.col_push')
    const stretchKey = t('targets.col_stretch')

    const upserts: any[] = []
    let skipped = 0
    for (const row of rows) {
      const customer = byId.get(row['ID']) ?? byName.get(row[distributorKey])
      if (!customer) { skipped++; continue }
      upserts.push({
        customer_id: customer.id,
        year,
        standard_target: parseFloat(row[standardKey]) || 0,
        push_target: parseFloat(row[pushKey]) || 0,
        stretch_target: parseFloat(row[stretchKey]) || 0,
      })
    }

    if (upserts.length) {
      await supabase.from('customer_targets').upsert(upserts, { onConflict: 'customer_id,year' })
    }
    queryClient.invalidateQueries({ queryKey: ['customer-targets', year] })
    alert(`${upserts.length} / ${rows.length}${skipped ? ` (${skipped} skipped)` : ''}`)
    e.target.value = ''
  }

  // Forecast = customers with an explicit (non-excluded) target, plus anyone with
  // revenue this year (auto-added) — unless explicitly removed via `excluded`
  const activeTargetRows = targets.filter((tg: any) => !tg.excluded)
  const excludedIds = new Set(targets.filter((tg: any) => tg.excluded).map((tg: any) => tg.customer_id))
  const targetedIds = new Set(activeTargetRows.map((tg: any) => tg.customer_id))
  const targetedCustomers = (customers as any[]).filter((c: any) => targetedIds.has(c.id))
  const forecastCustomers = (customers as any[])
    .filter((c: any) => !excludedIds.has(c.id) && (targetedIds.has(c.id) || getRevenue(c.id) > 0))
  const forecastIds = new Set(forecastCustomers.map((c: any) => c.id))
  const addableCustomers = (customers as any[])
    .filter((c: any) => !forecastIds.has(c.id) && c.legal_name.toLowerCase().includes(addSearch.toLowerCase()))

  // Summary stats — scoped to customers with an actual target, so revenue from
  // auto-added (target-less) forecast rows doesn't inflate the % of target figures
  const totalStandard = activeTargetRows.reduce((s: number, tg: any) => s + (tg.standard_target ?? 0), 0)
  const totalPush = activeTargetRows.reduce((s: number, tg: any) => s + (tg.push_target ?? 0), 0)
  const totalStretch = activeTargetRows.reduce((s: number, tg: any) => s + (tg.stretch_target ?? 0), 0)
  const scopedRevenue = targetedCustomers.reduce((s: number, c: any) => s + getRevenue(c.id), 0)
  const prevScopedRevenue = targetedCustomers.reduce((s: number, c: any) => s + sumRevenue(prevYearRevenues, c.id), 0)
  const growth = prevScopedRevenue ? ((scopedRevenue - prevScopedRevenue) / prevScopedRevenue) * 100 : null

  const prorata = monthsElapsed / 12
  const proratedStandard = totalStandard * prorata

  const customersWithTarget = targetedCustomers.length
  const onTrack = targetedCustomers.filter((c: any) => {
    const tg = getTarget(c.id)
    if (!tg) return false
    const rev = getRevenue(c.id)
    const status = getStatus(rev, tg.standard_target, tg.push_target, tg.stretch_target, monthsElapsed)
    return status && ['good', 'excellent', 'amazing'].includes(status.key)
  }).length

  const tierStats = [
    { label: t('targets.stat_pct_standard'), total: totalStandard, prorated: totalStandard * prorata },
    { label: t('targets.stat_pct_push'),     total: totalPush,     prorated: totalPush * prorata },
    { label: t('targets.stat_pct_stretch'),  total: totalStretch,  prorated: totalStretch * prorata },
  ]

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('targets.page_title')}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{t('targets.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
              <button key={y} onClick={() => setYear(y)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${year === y ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {y}
              </button>
            ))}
          </div>
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> {t('targets.download_template')}
          </button>
          <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer transition-colors">
            <Upload className="h-4 w-4" /> {t('targets.upload_targets')}
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={handleUploadFile} />
          </label>
          <div className="relative">
            <button onClick={() => setShowAddClient(v => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
              <Plus className="h-4 w-4" /> {t('targets.add_client')}
            </button>
            {showAddClient && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAddClient(false)} />
                <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input autoFocus value={addSearch} onChange={e => setAddSearch(e.target.value)}
                        placeholder={t('clients.search_placeholder')}
                        className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400" />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {addableCustomers.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-400 text-center">—</p>
                    ) : addableCustomers.map((c: any) => (
                      <button key={c.id} onClick={() => handleAddToForecast(c.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-2">
                        <span className="truncate">{c.legal_name}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{c.country ?? '—'}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setShowAddClient(false); router.push('/clients/new') }}
                    className="w-full text-left px-3 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 border-t border-gray-100 rounded-b-lg flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5" /> {t('targets.create_new_client')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Turnover vs Target + On track */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
        <div className="sm:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">{t('targets.stat_turnover_vs_target')}</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-2xl md:text-3xl font-bold text-gray-900">{fmt(scopedRevenue)}</p>
            <span className="text-sm text-gray-400">/ {fmt(totalStandard)}</span>
            {growth !== null && (
              <span className={`text-xs font-medium flex items-center gap-0.5 ${growth > 0 ? 'text-green-600' : growth < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {growth > 0 ? <TrendingUp className="h-3 w-3" /> : growth < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {growth > 0 ? '+' : ''}{growth.toFixed(0)}% {t('targets.vs_last_year')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {totalStandard ? Math.round((scopedRevenue / totalStandard) * 100) : 0}% {t('targets.full_year').toLowerCase()}
            {' · '}
            {proratedStandard ? Math.round((scopedRevenue / proratedStandard) * 100) : 0}% {t('targets.prorated').toLowerCase()}
          </p>
        </div>
        <div className="sm:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 mb-1">{t('targets.stat_on_track')}</p>
          <p className="text-2xl md:text-3xl font-bold text-gray-900">{onTrack} / {customersWithTarget}</p>
          <p className="text-xs text-gray-400 mt-1">{t('targets.on_track_sub')}</p>
        </div>
      </div>

      {/* % of Standard / Push / Stretch */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {tierStats.map(({ label, total, prorated }) => {
          const pctFull = total ? Math.round((scopedRevenue / total) * 100) : 0
          const pctPro = prorated ? Math.round((scopedRevenue / prorated) * 100) : 0
          return (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-bold text-gray-900">{pctPro}%</p>
              <p className="text-xs text-gray-400 mt-1">{fmt(scopedRevenue)} / {fmt(prorated)} ({t('targets.prorated').toLowerCase()})</p>
              <p className="text-xs text-gray-300 mt-0.5">{pctFull}% · {fmt(scopedRevenue)} / {fmt(total)} ({t('targets.full_year').toLowerCase()})</p>
            </div>
          )
        })}
      </div>

      {/* Targets table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            Month {Math.ceil(monthsElapsed)} of 12 — prorated targets based on {Math.round(monthsElapsed/12*100)}% of year elapsed
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={thClass}>{t('targets.col_distributor')}</th>
              <th className={thClass}>{t('targets.col_standard')}</th>
              <th className={thClass}>{t('targets.col_push')}</th>
              <th className={thClass}>{t('targets.col_stretch')}</th>
              <th className={thClass}>{t('targets.revenue_ytd')}</th>
              <th className={thClass}>{t('targets.col_progress')}</th>
              <th className={thClass}>{t('targets.col_status')}</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {forecastCustomers.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">—</td></tr>
            ) : forecastCustomers.map((c: any) => {
              const target = getTarget(c.id)
              const rev = getRevenue(c.id)
              const std = parseFloat(getEdit(c.id, 'standard', target?.standard_target ?? 0)) || 0
              const push = parseFloat(getEdit(c.id, 'push', target?.push_target ?? 0)) || 0
              const stretch = parseFloat(getEdit(c.id, 'stretch', target?.stretch_target ?? 0)) || 0
              const status = std > 0 ? getStatus(rev, std, push, stretch, monthsElapsed) : null
              const rowProratedStd = std * (monthsElapsed / 12)
              const progressPct = rowProratedStd > 0 ? Math.min((rev / rowProratedStd) * 100, 150) : 0
              const hasEdits = !!edits[c.id]

              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{c.legal_name}</p>
                    <p className="text-xs text-gray-400">{c.region ?? c.country ?? '—'}</p>
                  </td>
                  {/* Standard */}
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      value={getEdit(c.id, 'standard', target?.standard_target ?? 0)}
                      onChange={e => setEdit(c.id, 'standard', e.target.value)}
                      placeholder="0"
                      className="w-28 h-8 rounded border border-gray-200 px-2 text-right text-sm focus:outline-none focus:border-blue-400"
                    />
                  </td>
                  {/* Push */}
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      value={getEdit(c.id, 'push', target?.push_target ?? 0)}
                      onChange={e => setEdit(c.id, 'push', e.target.value)}
                      placeholder="0"
                      className="w-28 h-8 rounded border border-gray-200 px-2 text-right text-sm focus:outline-none focus:border-purple-400"
                    />
                  </td>
                  {/* Stretch */}
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      value={getEdit(c.id, 'stretch', target?.stretch_target ?? 0)}
                      onChange={e => setEdit(c.id, 'stretch', e.target.value)}
                      placeholder="0"
                      className="w-28 h-8 rounded border border-gray-200 px-2 text-right text-sm focus:outline-none focus:border-gray-400"
                    />
                  </td>
                  {/* Revenue YTD */}
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {rev > 0 ? fmt(rev) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Progress bar */}
                  <td className="px-4 py-3">
                    {std > 0 ? (
                      <div className="w-full">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                          {/* Standard marker */}
                          <div className="absolute top-0 bottom-0 w-0.5 bg-green-400 z-10" style={{ left: `${Math.min(100/150*100, 100)}%` }} />
                          {/* Push marker */}
                          {push > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-purple-400 z-10" style={{ left: `${Math.min((rowProratedStd > 0 ? (push*(monthsElapsed/12)/rowProratedStd) : 0)*100/150*100, 100)}%` }} />}
                          {/* Progress */}
                          <div className={`h-full rounded-full transition-all ${
                            !status ? 'bg-gray-200' :
                            status.key === 'urgent' ? 'bg-red-500' :
                            status.key === 'late' ? 'bg-orange-400' :
                            status.key === 'good' ? 'bg-green-500' :
                            status.key === 'excellent' ? 'bg-purple-500' :
                            'bg-gray-900'
                          }`} style={{ width: `${progressPct / 1.5}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 text-center">{fmt(rev)} / {fmt(rowProratedStd)}</p>
                      </div>
                    ) : <span className="text-gray-300 text-xs">{t('targets.no_target')}</span>}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {status ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${status.dot}`} />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                          {t('targets.status_' + status.key)}
                        </span>
                        <span className="text-xs text-gray-400">{status.pct}%</span>
                      </div>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  {/* Save / Remove */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {hasEdits && (
                        <button onClick={() => handleSave(c.id)} disabled={saving === c.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                          {saving === c.id ? '...' : <><Check className="h-3 w-3" /> {t('common.save')}</>}
                        </button>
                      )}
                      {!hasEdits && (
                        <button onClick={() => handleRemove(c.id)} disabled={saving === c.id}
                          title={t('common.delete')}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
