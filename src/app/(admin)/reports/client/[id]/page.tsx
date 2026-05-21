'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, TrendingUp, Package, Clock, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmt(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n.toFixed(0)}` }

export default function ClientReportPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()

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
        .eq('customer_id', id).neq('status','cancelled').neq('status','deleted')
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
  const active   = (orders as any[]).filter((o: any) => !['completed','cancelled','deleted','shipped'].includes(o.status))

  const totalRevenue = invoices.reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0)
  const totalUnits   = shipped.reduce((s: number, o: any) => s + (o.total_units ?? 0), 0)

  const shipTimes = shipped.map((o: any) => {
    if (!o.order_date || !o.shipment_date) return null
    return Math.floor((new Date(o.shipment_date).getTime() - new Date(o.order_date).getTime()) / 86400000)
  }).filter((d): d is number => d !== null && d >= 0)
  const avgShip = shipTimes.length ? (shipTimes.reduce((a,b)=>a+b,0)/shipTimes.length).toFixed(1) : '—'

  // Monthly revenue last 12m
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

  // Top products for this client
  const productMap = useMemo(() => {
    const map: Record<string, number> = {}
    const invoiceIds = new Set(invoices.map((o: any) => o.id))
    ;(lines as any[]).forEach((l: any) => {
      if (!invoiceIds.has(l.order_id) || l.line_type !== 'commercial') return
      map[l.product_name] = (map[l.product_name] ?? 0) + (l.quantity_units ?? 0)
    })
    return Object.entries(map).sort(([,a],[,b]) => b-a).slice(0,8)
  }, [lines, invoices])
  const maxProduct = Math.max(...productMap.map(([,v]) => v), 1)

  if (!customer) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{customer.legal_name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {customer.country} · {customer.assigned_price_list ?? '—'} price list · {customer.status}
            {customer.track_trace_enabled && <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">T&T</span>}
          </p>
        </div>
        <Link href={'/customers/' + id}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          View customer file
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { icon: TrendingUp, label: 'Total revenue', value: fmt(totalRevenue), sub: `${invoices.length} invoices` },
          { icon: Package,    label: 'Units purchased', value: totalUnits.toLocaleString(), sub: 'all time' },
          { icon: ShoppingCart, label: 'Active orders', value: active.length.toString(), sub: `${(orders as any[]).length} total` },
          { icon: Clock,      label: 'Avg order→ship', value: avgShip + 'd', sub: 'average lead time' },
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

      {/* Monthly revenue trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">Revenue trend (last 12 months)</h2>
        <div className="flex items-end gap-2" style={{ height: '100px' }}>
          {monthlyRevenue.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              {m.value > 0 && <span className="text-xs text-gray-400" style={{ fontSize: '9px' }}>{fmt(m.value)}</span>}
              <div className="w-full rounded-t" style={{
                height: `${Math.max((m.value/maxMonthly)*80, m.value > 0 ? 4 : 0)}px`,
                background: m.value > 0 ? '#185FA5' : '#E5E7EB',
              }} />
              <span style={{ fontSize: '9px' }} className="text-gray-400">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Top products */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Top products ordered</h2>
          {productMap.length === 0 ? (
            <p className="text-sm text-gray-400">No product data yet</p>
          ) : productMap.map(([name, value], i) => (
            <div key={name} className="flex items-center gap-3 mb-2.5">
              <span className="text-xs text-gray-400 w-4">{i+1}</span>
              <span className="text-xs text-gray-600 w-32 truncate" title={name}>{name}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                <div className="h-full rounded-full flex items-center px-2"
                  style={{ width:`${(value/maxProduct)*100}%`, background:'#0F6E56', minWidth:'40px' }}>
                  <span className="text-white text-xs">{value.toLocaleString()}u</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order history */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Recent orders</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(orders as any[]).slice(0, 10).map((o: any) => (
              <button key={o.id}
                onClick={() => router.push('/orders/' + o.id)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-gray-900">{o.order_number}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${
                    o.document_type === 'invoice' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {o.is_foc ? 'SO(DO)' : o.document_type === 'invoice' ? 'INV' : 'SO'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{o.total_units}u</span>
                  <span className="text-xs font-semibold text-gray-900">
                    {o.is_foc ? 'FOC' : `${o.currency} ${Number(o.total_amount).toFixed(0)}`}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    o.status === 'completed' ? 'bg-green-100 text-green-700' :
                    o.status === 'draft' ? 'bg-gray-100 text-gray-500' :
                    'bg-amber-100 text-amber-700'
                  }`}>{o.status.replace(/_/g,' ')}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contact info */}
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
  )
}