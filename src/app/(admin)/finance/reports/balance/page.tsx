'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const sgd = (n: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(n)

type AccountBalance = { code: string; name: string; balance: number }

function BalanceSection({ title, accounts, normalDebit }: { title: string; accounts: AccountBalance[]; normalDebit: boolean }) {
  const total = accounts.reduce((s, a) => s + (normalDebit ? a.balance : -a.balance), 0)
  if (accounts.length === 0) return null
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between py-2 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        <span className="font-semibold text-gray-900">{sgd(total)}</span>
      </div>
      {accounts.map(a => {
        const displayBalance = normalDebit ? a.balance : -a.balance
        return (
          <div key={a.code} className="flex items-center justify-between py-1.5 pl-4 text-sm">
            <div>
              <span className="font-mono text-xs text-gray-400 mr-2">{a.code}</span>
              <span className="text-gray-700">{a.name}</span>
            </div>
            <span className={displayBalance >= 0 ? 'text-gray-700' : 'text-red-500'}>
              {displayBalance < 0 ? `(${sgd(Math.abs(displayBalance))})` : sgd(displayBalance)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function BalanceSheetPage() {
  const supabase = createClient()
  const now = new Date()
  const [asOf, setAsOf] = useState(now.toISOString().slice(0, 10))

  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', asOf],
    queryFn: async () => {
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('account_code, account_name, debit, credit, journal_entries!inner(status, date)')
        .eq('journal_entries.status', 'posted')
        .lte('journal_entries.date', asOf)

      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('code, name, type, normal_balance')
        .eq('is_active', true)

      const acctMap: Record<string, { name: string; type: string; normal: string }> = {}
      for (const a of (accounts ?? []) as any[]) {
        acctMap[a.code] = { name: a.name, type: a.type, normal: a.normal_balance }
      }

      // Net balance: for debit-normal accounts, positive = debit > credit
      const balances: Record<string, { name: string; type: string; balance: number; code: string }> = {}
      for (const line of (lines ?? []) as any[]) {
        const code = line.account_code
        const acct = acctMap[code]
        if (!balances[code]) {
          balances[code] = { code, name: line.account_name, type: acct?.type ?? 'asset', balance: 0 }
        }
        balances[code].balance += Number(line.debit ?? 0) - Number(line.credit ?? 0)
      }

      const all = Object.values(balances)

      // Assets: debit-normal, show debit balance as positive
      const currentAssets = all.filter(a => ['1100','1110','1120','1200','1210','1300','1400'].includes(a.code))
      const fixedAssets = all.filter(a => ['1500','1510'].includes(a.code))

      // Liabilities: credit-normal, show credit balance as positive
      const currentLiabilities = all.filter(a => a.code.startsWith('2'))
      const equity = all.filter(a => a.code.startsWith('3'))

      // Retained earnings from P&L (revenue - cogs - expenses)
      const revenueTotal = all.filter(a => a.code.startsWith('4')).reduce((s, a) => s + (-a.balance), 0)
      const cogsTotal    = all.filter(a => a.code.startsWith('5')).reduce((s, a) => s + a.balance, 0)
      const expTotal     = all.filter(a => a.code.startsWith('6')).reduce((s, a) => s + a.balance, 0)
      const periodEarnings = revenueTotal - cogsTotal - expTotal

      const totalCurrentAssets = currentAssets.reduce((s, a) => s + a.balance, 0)
      const totalFixedAssets = fixedAssets.reduce((s, a) => s + a.balance, 0)
      const totalAssets = totalCurrentAssets + totalFixedAssets
      const totalCurrentLiab = currentLiabilities.reduce((s, a) => s + (-a.balance), 0)
      const totalEquity = equity.reduce((s, a) => s + (-a.balance), 0) + periodEarnings

      return { currentAssets, fixedAssets, currentLiabilities, equity, periodEarnings, totalAssets, totalCurrentLiab, totalEquity }
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance Sheet</h1>
          <p className="text-sm text-gray-500 mt-0.5">Statement of Financial Position — Singapore FRS</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-xs text-gray-500">As of</span>
            <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
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
        <div className="grid grid-cols-2 gap-6 max-w-5xl">

          {/* ASSETS */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-center mb-6">
              <h2 className="font-bold text-gray-900">Assets</h2>
              <p className="text-xs text-gray-400">As at {new Date(asOf).toLocaleDateString('en-SG')}</p>
            </div>
            <BalanceSection title="Current Assets" accounts={data.currentAssets} normalDebit />
            <BalanceSection title="Non-Current Assets" accounts={data.fixedAssets} normalDebit />
            <div className="flex items-center justify-between pt-3 border-t-2 border-gray-900 mt-4">
              <span className="font-bold text-gray-900">TOTAL ASSETS</span>
              <span className="font-bold text-gray-900 text-lg">{sgd(data.totalAssets)}</span>
            </div>
          </div>

          {/* LIABILITIES + EQUITY */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="text-center mb-6">
              <h2 className="font-bold text-gray-900">Liabilities & Equity</h2>
              <p className="text-xs text-gray-400">As at {new Date(asOf).toLocaleDateString('en-SG')}</p>
            </div>
            <BalanceSection title="Current Liabilities" accounts={data.currentLiabilities} normalDebit={false} />
            <BalanceSection title="Equity" accounts={data.equity} normalDebit={false} />
            {data.periodEarnings !== 0 && (
              <div className="flex items-center justify-between py-1.5 pl-4 text-sm">
                <div className="text-gray-700">Period Earnings</div>
                <span className={data.periodEarnings >= 0 ? 'text-gray-700' : 'text-red-500'}>
                  {data.periodEarnings < 0 ? `(${sgd(Math.abs(data.periodEarnings))})` : sgd(data.periodEarnings)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between pt-3 border-t-2 border-gray-900 mt-4">
              <span className="font-bold text-gray-900">TOTAL LIAB. + EQUITY</span>
              <span className={`font-bold text-lg ${Math.abs(data.totalAssets - data.totalCurrentLiab - data.totalEquity) < 0.01 ? 'text-gray-900' : 'text-red-600'}`}>
                {sgd(data.totalCurrentLiab + data.totalEquity)}
              </span>
            </div>
            {Math.abs(data.totalAssets - data.totalCurrentLiab - data.totalEquity) > 0.01 && (
              <p className="mt-2 text-xs text-red-500 text-center">
                Balance sheet does not balance — check for missing journal entries
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
