'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Target, Save, TrendingUp, Check } from 'lucide-react'
import { useT } from '@/lib/i18n/LanguageProvider'

const CURRENT_YEAR = new Date().getFullYear()

const getStatus = (actual: number, standard: number, push: number, stretch: number, monthsElapsed: number) => {
  if (standard === 0) return null
  const prorata = monthsElapsed / 12
  const stdPro = standard * prorata
  const pushPro = push * prorata
  const stretchPro = stretch * prorata

  if (actual === 0) return { label: 'Urgent', color: 'bg-red-100 text-red-700', dot: 'bg-red-500', pct: 0 }
  if (actual < stdPro) {
    const pct = Math.round((actual / stdPro) * 100)
    return { label: 'Late', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', pct }
  }
  if (actual < pushPro) {
    const pct = Math.round((actual / stdPro) * 100)
    return { label: 'Good', color: 'bg-green-100 text-green-700', dot: 'bg-green-500', pct }
  }
  if (actual < stretchPro) {
    const pct = Math.round((actual / stdPro) * 100)
    return { label: 'Excellent', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', pct }
  }
  const pct = Math.round((actual / stdPro) * 100)
  return { label: 'Amazing', color: 'bg-gray-900 text-white', dot: 'bg-gray-900', pct }
}

const fmt = (n: number) => {
  if (!n) return '$0'
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n/1000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export default function TargetsPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const t = useT()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [saving, setSaving] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, { standard: string; push: string; stretch: string }>>({})

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

  const getTarget = (customerId: string) =>
    targets.find((t: any) => t.customer_id === customerId)

  const getRevenue = (customerId: string) =>
    revenues.filter((r: any) => r.customer_id === customerId)
      .reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0)

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

  // Summary stats
  const totalStandard = targets.reduce((s: number, t: any) => s + (t.standard_target ?? 0), 0)
  const totalRevenue = customers.reduce((s: number, c: any) => s + getRevenue(c.id), 0)
  const customersWithTarget = targets.length
  const onTrack = customers.filter((c: any) => {
    const t = getTarget(c.id)
    if (!t) return false
    const rev = getRevenue(c.id)
    const status = getStatus(rev, t.standard_target, t.push_target, t.stretch_target, monthsElapsed)
    return status && ['Good', 'Excellent', 'Amazing'].includes(status.label)
  }).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('targets.page_title')}</h1>
          <p className="text-gray-500 text-sm mt-0.5">Set annual objectives per distributor</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${year === y ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Standard Target',  value: fmt(totalStandard),           sub: `${customersWithTarget} clients with targets` },
          { label: 'Revenue YTD',            value: fmt(totalRevenue),            sub: `${Math.round((now.getMonth()+1)/12*100)}% of year elapsed` },
          { label: '% of Standard',          value: totalStandard ? Math.round((totalRevenue / (totalStandard * monthsElapsed / 12)) * 100) + '%' : '—', sub: 'vs prorated standard' },
          { label: 'On track',               value: `${onTrack} / ${customersWithTarget}`, sub: 'Good, Excellent or Amazing' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </div>
        ))}
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
              <th className="text-left px-5 py-3 font-medium text-gray-600">{t('targets.col_distributor')}</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">{t('targets.col_standard')} ($)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">{t('targets.col_push')} ($)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">{t('targets.col_stretch')} ($)</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Revenue YTD</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">{t('targets.col_progress')}</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(customers as any[]).map((c: any) => {
              const t = getTarget(c.id)
              const rev = getRevenue(c.id)
              const std = parseFloat(getEdit(c.id, 'standard', t?.standard_target ?? 0)) || 0
              const push = parseFloat(getEdit(c.id, 'push', t?.push_target ?? 0)) || 0
              const stretch = parseFloat(getEdit(c.id, 'stretch', t?.stretch_target ?? 0)) || 0
              const status = std > 0 ? getStatus(rev, std, push, stretch, monthsElapsed) : null
              const proratedStd = std * (monthsElapsed / 12)
              const progressPct = proratedStd > 0 ? Math.min((rev / proratedStd) * 100, 150) : 0
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
                      value={getEdit(c.id, 'standard', t?.standard_target ?? 0)}
                      onChange={e => setEdit(c.id, 'standard', e.target.value)}
                      placeholder="0"
                      className="w-28 h-8 rounded border border-gray-200 px-2 text-right text-sm focus:outline-none focus:border-blue-400"
                    />
                  </td>
                  {/* Push */}
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      value={getEdit(c.id, 'push', t?.push_target ?? 0)}
                      onChange={e => setEdit(c.id, 'push', e.target.value)}
                      placeholder="0"
                      className="w-28 h-8 rounded border border-gray-200 px-2 text-right text-sm focus:outline-none focus:border-purple-400"
                    />
                  </td>
                  {/* Stretch */}
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      value={getEdit(c.id, 'stretch', t?.stretch_target ?? 0)}
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
                          {push > 0 && <div className="absolute top-0 bottom-0 w-0.5 bg-purple-400 z-10" style={{ left: `${Math.min((proratedStd > 0 ? (push*(monthsElapsed/12)/proratedStd) : 0)*100/150*100, 100)}%` }} />}
                          {/* Progress */}
                          <div className={`h-full rounded-full transition-all ${
                            !status ? 'bg-gray-200' :
                            status.label === 'Urgent' ? 'bg-red-500' :
                            status.label === 'Late' ? 'bg-orange-400' :
                            status.label === 'Good' ? 'bg-green-500' :
                            status.label === 'Excellent' ? 'bg-purple-500' :
                            'bg-gray-900'
                          }`} style={{ width: `${progressPct / 1.5}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 text-center">{fmt(rev)} / {fmt(proratedStd)}</p>
                      </div>
                    ) : <span className="text-gray-300 text-xs">{t('targets.no_target')}</span>}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    {status ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${status.dot}`} />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="text-xs text-gray-400">{status.pct}%</span>
                      </div>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  {/* Save */}
                  <td className="px-4 py-3 text-center">
                    {hasEdits && (
                      <button onClick={() => handleSave(c.id)} disabled={saving === c.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors mx-auto">
                        {saving === c.id ? '...' : <><Check className="h-3 w-3" /> {t('common.save')}</>}
                      </button>
                    )}
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