'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const sgd = (n: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(n)

const BUCKETS = [
  { label: 'Current', min: 0, max: 0 },
  { label: '1-30 days', min: 1, max: 30 },
  { label: '31-60 days', min: 31, max: 60 },
  { label: '61-90 days', min: 61, max: 90 },
  { label: '90+ days', min: 91, max: Infinity },
]

export default function AgeingPage() {
  const supabase = createClient()
  const [mode, setMode] = useState<'ar' | 'ap'>('ar')
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ageing', mode],
    queryFn: async () => {
      if (mode === 'ar') {
        const { data: orders } = await supabase
          .from('sales_orders')
          .select('id, order_number, customer_id, total_amount, created_at, status')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: true })

        const customerIds = Array.from(new Set((orders ?? []).map((o: any) => o.customer_id).filter(Boolean)))
        const { data: customers } = customerIds.length
          ? await supabase.from('customers').select('id, name').in('id', customerIds)
          : { data: [] }
        const customerMap: Record<string, string> = {}
        for (const c of (customers ?? []) as any[]) customerMap[c.id] = c.name

        return (orders ?? [])
          .filter((o: any) => o.total_amount > 0)
          .map((o: any) => ({
            ref: o.order_number,
            entity: customerMap[o.customer_id] ?? 'Unknown',
            amount: Number(o.total_amount ?? 0),
            date: o.created_at?.slice(0, 10) ?? today,
          }))
      } else {
        const { data: pos } = await supabase
          .from('purchase_orders')
          .select('id, po_number, partner_id, total_amount, created_at, status')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: true })

        const partnerIds = Array.from(new Set((pos ?? []).map((p: any) => p.partner_id).filter(Boolean)))
        const { data: partners } = partnerIds.length
          ? await supabase.from('partners').select('id, name').in('id', partnerIds)
          : { data: [] }
        const partnerMap: Record<string, string> = {}
        for (const p of (partners ?? []) as any[]) partnerMap[p.id] = p.name

        return (pos ?? [])
          .filter((p: any) => p.total_amount > 0)
          .map((p: any) => ({
            ref: p.po_number,
            entity: partnerMap[p.partner_id] ?? 'Unknown',
            amount: Number(p.total_amount ?? 0),
            date: p.created_at?.slice(0, 10) ?? today,
          }))
      }
    },
  })

  const getDaysOverdue = (dateStr: string) => {
    const ms = new Date(today).getTime() - new Date(dateStr).getTime()
    return Math.floor(ms / (1000 * 60 * 60 * 24))
  }

  const getBucket = (days: number) => {
    if (days <= 0) return 0
    if (days <= 30) return 1
    if (days <= 60) return 2
    if (days <= 90) return 3
    return 4
  }

  const byEntity: Record<string, { name: string; buckets: number[]; total: number }> = {}
  for (const row of rows) {
    const days = getDaysOverdue(row.date)
    const bucket = getBucket(days)
    if (!byEntity[row.entity]) {
      byEntity[row.entity] = { name: row.entity, buckets: [0, 0, 0, 0, 0], total: 0 }
    }
    byEntity[row.entity].buckets[bucket] += row.amount
    byEntity[row.entity].total += row.amount
  }

  const entities = Object.values(byEntity).sort((a, b) => b.total - a.total)
  const bucketTotals = BUCKETS.map((_, i) => entities.reduce((s, e) => s + e.buckets[i], 0))
  const grandTotal = entities.reduce((s, e) => s + e.total, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AR / AP Ageing</h1>
          <p className="text-sm text-gray-500 mt-0.5">As at {new Date(today).toLocaleDateString('en-SG')}</p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { v: 'ar', l: 'Accounts Receivable (AR)' },
            { v: 'ap', l: 'Accounts Payable (AP)' },
          ].map(m => (
            <button key={m.v} onClick={() => setMode(m.v as any)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === m.v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {m.l}
            </button>
          ))}
        </div>
      </div>

      {/* Bucket totals */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {BUCKETS.map((b, i) => (
          <div key={b.label} className={`bg-white rounded-xl border p-4 ${i >= 3 ? 'border-red-200' : 'border-gray-200'}`}>
            <p className={`text-xs font-medium uppercase ${i >= 3 ? 'text-red-500' : 'text-gray-500'}`}>{b.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${i >= 3 ? 'text-red-600' : 'text-gray-900'}`}>{sgd(bucketTotals[i])}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading…</div>
        ) : entities.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No open {mode.toUpperCase()} items</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-3 font-medium">{mode === 'ar' ? 'Customer' : 'Supplier'}</th>
                {BUCKETS.map(b => (
                  <th key={b.label} className="text-right px-3 py-3 font-medium">{b.label}</th>
                ))}
                <th className="text-right px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entities.map(e => (
                <tr key={e.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                  {e.buckets.map((amt, i) => (
                    <td key={i} className={`px-3 py-3 text-right ${i >= 3 && amt > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      {amt > 0 ? sgd(amt) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{sgd(e.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-900 font-bold">
                <td className="px-4 py-3 text-gray-900">TOTAL</td>
                {bucketTotals.map((t, i) => (
                  <td key={i} className={`px-3 py-3 text-right ${i >= 3 && t > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {sgd(t)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right text-gray-900">{sgd(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
