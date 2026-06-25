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
  const pdfRef = useRef<HTMLDivElement>(null)

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
    if (!pdfRef.current) return
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(pdfRef.current, { backgroundColor: '#ffffff' })
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

  const generatedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-5xl">
      {/* Web header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{product.full_name}</h1>
          <p className="text-gray-500 text-sm mt-0.5 font-mono">
            {product.sku}
            {product.fixmer_reference && <span className="ml-3 text-gray-400">Fixmer: {product.fixmer_reference}</span>}
            {product.brand && <span className="ml-3 px-2 py-0.5 bg-gray-100 rounded text-xs not-italic">{product.brand}</span>}
          </p>
        </div>
        <button onClick={handleExportPDF}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Download className="h-4 w-4" /> Export PDF
        </button>
        <Link href={'/products/' + product.id + '/edit'}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Edit product
        </Link>
      </div>

      {/* Web UI */}
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: TrendingUp, label: 'Revenue', value: fmt(totalRevenue), sub: `${invoiceOrders.length} invoices` },
            { icon: Package,    label: 'Units shipped', value: totalUnits.toLocaleString(), sub: 'all time' },
            { icon: Users,      label: 'Clients', value: clientMap.length.toString(), sub: 'who ordered this' },
            { icon: Warehouse,  label: 'In stock', value: stockTotal.toString(), sub: 'packs available' },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2"><Icon className="h-4 w-4 text-gray-400" /><span className="text-xs text-gray-500">{label}</span></div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Units shipped (last 12 months)</h2>
          <div className="flex items-end gap-2" style={{ height: '100px' }}>
            {monthlyUnits.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                {m.value > 0 && <span style={{ fontSize: '9px' }} className="text-gray-400">{m.value}</span>}
                <div className="w-full rounded-t" style={{ height: `${Math.max((m.value/maxMonthly)*80, m.value > 0 ? 4 : 0)}px`, background: m.value > 0 ? '#0F6E56' : '#E5E7EB' }} />
                <span style={{ fontSize: '9px' }} className="text-gray-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Top clients ordering this product</h2>
            {clientMap.length === 0 ? <p className="text-sm text-gray-400">No data yet</p> :
              clientMap.map(([name, units], i) => (
                <div key={name} className="flex items-center gap-3 mb-2.5">
                  <span className="text-xs text-gray-400 w-4">{i+1}</span>
                  <span className="text-xs text-gray-600 w-32 truncate" title={name}>{name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div className="h-full rounded-full flex items-center px-2" style={{ width:`${(units/maxClient)*100}%`, background:'#185FA5', minWidth:'40px' }}>
                      <span className="text-white text-xs">{units.toLocaleString()}u</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>

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
            <div className="flex justify-between pt-3 mt-1 border-t border-gray-200">
              <span className="text-sm font-semibold">Total</span>
              <span className="font-bold text-gray-900">{stockTotal} packs</span>
            </div>
          </div>
        </div>

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
                  <tr key={o.id} onClick={() => router.push('/orders/' + o.id)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-900">{o.order_number}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{o.customer_name}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.order_date ?? o.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{line?.quantity_units ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.status === 'completed' ? 'bg-green-100 text-green-700' : o.status === 'shipped' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                        {o.status.replace(/_/g,' ')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PDF-ONLY SECTION (hidden off-screen) ── */}
      <div ref={pdfRef} style={{
        position: 'fixed', left: '-9999px', top: 0,
        width: '794px', background: '#fff',
        padding: '48px 56px', fontFamily: 'Arial, sans-serif',
        fontSize: '12px', color: '#1a1a1a', boxSizing: 'border-box'
      }}>
        {/* PDF Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', borderBottom: '2px solid #1a1a1a', paddingBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 'bold', letterSpacing: '-1px' }}>dh.</div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '2px' }}>SIGNATURE</div>
            <div style={{ fontSize: '8px', color: '#888', letterSpacing: '1px' }}>CREATING UNIQUE MOMENTS</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>PRODUCT REPORT</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Generated {generatedDate}</div>
          </div>
        </div>

        {/* Product info */}
        <div style={{ marginBottom: '28px', padding: '16px', background: '#f9f9f9', borderRadius: '8px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>{product.full_name}</div>
          <div style={{ display: 'flex', gap: '24px', fontSize: '11px', color: '#555', flexWrap: 'wrap' }}>
            <div><span style={{ color: '#999' }}>SKU: </span><span style={{ fontFamily: 'monospace' }}>{product.sku}</span></div>
            {product.brand && <div><span style={{ color: '#999' }}>Brand: </span>{product.brand}</div>}
            {product.vitola && <div><span style={{ color: '#999' }}>Vitola: </span>{product.vitola}</div>}
            {product.shape && <div><span style={{ color: '#999' }}>Shape: </span>{product.shape}</div>}
            {product.wrapper && <div><span style={{ color: '#999' }}>Wrapper: </span>{product.wrapper}</div>}
            {product.units_per_pack && <div><span style={{ color: '#999' }}>Units/pack: </span>{product.units_per_pack}</div>}
            {product.fixmer_reference && <div><span style={{ color: '#999' }}>Ref. Fixmer: </span>{product.fixmer_reference}</div>}
            {product.eu_ceg_id && <div><span style={{ color: '#999' }}>EU-CEG ID: </span>{product.eu_ceg_id}</div>}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'Revenue', value: fmt(totalRevenue), sub: `${invoiceOrders.length} invoices` },
            { label: 'Units Shipped', value: totalUnits.toLocaleString(), sub: 'all time' },
            { label: 'Clients', value: clientMap.length.toString(), sub: 'who ordered' },
            { label: 'In Stock', value: stockTotal.toString(), sub: 'packs available' },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{value}</div>
              <div style={{ fontSize: '10px', color: '#aaa', marginTop: '3px' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Monthly chart */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Units Shipped (Last 12 Months)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
            {monthlyUnits.map((m, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                {m.value > 0 && <div style={{ fontSize: '8px', color: '#999' }}>{m.value}</div>}
                <div style={{ width: '100%', borderRadius: '2px 2px 0 0', background: m.value > 0 ? '#0F6E56' : '#f3f4f6', height: `${Math.max((m.value/maxMonthly)*60, m.value > 0 ? 3 : 0)}px` }} />
                <div style={{ fontSize: '8px', color: '#aaa' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top clients */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Top Clients</div>
          {clientMap.map(([name, units], i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '16px', color: '#999', fontSize: '10px', textAlign: 'right' }}>{i+1}</div>
              <div style={{ width: '200px', fontSize: '11px', color: '#333' }}>{name}</div>
              <div style={{ flex: 1, height: '16px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#185FA5', borderRadius: '3px', width: `${(units/maxClient)*100}%`, display: 'flex', alignItems: 'center', paddingLeft: '6px' }}>
                  <span style={{ color: '#fff', fontSize: '9px', fontWeight: 'bold' }}>{units.toLocaleString()} u</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stock */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Stock by Warehouse</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Warehouse','Packs','Units'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 4px', fontSize: '9px', color: '#999', fontWeight: 'normal', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WH.map(w => {
                const record = (stockRecords as any[]).find((r: any) => r.warehouse === w)
                return (
                  <tr key={w} style={{ borderBottom: '1px solid #f9f9f9' }}>
                    <td style={{ padding: '8px 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: WH_COLORS[w] }} />
                      <span style={{ fontSize: '11px' }}>{w}</span>
                    </td>
                    <td style={{ padding: '8px 4px', fontWeight: record?.quantity_packs ? 'bold' : 'normal', color: record?.quantity_packs ? '#1a1a1a' : '#aaa' }}>{record?.quantity_packs ?? 0}</td>
                    <td style={{ padding: '8px 4px', color: '#666' }}>{record?.quantity_units ?? 0}</td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '2px solid #1a1a1a' }}>
                <td style={{ padding: '8px 4px', fontWeight: 'bold', fontSize: '12px' }}>Total</td>
                <td style={{ padding: '8px 4px', fontWeight: 'bold', fontSize: '12px' }}>{stockTotal}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Recent orders */}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Recent Orders</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Order #','Client','Date','Units','Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 4px', fontSize: '9px', color: '#999', fontWeight: 'normal', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.slice(0,10).map((o: any) => {
                const line = (lines as any[]).find((l: any) => l.order_id === o.id)
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                    <td style={{ padding: '8px 4px', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' }}>{o.order_number}</td>
                    <td style={{ padding: '8px 4px', fontSize: '11px' }}>{o.customer_name}</td>
                    <td style={{ padding: '8px 4px', fontSize: '10px', color: '#666' }}>{new Date(o.order_date ?? o.created_at).toLocaleDateString('en-GB')}</td>
                    <td style={{ padding: '8px 4px', fontSize: '11px', fontWeight: '500' }}>{line?.quantity_units ?? 0}</td>
                    <td style={{ padding: '8px 4px', fontSize: '10px', color: o.status === 'completed' ? '#3B6D11' : '#666' }}>{o.status.replace(/_/g,' ')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '32px', paddingTop: '12px', textAlign: 'center', fontSize: '9px', color: '#aaa' }}>
          DH Signature · Trade Cockpit · Confidential · {generatedDate}
        </div>
      </div>
    </div>
  )
}