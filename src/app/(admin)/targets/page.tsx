'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { COUNTRIES } from '@/lib/countries'
import { Check, TrendingUp, TrendingDown, Download, Upload, Plus, Trash2, Search } from 'lucide-react'
import { useT } from '@/lib/i18n/LanguageProvider'

const CURRENT_YEAR = new Date().getFullYear()

type Zone = 'late' | 'good' | 'excellent' | 'amazing'

// Same thresholds drive the row badges and the header's overall-position gauge
const computeZone = (actual: number, stdPro: number, pushPro: number, stretchPro: number): Zone | null => {
  if (stdPro <= 0 && pushPro <= 0 && stretchPro <= 0) return null
  if (actual < stdPro) return 'late'
  if (actual < pushPro) return 'good'
  if (actual < stretchPro) return 'excellent'
  return 'amazing'
}

const ZONE_HEX: Record<Zone, string>   = { late: '#EF4444', good: '#F97316', excellent: '#22C55E', amazing: '#A855F7' }
const ZONE_DOT: Record<Zone, string>   = { late: 'bg-red-500', good: 'bg-orange-500', excellent: 'bg-green-500', amazing: 'bg-purple-500' }
const ZONE_BADGE: Record<Zone, string> = {
  late: 'bg-red-100 text-red-700', good: 'bg-orange-100 text-orange-700',
  excellent: 'bg-green-100 text-green-700', amazing: 'bg-purple-100 text-purple-700',
}

const fmt = (n: number) => {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n/1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

const thClass = "px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500"

const countryName = (code?: string | null) => COUNTRIES.find(c => c.code === code)?.name ?? code ?? '—'

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
        .select('id, legal_name, currency, country')
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
  const forecastCustomers = (customers as any[])
    .filter((c: any) => !excludedIds.has(c.id) && (targetedIds.has(c.id) || getRevenue(c.id) > 0))
  const forecastIds = new Set(forecastCustomers.map((c: any) => c.id))
  const addableCustomers = (customers as any[])
    .filter((c: any) => !forecastIds.has(c.id) && c.legal_name.toLowerCase().includes(addSearch.toLowerCase()))

  const prorata = monthsElapsed / 12
  const clientsTotal = (customers as any[]).length
  // Turnover is always company-wide (every active client), never scoped down to just
  // whoever happens to have a target — only the target *sum* itself is tier-scoped.
  const revenueYtdAll = (customers as any[]).reduce((s: number, c: any) => s + getRevenue(c.id), 0)

  const allWithHistory = (customers as any[]).filter((c: any) => sumRevenue(prevYearRevenues, c.id) > 0)
  const thisYearHistAll = allWithHistory.reduce((s: number, c: any) => s + getRevenue(c.id), 0)
  const lastYearHistAll = allWithHistory.reduce((s: number, c: any) => s + sumRevenue(prevYearRevenues, c.id), 0)
  const pctVsLastYearAll = lastYearHistAll ? ((thisYearHistAll - lastYearHistAll) / lastYearHistAll) * 100 : null
  const yoyCoveredAll = allWithHistory.length

  // Per-tier: only the target sum (and the "uncovered revenue" breakdown) is scoped
  // to customers who actually have that tier's target > 0
  const computeTier = (field: 'standard_target' | 'push_target' | 'stretch_target') => {
    const rows = activeTargetRows.filter((tg: any) => (tg[field] ?? 0) > 0)
    const rowCustomerIds = new Set(rows.map((tg: any) => tg.customer_id))
    const tierCustomers = (customers as any[]).filter((c: any) => rowCustomerIds.has(c.id))

    const targetSum = rows.reduce((s: number, tg: any) => s + (tg[field] ?? 0), 0)
    const proratedTarget = targetSum * prorata
    const revenueFromTargeted = tierCustomers.reduce((s: number, c: any) => s + getRevenue(c.id), 0)

    const pctFullYear = targetSum ? (revenueYtdAll / targetSum) * 100 : null
    const pctProrated = proratedTarget ? (revenueYtdAll / proratedTarget) * 100 : null

    return { targetSum, proratedTarget, revenueFromTargeted, pctFullYear, pctProrated, clientsWithTarget: tierCustomers.length }
  }

  const standardTier = computeTier('standard_target')
  const pushTier = computeTier('push_target')
  const stretchTier = computeTier('stretch_target')

  // Axis scale comes from the targets alone (not revenue) so the tick marks stay
  // legibly spread out — the marker is simply clamped at 100% when revenue exceeds Stretch
  const gaugeAxisMax = Math.max(standardTier.proratedTarget, pushTier.proratedTarget, stretchTier.proratedTarget, 1)
  const gaugeStdPct = (standardTier.proratedTarget / gaugeAxisMax) * 100
  const gaugePushPct = (pushTier.proratedTarget / gaugeAxisMax) * 100
  const gaugeStretchPct = (stretchTier.proratedTarget / gaugeAxisMax) * 100
  const gaugeMarkerPct = Math.min((revenueYtdAll / gaugeAxisMax) * 100, 100)
  const gaugeZone = computeZone(revenueYtdAll, standardTier.proratedTarget, pushTier.proratedTarget, stretchTier.proratedTarget)

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

      {/* % of Standard / Push / Stretch */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {[
          { label: t('targets.col_standard'), tier: standardTier },
          { label: t('targets.col_push'),     tier: pushTier },
          { label: t('targets.col_stretch'),  tier: stretchTier },
        ].map(({ label, tier }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-3xl font-bold text-gray-900">{tier.pctProrated !== null ? Math.round(tier.pctProrated) : '—'}%</p>
            <p className="text-xs text-gray-400 mt-0.5">{fmt(revenueYtdAll)} / {fmt(tier.proratedTarget)} {t('targets.prorated').toLowerCase()}</p>

            <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2 border-t border-gray-100">
              <span>{tier.pctFullYear !== null ? Math.round(tier.pctFullYear) : '—'}% {t('targets.full_year').toLowerCase()}</span>
              {pctVsLastYearAll !== null ? (
                <span
                  title={`${yoyCoveredAll}/${clientsTotal}`}
                  className={`flex items-center gap-0.5 font-medium ${pctVsLastYearAll > 0 ? 'text-green-600' : pctVsLastYearAll < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {pctVsLastYearAll > 0 ? <TrendingUp className="h-3 w-3" /> : pctVsLastYearAll < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                  {pctVsLastYearAll > 0 ? '+' : ''}{Math.round(pctVsLastYearAll)}% {t('targets.vs_last_year')}
                </span>
              ) : <span className="text-gray-300">—</span>}
            </div>

            <p className="text-[11px] text-gray-400 mt-1.5">
              {fmt(revenueYtdAll)} / {fmt(tier.targetSum)} · {tier.clientsWithTarget}/{clientsTotal} {t('targets.clients_with_target')}
            </p>
            {tier.clientsWithTarget < clientsTotal && (
              <p className="text-[11px] text-gray-300 mt-0.5">
                {fmt(revenueYtdAll - tier.revenueFromTargeted)} {t('targets.uncovered_revenue')} ({clientsTotal - tier.clientsWithTarget})
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Overall position gauge */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <p className="text-xs text-gray-500 mb-4">{t('targets.overall_position')}</p>
        <div className="relative h-2 bg-gray-100 rounded-full mb-2">
          <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-300" style={{ left: `${gaugeStdPct}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-300" style={{ left: `${gaugePushPct}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-300" style={{ left: `${gaugeStretchPct}%` }} />
          {gaugeZone && (
            <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-4 rounded-full" style={{ left: `calc(${gaugeMarkerPct}% - 3px)`, background: ZONE_HEX[gaugeZone] }} />
          )}
        </div>
        <div className="relative h-4 text-[11px] text-gray-400 mb-3">
          <span className="absolute -translate-x-1/2" style={{ left: `${gaugeStdPct}%` }}>{t('targets.col_standard')}</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${gaugePushPct}%` }}>{t('targets.col_push')}</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${gaugeStretchPct}%` }}>{t('targets.col_stretch')}</span>
        </div>
        {gaugeZone && (
          <p className="text-sm font-semibold" style={{ color: ZONE_HEX[gaugeZone] }}>
            {t('targets.status_' + gaugeZone)} — {t('targets.overall_desc_' + gaugeZone)}
          </p>
        )}
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
              const rowProratedStd = std * prorata
              const rowProratedPush = push * prorata
              const rowProratedStretch = stretch * prorata
              const zone = std > 0 ? computeZone(rev, rowProratedStd, rowProratedPush, rowProratedStretch) : null
              const zonePct = rowProratedStd > 0 ? Math.round((rev / rowProratedStd) * 100) : null
              const rowAxisMax = Math.max(rowProratedStd, rowProratedPush, rowProratedStretch, 1)
              const rowStdPct = (rowProratedStd / rowAxisMax) * 100
              const rowPushPct = (rowProratedPush / rowAxisMax) * 100
              const rowStretchPct = (rowProratedStretch / rowAxisMax) * 100
              const rowMarkerPct = Math.min((rev / rowAxisMax) * 100, 100)
              const hasEdits = !!edits[c.id]

              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{c.legal_name}</p>
                    <p className="text-xs text-gray-400">{countryName(c.country)}</p>
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
                  {/* Progress bar — proportional axis Standard→Push→Stretch, marker = revenue YTD */}
                  <td className="px-4 py-3">
                    {std > 0 ? (
                      <div className="w-full">
                        <div className="relative h-2 bg-gray-100 rounded-full">
                          <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-gray-300" style={{ left: `${rowStdPct}%` }} />
                          {push > 0 && <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-gray-300" style={{ left: `${rowPushPct}%` }} />}
                          {stretch > 0 && <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-gray-300" style={{ left: `${rowStretchPct}%` }} />}
                          {zone && (
                            <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3.5 rounded-full" style={{ left: `calc(${rowMarkerPct}% - 3px)`, background: ZONE_HEX[zone] }} />
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 text-center">{fmt(rev)} / {fmt(rowProratedStd)}</p>
                      </div>
                    ) : <span className="text-gray-300 text-xs">{t('targets.no_target')}</span>}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {zone ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${ZONE_DOT[zone]}`} />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_BADGE[zone]}`}>
                          {t('targets.status_' + zone)}
                        </span>
                        {zonePct !== null && <span className="text-xs text-gray-400">{zonePct}%</span>}
                      </div>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                        {t('targets.status_untracked')}
                      </span>
                    )}
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
