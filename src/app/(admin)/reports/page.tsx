'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BarChart3, Globe, Package, Users, Target, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TABS = [
  { id: 'overview',   label: 'Overview',   icon: BarChart3 },
  { id: 'geography',  label: 'Geography',  icon: Globe },
  { id: 'products',   label: 'Products',   icon: Package },
  { id: 'clients',    label: 'Clients',    icon: Users },
  { id: 'activity',   label: 'Activity',   icon: Target },
]

function fmt(n: number, currency = 'USD') {
  if (n >= 1000000) return `$${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n/1000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function getHealthScore(lastOrderDays: number, freqPerMonth: number) {
  if (lastOrderDays > 365) return { label: 'Lost',    color: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400',   priority: 4 }
  if (lastOrderDays > 120) return { label: 'Dormant', color: 'bg-red-100 text-red-600',     dot: 'bg-red-500',    priority: 3 }
  if (lastOrderDays > 60 || freqPerMonth < 0.5) return { label: 'At risk', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', priority: 2 }
  return { label: 'Active',   color: 'bg-green-100 text-green-700', dot: 'bg-green-500',  priority: 1 }
}

function Delta({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return <span className="text-gray-400 text-xs">—</span>
  const p = ((curr - prev) / prev * 100)
  if (Math.abs(p) < 1) return <span className="text-gray-400 text-xs flex items-center gap-0.5"><Minus className="h-3 w-3" />0%</span>
  return p > 0
    ? <span className="text-green-600 text-xs flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />{p.toFixed(0)}%</span>
    : <span className="text-red-500 text-xs flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{Math.abs(p).toFixed(0)}%</span>
}

export default function ReportsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [tab, setTab] = useState('overview')
  const [activityFilter, setActivityFilter] = useState<'all'|'active'|'at_risk'|'dormant'|'lost'>('all')
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null)

  const { data: customers = [] } = useQuery({
    queryKey: ['report-customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, legal_name, country, region, assigned_price_list, currency, status, is_european, eu_compliance_type, internal_owner').eq('status', 'active')
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

  const invoices = orders.filter((o: any) => o.document_type === 'invoice' && !o.is_foc)
  const now = new Date()

  // ── OVERVIEW ──
  const ytdInvoices = invoices.filter((o: any) => new Date(o.order_date ?? o.created_at).getFullYear() === now.getFullYear())
  const lastYearInvoices = invoices.filter((o: any) => new Date(o.order_date ?? o.created_at).getFullYear() === now.getFullYear() - 1)
  const ytdRevenue = ytdInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const lyRevenue = lastYearInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const ytdUnits = ytdInvoices.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
  const lyUnits = lastYearInvoices.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
  const activeClients = new Set(ytdInvoices.map((o: any) => o.customer_id)).size
  const lyActiveClients = new Set(lastYearInvoices.map((o: any) => o.customer_id)).size

  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - 11 + i)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const val = invoices.filter((o: any) => {
      const od = new Date(o.order_date ?? o.created_at)
      return `${od.getFullYear()}-${od.getMonth()}` === key
    }).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    return { label: MONTHS[d.getMonth()], value: val }
  })
  const maxMonthly = Math.max(...monthlyRevenue.map(m => m.value), 1)

  // ── GEOGRAPHY ──
  const regionMap: Record<string, { clients: any[], revenue: number, units: number, prevRevenue: number }> = {}
  customers.forEach((c: any) => {
    const region = c.region ?? c.country ?? 'Unknown'
    if (!regionMap[region]) regionMap[region] = { clients: [], revenue: 0, units: 0, prevRevenue: 0 }
    regionMap[region].clients.push(c)
    const cInvoices = ytdInvoices.filter((o: any) => o.customer_id === c.id)
    const cPrevInvoices = lastYearInvoices.filter((o: any) => o.customer_id === c.id)
    regionMap[region].revenue += cInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    regionMap[region].units += cInvoices.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
    regionMap[region].prevRevenue += cPrevInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  })
  const regionList = Object.entries(regionMap).sort(([,a],[,b]) => b.revenue - a.revenue)
  const maxRegionRevenue = Math.max(...regionList.map(([,v]) => v.revenue), 1)

  // ── PRODUCTS ──
  const brandMap: Record<string, { units: number, revenue: number }> = {}
  const productMap: Record<string, { units: number, revenue: number, brand: string }> = {}
  lines.forEach((l: any) => {
    const o = invoices.find((o: any) => o.id === l.order_id)
    if (!o || new Date(o.order_date ?? o.created_at).getFullYear() !== now.getFullYear()) return
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

  // ── CLIENTS ──
  const clientRevenue = customers.map((c: any) => {
    const cInv = ytdInvoices.filter((o: any) => o.customer_id === c.id)
    const cPrev = lastYearInvoices.filter((o: any) => o.customer_id === c.id)
    const rev = cInv.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    const prevRev = cPrev.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    const units = cInv.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
    return { ...c, revenue: rev, prevRevenue: prevRev, units, orders: cInv.length }
  }).filter((c: any) => c.revenue > 0).sort((a: any, b: any) => b.revenue - a.revenue)
  const maxClientRev = Math.max(...clientRevenue.map((c: any) => c.revenue), 1)

  // ── ACTIVITY ──
  const activityData = customers.map((c: any) => {
    const cOrders = invoices.filter((o: any) => o.customer_id === c.id)
    if (cOrders.length === 0) {
      return { ...c, lastOrderDate: null, lastOrderDays: 9999, freqPerMonth: 0, revenue12m: 0, prevRevenue12m: 0, orderCount12m: 0, health: getHealthScore(9999, 0) }
    }
    const sorted = cOrders.sort((a: any, b: any) => new Date(b.order_date ?? b.created_at).getTime() - new Date(a.order_date ?? a.created_at).getTime())
    const lastDate = new Date(sorted[0].order_date ?? sorted[0].created_at)
    const lastOrderDays = Math.floor((now.getTime() - lastDate.getTime()) / 86400000)
    const cutoff12m = new Date(); cutoff12m.setFullYear(cutoff12m.getFullYear() - 1)
    const cutoff24m = new Date(); cutoff24m.setFullYear(cutoff24m.getFullYear() - 2)
    const orders12m = cOrders.filter((o: any) => new Date(o.order_date ?? o.created_at) > cutoff12m)
    const orders12m24m = cOrders.filter((o: any) => { const d = new Date(o.order_date ?? o.created_at); return d > cutoff24m && d <= cutoff12m })
    const revenue12m = orders12m.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    const prevRevenue12m = orders12m24m.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
    const freqPerMonth = orders12m.length / 12
    // Heatmap: last 12 months order count
    const heatmap = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - 11 + i)
      return cOrders.filter((o: any) => {
        const od = new Date(o.order_date ?? o.created_at)
        return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth()
      }).length
    })
    return { ...c, lastOrderDate: lastDate, lastOrderDays, freqPerMonth, revenue12m, prevRevenue12m, orderCount12m: orders12m.length, health: getHealthScore(lastOrderDays, freqPerMonth), heatmap }
  }).sort((a: any, b: any) => a.health.priority - b.health.priority || b.lastOrderDays - a.lastOrderDays)

  const filteredActivity = activityData.filter((c: any) => {
    if (activityFilter === 'all') return true
    return c.health.label.toLowerCase().replace(' ', '_') === activityFilter
  })

  const healthCounts = {
    active:  activityData.filter((c: any) => c.health.label === 'Active').length,
    at_risk: activityData.filter((c: any) => c.health.label === 'At risk').length,
    dormant: activityData.filter((c: any) => c.health.label === 'Dormant').length,
    lost:    activityData.filter((c: any) => c.health.label === 'Lost').length,
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-0.5">Business intelligence & analytics</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="h-4 w-4" />
              {t.label}
              {t.id === 'activity' && (healthCounts.dormant + healthCounts.at_risk) > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                  {healthCounts.dormant + healthCounts.at_risk}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Revenue YTD',    value: fmt(ytdRevenue),              prev: lyRevenue,       sub: `${ytdInvoices.length} invoices` },
              { label: 'Units YTD',      value: ytdUnits.toLocaleString(),    prev: lyUnits,         sub: 'units shipped' },
              { label: 'Active clients', value: activeClients.toString(),     prev: lyActiveClients, sub: 'ordered this year' },
            ].map(({ label, value, prev, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm text-gray-500 mb-1">{label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900">{value}</p>
                  <Delta curr={typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g,'')) : value as any} prev={prev} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Revenue trend — last 12 months</h2>
            <div className="flex items-end gap-2" style={{ height: '120px' }}>
              {monthlyRevenue.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  {m.value > 0 && <span style={{ fontSize: '9px' }} className="text-gray-400">{fmt(m.value)}</span>}
                  <div className="w-full rounded-t" style={{ height: `${Math.max((m.value/maxMonthly)*95, m.value > 0 ? 4 : 0)}px`, background: m.value > 0 ? '#185FA5' : '#F3F4F6' }} />
                  <span style={{ fontSize: '9px' }} className="text-gray-400">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Top regions YTD</h2>
              {regionList.slice(0,6).map(([region, data]) => (
                <div key={region} className="flex items-center gap-3 mb-2.5">
                  <span className="text-sm text-gray-600 w-28 truncate">{region}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(data.revenue/maxRegionRevenue)*100}%`, background: '#185FA5' }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 w-16 text-right">{fmt(data.revenue)}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Top brands YTD</h2>
              {brandList.slice(0,6).map(([brand, data]) => (
                <div key={brand} className="flex items-center gap-3 mb-2.5">
                  <span className="text-sm text-gray-600 w-28 truncate">{brand}</span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(data.revenue/maxBrand)*100}%`, background: '#0F6E56' }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 w-16 text-right">{fmt(data.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── GEOGRAPHY TAB ── */}
      {tab === 'geography' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3 mb-2">
            {[
              { label: 'Regions',         value: regionList.length },
              { label: 'Active clients',  value: customers.length },
              { label: 'Revenue YTD',     value: fmt(ytdRevenue) },
              { label: 'Avg per region',  value: fmt(ytdRevenue / Math.max(regionList.length, 1)) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Region</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Clients</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Revenue YTD</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Units</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">vs LY</th>
                  <th className="px-4 py-3 w-40" />
                </tr>
              </thead>
              <tbody>
                {regionList.map(([region, data]) => (
                  <>
                    <tr key={region}
                      onClick={() => setExpandedRegion(expandedRegion === region ? null : region)}
                      className="cursor-pointer hover:bg-gray-50 border-b border-gray-100">
                      <td className="px-5 py-3 font-semibold text-gray-900">
                        <div className="flex items-center gap-2">
                          <span className={`transition-transform ${expandedRegion === region ? 'rotate-90' : ''}`}>›</span>
                          {region}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{data.clients.length}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(data.revenue)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{data.units.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right"><Delta curr={data.revenue} prev={data.prevRevenue} /></td>
                      <td className="px-4 py-3">
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(data.revenue/maxRegionRevenue)*100}%`, background: '#185FA5' }} />
                        </div>
                      </td>
                    </tr>
                    {expandedRegion === region && data.clients.map((c: any) => {
                      const cRev = ytdInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
                      const cPrev = lastYearInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
                      const cUnits = ytdInvoices.filter((o: any) => o.customer_id === c.id).reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
                      return (
                        <tr key={c.id} className="bg-blue-50 border-b border-blue-100 hover:bg-blue-100 cursor-pointer"
                          onClick={e => { e.stopPropagation(); router.push('/reports/client/' + c.id) }}>
                          <td className="px-5 py-2.5 pl-10 text-sm text-gray-700">{c.legal_name}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.eu_compliance_type === 'TT' ? 'bg-blue-100 text-blue-700' : c.eu_compliance_type === 'PR' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {c.eu_compliance_type ?? 'EXP'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-900">{cRev > 0 ? fmt(cRev) : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-gray-600">{cUnits > 0 ? cUnits.toLocaleString() : '—'}</td>
                          <td className="px-4 py-2.5 text-right"><Delta curr={cRev} prev={cPrev} /></td>
                          <td className="px-4 py-2.5 text-right text-xs text-blue-600">View report →</td>
                        </tr>
                      )
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PRODUCTS TAB ── */}
      {tab === 'products' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Revenue by brand YTD</h2>
              {brandList.map(([brand, data]) => (
                <div key={brand} className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-gray-700 w-32 truncate">{brand}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full flex items-center px-2"
                      style={{ width: `${Math.max((data.revenue/maxBrand)*100, 8)}%`, background: '#0F6E56' }}>
                      <span className="text-white" style={{ fontSize: '9px' }}>{fmt(data.revenue)}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right">{data.units.toLocaleString()} u</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Top products by units YTD</h2>
              {productList.map(([name, data], i) => (
                <div key={name} className="flex items-center gap-2 mb-2.5">
                  <span className="text-xs text-gray-400 w-4 text-right">{i+1}</span>
                  <button onClick={() => router.push('/reports/product/' + encodeURIComponent(Object.keys(productMap).find(k => k === name) ?? name))}
                    className="text-xs text-gray-700 w-40 truncate text-left hover:text-blue-600" title={name}>{name}</button>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(data.units/maxProduct)*100}%`, background: '#185FA5' }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-900 w-12 text-right">{data.units.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CLIENTS TAB ── */}
      {tab === 'clients' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Region</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Revenue YTD</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Units</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Orders</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">vs LY</th>
                <th className="px-4 py-3 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clientRevenue.map((c: any, i: number) => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push('/reports/client/' + c.id)}>
                  <td className="px-5 py-3 text-gray-400 text-xs">{i+1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.legal_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.region ?? c.country ?? '—'}</td>
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
      )}

      {/* ── ACTIVITY TAB ── */}
      {tab === 'activity' && (
        <div className="space-y-4">
          {/* Health summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { key: 'active',  label: 'Active',   count: healthCounts.active,  icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
              { key: 'at_risk', label: 'At risk',  count: healthCounts.at_risk, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
              { key: 'dormant', label: 'Dormant',  count: healthCounts.dormant, icon: Clock, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
              { key: 'lost',    label: 'Lost',     count: healthCounts.lost,    icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
            ].map(({ key, label, count, icon: Icon, color, bg, border }) => (
              <button key={key}
                onClick={() => setActivityFilter(activityFilter === key as any ? 'all' : key as any)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${activityFilter === key ? border + ' ' + bg : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-5 w-5 ${color}`} />
                  <span className="text-2xl font-bold text-gray-900">{count}</span>
                </div>
                <p className={`text-sm font-medium ${color}`}>{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {key === 'active'  && '< 60 days, regular'}
                  {key === 'at_risk' && '60–120 days or low freq'}
                  {key === 'dormant' && '120–365 days'}
                  {key === 'lost'    && '> 365 days'}
                </p>
              </button>
            ))}
          </div>

          {/* Activity table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Customer Activity Tracker
                <span className="ml-2 text-sm font-normal text-gray-400">{filteredActivity.length} clients</span>
              </h2>
              <div className="text-xs text-gray-400 flex items-center gap-4">
                <span>Heatmap = orders/month (12 months)</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-gray-100" /> 0
                  <div className="w-3 h-3 rounded bg-blue-200 ml-1" /> 1
                  <div className="w-3 h-3 rounded bg-blue-400 ml-1" /> 2
                  <div className="w-3 h-3 rounded bg-blue-600 ml-1" /> 3+
                </div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Region</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Last order</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Freq/mo</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">12M value</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">vs prev</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Activity (12mo)</th>
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
                          <div key={i} title={`${MONTHS[new Date(new Date().setMonth(new Date().getMonth()-11+i)).getMonth()]}: ${count} orders`}
                            className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
                            style={{ background: count === 0 ? '#F3F4F6' : count === 1 ? '#BFDBFE' : count === 2 ? '#60A5FA' : '#1D4ED8' }} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${c.health.dot}`} />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.health.color}`}>
                          {c.health.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-blue-600">View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}