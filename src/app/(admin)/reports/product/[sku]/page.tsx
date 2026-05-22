'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, TrendingUp, Package, Users, Warehouse } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useRef } from 'react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WH = ['T1','Central','Aged','Sample','Private']
const WH_COLORS: Record<string,string> = {
  T1:'#185FA5', Central:'#0F6E56', Aged:'#854F0B', Sample:'#534AB7', Private:'#993556'
}
function fmt(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}` }

export default function ProductReportPage() {
  const { sku: skuParam } = useParams()
  const sku = decodeURIComponent(skuParam as string)
  const router = useRouter()
  const supabase = createClient()
  const reportRef = useRef<HTMLDivElement>(null)

  const { data: product } = useQuery({
    queryKey: ['product-report', sku],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('sku', sku).single()
      return data
    }
  })

  const { data: lines = [] } = useQuery({
    queryKey: ['product-report-lines', sku],
    queryFn: async () => {
      const { data } = await supabase.from('sales_order_lines')
        .select('order_id, quantity_units, quantity_packs, line_total, line_type')
        .eq('sku', sku).eq('line_type', 'commercial')
      return data ?? []
    }
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['product-report-orders', sku],
    queryFn: async () => {
      const lineOrderIds = (lines as any[]).map((l: any) => l.order_id)
      if (!lineOrderIds.length) return []
      const { data } = await supabase.from('sales_orders')
        .select('*')
        .in('id', lineOrderIds)
        .neq('status','cancelled')
        .order('order_date', { ascending: false })
      return data ?? []
    },
    enabled: lines.length > 0
  })

  const { data: stockRecords = [] } = useQuery({
    queryKey: ['product-report-stock', sku],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_records')
        .select('warehouse, quantity_packs, quantity_units, category')
        .eq('sku', sku).eq('category', 'available')
      return data ?? []
    }
  })

  const invoiceOrders = orders.filter((o: any) => o.document_type === 'invoice' && !o.is_foc)
  const shippedOrders = orders.filter((o: any) => ['shipped','completed'].includes(o.status))

  const totalUnits = (lines as any[]).filter((l: any) => {
    const o = orders.find((o: any) => o.id === l.order_id)
    return o && ['shipped','completed'].includes(o.status)
  }).reduce((s: number, l: any) => s + (l.quantity_units ?? 0), 0)

  const totalRevenue = (lines as any[]).reduce((s: number, l: any) => {
    const o = orders.find((o: any) => o.id === l.order_id)
    return o && o.document_type === 'invoice' ? s + (l.line_total ?? 0) : s
  }, 0)

  const stockTotal = (stockRecords as any[]).reduce((s: number, r: any) => s + (r.quantity_packs ?? 0), 0)

  // Monthly units shipped
  const monthlyUnits = useMemo(() => {
    const map: Record<string,number> = {}
    ;(lines as any[]).forEach((l: any) => {
      const o = orders.find((o: any) => o.id === l.order_id)
      if (!o || !['shipped','completed'].includes(o.status)) return
      const d = new Date(o.order_date ?? o.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      map[key] = (map[key] ?? 0) + (l.quantity_units ?? 0)
    })
    const result = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      result.push({ label: MONTHS[d.getMonth()], value: map[key] ?? 0 })
    }
    return result
  }, [lines, orders])
  const maxMonthly = Math.max(...monthlyUnits.map(m => m.value), 1)

  // Top clients for this product
  const clientMap = useMemo(() => {
    const map: Record<string, number> = {}
    ;(lines as any[]).forEach((l: any) => {
      const o = orders.find((o: any) => o.id === l.order_id)
      if (!o || o.document_type !== 'invoice') return
      map[o.customer_name] = (map[o.customer_name] ?? 0) + (l.quantity_units ?? 0)
    })
    return Object.entries(map).sort(([,a],[,b]) => b-a).slice(0,8)
  }, [lines, orders])
  const maxClient = Math.max(...clientMap.map(([,v]) => v), 1)

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
    pdf.save(`Product-Report-${sku}-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  if (!product) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{product.full_name}</h1>
          <p className="text-gray-500 text-sm mt-0.5 font-mono">
            {product.sku}
            {product.fixmer_reference && <span className="ml-3 text-gray-400">Fixmer: {product.fixmer_reference}</span>}
            {product.brand && <span className="ml-3 px-2 py-0.5 bg-gray-100 rounded text-xs">{product.brand}</span>}
          </p>
        </div>
        <button onClick={handleExportPDF}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <Download className="h-4 w-4" /> Export PDF
        </button>
      </div>

      <div ref={reportRef}>
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { icon: TrendingUp, label: 'Revenue', value: fmt(totalRevenue), sub: `${invoiceOrders.length} invoices` },
            { icon: Package,    label: 'Units shipped', value: totalUnits.toLocaleString(), sub: 'all time' },
            { icon: Users,      label: 'Clients', value: clientMap.length.toString(), sub: 'who ordered this' },
            { icon: Warehouse,  label: 'In stock', value: stockTotal.toString(), sub: 'packs available' },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-gray-400" />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        {/* Product details */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">Product details</h2>
          <div className="grid grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Brand',    value: product.brand },
              { label: 'Vitola',   value: product.vitola },
              { label: 'Shape',    value: product.shape },
              { label: 'Wrapper',  value: product.wrapper },
              { label: 'Binder',   value: product.binder },
              { label: 'Filler',   value: product.filler },
              { label: 'Units/pack', value: product.units_per_pack },
              { label: 'EU-CEG ID', value: product.eu_ceg_id },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="font-medium text-gray-900">{value ?? '—'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly units chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">Units shipped (last 12 months)</h2>
          <div className="flex items-end gap-2" style={{ height: '100px' }}>
            {monthlyUnits.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                {m.value > 0 && <span style={{ fontSize: '9px' }} className="text-gray-400">{m.value}</span>}
                <div className="w-full rounded-t" style={{
                  height: `${Math.max((m.value/maxMonthly)*80, m.value > 0 ? 4 : 0)}px`,
                  background: m.value > 0 ? '#0F6E56' : '#E5E7EB',
                }} />
                <span style={{ fontSize: '9px' }} className="text-gray-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Top clients */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Top clients ordering this product</h2>
            {clientMap.length === 0 ? (
              <p className="text-sm text-gray-400">No data yet</p>
            ) : clientMap.map(([name, units], i) => (
              <div key={name} className="flex items-center gap-3 mb-2.5">
                <span className="text-xs text-gray-400 w-4">{i+1}</span>
                <span className="text-xs text-gray-600 w-32 truncate" title={name}>{name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div className="h-full rounded-full flex items-center px-2"
                    style={{ width: `${(units/maxClient)*100}%`, background:'#185FA5', minWidth:'40px' }}>
                    <span className="text-white text-xs">{units.toLocaleString()}u</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stock by warehouse */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Stock by warehouse</h2>
            {WH.map(w => {
              const record = (stockRecords as any[]).find((r: any) => r.warehouse === w)
              const packs = record?.quantity_packs ?? 0
              const units = record?.quantity_units ?? 0
              return (
                <div key={w} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: WH_COLORS[w] }} />
                    <span className="text-sm text-gray-700">{w}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-gray-900">{packs} packs</span>
                    <span className="text-xs text-gray-400 ml-2">{units} u</span>
                  </div>
                </div>
              )
            })}
            <div className="flex justify-between items-center pt-3 mt-1 border-t border-gray-200">
              <span className="text-sm font-semibold">Total</span>
              <span className="font-bold text-gray-900">{stockTotal} packs</span>
            </div>
          </div>
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent orders containing this product</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Order #</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Units</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.slice(0,10).map((o: any) => {
                const line = (lines as any[]).find((l: any) => l.order_id === o.id)
                return (
                  <tr key={o.id} onClick={() => router.push('/orders/' + o.id)}
                    className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{o.order_number}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{o.customer_name}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.order_date ?? o.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{line?.quantity_units ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        o.status === 'completed' ? 'bg-green-100 text-green-700' :
                        o.status === 'shipped' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>{o.status.replace(/_/g,' ')}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}