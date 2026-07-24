'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, TrendingDown, DollarSign, Users2, Receipt, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { reportYearStart } from '@/lib/reportPeriod'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(n)

function KpiCard({ label, value, icon: Icon, color, href }: any) {
  const content = (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 hover:border-gray-300 transition-colors">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
      </div>
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : <div>{content}</div>
}

export default function FinanceDashboardPage() {
  const supabase = createClient()

  const now = new Date()
  const yearStart = reportYearStart(now.getFullYear())

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['finance-kpis', now.getFullYear()],
    queryFn: async () => {
      // Revenue YTD — directly from sales_orders (source of truth)
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('total_amount, created_at')
        .not('status', 'in', '("cancelled","rejected")')
        .gte('created_at', yearStart)
      const revenue = (salesOrders ?? []).reduce((s, o) => s + Number(o.total_amount ?? 0), 0)

      // Expenses YTD — directly from expenses table
      const { data: expenseRows } = await supabase
        .from('expenses')
        .select('amount_sgd, date')
        .not('status', 'eq', 'rejected')
        .gte('date', yearStart)
      const expenses = (expenseRows ?? []).reduce((s, e) => s + Number(e.amount_sgd ?? 0), 0)

      // Purchase orders YTD (COGS proxy)
      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select('total_amount, created_at')
        .not('status', 'in', '("cancelled","rejected")')
        .gte('created_at', yearStart)
      const cogs = (purchaseOrders ?? []).reduce((s, p) => s + Number(p.total_amount ?? 0), 0)

      const netProfit = revenue - cogs - expenses

      // AR — open sales orders (not cancelled/rejected)
      const { data: openSO } = await supabase
        .from('sales_orders')
        .select('total_amount')
        .not('status', 'in', '("cancelled","rejected","paid","delivered")')
      const ar = (openSO ?? []).reduce((s, o) => s + Number(o.total_amount ?? 0), 0)

      // AP — open purchase orders
      const { data: openPO } = await supabase
        .from('purchase_orders')
        .select('total_amount')
        .not('status', 'in', '("cancelled","rejected","received")')
      const ap = (openPO ?? []).reduce((s, p) => s + Number(p.total_amount ?? 0), 0)

      // Cash — from GL if journal entries exist, else 0
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('account_code, debit, credit, journal_entries!inner(status)')
        .eq('journal_entries.status', 'posted')
      const balances: Record<string, number> = {}
      for (const line of (lines ?? []) as any[]) {
        const code = line.account_code
        balances[code] = (balances[code] ?? 0) + Number(line.debit ?? 0) - Number(line.credit ?? 0)
      }
      const cash = (balances['1100'] ?? 0) + (balances['1110'] ?? 0) + (balances['1120'] ?? 0)

      // Pending expenses count
      const { count: pendingExpenses } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'approved'])

      // Recent journal entries
      const { data: recent } = await supabase
        .from('journal_entries')
        .select('id, entry_number, date, description, status')
        .order('created_at', { ascending: false })
        .limit(8)

      return { cash, ar, ap, revenue, cogs, expenses, netProfit, pendingExpenses: pendingExpenses ?? 0, recent: recent ?? [] }
    },
  })

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  const k = kpis!

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance Dashboard</h1>
          <p className="text-gray-500 text-sm">Nadir y Bohue Pte. Ltd. — Singapore FRS</p>
        </div>
        <span className="text-sm text-gray-400">{now.getFullYear()} YTD</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Cash (GL)" value={fmt(k.cash)} icon={DollarSign} color="bg-emerald-500" href="/finance/journal" />
        <KpiCard label="Sales YTD" value={fmt(k.revenue)} icon={TrendingUp} color="bg-blue-500" href="/finance/reports/pl" />
        <KpiCard label="Purchases YTD" value={fmt(k.cogs)} icon={TrendingDown} color="bg-red-400" href="/finance/reports/pl" />
        <KpiCard label="Expenses YTD" value={fmt(k.expenses)} icon={TrendingDown} color="bg-orange-400" href="/finance/expenses" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <KpiCard label="Open AR" value={fmt(k.ar)} icon={TrendingUp} color="bg-sky-500" href="/finance/reports/ageing" />
        <KpiCard label="Open AP" value={fmt(k.ap)} icon={TrendingDown} color="bg-amber-500" href="/finance/reports/ageing" />
        <KpiCard label="Pending Expenses" value={k.pendingExpenses} icon={Receipt} color="bg-purple-500" href="/finance/expenses" />
      </div>

      {/* Recent journal entries */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Recent Journal Entries</h2>
          </div>
          <Link href="/finance/journal" className="text-xs text-indigo-600 hover:underline">View all</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {k.recent.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No journal entries yet</p>
          ) : k.recent.map((je: any) => (
            <div key={je.id} className="flex items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <span className="text-xs font-mono text-gray-400 block">{je.entry_number}</span>
                <span className="text-sm text-gray-900 truncate block">{je.description ?? '—'}</span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs text-gray-400">{new Date(je.date).toLocaleDateString('en-SG')}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  je.status === 'posted' ? 'bg-emerald-100 text-emerald-700'
                  : je.status === 'void' ? 'bg-red-100 text-red-600'
                  : 'bg-gray-100 text-gray-500'
                }`}>{je.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
