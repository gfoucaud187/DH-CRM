'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const sgd = (n: number, signed = false) => {
  const s = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(Math.abs(n))
  if (signed && n < 0) return `(${s})`
  return s
}

type AccountBalance = { code: string; name: string; balance: number }

function Section({ title, accounts, sign = 1, color }: { title: string; accounts: AccountBalance[]; sign?: number; color?: string }) {
  const total = accounts.reduce((s, a) => s + a.balance * sign, 0)
  if (accounts.length === 0) return null
  return (
    <div className="mb-4">
      <div className={`flex items-center justify-between py-2 border-b ${color ?? 'border-gray-200'}`}>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="font-semibold text-gray-900">{sgd(total)}</span>
      </div>
      {accounts.map(a => (
        <div key={a.code} className="flex items-center justify-between py-1.5 pl-4 text-sm">
          <div>
            <span className="font-mono text-xs text-gray-400 mr-2">{a.code}</span>
            <span className="text-gray-700">{a.name}</span>
          </div>
          <span className="text-gray-600">{sgd(a.balance * sign)}</span>
        </div>
      ))}
    </div>
  )
}

export default function PLReportPage() {
  const supabase = createClient()
  const now = new Date()
  const [dateFrom, setDateFrom] = useState(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(now.toISOString().slice(0, 10))

  const { data, isLoading } = useQuery({
    queryKey: ['pl-report', dateFrom, dateTo],
    queryFn: async () => {
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('account_code, account_name, debit, credit, journal_entries!inner(status, date)')
        .eq('journal_entries.status', 'posted')
        .gte('journal_entries.date', dateFrom)
        .lte('journal_entries.date', dateTo)

      // Aggregate by account: credit-normal accounts → balance = credits - debits
      const balances: Record<string, { name: string; balance: number; code: string }> = {}
      for (const line of (lines ?? []) as any[]) {
        const code = line.account_code
        if (!balances[code]) balances[code] = { code, name: line.account_name, balance: 0 }
        balances[code].balance += Number(line.credit ?? 0) - Number(line.debit ?? 0)
      }

      const all = Object.values(balances)
      const revenue = all.filter(a => a.code.startsWith('4') && a.balance > 0)
      const otherIncome = all.filter(a => a.code.startsWith('4') && a.balance <= 0)
      const cogs = all.filter(a => a.code.startsWith('5')).map(a => ({ ...a, balance: -a.balance }))
      const expenses = all.filter(a => a.code.startsWith('6')).map(a => ({ ...a, balance: -a.balance }))

      const totalRevenue = revenue.reduce((s, a) => s + a.balance, 0)
      const totalCogs = cogs.reduce((s, a) => s + a.balance, 0)
      const grossProfit = totalRevenue - totalCogs
      const totalExpenses = expenses.reduce((s, a) => s + a.balance, 0)
      const netProfit = grossProfit - totalExpenses
      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue * 100) : 0
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0

      return { revenue, cogs, expenses, totalRevenue, totalCogs, grossProfit, totalExpenses, netProfit, grossMargin, netMargin }
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h1>
          <p className="text-sm text-gray-500 mt-0.5">Nadir y Bohue Pte. Ltd. — Singapore FRS</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-xs text-gray-500">From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-sm border-0 focus:outline-none" />
          </div>
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-xs text-gray-500">To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-sm border-0 focus:outline-none" />
          </div>
          <button onClick={() => window.print()}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Print
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading…</div>
      ) : !data ? null : (
        <div className="max-w-2xl">

          {/* KPI summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Total Revenue', value: sgd(data.totalRevenue), color: 'text-gray-900' },
              { label: 'Gross Profit', value: `${sgd(data.grossProfit)} (${data.grossMargin.toFixed(1)}%)`, color: data.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600' },
              { label: 'Net Profit', value: `${sgd(data.netProfit)} (${data.netMargin.toFixed(1)}%)`, color: data.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500 uppercase font-medium">{k.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-center mb-6">
              <h2 className="font-bold text-gray-900">Nadir y Bohue Pte. Ltd.</h2>
              <p className="text-sm text-gray-500">Statement of Profit or Loss</p>
              <p className="text-xs text-gray-400">
                {new Date(dateFrom).toLocaleDateString('en-SG')} – {new Date(dateTo).toLocaleDateString('en-SG')}
              </p>
            </div>

            <Section title="Revenue" accounts={data.revenue} />

            <div className="flex items-center justify-between py-2 mb-4 bg-gray-50 rounded px-3">
              <span className="font-semibold text-gray-900">Total Revenue</span>
              <span className="font-semibold text-gray-900">{sgd(data.totalRevenue)}</span>
            </div>

            <Section title="Cost of Goods Sold" accounts={data.cogs} />

            {data.cogs.length > 0 && (
              <div className="flex items-center justify-between py-2 mb-4 bg-gray-50 rounded px-3">
                <span className="font-semibold text-gray-900">Gross Profit</span>
                <span className={`font-semibold ${data.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {sgd(data.grossProfit)}
                </span>
              </div>
            )}

            <Section title="Operating Expenses" accounts={data.expenses} />

            <div className="flex items-center justify-between py-3 mt-4 border-t-2 border-gray-900">
              <span className="font-bold text-gray-900 text-base">Net Profit / (Loss)</span>
              <span className={`font-bold text-lg ${data.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {data.netProfit < 0 ? `(${sgd(Math.abs(data.netProfit))})` : sgd(data.netProfit)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
