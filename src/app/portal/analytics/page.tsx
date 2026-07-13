'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, Package, ShoppingCart, FileText } from 'lucide-react'

type DateRange = 'all' | 'current_month' | 'last_month' | 'current_year' | 'last_year' | 'custom'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getDateRange(range: DateRange, customFrom?: string, customTo?: string) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (range) {
    case 'current_month': return { from: new Date(y, m, 1), to: new Date(y, m+1, 0) }
    case 'last_month':    return { from: new Date(y, m-1, 1), to: new Date(y, m, 0) }
    case 'current_year':  return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) }
    case 'last_year':     return { from: new Date(y-1, 0, 1), to: new Date(y-1, 11, 31) }
    case 'custom':        return { from: customFrom ? new Date(customFrom) : null, to: customTo ? new Date(customTo) : null }
    default:              return { from: null, to: null }
  }
}

function getPrevRange(range: DateRange) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (range) {
    case 'current_month': return { from: new Date(y, m-1, 1), to: new Date(y, m, 0) }
    case 'last_month':    return { from: new Date(y, m-2, 1), to: new Date(y, m-1, 0) }
    case 'current_year':  return { from: new Date(y-1, 0, 1), to: new Date(y-1, 11, 31) }
    case 'last_year':     return { from: new Date(y-2, 0, 1), to: new Date(y-2, 11, 31) }
    default:              return { from: null, to: null }
  }
}

function inRange(date: Date, from: Date | null, to: Date | null) {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function fmt(n: number) { return `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` }
function pct(curr: number, prev: number) {
  if (!prev) return null
  return ((curr - prev) / prev * 100)
}

export default function PortalAnalyticsPage() {
  const supabase = createClient()
  const [range, setRange] = useState<DateRange>('current_year')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const { data: profile } = useQuery({
    queryKey: ['portal-profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase.from('user_profiles').select('customer_id').eq('id', user.id).single()
      return data
    }
  })

  const { data: customer } = useQuery({
    queryKey: ['portal-customer', profile?.customer_id],
    queryFn: async () => {
      const { data } = await supabase.from('customers')
        .select('legal_name, currency, assigned_price_list').eq('id', profile!.customer_id).single()
      return data
    },
    enabled: !!profile?.customer_id
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['portal-analytics-orders', profile?.customer_id],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders')
        .select('*').eq('customer_id', profile!.customer_id).neq('status', 'cancelled')
      return data ?? []
    },
    enabled: !!profile?.customer_id
  })

  const { data: lines = [] } = useQuery({
    queryKey: ['portal-analytics-lines', profile?.customer_id],
    queryFn: async () => {
      const orderIds = (orders as any[]).map((o: any) => o.id)
      if (!orderIds.length) return []
      const { data } = await supabase.from('sales_order_lines')
        .select('order_id, sku, product_name, brand, quantity_units, quantity_packs, line_total, line_type')
        .in('order_id', orderIds).eq('line_type', 'commercial')
      return data ?? []
    },
    enabled: orders.length > 0
  })

  const { from, to } = getDateRange(range, customFrom, customTo)
  const { from: prevFrom, to: prevTo } = getPrevRange(range)

  const invoices = (orders as any[]).filter((o: any) => o.document_type === 'invoice' && !o.is_foc)
  const pos      = (orders as any[]).filter((o: any) => o.document_type === 'po')

  const filteredInvoices = invoices.filter((o: any) => inRange(new Date(o.order_date ?? o.created_at), from, to))
  const prevInvoices     = invoices.filter((o: any) => inRange(new Date(o.order_date ?? o.created_at), prevFrom, prevTo))
  const filteredPOs      = pos.filter((o: any) => inRange(new Date(o.created_at), from, to))

  const filteredLines = (lines as any[]).filter((l: any) => {
    const o = (orders as any[]).find((o: any) => o.id === l.order_id)
    return o && o.document_type === 'invoice' && inRange(new Date(o.order_date ?? o.created_at), from, to)
  })
  const prevLines = (lines as any[]).filter((l: any) => {
    const o = (orders as any[]).find((o: any) => o.id === l.order_id)
    return o && o.document_type === 'invoice' && inRange(new Date(o.order_date ?? o.created_at), prevFrom, prevTo)
  })

  const orderValue     = filteredInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const prevOrderValue = prevInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const units          = filteredLines.reduce((s: number, l: any) => s + (l.quantity_units ?? 0), 0)
  const prevUnits      = prevLines.reduce((s: number, l: any) => s + (l.quantity_units ?? 0), 0)
  const avgOrder       = filteredInvoices.length ? orderValue / filteredInvoices.length : 0
  const prevAvgOrder   = prevInvoices.length ? prevOrderValue / prevInvoices.length : 0

  const monthlyValues = useMemo(() => {
    const map: Record<string, number> = {}
    invoices.forEach((o: any) => {
      const d = new Date(o.order_date ?? o.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      map[key] = (map[key] ?? 0) + (o.total_amount ?? 0)
    })
    return Array.from({length: 12}, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - 11 + i)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      return { label: MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2), value: map[key] ?? 0 }
    })
  }, [invoices])
  const maxMonthly = Math.max(...monthlyValues.map(m => m.value), 1)

  const productMap = useMemo(() => {
    const map: Record<string, { units: number, value: number, packs: number }> = {}
    filteredLines.forEach((l: any) => {
      if (!map[l.product_name]) map[l.product_name] = { units: 0, value: 0, packs: 0 }
      map[l.product_name].units += l.quantity_units ?? 0
      map[l.product_name].value += l.line_total ?? 0
      map[l.product_name].packs += l.quantity_packs ?? 0
    })
    return Object.entries(map).sort(([,a],[,b]) => b.units - a.units).slice(0, 8)
  }, [filteredLines])
  const maxProduct = Math.max(...productMap.map(([,v]) => v.units), 1)

  const brandMap = useMemo(() => {
    const map: Record<string, { units: number, value: number }> = {}
    filteredLines.forEach((l: any) => {
      const brand = l.brand ?? 'Unknown'
      if (!map[brand]) map[brand] = { units: 0, value: 0 }
      map[brand].units += l.quantity_units ?? 0
      map[brand].value += l.line_total ?? 0
    })
    return Object.entries(map).sort(([,a],[,b]) => b.units - a.units)
  }, [filteredLines])
  const totalBrandUnits = brandMap.reduce((s, [,v]) => s + v.units, 0)

  const statusMap = useMemo(() => {
    const map: Record<string, number> = {}
    filteredPOs.forEach((o: any) => { map[o.status] = (map[o.status] ?? 0) + 1 })
    return map
  }, [filteredPOs])

  const BRAND_COLORS = ['#185FA5','#0F6E56','#854F0B','#534AB7','#993556','#C16A2A','#2A7A8A','#5A4A3A']

  const Delta = ({ curr, prev }: { curr: number, prev: number }) => {
    const p = pct(curr, prev)
    if (p === null || range === 'all' || range === 'custom') return null
    return (
      <span className={`text-xs font-medium ml-2 ${p >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        {p >= 0 ? '↑' : '↓'} {Math.abs(p).toFixed(0)}%
      </span>
    )
  }

  const RANGE_OPTIONS: { label: string; value: DateRange }[] = [
    { label: 'All time',   value: 'all' },
    { label: 'This month', value: 'current_month' },
    { label: 'Last month', value: 'last_month' },
    { label: 'This year',  value: 'current_year' },
    { label: 'Last year',  value: 'last_year' },
    { label: 'Custom',     value: 'custom' },
  ]

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Analytics</h1>
        <p className="text-gray-500 text-sm mt-0.5">{customer?.legal_name} · {customer?.assigned_price_list} price list</p>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {RANGE_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setRange(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${range === opt.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {opt.label}
          </button>
        ))}
        {range === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 px-2 text-sm focus:outline-none" />
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 px-2 text-sm focus:outline-none" />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { icon: TrendingUp,   label: 'Total Order Value', value: fmt(orderValue),          delta: <Delta curr={orderValue} prev={prevOrderValue} />,  color: 'text-blue-600',   bg: 'bg-blue-50' },
          { icon: Package,      label: 'Units Ordered',     value: units.toLocaleString(),   delta: <Delta curr={units} prev={prevUnits} />,            color: 'text-green-600',  bg: 'bg-green-50' },
          { icon: FileText,     label: 'Invoices',          value: filteredInvoices.length,  delta: null,                                               color: 'text-purple-600', bg: 'bg-purple-50' },
          { icon: ShoppingCart, label: 'Avg Order Value',   value: fmt(avgOrder),            delta: <Delta curr={avgOrder} prev={prevAvgOrder} />,      color: 'text-amber-600',  bg: 'bg-amber-50' },
        ].map(({ icon: Icon, label, value, delta, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{label}</span>
              <div className={`p-1.5 rounded-lg ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
            </div>
            <div className="flex items-baseline">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              {delta}
            </div>
          </div>
        ))}
      </div>

      {/* Monthly chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4">Order value trend (last 12 months)</h2>
        <div className="flex items-end gap-1.5" style={{ height: '100px' }}>
          {monthlyValues.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              {m.value > 0 && <span style={{ fontSize: '9px' }} className="text-gray-400">{fmt(m.value)}</span>}
              <div className="w-full rounded-t transition-all" style={{
                height: `${Math.max((m.value/maxMonthly)*78, m.value > 0 ? 4 : 0)}px`,
                background: m.value > 0 ? '#185FA5' : '#F3F4F6'
              }} />
              <span style={{ fontSize: '8px' }} className="text-gray-400">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5 mb-5">
        {/* Top products */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top products ordered</h2>
          {productMap.length === 0 ? (
            <p className="text-sm text-gray-400">No data for this period</p>
          ) : productMap.map(([name, data], i) => (
            <div key={name} className="flex items-center gap-3 mb-3">
              <span className="text-xs text-gray-400 w-4 text-right">{i+1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate" title={name}>{name}</p>
                <div className="mt-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full flex items-center px-2"
                    style={{ width: `${Math.max((data.units/maxProduct)*100, 8)}%`, background: '#0F6E56' }}>
                    <span className="text-white" style={{ fontSize: '9px' }}>{data.units.toLocaleString()}u</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-semibold text-gray-900">{fmt(data.value)}</p>
                <p className="text-xs text-gray-400">{data.packs} pk</p>
              </div>
            </div>
          ))}
        </div>

        {/* Top brands */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Order value by brand</h2>
          {brandMap.length === 0 ? (
            <p className="text-sm text-gray-400">No data for this period</p>
          ) : brandMap.map(([brand, data], i) => {
            const pctVal = totalBrandUnits ? (data.units / totalBrandUnits * 100) : 0
            return (
              <div key={brand} className="flex items-center gap-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                <span className="text-sm text-gray-700 flex-1">{brand}</span>
                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                </div>
                <span className="text-xs font-semibold text-gray-900 w-10 text-right">{pctVal.toFixed(0)}%</span>
                <span className="text-xs text-gray-400 w-16 text-right">{data.units.toLocaleString()} u</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* PO status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">
            Purchase orders this period
            <span className="ml-2 text-sm font-normal text-gray-400">{filteredPOs.length} total</span>
          </h2>
          {filteredPOs.length === 0 ? (
            <p className="text-sm text-gray-400">No purchase orders for this period</p>
          ) : Object.entries(statusMap).map(([status, count]) => {
            const colors: Record<string, string> = {
              draft:            'bg-gray-100 text-gray-600',
              pending_approval: 'bg-orange-100 text-orange-700',
              approved:         'bg-green-100 text-green-700',
              rejected:         'bg-red-100 text-red-600',
            }
            return (
              <div key={status} className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {status.replace(/_/g, ' ')}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-400 rounded-full" style={{ width: `${(count/filteredPOs.length)*100}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-6 text-right">{count}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Period summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Period summary</h2>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Total order value',  value: `${customer?.currency} ${Number(orderValue).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` },
              { label: 'Units ordered',      value: units.toLocaleString() },
              { label: 'Invoices issued',    value: filteredInvoices.length.toString() },
              { label: 'POs submitted',      value: filteredPOs.length.toString() },
              { label: 'Avg order value',    value: filteredInvoices.length ? `${customer?.currency} ${Number(avgOrder).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—' },
              { label: 'Products ordered',   value: productMap.length.toString() },
              { label: 'Brands ordered',     value: brandMap.length.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-1 border-b border-gray-50 last:border-0">
                <span className="text-gray-500">{label}</span>
                <span className="font-semibold text-gray-900">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}