'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useState, useMemo, useRef } from 'react'
import { TrendingUp, Package, Users, Clock, AlertCircle, Warehouse, Download, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Period = 'ytd' | 'q1' | 'q2' | 'q3' | 'q4' | 'last12' | 'custom'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WH = ['T1','Central','Aged','Sample','Private']
const WH_COLORS: Record<string,string> = {
  T1:'#185FA5', Central:'#0F6E56', Aged:'#854F0B', Sample:'#534AB7', Private:'#993556'
}
const BRANDS = ['Nicarao', 'Furia', 'La Ley', 'La Preferida']
const BRAND_COLORS: Record<string,string> = {
  'Nicarao': '#185FA5',
  'Furia': '#0F6E56',
  'La Ley': '#854F0B',
  'La Preferida': '#534AB7',
}

const AGING_BUCKETS = [
  { label: '0–30 days', key: 'd30', color: '#3B6D11', bg: '#EAF3DE' },
  { label: '31–60 days', key: 'd60', color: '#854F0B', bg: '#FAEEDA' },
  { label: '61–90 days', key: 'd90', color: '#A32D2D', bg: '#FCEBEB' },
  { label: '+90 days', key: 'd90plus', color: '#791F1F', bg: '#FCEBEB' },
]

function fmt(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}` }

export default function ReportsPage() {
  const supabase = createClient()
  const router = useRouter()
  const reportRef = useRef<HTMLDivElement>(null)
  const currentYear = new Date().getFullYear()

  const [period, setPeriod] = useState<Period>('ytd')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedProductSku, setSelectedProductSku] = useState('')

  const { data: orders = [] } = useQuery({
    queryKey: ['reports-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders').select('*').neq('status','cancelled')
      return data ?? []
    }
  })

  const { data: allLines = [] } = useQuery({
    queryKey: ['reports-lines'],
    queryFn: async () => {
      const { data } = await supabase.from('sales_order_lines')
        .select('order_id, sku, product_name, brand, quantity_units, quantity_packs, line_total, line_type')
      return data ?? []
    }
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, legal_name').eq('status','active').order('legal_name')
      return data ?? []
    }
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, sku, full_name, brand').eq('status','active').eq('product_role','original').order('full_name')
      return data ?? []
    }
  })

  const { data: inventoryRecords = [] } = useQuery({
    queryKey: ['inventory-records-detail'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_records')
        .select('sku, product_name, brand, warehouse, quantity_packs, quantity_units, category')
        .eq('category','available')
      return data ?? []
    }
  })

  const filterByPeriod = (o: any) => {
    const d = new Date(o.order_date ?? o.created_at)
    const y = d.getFullYear(), m = d.getMonth()
    if (period === 'ytd') return y === currentYear
    if (period === 'q1') return y === currentYear && m < 3
    if (period === 'q2') return y === currentYear && m >= 3 && m < 6
    if (period === 'q3') return y === currentYear && m >= 6 && m < 9
    if (period === 'q4') return y === currentYear && m >= 9
    if (period === 'last12') { const c = new Date(); c.setMonth(c.getMonth()-12); return d >= c }
    if (period === 'custom' && customStart && customEnd)
      return d >= new Date(customStart) && d <= new Date(customEnd)
    return true
  }

  const filtered   = useMemo(() => orders.filter(filterByPeriod), [orders, period, customStart, customEnd])
  const invoices   = filtered.filter((o: any) => o.document_type === 'invoice' && !o.is_foc)
  const shipped    = filtered.filter((o: any) => ['shipped','completed'].includes(o.status))
  const filteredIds = new Set(filtered.map((o: any) => o.id))

  const revenue      = invoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const totalUnits   = shipped.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
  const totalPacks   = shipped.reduce((s: number, o: any) => s + (o.total_packs ?? 0), 0)
  const activeOrders = orders.filter((o: any) => !['completed','cancelled','shipped'].includes(o.status)).length
  const readyToShip  = orders.filter((o: any) => o.status === 'ready_for_shipment').length
  const focUnits     = filtered.filter((o:any) => o.is_foc).reduce((s:number,o:any) => s+(o.total_units??0),0)
  const focRatio     = totalUnits > 0 ? ((focUnits/(totalUnits+focUnits))*100).toFixed(1) : '0'

  const pendingInvoices = orders.filter((o: any) =>
    o.document_type === 'invoice' && !o.is_foc && ['draft','sent_to_customer'].includes(o.status)
  )
  const pendingTotal = pendingInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)

  const now = Date.now()
  const aging: Record<string,number> = { d30:0, d60:0, d90:0, d90plus:0 }
  pendingInvoices.forEach((o: any) => {
    const days = Math.floor((now - new Date(o.order_date ?? o.created_at).getTime()) / 86400000)
    const amt = o.total_amount ?? 0
    if (days <= 30) aging.d30 += amt
    else if (days <= 60) aging.d60 += amt
    else if (days <= 90) aging.d90 += amt
    else aging.d90plus += amt
  })

  const shipTimes = shipped.map((o: any) => {
    if (!o.order_date || !o.shipment_date) return null
    return Math.floor((new Date(o.shipment_date).getTime() - new Date(o.order_date).getTime()) / 86400000)
  }).filter((d): d is number => d !== null && d >= 0)
  const avgShip = shipTimes.length ? (shipTimes.reduce((a,b)=>a+b,0)/shipTimes.length).toFixed(1) : '—'
  const maxShip = shipTimes.length ? Math.max(...shipTimes) : 0

  const monthlyRevenue = useMemo(() => {
    const map: Record<string,number> = {}
    invoices.forEach((o: any) => {
      const d = new Date(o.order_date ?? o.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      map[key] = (map[key] ?? 0) + (o.total_amount ?? 0)
    })
    const result = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      result.push({ label: MONTHS[d.getMonth()], value: map[key] ?? 0 })
    }
    return result
  }, [invoices])
  const maxMonthly = Math.max(...monthlyRevenue.map(m => m.value), 1)

  const clientRevenue = useMemo(() => {
    const map: Record<string, { revenue: number; id: string }> = {}
    invoices.forEach((o: any) => {
      if (!o.customer_name) return
      if (!map[o.customer_name]) map[o.customer_name] = { revenue: 0, id: o.customer_id ?? '' }
      map[o.customer_name].revenue += o.total_amount ?? 0
    })
    return Object.entries(map)
      .sort(([,a],[,b]) => b.revenue - a.revenue)
      .slice(0,7)
      .map(([name, data]) => ({ name, revenue: data.revenue, id: data.id }))
  }, [invoices])
  const maxClient = Math.max(...clientRevenue.map(c => c.revenue), 1)

  const productUnits = useMemo(() => {
    const map: Record<string, { units: number; sku: string }> = {}
    ;(allLines as any[]).forEach((l: any) => {
      if (!filteredIds.has(l.order_id) || l.line_type !== 'commercial') return
      if (!map[l.product_name]) map[l.product_name] = { units: 0, sku: l.sku }
      map[l.product_name].units += l.quantity_units ?? 0
    })
    return Object.entries(map)
      .sort(([,a],[,b]) => b.units - a.units)
      .slice(0,6)
      .map(([name, data]) => ({ name, units: data.units, sku: data.sku }))
  }, [allLines, filteredIds])
  const maxProduct = Math.max(...productUnits.map(p => p.units), 1)

  // Brand stats
  const brandStats = useMemo(() => {
    return BRANDS.map(brand => {
      const brandLines = (allLines as any[]).filter((l: any) =>
        filteredIds.has(l.order_id) && l.line_type === 'commercial' &&
        l.brand?.toLowerCase().includes(brand.toLowerCase())
      )
      const units = brandLines.reduce((s: number, l: any) => s + (l.quantity_units ?? 0), 0)
      const rev = brandLines.reduce((s: number, l: any) => s + (l.line_total ?? 0), 0)
      const stockPacks = (inventoryRecords as any[])
        .filter((r: any) => r.brand?.toLowerCase().includes(brand.toLowerCase()))
        .reduce((s: number, r: any) => s + (r.quantity_packs ?? 0), 0)
      return { brand, units, revenue: rev, stockPacks }
    })
  }, [allLines, filteredIds, inventoryRecords])
  const maxBrandUnits = Math.max(...brandStats.map(b => b.units), 1)

  const stockByWH = useMemo(() => {
    const map: Record<string,number> = {}
    ;(inventoryRecords as any[]).forEach((r: any) => {
      WH.forEach(w => { if (r.warehouse === w) map[w] = (map[w] ?? 0) + (r.quantity_packs ?? 0) })
    })
    return map
  }, [inventoryRecords])

  const handleExportPDF = async () => {
    if (!reportRef.current) return
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(reportRef.current, { scale: 1.5, backgroundColor: '#ffffff' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const w = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const h = (canvas.height * w) / canvas.width
    const pages = Math.ceil(h / pageH)
    for (let i = 0; i < pages; i++) {
      if (i > 0) pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, -(i * pageH), w, h)
    }
    pdf.save(`DH-Report-${period}-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  const handleClientReport = () => {
    if (!selectedClientId) return
    router.push('/reports/client/' + selectedClientId)
  }

  const handleProductReport = () => {
    if (!selectedProductSku) return
    router.push('/reports/product/' + encodeURIComponent(selectedProductSku))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm mt-0.5">Business intelligence & KPIs</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {([['ytd','YTD'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['last12','Last 12m'],['custom','Custom']] as [Period,string][]).map(([v,l]) => (
              <button key={v} onClick={() => setPeriod(v)}
                className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ' + (period === v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <span className="text-sm text-gray-500">From</span>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="h-8 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
          <span className="text-sm text-gray-500">to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="h-8 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
        </div>
      )}

      {/* Quick access to detailed reports */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" /> Client Report
          </h2>
          <div className="flex gap-2">
            <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
              className="flex-1 h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
              <option value="">Select a client...</option>
              {(customers as any[]).map((c: any) => (
                <option key={c.id} value={c.id}>{c.legal_name}</option>
              ))}
            </select>
            <button onClick={handleClientReport} disabled={!selectedClientId}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-green-500" /> Product Report
          </h2>
          <div className="flex gap-2">
            <select value={selectedProductSku} onChange={e => setSelectedProductSku(e.target.value)}
              className="flex-1 h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
              <option value="">Select a product...</option>
              {(products as any[]).map((p: any) => (
                <option key={p.sku} value={p.sku}>{p.full_name}</option>
              ))}
            </select>
            <button onClick={handleProductReport} disabled={!selectedProductSku}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div ref={reportRef}>
        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { icon: TrendingUp, label: 'Revenue', value: fmt(revenue), sub: `${invoices.length} invoices`, color: 'text-blue-600', bg: 'bg-blue-50' },
            { icon: Package,    label: 'Units shipped', value: totalUnits.toLocaleString(), sub: `${totalPacks} packs`, color: 'text-green-600', bg: 'bg-green-50' },
            { icon: Users,      label: 'Active orders', value: activeOrders.toString(), sub: `${readyToShip} ready to ship`, color: 'text-purple-600', bg: 'bg-purple-50' },
            { icon: AlertCircle,label: 'Pending payment', value: fmt(pendingTotal), sub: `${pendingInvoices.length} invoices`, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(({ icon: Icon, label, value, sub, color, bg }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">{label}</span>
                <div className={'p-1.5 rounded-lg ' + bg}><Icon className={'h-4 w-4 ' + color} /></div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Order → Shipment</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{avgShip}</span>
              <span className="text-sm text-gray-400">days avg · {maxShip}d max</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">FOC ratio</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{focRatio}%</span>
              <span className="text-sm text-gray-400">of total units</span>
            </div>
          </div>
        </div>

        {/* Monthly revenue */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Monthly revenue</h2>
          <div className="flex items-end gap-3" style={{ height: '120px' }}>
            {monthlyRevenue.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-400">{m.value > 0 ? fmt(m.value) : ''}</span>
                <div className="w-full rounded-t transition-all" style={{
                  height: `${Math.max((m.value/maxMonthly)*90, m.value > 0 ? 4 : 0)}px`,
                  background: i === monthlyRevenue.length-1 ? '#185FA5' : '#B5D4F4',
                }} />
                <span className="text-xs text-gray-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Top clients — click goes to full report */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Top clients by revenue</h2>
            <p className="text-xs text-gray-400 mb-4">Click to open full client report</p>
            {clientRevenue.length === 0 ? (
              <p className="text-sm text-gray-400">No data for this period</p>
            ) : clientRevenue.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3 mb-2.5">
                <span className="text-xs text-gray-400 w-4">{i+1}</span>
                <button
                  onClick={() => c.id && router.push('/reports/client/' + c.id)}
                  className="text-xs text-blue-700 w-28 truncate text-left hover:underline font-medium"
                  title={c.name}
                >
                  {c.name}
                </button>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden cursor-pointer"
                  onClick={() => c.id && router.push('/reports/client/' + c.id)}>
                  <div className="h-full rounded-full flex items-center px-2"
                    style={{ width: `${(c.revenue/maxClient)*100}%`, background:'#185FA5', minWidth:'50px' }}>
                    <span className="text-white text-xs font-medium">{fmt(c.revenue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Top products — click goes to full report */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Top products by units</h2>
            <p className="text-xs text-gray-400 mb-4">Click to open full product report</p>
            {productUnits.length === 0 ? (
              <p className="text-sm text-gray-400">No data for this period</p>
            ) : productUnits.map((p, i) => (
              <div key={p.sku} className="flex items-center gap-3 mb-2.5">
                <span className="text-xs text-gray-400 w-4">{i+1}</span>
                <button
                  onClick={() => router.push('/reports/product/' + encodeURIComponent(p.sku))}
                  className="text-xs text-green-700 w-28 truncate text-left hover:underline font-medium"
                  title={p.name}
                >
                  {p.name}
                </button>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden cursor-pointer"
                  onClick={() => router.push('/reports/product/' + encodeURIComponent(p.sku))}>
                  <div className="h-full rounded-full flex items-center px-2"
                    style={{ width: `${(p.units/maxProduct)*100}%`, background:'#0F6E56', minWidth:'50px' }}>
                    <span className="text-white text-xs font-medium">{p.units.toLocaleString()}u</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Brand stats */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Performance by brand</h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {brandStats.map(b => (
              <div key={b.brand} className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: BRAND_COLORS[b.brand] ?? '#888' }} />
                  <span className="text-xs font-semibold text-gray-700">{b.brand}</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{b.units.toLocaleString()}</p>
                <p className="text-xs text-gray-400">units shipped</p>
                <p className="text-sm font-semibold text-gray-700 mt-1">{fmt(b.revenue)}</p>
                <p className="text-xs text-gray-400">revenue</p>
                <p className="text-xs text-gray-400 mt-1">{b.stockPacks} packs in stock</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {brandStats.map(b => (
              <div key={b.brand} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-28">{b.brand}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div className="h-full rounded-full flex items-center px-2"
                    style={{ width: `${Math.max((b.units/maxBrandUnits)*100, b.units > 0 ? 5 : 0)}%`, background: BRAND_COLORS[b.brand] ?? '#888', minWidth: b.units > 0 ? '40px' : '0' }}>
                    {b.units > 0 && <span className="text-white text-xs">{b.units.toLocaleString()}u</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* AR Aging */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Pending payments (AR aging)</h2>
            {AGING_BUCKETS.map(({ label, key, color, bg }) => (
              <div key={key} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="text-sm font-semibold px-2 py-0.5 rounded" style={{ color, background: bg }}>
                  {fmt(aging[key])}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 mt-1 border-t border-gray-200">
              <span className="text-sm font-semibold text-gray-900">Total outstanding</span>
              <span className="text-sm font-bold text-gray-900">{fmt(pendingTotal)}</span>
            </div>
          </div>

          {/* Stock by warehouse */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Warehouse className="h-4 w-4 text-gray-400" />
              <h2 className="font-semibold text-gray-900">Stock by warehouse</h2>
            </div>
            <div className="space-y-3">
              {WH.map(w => {
                const packs = stockByWH[w] ?? 0
                const maxPacks = Math.max(...WH.map(wh => stockByWH[wh] ?? 0), 1)
                return (
                  <button key={w}
                    onClick={() => router.push('/inventory')}
                    className="w-full flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <span className="text-xs text-gray-600 w-16 text-left font-medium">{w}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                      <div className="h-full rounded-full flex items-center px-2"
                        style={{ width: `${Math.max((packs/maxPacks)*100, packs>0?5:0)}%`, background: WH_COLORS[w], minWidth: packs>0?'50px':'0' }}>
                        {packs > 0 && <span className="text-white text-xs font-medium">{packs} pk</span>}
                      </div>
                    </div>
                    {packs === 0 && <span className="text-xs text-gray-300">empty</span>}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Total</span>
              <span className="text-sm font-semibold text-gray-900">
                {WH.reduce((s,w) => s+(stockByWH[w]??0),0).toLocaleString()} packs
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}