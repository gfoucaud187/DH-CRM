'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useState, useMemo, useRef } from 'react'
import { TrendingUp, Package, Users, Clock, AlertCircle, Warehouse, X, ArrowRight, Download, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Period = 'ytd' | 'q1' | 'q2' | 'q3' | 'q4' | 'last12' | 'custom'
type DrillDown = null | 'client' | 'product' | 'aging' | 'stock'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WH = ['T1','Central','Aged','Sample','Private']
const WH_COLORS: Record<string,string> = {
  T1:'#185FA5', Central:'#0F6E56', Aged:'#854F0B', Sample:'#534AB7', Private:'#993556'
}
const AGING_BUCKETS = [
  { label: '0–30 days', key: 'd30', color: '#3B6D11', bg: '#EAF3DE', max: 30 },
  { label: '31–60 days', key: 'd60', color: '#854F0B', bg: '#FAEEDA', max: 60 },
  { label: '61–90 days', key: 'd90', color: '#A32D2D', bg: '#FCEBEB', max: 90 },
  { label: '+90 days', key: 'd90plus', color: '#791F1F', bg: '#FCEBEB', max: 999 },
]

function fmt(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}` }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-lg text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const supabase = createClient()
  const router = useRouter()
  const reportRef = useRef<HTMLDivElement>(null)

  const [period, setPeriod] = useState<Period>('ytd')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [drillDown, setDrillDown] = useState<DrillDown>(null)
  const [drillParam, setDrillParam] = useState<string>('')

  const currentYear = new Date().getFullYear()

  const { data: orders = [] } = useQuery({
    queryKey: ['reports-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders').select('*')
        .neq('status','cancelled').neq('status','deleted')
      return data ?? []
    }
  })

  const { data: inventory = [] } = useQuery({
    queryKey: ['reports-inventory'],
    queryFn: async () => {
      const { data } = await supabase.from('v_inventory_by_warehouse').select('*')
      return data ?? []
    }
  })

  const { data: allLines = [] } = useQuery({
    queryKey: ['reports-lines'],
    queryFn: async () => {
      const { data } = await supabase.from('sales_order_lines')
        .select('order_id, sku, product_name, quantity_units, quantity_packs, line_total, line_type')
      return data ?? []
    }
  })

  const { data: inventoryRecords = [] } = useQuery({
    queryKey: ['inventory-records-detail'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_records')
        .select('sku, product_name, brand, warehouse, quantity_packs, quantity_units, category')
        .eq('category','available').order('warehouse')
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
    if (period === 'last12') {
      const c = new Date(); c.setMonth(c.getMonth()-12); return d >= c
    }
    if (period === 'custom' && customStart && customEnd) {
      return d >= new Date(customStart) && d <= new Date(customEnd)
    }
    return true
  }

  const filtered = useMemo(() => orders.filter(filterByPeriod), [orders, period, customStart, customEnd])
  const invoices = filtered.filter((o: any) => o.document_type === 'invoice' && !o.is_foc)
  const shipped  = filtered.filter((o: any) => ['shipped','completed'].includes(o.status))
  const filteredIds = new Set(filtered.map((o: any) => o.id))

  const revenue = invoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const totalUnits = shipped.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)
  const totalPacks = shipped.reduce((s: number, o: any) => s + (o.total_packs ?? 0), 0)
  const activeOrders = orders.filter((o: any) => !['completed','cancelled','deleted','shipped'].includes(o.status)).length
  const readyToShip = orders.filter((o: any) => o.status === 'ready_for_shipment').length
  const focUnits = filtered.filter((o:any) => o.is_foc).reduce((s:number,o:any) => s+(o.total_units??0),0)
  const focRatio = totalUnits > 0 ? ((focUnits/(totalUnits+focUnits))*100).toFixed(1) : '0'

  const pendingInvoices = orders.filter((o: any) =>
    o.document_type === 'invoice' && !o.is_foc && ['draft','sent_to_customer'].includes(o.status)
  )
  const pendingTotal = pendingInvoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)

  const now = Date.now()
  const aging: Record<string,number> = { d30:0, d60:0, d90:0, d90plus:0 }
  const agingInvoices: Record<string,any[]> = { d30:[], d60:[], d90:[], d90plus:[] }
  pendingInvoices.forEach((o: any) => {
    const days = Math.floor((now - new Date(o.order_date ?? o.created_at).getTime()) / 86400000)
    const amt = o.total_amount ?? 0
    if (days <= 30) { aging.d30 += amt; agingInvoices.d30.push({...o,days}) }
    else if (days <= 60) { aging.d60 += amt; agingInvoices.d60.push({...o,days}) }
    else if (days <= 90) { aging.d90 += amt; agingInvoices.d90.push({...o,days}) }
    else { aging.d90plus += amt; agingInvoices.d90plus.push({...o,days}) }
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
    const map: Record<string,number> = {}
    invoices.forEach((o: any) => {
      if (!o.customer_name) return
      map[o.customer_name] = (map[o.customer_name] ?? 0) + (o.total_amount ?? 0)
    })
    return Object.entries(map).sort(([,a],[,b]) => b-a).slice(0,7)
  }, [invoices])
  const maxClient = Math.max(...clientRevenue.map(([,v]) => v), 1)

  const productUnits = useMemo(() => {
    const map: Record<string,number> = {}
    ;(allLines as any[]).forEach((l: any) => {
      if (!filteredIds.has(l.order_id) || l.line_type !== 'commercial') return
      map[l.product_name] = (map[l.product_name] ?? 0) + (l.quantity_units ?? 0)
    })
    return Object.entries(map).sort(([,a],[,b]) => b-a).slice(0,6)
  }, [allLines, filteredIds])
  const maxProduct = Math.max(...productUnits.map(([,v]) => v), 1)

  const stockByWH = useMemo(() => {
    const map: Record<string,number> = {}
    ;(inventory as any[]).forEach((r: any) => {
      WH.forEach(w => {
        const key = `packs_${w.toLowerCase()}`
        map[w] = (map[w] ?? 0) + (r[key] ?? 0)
      })
    })
    return map
  }, [inventory])

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

  // Drill-down data
  const clientOrders = useMemo(() => {
    if (!drillParam) return []
    return invoices.filter((o: any) => o.customer_name === drillParam)
      .sort((a: any, b: any) => new Date(b.order_date ?? b.created_at).getTime() - new Date(a.order_date ?? a.created_at).getTime())
  }, [drillParam, invoices])

  const productClients = useMemo(() => {
    if (!drillParam) return []
    const map: Record<string, { units: number; orders: number }> = {}
    ;(allLines as any[]).forEach((l: any) => {
      if (l.product_name !== drillParam || l.line_type !== 'commercial') return
      const order = orders.find((o: any) => o.id === l.order_id)
      if (!order || !filteredIds.has(order.id)) return
      const name = order.customer_name
      if (!map[name]) map[name] = { units: 0, orders: 0 }
      map[name].units += l.quantity_units ?? 0
      map[name].orders += 1
    })
    return Object.entries(map).sort(([,a],[,b]) => b.units - a.units)
  }, [drillParam, allLines, orders, filteredIds])

  const stockDetails = useMemo(() => {
    if (!drillParam) return []
    return (inventoryRecords as any[]).filter((r: any) => r.warehouse === drillParam)
      .sort((a: any, b: any) => b.quantity_packs - a.quantity_packs)
  }, [drillParam, inventoryRecords])

  return (
    <div>
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
            <Download className="h-3.5 w-3.5" />
            PDF
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
          {/* Top clients */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Top clients by revenue</h2>
            <p className="text-xs text-gray-400 mb-4">Click to drill down</p>
            {clientRevenue.length === 0 ? (
              <p className="text-sm text-gray-400">No data for this period</p>
            ) : clientRevenue.map(([name, value], i) => (
              <div key={name} className="flex items-center gap-3 mb-2.5 group">
                <span className="text-xs text-gray-400 w-4">{i+1}</span>
                <button
                  onClick={() => { setDrillDown('client'); setDrillParam(name) }}
                  className="text-xs text-blue-700 w-28 truncate text-left hover:underline font-medium"
                  title={name}
                >
                  {name}
                </button>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden cursor-pointer"
                  onClick={() => { setDrillDown('client'); setDrillParam(name) }}>
                  <div className="h-full rounded-full flex items-center px-2"
                    style={{ width: `${(value/maxClient)*100}%`, background:'#185FA5', minWidth:'50px' }}>
                    <span className="text-white text-xs font-medium">{fmt(value)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Top products */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Top products by units</h2>
            <p className="text-xs text-gray-400 mb-4">Click to see who ordered what</p>
            {productUnits.length === 0 ? (
              <p className="text-sm text-gray-400">No data for this period</p>
            ) : productUnits.map(([name, value], i) => (
              <div key={name} className="flex items-center gap-3 mb-2.5">
                <span className="text-xs text-gray-400 w-4">{i+1}</span>
                <button
                  onClick={() => { setDrillDown('product'); setDrillParam(name) }}
                  className="text-xs text-green-700 w-28 truncate text-left hover:underline font-medium"
                  title={name}
                >
                  {name}
                </button>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden cursor-pointer"
                  onClick={() => { setDrillDown('product'); setDrillParam(name) }}>
                  <div className="h-full rounded-full flex items-center px-2"
                    style={{ width: `${(value/maxProduct)*100}%`, background:'#0F6E56', minWidth:'50px' }}>
                    <span className="text-white text-xs font-medium">{value.toLocaleString()}u</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* AR Aging */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Pending payments (AR aging)</h2>
            <p className="text-xs text-gray-400 mb-4">Click a bucket to see invoices</p>
            {AGING_BUCKETS.map(({ label, key, color, bg }) => (
              <button key={key}
                onClick={() => { setDrillDown('aging'); setDrillParam(key) }}
                className="w-full flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded px-2 -mx-2 transition-colors">
                <span className="text-sm text-gray-600">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold px-2 py-0.5 rounded" style={{ color, background: bg }}>
                    {fmt(aging[key])}
                  </span>
                  <span className="text-xs text-gray-300">({agingInvoices[key].length})</span>
                </div>
              </button>
            ))}
            <div className="flex justify-between items-center pt-3 mt-1 border-t border-gray-200">
              <span className="text-sm font-semibold text-gray-900">Total outstanding</span>
              <span className="text-sm font-bold text-gray-900">{fmt(pendingTotal)}</span>
            </div>
          </div>

          {/* Stock by warehouse */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Warehouse className="h-4 w-4 text-gray-400" />
              <h2 className="font-semibold text-gray-900">Stock by warehouse</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Click to see details</p>
            <div className="space-y-3">
              {WH.map(w => {
                const packs = stockByWH[w] ?? 0
                const maxPacks = Math.max(...WH.map(wh => stockByWH[wh] ?? 0), 1)
                return (
                  <button key={w}
                    onClick={() => { setDrillDown('stock'); setDrillParam(w) }}
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

        {/* Client report shortcut */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Client-specific reports</p>
            <p className="text-sm text-gray-500 mt-0.5">Deep dive on any client — orders, trends, top products, payment history</p>
          </div>
          <button
            onClick={() => { setDrillDown('client'); setDrillParam('__select__') }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            View client report
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── DRILL-DOWN MODALS ── */}

      {/* Client drill-down */}
      {drillDown === 'client' && drillParam && drillParam !== '__select__' && (
        <Modal title={`Client: ${drillParam}`} onClose={() => setDrillDown(null)}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">{fmt(clientOrders.reduce((s:number,o:any)=>s+(o.total_amount??0),0))}</p>
              <p className="text-sm text-gray-400">{clientOrders.length} invoices in period</p>
            </div>
            <button
              onClick={() => {
                const c = orders.find((o:any) => o.customer_name === drillParam)
                if (c?.customer_id) router.push('/reports/client/' + c.customer_id)
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <ExternalLink className="h-4 w-4" />
              Full client report
            </button>
          </div>
          <div className="space-y-2">
            {clientOrders.length === 0 ? (
              <p className="text-gray-400 text-sm">No invoices for this client in the selected period.</p>
            ) : clientOrders.map((o: any) => (
              <button key={o.id}
                onClick={() => router.push('/orders/' + o.id)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-gray-900">{o.order_number}</span>
                  <span className="text-xs text-gray-400">{new Date(o.order_date ?? o.created_at).toLocaleDateString()}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    o.status === 'completed' ? 'bg-green-100 text-green-700' :
                    o.status === 'shipped' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>{o.status.replace(/_/g,' ')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{o.currency} {Number(o.total_amount).toFixed(2)}</span>
                  <span className="text-xs text-gray-400">{o.total_units} u</span>
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {drillDown === 'client' && drillParam === '__select__' && (
        <Modal title="Select a client" onClose={() => setDrillDown(null)}>
          <div className="space-y-1">
            {clientRevenue.map(([name]) => (
              <button key={name}
                onClick={() => setDrillParam(name)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-100">
                <span className="font-medium text-gray-900">{name}</span>
                <ArrowRight className="h-4 w-4 text-gray-300" />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Product drill-down */}
      {drillDown === 'product' && drillParam && (
        <Modal title={`Product: ${drillParam}`} onClose={() => setDrillDown(null)}>
          <p className="text-sm text-gray-500 mb-4">Clients who ordered this product in the selected period</p>
          {productClients.length === 0 ? (
            <p className="text-gray-400 text-sm">No data for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 rounded-l">Client</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Units</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600 rounded-r">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {productClients.map(([name, data]) => (
                  <tr key={name}>
                    <td className="px-3 py-3 font-medium text-gray-900">{name}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-semibold">{(data as any).units.toLocaleString()}</span>
                      <span className="text-gray-400 ml-1 text-xs">u</span>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">{(data as any).orders}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200">
                <tr>
                  <td className="px-3 py-3 font-semibold text-gray-900">Total</td>
                  <td className="px-3 py-3 text-right font-bold text-gray-900">
                    {productClients.reduce((s,[,d]) => s + (d as any).units, 0).toLocaleString()} u
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-gray-900">
                    {productClients.reduce((s,[,d]) => s + (d as any).orders, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </Modal>
      )}

      {/* Aging drill-down */}
      {drillDown === 'aging' && drillParam && (
        <Modal
          title={`Pending invoices — ${AGING_BUCKETS.find(b => b.key === drillParam)?.label}`}
          onClose={() => setDrillDown(null)}
        >
          {agingInvoices[drillParam]?.length === 0 ? (
            <p className="text-gray-400 text-sm">No invoices in this bucket.</p>
          ) : (
            <div className="space-y-2">
              {agingInvoices[drillParam]?.map((o: any) => (
                <button key={o.id}
                  onClick={() => { setDrillDown(null); router.push('/orders/' + o.id) }}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-gray-900">{o.order_number}</span>
                    <span className="font-medium text-gray-700">{o.customer_name}</span>
                    <span className="text-xs text-gray-400">{o.days}d ago</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-900">{fmt(o.total_amount ?? 0)}</span>
                    <ArrowRight className="h-4 w-4 text-gray-300" />
                  </div>
                </button>
              ))}
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg mt-2">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="font-bold text-gray-900">
                  {fmt(agingInvoices[drillParam]?.reduce((s:number,o:any) => s+(o.total_amount??0),0))}
                </span>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Stock drill-down */}
      {drillDown === 'stock' && drillParam && (
        <Modal title={`Stock detail — ${drillParam} warehouse`} onClose={() => setDrillDown(null)}>
          <p className="text-sm text-gray-500 mb-4">
            {stockDetails.length} products · {stockDetails.reduce((s:number,r:any) => s+(r.quantity_packs??0),0)} packs total
          </p>
          {stockDetails.length === 0 ? (
            <p className="text-gray-400 text-sm">No stock in this warehouse.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Product</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">SKU</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Packs</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stockDetails.map((r: any) => (
                  <tr key={r.sku} className={r.quantity_packs < 5 ? 'bg-amber-50' : ''}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-900">{r.product_name}</p>
                      <p className="text-xs text-gray-400">{r.brand}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500">{r.sku}</td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-900">{r.quantity_packs}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{r.quantity_units}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  )
}