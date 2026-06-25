'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, TrendingUp, Package, Clock, ShoppingCart, Download } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useRef } from 'react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmt(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}` }

export default function ClientReportPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const pdfRef = useRef<HTMLDivElement>(null)

  const { data: customer } = useQuery({
    queryKey: ['client-report-customer', id],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', id).single()
      return data
    }
  })

  const { data: orders = [] } = useQuery({
    queryKey: ['client-report-orders', id],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders').select('*')
        .eq('customer_id', id).neq('status','cancelled')
        .order('order_date', { ascending: false })
      return data ?? []
    }
  })

  const { data: lines = [] } = useQuery({
    queryKey: ['client-report-lines', id],
    queryFn: async () => {
      const orderIds = (orders as any[]).map((o: any) => o.id)
      if (!orderIds.length) return []
      const { data } = await supabase.from('sales_order_lines')
        .select('order_id, product_name, sku, quantity_units, quantity_packs, line_total, line_type')
        .in('order_id', orderIds)
      return data ?? []
    },
    enabled: orders.length > 0
  })

  const invoices = (orders as any[]).filter((o: any) => o.document_type === 'invoice' && !o.is_foc)
  const shipped  = (orders as any[]).filter((o: any) => ['shipped','completed'].includes(o.status))
  const active   = (orders as any[]).filter((o: any) => !['completed','cancelled','shipped'].includes(o.status))

  const totalRevenue = invoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const totalUnits   = shipped.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)

  const shipTimes = shipped.map((o: any) => {
    if (!o.order_date || !o.shipment_date) return null
    return Math.floor((new Date(o.shipment_date).getTime() - new Date(o.order_date).getTime()) / 86400000)
  }).filter((d): d is number => d !== null && d >= 0)
  const avgShip = shipTimes.length ? (shipTimes.reduce((a,b)=>a+b,0)/shipTimes.length).toFixed(1) : '—'

  const monthlyRevenue = useMemo(() => {
    const map: Record<string,number> = {}
    invoices.forEach((o: any) => {
      const d = new Date(o.order_date ?? o.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      map[key] = (map[key] ?? 0) + (o.total_amount ?? 0)
    })
    const result = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth()-i)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      result.push({ label: MONTHS[d.getMonth()], value: map[key] ?? 0 })
    }
    return result
  }, [invoices])
  const maxMonthly = Math.max(...monthlyRevenue.map(m => m.value), 1)

  const productMap = useMemo(() => {
    const map: Record<string, number> = {}
    const invoiceIds = new Set(invoices.map((o: any) => o.id))
    ;(lines as any[]).forEach((l: any) => {
      if (!invoiceIds.has(l.order_id) || l.line_type !== 'commercial') return
      map[l.product_name] = (map[l.product_name] ?? 0) + (l.quantity_units ?? 0)
    })
    return Object.entries(map).sort(([,a],[,b]) => b-a).slice(0,6)
  }, [lines, invoices])
  const maxProduct = Math.max(...productMap.map(([,v]) => v), 1)

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
    pdf.save(`Client-Report-${customer?.legal_name?.replace(/\s/g,'-')}-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  if (!customer) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  const generatedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-5xl">
      {/* Web header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{customer.legal_name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {customer.country} · {customer.assigned_price_list ?? '—'} price list · {customer.status}
            {customer.track_trace_enabled && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">T&T</span>
            )}
          </p>
        </div>
        <button onClick={handleExportPDF}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Download className="h-4 w-4" /> Export PDF
        </button>
        <Link href={'/customers/' + id + '/edit'}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Edit distributor
        </Link>
      </div>

      {/* Web UI */}
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: TrendingUp,   label: 'Total revenue',    value: fmt(totalRevenue), sub: `${invoices.length} invoices` },
            { icon: Package,      label: 'Units purchased',  value: totalUnits.toLocaleString(), sub: 'all time' },
            { icon: ShoppingCart, label: 'Active orders',    value: active.length.toString(), sub: `${(orders as any[]).length} total` },
            { icon: Clock,        label: 'Avg order→ship',   value: avgShip + 'd', sub: 'average lead time' },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2"><Icon className="h-4 w-4 text-gray-400" /><span className="text-xs text-gray-500">{label}</span></div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400 mt-1">{sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Revenue trend (last 12 months)</h2>
          <div className="flex items-end gap-2" style={{ height: '100px' }}>
            {monthlyRevenue.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                {m.value > 0 && <span className="text-gray-400" style={{ fontSize: '9px' }}>{fmt(m.value)}</span>}
                <div className="w-full rounded-t" style={{ height: `${Math.max((m.value/maxMonthly)*80, m.value > 0 ? 4 : 0)}px`, background: m.value > 0 ? '#185FA5' : '#E5E7EB' }} />
                <span style={{ fontSize: '9px' }} className="text-gray-400">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Top products ordered</h2>
            {productMap.length === 0 ? <p className="text-sm text-gray-400">No data yet</p> :
              productMap.map(([name, value], i) => (
                <div key={name} className="flex items-center gap-3 mb-2.5">
                  <span className="text-xs text-gray-400 w-4">{i+1}</span>
                  <span className="text-xs text-gray-600 w-32 truncate" title={name}>{name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div className="h-full rounded-full flex items-center px-2" style={{ width:`${(value/maxProduct)*100}%`, background:'#0F6E56', minWidth:'40px' }}>
                      <span className="text-white text-xs">{value.toLocaleString()}u</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Recent orders</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(orders as any[]).slice(0, 8).map((o: any) => (
                <button key={o.id} onClick={() => router.push('/orders/' + o.id)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-gray-900">{o.order_number}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${o.document_type === 'invoice' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {o.is_foc ? (o.document_type === 'invoice' ? 'INV(DO)' : 'SO(DO)') : o.document_type === 'invoice' ? 'INV' : o.document_type?.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-400">{new Date(o.order_date ?? o.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{o.total_units}u</span>
                    <span className="text-xs font-semibold text-gray-900">{o.is_foc ? 'FOC' : `${o.currency} ${Number(o.total_amount).toFixed(0)}`}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${o.status === 'completed' ? 'bg-green-100 text-green-700' : o.status === 'draft' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>
                      {o.status.replace(/_/g,' ')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {customer.contacts?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Contacts</h2>
            <div className="grid grid-cols-3 gap-4">
              {customer.contacts.map((c: any, i: number) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-sm text-gray-900">{c.name}</p>
                  {c.role && <p className="text-xs text-gray-500 mt-0.5">{c.role}</p>}
                  {c.email && <p className="text-xs text-blue-600 mt-1">{c.email}</p>}
                  {c.phone && <p className="text-xs text-gray-500 mt-0.5">{c.phone}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
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
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1a1a1a' }}>CLIENT REPORT</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Generated {generatedDate}</div>
          </div>
        </div>

        {/* Client info */}
        <div style={{ marginBottom: '28px', padding: '16px', background: '#f9f9f9', borderRadius: '8px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>{customer.legal_name}</div>
          <div style={{ display: 'flex', gap: '32px', fontSize: '11px', color: '#555' }}>
            {customer.country && <div><span style={{ color: '#999' }}>Country: </span>{customer.country}</div>}
            {customer.assigned_price_list && <div><span style={{ color: '#999' }}>Price list: </span>{customer.assigned_price_list}</div>}
            {customer.currency && <div><span style={{ color: '#999' }}>Currency: </span>{customer.currency}</div>}
            {customer.incoterms && <div><span style={{ color: '#999' }}>Incoterms: </span>{customer.incoterms}</div>}
            {customer.payment_terms && <div><span style={{ color: '#999' }}>Payment: </span>{customer.payment_terms}</div>}
            {customer.track_trace_enabled && <div style={{ background: '#e6f1fb', color: '#185fa5', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>TRACK & TRACE</div>}
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '28px' }}>
          {[
            { label: 'Total Revenue', value: fmt(totalRevenue), sub: `${invoices.length} invoices` },
            { label: 'Units Purchased', value: totalUnits.toLocaleString(), sub: 'all time' },
            { label: 'Active Orders', value: active.length.toString(), sub: `${(orders as any[]).length} total` },
            { label: 'Avg Order→Ship', value: avgShip + 'd', sub: 'lead time' },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{value}</div>
              <div style={{ fontSize: '10px', color: '#aaa', marginTop: '3px' }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Revenue chart */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Revenue Trend (Last 12 Months)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
            {monthlyRevenue.map((m, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                {m.value > 0 && <div style={{ fontSize: '8px', color: '#999' }}>{fmt(m.value)}</div>}
                <div style={{ width: '100%', borderRadius: '2px 2px 0 0', background: m.value > 0 ? '#185FA5' : '#f3f4f6', height: `${Math.max((m.value/maxMonthly)*60, m.value > 0 ? 3 : 0)}px` }} />
                <div style={{ fontSize: '8px', color: '#aaa' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Top Products Ordered</div>
          {productMap.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: '11px' }}>No product data yet</div>
          ) : productMap.map(([name, value], i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '16px', color: '#999', fontSize: '10px', textAlign: 'right' }}>{i+1}</div>
              <div style={{ width: '200px', fontSize: '11px', color: '#333' }}>{name}</div>
              <div style={{ flex: 1, height: '16px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#0F6E56', borderRadius: '3px', width: `${(value/maxProduct)*100}%`, display: 'flex', alignItems: 'center', paddingLeft: '6px' }}>
                  <span style={{ color: '#fff', fontSize: '9px', fontWeight: 'bold' }}>{value.toLocaleString()} u</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent orders */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Recent Orders</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Order #','Type','Date','Units','Amount','Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 4px', fontSize: '9px', color: '#999', fontWeight: 'normal', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(orders as any[]).slice(0,10).map((o: any) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                  <td style={{ padding: '8px 4px', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '11px' }}>{o.order_number}</td>
                  <td style={{ padding: '8px 4px', fontSize: '10px', color: '#666' }}>
                    {o.is_foc ? (o.document_type === 'invoice' ? 'INV(DO)' : 'SO(DO)') : o.document_type?.toUpperCase()}
                  </td>
                  <td style={{ padding: '8px 4px', fontSize: '10px', color: '#666' }}>{new Date(o.order_date ?? o.created_at).toLocaleDateString('en-GB')}</td>
                  <td style={{ padding: '8px 4px', fontSize: '11px' }}>{o.total_units}</td>
                  <td style={{ padding: '8px 4px', fontSize: '11px', fontWeight: '500' }}>
                    {o.is_foc ? 'FOC' : `${o.currency} ${Number(o.total_amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
                  </td>
                  <td style={{ padding: '8px 4px', fontSize: '10px', color: o.status === 'completed' ? '#3B6D11' : o.status === 'cancelled' ? '#A32D2D' : '#666' }}>
                    {o.status.replace(/_/g,' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Contacts */}
        {customer.contacts?.length > 0 && (
          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Contacts</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              {customer.contacts.map((c: any, i: number) => (
                <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{c.name}</div>
                  {c.role && <div style={{ color: '#999', fontSize: '10px', marginTop: '2px' }}>{c.role}</div>}
                  {c.email && <div style={{ color: '#185fa5', fontSize: '10px', marginTop: '4px' }}>{c.email}</div>}
                  {c.phone && <div style={{ color: '#666', fontSize: '10px', marginTop: '2px' }}>{c.phone}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '32px', paddingTop: '12px', textAlign: 'center', fontSize: '9px', color: '#aaa' }}>
          DH Signature · Trade Cockpit · Confidential · {generatedDate}
        </div>
      </div>
    </div>
  )
}