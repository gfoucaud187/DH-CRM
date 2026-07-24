'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/lib/i18n/LanguageProvider'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { COUNTRIES } from '@/lib/countries'
import { reportPeriod, reportYearStart, trailingReportPeriods } from '@/lib/reportPeriod'
import { BarChart3, Globe, Package, Users, Target, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Clock, XCircle, Calendar, Download } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']


const PERIODS = [
  { id: 'ytd', label: 'YTD',       vsLabel: 'vs. same period last year' },
  { id: '12m', label: 'Last 12M',  vsLabel: 'vs. previous 12 months' },
  { id: '2y',  label: '2 Years',   vsLabel: 'vs. previous 2 years' },
  { id: '3y',  label: '3 Years',   vsLabel: 'vs. previous 3 years' },
  { id: 'all', label: 'All time',  vsLabel: 'vs. previous period' },
]

function fmt(n: number) {
  return `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function fmtUnit(n: number) {
  return `USD ${n.toFixed(2)}`
}

function flagFor(code?: string | null) {
  return COUNTRIES.find(c => c.code === code)?.flag ?? ''
}

function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = rows.map(r => r.map(v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

function getHealthScore(lastOrderDays: number, freqPerMonth: number) {
  if (lastOrderDays > 365) return { label: 'Lost',    color: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400',   priority: 4 }
  if (lastOrderDays > 120) return { label: 'Dormant', color: 'bg-red-100 text-red-600',     dot: 'bg-red-500',    priority: 3 }
  if (lastOrderDays > 60 || freqPerMonth < 0.5) return { label: 'At risk', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', priority: 2 }
  return { label: 'Active', color: 'bg-green-100 text-green-700', dot: 'bg-green-500', priority: 1 }
}

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex-shrink-0">
      <Download className="h-4 w-4" /> {label}
    </button>
  )
}

function Delta({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return <span className="text-gray-400 text-xs">—</span>
  const p = ((curr - prev) / prev * 100)
  if (Math.abs(p) < 1) return <span className="text-gray-400 text-xs flex items-center gap-0.5"><Minus className="h-3 w-3" />0%</span>
  return p > 0
    ? <span className="text-green-600 text-xs flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />{p.toFixed(0)}%</span>
    : <span className="text-red-500 text-xs flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{Math.abs(p).toFixed(0)}%</span>
}

function getPeriodDates(period: string) {
  const now = new Date()
  let start: Date
  let prevStart: Date
  let prevEnd: Date

  switch (period) {
    case 'ytd':
      // Oct/Nov/Dec 2025 are folded into "2026" for reporting — YTD for 2026 has to reach back
      // to Oct 1, 2025 to actually include that folded quarter, instead of starting Jan 1.
      start = new Date(reportYearStart(now.getFullYear()))
      prevStart = new Date(now.getFullYear() - 1, 0, 1)
      prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      break
    case '12m':
      start = new Date(now); start.setFullYear(start.getFullYear() - 1)
      prevStart = new Date(now); prevStart.setFullYear(prevStart.getFullYear() - 2)
      prevEnd = new Date(start)
      break
    case '2y':
      start = new Date(now); start.setFullYear(start.getFullYear() - 2)
      prevStart = new Date(now); prevStart.setFullYear(prevStart.getFullYear() - 4)
      prevEnd = new Date(start)
      break
    case '3y':
      start = new Date(now); start.setFullYear(start.getFullYear() - 3)
      prevStart = new Date(now); prevStart.setFullYear(prevStart.getFullYear() - 6)
      prevEnd = new Date(start)
      break
    default:
      start = new Date('2020-01-01')
      prevStart = new Date('2015-01-01')
      prevEnd = new Date('2020-01-01')
  }
  return { start, end: now, prevStart, prevEnd }
}

export default function ReportsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [tab, setTab] = useState('overview')
  const [period, setPeriod] = useState('ytd')
  const [activityFilter, setActivityFilter] = useState<'all'|'active'|'at_risk'|'dormant'|'lost'>('all')
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null)
  const [geoTypeFilter, setGeoTypeFilter] = useState<'all'|'distributor'|'private'>('all')

  const t = useT()

  const TABS = [
    { id: 'overview',  label: t('reports.tab_overview'),  icon: BarChart3 },
    { id: 'geography', label: t('reports.tab_geography'), icon: Globe },
    { id: 'products',  label: t('reports.tab_products'),  icon: Package },
    { id: 'clients',   label: t('reports.tab_clients'),   icon: Users },
    { id: 'activity',  label: t('reports.tab_activity'),  icon: Target },
  ]

  const currentPeriod = PERIODS.find(p => p.id === period) ?? PERIODS[0]

  const { data: customers = [] } = useQuery({
    queryKey: ['report-customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers')
        .select('id, legal_name, country, region, client_type, assigned_price_list, currency, status, is_european, eu_compliance_type, internal_owner')
        .eq('status', 'active')
      return data ?? []
    }
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['report-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders')
        .select('id, customer_id, customer_name, document_type, status, total_amount, total_units, order_date, created_at, currency, is_foc')
        .neq('status', 'cancelled')
        .order('order_date', { ascending: false })
      return data ?? []
    }
  })

  const { data: lines = [] } = useQuery({
    queryKey: ['report-lines'],
    queryFn: async () => {
      const { data } = await supabase.from('sales_order_lines')
        .select('order_id, sku, product_name, brand, quantity_units, quantity_packs, line_total, line_type')
        .eq('line_type', 'commercial')
      return data ?? []
    }
  })

  const now = new Date()
  const { start, end, prevStart, prevEnd } = useMemo(() => getPeriodDates(period), [period])

  const invoices = orders.filter((o: any) => o.document_type === 'invoice' && !o.is_foc)

  const inPeriod = (o: any) => {
    const d = new Date(o.order_date ?? o.created_at)
    return d >= start && d <= end
  }
  const inPrev = (o: any) => {
    const d = new Date(o.order_date ?? o.created_at)
    return d >= prevStart && d <= prevEnd
  }

  const periodInvoices = invoices.filter(inPeriod)
  const prevInvoices   = invoices.filter(inPrev)

  const periodRevenue = periodInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const prevRevenue   = prevInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const periodUnits   = periodInvoices.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
  const prevUnits     = prevInvoices.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
  const activeClients = new Set(periodInvoices.map((o: any) => o.customer_id)).size
  const prevClients   = new Set(prevInvoices.map((o: any) => o.customer_id)).size

  const trailing12 = trailingReportPeriods(12)
  const monthlyRevenue = trailing12.map(({ year, month }) => {
    const val = invoices.filter((o: any) => {
      const p = reportPeriod(o.order_date ?? o.created_at)
      return p.year === year && p.month === month
    }).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    return { label: MONTHS[month], value: val, year }
  })
  const maxMonthly = Math.max(...monthlyRevenue.map(m => m.value), 1)

  const countryMap: Record<string, { clients: any[], revenue: number, units: number, prevRevenue: number }> = {}
  customers.forEach((c: any) => {
    const country = c.country ?? 'Unknown'
    if (!countryMap[country]) countryMap[country] = { clients: [], revenue: 0, units: 0, prevRevenue: 0 }
    countryMap[country].clients.push(c)
    countryMap[country].revenue += periodInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    countryMap[country].prevRevenue += prevInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    countryMap[country].units += periodInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
  })
  const countryList = Object.entries(countryMap).sort(([,a],[,b]) => b.revenue - a.revenue)
  const maxCountryRevenue = Math.max(...countryList.map(([,v]) => v.revenue), 1)

  const geoCustomers = customers.filter((c: any) => geoTypeFilter === 'all' || (c.client_type ?? 'distributor') === geoTypeFilter)
  const geoCountryMap: Record<string, { clients: any[], revenue: number, units: number, prevRevenue: number }> = {}
  geoCustomers.forEach((c: any) => {
    const country = c.country ?? 'Unknown'
    if (!geoCountryMap[country]) geoCountryMap[country] = { clients: [], revenue: 0, units: 0, prevRevenue: 0 }
    geoCountryMap[country].clients.push(c)
    geoCountryMap[country].revenue += periodInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    geoCountryMap[country].prevRevenue += prevInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    geoCountryMap[country].units += periodInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
  })
  const geoCountryList = Object.entries(geoCountryMap).sort(([,a],[,b]) => b.revenue - a.revenue)
  const maxGeoCountryRevenue = Math.max(...geoCountryList.map(([,v]) => v.revenue), 1)
  const geoRevenue = geoCountryList.reduce((s, [,v]) => s + v.revenue, 0)

  const brandMap: Record<string, { units: number, revenue: number }> = {}
  const productMap: Record<string, { units: number, revenue: number, brand: string }> = {}
  lines.forEach((l: any) => {
    const o = invoices.find((o: any) => o.id === l.order_id)
    if (!o || !inPeriod(o)) return
    const brand = l.brand ?? 'Unknown'
    if (!brandMap[brand]) brandMap[brand] = { units: 0, revenue: 0 }
    brandMap[brand].units += l.quantity_units ?? 0
    brandMap[brand].revenue += l.line_total ?? 0
    if (!productMap[l.product_name]) productMap[l.product_name] = { units: 0, revenue: 0, brand }
    productMap[l.product_name].units += l.quantity_units ?? 0
    productMap[l.product_name].revenue += l.line_total ?? 0
  })
  const brandList = Object.entries(brandMap).sort(([,a],[,b]) => b.revenue - a.revenue)
  const productList = Object.entries(productMap).sort(([,a],[,b]) => b.units - a.units).slice(0, 15)
  const maxBrand = Math.max(...brandList.map(([,v]) => v.revenue), 1)
  const maxProduct = Math.max(...productList.map(([,v]) => v.units), 1)

  const clientRevenue = customers.map((c: any) => ({
    ...c,
    revenue: periodInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0),
    prevRevenue: prevInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0),
    units: periodInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_units ?? 0), 0),
    orders: periodInvoices.filter((o: any) => o.customer_id === c.id).length,
  })).filter((c: any) => c.revenue > 0).sort((a: any, b: any) => b.revenue - a.revenue)
  const maxClientRev = Math.max(...clientRevenue.map((c: any) => c.revenue), 1)

  const activityData = customers.map((c: any) => {
    const cOrders = invoices.filter((o: any) => o.customer_id === c.id)
    if (!cOrders.length) return { ...c, lastOrderDate: null, lastOrderDays: 9999, freqPerMonth: 0, revenue12m: 0, prevRevenue12m: 0, orderCount12m: 0, health: getHealthScore(9999, 0), heatmap: Array(12).fill(0) }
    const sorted = [...cOrders].sort((a: any, b: any) => new Date(b.order_date ?? b.created_at).getTime() - new Date(a.order_date ?? a.created_at).getTime())
    const lastDate = new Date(sorted[0].order_date ?? sorted[0].created_at)
    const lastOrderDays = Math.floor((now.getTime() - lastDate.getTime()) / 86400000)
    const cut12 = new Date(); cut12.setFullYear(cut12.getFullYear() - 1)
    const cut24 = new Date(); cut24.setFullYear(cut24.getFullYear() - 2)
    const o12 = cOrders.filter((o: any) => new Date(o.order_date ?? o.created_at) > cut12)
    const o24 = cOrders.filter((o: any) => { const d = new Date(o.order_date ?? o.created_at); return d > cut24 && d <= cut12 })
    const heatmap = trailing12.map(({ year, month }) =>
      cOrders.filter((o: any) => {
        const p = reportPeriod(o.order_date ?? o.created_at)
        return p.year === year && p.month === month
      }).length
    )
    return {
      ...c, lastOrderDate: lastDate, lastOrderDays,
      freqPerMonth: o12.length / 12,
      revenue12m: o12.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0),
      prevRevenue12m: o24.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0),
      orderCount12m: o12.length,
      health: getHealthScore(lastOrderDays, o12.length / 12),
      heatmap,
    }
  }).sort((a: any, b: any) => a.health.priority - b.health.priority || b.lastOrderDays - a.lastOrderDays)

  const filteredActivity = activityData.filter((c: any) =>
    activityFilter === 'all' || c.health.label.toLowerCase().replace(' ', '_') === activityFilter
  )
  const healthCounts = {
    active:  activityData.filter((c: any) => c.health.label === 'Active').length,
    at_risk: activityData.filter((c: any) => c.health.label === 'At risk').length,
    dormant: activityData.filter((c: any) => c.health.label === 'Dormant').length,
    lost:    activityData.filter((c: any) => c.health.label === 'Lost').length,
  }

  const exportOverview = () => downloadCsv([
    ['Metric', 'Value', 'Previous'],
    [t('reports.kpi_revenue'), periodRevenue, prevRevenue],
    [t('reports.kpi_units_shipped'), periodUnits, prevUnits],
    [t('reports.kpi_active_clients'), activeClients, prevClients],
    [],
    ['Month', 'Revenue'],
    ...monthlyRevenue.map(m => [m.label, m.value]),
    [],
    [t('reports.col_country'), t('reports.col_revenue')],
    ...countryList.map(([country, d]: any) => [country, d.revenue]),
    [],
    ['Brand', t('reports.col_revenue')],
    ...brandList.map(([brand, d]: any) => [brand, d.revenue]),
  ], 'overview.csv')

  const exportGeography = () => downloadCsv([
    [t('reports.col_country'), t('reports.col_clients'), t('reports.col_revenue'), t('reports.col_units'), t('reports.col_avg_unit')],
    ...geoCountryList.map(([country, d]: any) => [
      country, d.clients.length, d.revenue, d.units, d.units ? (d.revenue / d.units).toFixed(2) : '',
    ]),
  ], 'geography.csv')

  const exportProducts = () => downloadCsv([
    ['Brand', t('reports.col_revenue'), t('reports.col_units'), t('reports.col_avg_unit')],
    ...brandList.map(([brand, d]: any) => [brand, d.revenue, d.units, d.units ? (d.revenue / d.units).toFixed(2) : '']),
    [],
    ['Product', 'Brand', t('reports.col_units'), t('reports.col_revenue'), t('reports.col_avg_unit')],
    ...productList.map(([name, d]: any) => [name, d.brand, d.units, d.revenue, d.units ? (d.revenue / d.units).toFixed(2) : '']),
  ], 'products.csv')

  const exportClients = () => downloadCsv([
    ['Client', t('reports.col_country'), t('reports.col_revenue'), t('reports.col_units'), t('reports.col_orders')],
    ...clientRevenue.map((c: any) => [c.legal_name, c.country, c.revenue, c.units, c.orders]),
  ], 'clients.csv')

  const exportActivity = () => downloadCsv([
    ['Client', t('reports.col_country'), 'Last order', 'Days since', 'Freq/mo', '12M revenue', 'Health'],
    ...filteredActivity.map((c: any) => [
      c.legal_name, c.country, c.lastOrderDate ? c.lastOrderDate.toLocaleDateString('en-GB') : '',
      c.lastOrderDays, c.freqPerMonth.toFixed(2), c.revenue12m, c.health.label,
    ]),
  ], 'activity.csv')

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('reports.page_title')}</h1>
          <p className="text-gray-500 text-sm mt-0.5">Business intelligence & analytics</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl overflow-x-auto flex-nowrap">
          <Calendar className="h-4 w-4 text-gray-400 ml-2 flex-shrink-0" />
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${period === p.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl overflow-x-auto flex-nowrap">
        {TABS.map(tabItem => {
          const Icon = tabItem.icon
          return (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${tab === tabItem.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tabItem.label}</span>
              {tabItem.id === 'activity' && (healthCounts.dormant + healthCounts.at_risk) > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                  {healthCounts.dormant + healthCounts.at_risk}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <ExportButton label={t('reports.export')} onClick={exportOverview} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: t('reports.kpi_revenue'),        value: fmt(periodRevenue), curr: periodRevenue, prev: prevRevenue, sub: `${periodInvoices.length} invoices` },
              { label: t('reports.kpi_units_shipped'),  value: periodUnits.toLocaleString(), curr: periodUnits, prev: prevUnits, sub: 'units' },
              { label: t('reports.kpi_active_clients'), value: activeClients.toString(), curr: activeClients, prev: prevClients, sub: 'ordered in period' },
            ].map(({ label, value, curr, prev, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
                <p className="text-sm text-gray-500 mb-1">{label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl md:text-3xl font-bold text-gray-900">{value}</p>
                  <Delta curr={curr} prev={prev} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{sub}</p>
                <p className="text-xs text-gray-300 mt-0.5">{currentPeriod.vsLabel}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Revenue — last 12 months</h2>
            <div className="flex items-end gap-1 md:gap-2" style={{ height: '120px' }}>
              {monthlyRevenue.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  {m.value > 0 && <span style={{ fontSize: '9px' }} className="text-gray-400 hidden sm:block">{fmt(m.value)}</span>}
                  <div className="w-full rounded-t" style={{ height: `${Math.max((m.value/maxMonthly)*95, m.value > 0 ? 4 : 0)}px`, background: m.value > 0 ? '#185FA5' : '#F3F4F6' }} />
                  <span style={{ fontSize: '9px' }} className="text-gray-400">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
              <h2 className="font-semibold text-gray-900 mb-3">{t('reports.top_countries')}</h2>
              {countryList.slice(0,6).map(([country, data]) => (
                <div key={country} className="flex items-center gap-3 mb-2.5">
                  <span className="text-sm text-gray-600 w-24 md:w-28 truncate">{flagFor(country)} {country}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(data.revenue/maxCountryRevenue)*100}%`, background: '#185FA5' }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 w-14 md:w-16 text-right">{fmt(data.revenue)}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Top brands</h2>
              {brandList.slice(0,6).map(([brand, data]) => (
                <div key={brand} className="flex items-center gap-3 mb-2.5">
                  <span className="text-sm text-gray-600 w-24 md:w-28 truncate">{brand}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(data.revenue/maxBrand)*100}%`, background: '#0F6E56' }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 w-14 md:w-16 text-right">{fmt(data.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── GEOGRAPHY ── */}
      {tab === 'geography' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t('reports.filter_type')}:</span>
              {(['all','distributor','private'] as const).map(f => (
                <button key={f} onClick={() => setGeoTypeFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${geoTypeFilter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f === 'all' ? t('common.all') : f === 'distributor' ? t('clients.type_distributor') : t('clients.type_private')}
                </button>
              ))}
            </div>
            <ExportButton label={t('reports.export')} onClick={exportGeography} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t('reports.stat_countries'),        value: geoCountryList.length },
              { label: t('reports.kpi_active_clients'),   value: geoCustomers.length },
              { label: t('reports.kpi_revenue'),          value: fmt(geoRevenue) },
              { label: t('reports.avg_per_country'),      value: fmt(geoRevenue / Math.max(geoCountryList.length, 1)) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-xl md:text-2xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 md:px-5 py-3 font-medium text-gray-600">{t('reports.col_country')}</th>
                    <th className="text-center px-3 md:px-4 py-3 font-medium text-gray-600">{t('reports.col_clients')}</th>
                    <th className="text-right px-3 md:px-4 py-3 font-medium text-gray-600">{t('reports.col_revenue')}</th>
                    <th className="text-right px-3 md:px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">{t('reports.col_units')}</th>
                    <th className="text-right px-3 md:px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">{t('reports.col_avg_unit')}</th>
                    <th className="text-right px-3 md:px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{currentPeriod.vsLabel}</th>
                    <th className="px-3 md:px-4 py-3 w-24 md:w-40 hidden sm:table-cell" />
                  </tr>
                </thead>
                <tbody>
                  {geoCountryList.map(([country, data]) => (
                    <>
                      <tr key={country} onClick={() => setExpandedCountry(expandedCountry === country ? null : country)}
                        className="cursor-pointer hover:bg-gray-50 border-b border-gray-100">
                        <td className="px-4 md:px-5 py-3 font-semibold text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className={`transition-transform ${expandedCountry === country ? 'rotate-90' : ''}`}>›</span>
                            {flagFor(country)} {country}
                          </div>
                        </td>
                        <td className="px-3 md:px-4 py-3 text-center text-gray-600">{data.clients.length}</td>
                        <td className="px-3 md:px-4 py-3 text-right font-semibold text-gray-900">{fmt(data.revenue)}</td>
                        <td className="px-3 md:px-4 py-3 text-right text-gray-600 hidden sm:table-cell">{data.units.toLocaleString()}</td>
                        <td className="px-3 md:px-4 py-3 text-right text-gray-600 hidden sm:table-cell">{data.units ? fmtUnit(data.revenue/data.units) : '—'}</td>
                        <td className="px-3 md:px-4 py-3 text-right hidden md:table-cell"><Delta curr={data.revenue} prev={data.prevRevenue} /></td>
                        <td className="px-3 md:px-4 py-3 hidden sm:table-cell">
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(data.revenue/maxGeoCountryRevenue)*100}%`, background: '#185FA5' }} />
                          </div>
                        </td>
                      </tr>
                      {expandedCountry === country && data.clients.map((c: any) => {
                        const cRev = periodInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
                        const cPrev = prevInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
                        const cUnits = periodInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
                        return (
                          <tr key={c.id} className="bg-blue-50 border-b border-blue-100 hover:bg-blue-100 cursor-pointer"
                            onClick={e => { e.stopPropagation(); router.push('/reports/client/' + c.id) }}>
                            <td className="px-4 md:px-5 py-2.5 pl-10 text-sm text-gray-700">{c.legal_name}</td>
                            <td className="px-3 md:px-4 py-2.5 text-center">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.eu_compliance_type === 'TT' ? 'bg-blue-100 text-blue-700' : c.eu_compliance_type === 'PR' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {c.eu_compliance_type ?? 'EXP'}
                              </span>
                            </td>
                            <td className="px-3 md:px-4 py-2.5 text-right text-sm font-medium text-gray-900">{cRev > 0 ? fmt(cRev) : '—'}</td>
                            <td className="px-3 md:px-4 py-2.5 text-right text-sm text-gray-600 hidden sm:table-cell">{cUnits > 0 ? cUnits.toLocaleString() : '—'}</td>
                            <td className="px-3 md:px-4 py-2.5 text-right text-sm text-gray-600 hidden sm:table-cell">{cUnits ? fmt(cRev/cUnits) : '—'}</td>
                            <td className="px-3 md:px-4 py-2.5 text-right hidden md:table-cell"><Delta curr={cRev} prev={cPrev} /></td>
                            <td className="px-3 md:px-4 py-2.5 text-right text-xs text-blue-600 hidden sm:table-cell">View →</td>
                          </tr>
                        )
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── PRODUCTS ── */}
      {tab === 'products' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <ExportButton label={t('reports.export')} onClick={exportProducts} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Revenue by brand</h2>
              {brandList.map(([brand, data]) => (
                <div key={brand} className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-gray-700 w-24 md:w-32 truncate">{brand}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-full relative">
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.max((data.revenue/maxBrand)*100, 8)}%`, background: '#0F6E56' }} />
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-gray-900 text-white px-2 py-0.5 rounded-full whitespace-nowrap" style={{ fontSize: '9px' }}>
                      {fmt(data.revenue)}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 w-12 md:w-16 text-right">{data.units.toLocaleString()}u</span>
                  <span className="text-xs text-gray-400 w-16 md:w-20 text-right" title={t('reports.col_avg_unit')}>
                    {data.units ? fmtUnit(data.revenue/data.units) : '—'}/u
                  </span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Top products by units</h2>
              {productList.map(([name, data], i) => (
                <div key={name} className="flex items-center gap-2 mb-2.5">
                  <span className="text-xs text-gray-400 w-4 text-right">{i+1}</span>
                  <span className="text-xs text-gray-700 w-36 md:w-44 truncate" title={name}>{name}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full relative">
                    <div className="h-full rounded-full" style={{ width: `${Math.max((data.units/maxProduct)*100, 8)}%`, background: '#185FA5' }} />
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-gray-900 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ fontSize: '9px' }}>
                      {data.units.toLocaleString()}u
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 w-14 md:w-16 text-right" title={t('reports.col_avg_unit')}>
                    {data.units ? fmtUnit(data.revenue/data.units) : '—'}/u
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CLIENTS ── */}
      {tab === 'clients' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <ExportButton label={t('reports.export')} onClick={exportClients} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {clientRevenue.map((c: any, i: number) => (
              <div key={c.id} className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => router.push('/reports/client/' + c.id)}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-400 flex-shrink-0">#{i+1}</span>
                    <span className="font-medium text-gray-900 truncate">{c.legal_name}</span>
                  </div>
                  <Delta curr={c.revenue} prev={c.prevRevenue} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{flagFor(c.country)} {c.country ?? '—'}</span>
                  <span className="font-semibold text-gray-900">{fmt(c.revenue)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">#</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{t('reports.col_country')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('reports.col_revenue')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('reports.col_units')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{t('reports.col_orders')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{currentPeriod.vsLabel}</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clientRevenue.map((c: any, i: number) => (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push('/reports/client/' + c.id)}>
                    <td className="px-5 py-3 text-gray-400 text-xs">{i+1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.legal_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{flagFor(c.country)} {c.country ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${(c.revenue/maxClientRev)*100}%` }} />
                        </div>
                        <span className="font-semibold text-gray-900">{fmt(c.revenue)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{c.units.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{c.orders}</td>
                    <td className="px-4 py-3 text-right"><Delta curr={c.revenue} prev={c.prevRevenue} /></td>
                    <td className="px-4 py-3 text-right text-xs text-blue-600">View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {/* ── ACTIVITY ── */}
      {tab === 'activity' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'active',  label: t('reports.health_active'),  count: healthCounts.active,  icon: CheckCircle,  color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-200', desc: '< 60 days, regular' },
              { key: 'at_risk', label: t('reports.health_at_risk'), count: healthCounts.at_risk, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200', desc: '60–120 days or low freq' },
              { key: 'dormant', label: t('reports.health_dormant'), count: healthCounts.dormant, icon: Clock,         color: 'text-red-600',   bg: 'bg-red-50',    border: 'border-red-200',   desc: '120–365 days' },
              { key: 'lost',    label: t('reports.health_lost'),    count: healthCounts.lost,    icon: XCircle,       color: 'text-gray-500',  bg: 'bg-gray-50',   border: 'border-gray-200',  desc: '> 365 days' },
            ].map(({ key, label, count, icon: Icon, color, bg, border, desc }) => (
              <button key={key}
                onClick={() => setActivityFilter(activityFilter === key as any ? 'all' : key as any)}
                className={`rounded-xl border-2 p-3 md:p-4 text-left transition-all ${activityFilter === key ? border + ' ' + bg : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-4 w-4 md:h-5 md:w-5 ${color}`} />
                  <span className="text-xl md:text-2xl font-bold text-gray-900">{count}</span>
                </div>
                <p className={`text-sm font-medium ${color}`}>{label}</p>
                <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">{desc}</p>
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="font-semibold text-gray-900">
                Customer Activity Tracker
                <span className="ml-2 text-sm font-normal text-gray-400">{filteredActivity.length} clients</span>
              </h2>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="hidden sm:inline">Heatmap = orders/month</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-gray-100" />0
                  <div className="w-3 h-3 rounded bg-blue-200 ml-1" />1
                  <div className="w-3 h-3 rounded bg-blue-400 ml-1" />2
                  <div className="w-3 h-3 rounded bg-blue-600 ml-1" />3+
                </div>
                <ExportButton label={t('reports.export')} onClick={exportActivity} />
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredActivity.map((c: any) => (
                <div key={c.id} className="px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => router.push('/reports/client/' + c.id)}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 truncate max-w-[180px]">{c.legal_name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className={`w-2 h-2 rounded-full ${c.health.dot}`} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.health.color}`}>{c.health.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">{c.region ?? c.country ?? '—'}</p>
                      {c.lastOrderDate ? (
                        <p className={`text-xs ${c.lastOrderDays > 120 ? 'text-red-500 font-semibold' : c.lastOrderDays > 60 ? 'text-amber-600' : 'text-gray-400'}`}>
                          {c.lastOrderDays}d ago
                        </p>
                      ) : <p className="text-xs text-gray-300">{t('reports.never_ordered')}</p>}
                    </div>
                    <div className="flex items-center gap-0.5">
                      {(c.heatmap ?? []).map((count: number, i: number) => (
                        <div key={i}
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ background: count === 0 ? '#F3F4F6' : count === 1 ? '#BFDBFE' : count === 2 ? '#60A5FA' : '#1D4ED8' }} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Client</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Region</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Last order</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Freq/mo</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">12M value</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">vs prev 12M</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Activity</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Score</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredActivity.map((c: any) => (
                    <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push('/reports/client/' + c.id)}>
                      <td className="px-5 py-3 font-medium text-gray-900">{c.legal_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{c.region ?? c.country ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {c.lastOrderDate ? (
                          <div>
                            <p className="text-xs font-medium text-gray-700">{c.lastOrderDate.toLocaleDateString('en-GB')}</p>
                            <p className={`text-xs ${c.lastOrderDays > 120 ? 'text-red-500 font-semibold' : c.lastOrderDays > 60 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {c.lastOrderDays}d ago
                            </p>
                          </div>
                        ) : <span className="text-xs text-gray-300">Never</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium ${c.freqPerMonth === 0 ? 'text-gray-300' : c.freqPerMonth < 0.5 ? 'text-amber-600' : 'text-green-600'}`}>
                          {c.freqPerMonth === 0 ? '—' : c.freqPerMonth.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {c.revenue12m > 0 ? fmt(c.revenue12m) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right"><Delta curr={c.revenue12m} prev={c.prevRevenue12m} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5 justify-center">
                          {(c.heatmap ?? []).map((count: number, i: number) => (
                            <div key={i} title={`${MONTHS[trailing12[i]?.month ?? 0]} ${trailing12[i]?.year ?? ''}: ${count}`}
                              className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                              style={{ background: count === 0 ? '#F3F4F6' : count === 1 ? '#BFDBFE' : count === 2 ? '#60A5FA' : '#1D4ED8' }} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${c.health.dot}`} />
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.health.color}`}>{c.health.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-blue-600">View →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
