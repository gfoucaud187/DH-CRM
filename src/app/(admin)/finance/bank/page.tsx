'use client'

import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Upload, CheckCircle, Link2, Loader2 } from 'lucide-react'

const sgd = (n: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(n)

const BANKS = ['DBS', 'OCBC', 'UOB']

function parseCSV(text: string, bank: string): Array<{ date: string; description: string; reference: string; amount: number; balance?: number }> {
  const lines = text.trim().split('\n').map(l => l.trim())
  const rows: any[] = []

  if (bank === 'DBS') {
    // DBS format: Transaction Date,Reference,Debit Amount,Credit Amount,Running Balance,Remarks
    let dataStart = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('transaction date')) { dataStart = i + 1; break }
    }
    for (let i = dataStart; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'))
      if (cols.length < 5 || !cols[0]) continue
      const dateStr = cols[0]
      const ref = cols[1] ?? ''
      const debit = parseFloat(cols[2]) || 0
      const credit = parseFloat(cols[3]) || 0
      const balance = parseFloat(cols[4]) || undefined
      const description = cols[5] ?? ref
      const amount = credit > 0 ? credit : -debit
      if (amount === 0 && !description) continue
      rows.push({ date: parseDateSG(dateStr), description, reference: ref, amount, balance })
    }
  } else if (bank === 'OCBC') {
    // OCBC format: Date,Txn Ref No,Description,Withdrawal,Deposit,Balance
    let dataStart = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('date') && lines[i].toLowerCase().includes('description')) {
        dataStart = i + 1; break
      }
    }
    for (let i = dataStart; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'))
      if (cols.length < 4 || !cols[0]) continue
      const withdrawal = parseFloat(cols[3]) || 0
      const deposit = parseFloat(cols[4]) || 0
      const balance = parseFloat(cols[5]) || undefined
      const amount = deposit > 0 ? deposit : -withdrawal
      if (amount === 0) continue
      rows.push({ date: parseDateSG(cols[0]), description: cols[2] ?? '', reference: cols[1] ?? '', amount, balance })
    }
  } else {
    // UOB / generic: Date,Description,Withdrawal,Deposit,Balance
    let dataStart = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('date')) { dataStart = i + 1; break }
    }
    for (let i = dataStart; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"(.*)"$/, '$1'))
      if (cols.length < 2 || !cols[0]) continue
      const withdrawal = parseFloat(cols[2]) || 0
      const deposit = parseFloat(cols[3]) || 0
      const balance = parseFloat(cols[4]) || undefined
      const amount = deposit > 0 ? deposit : -withdrawal
      if (amount === 0) continue
      rows.push({ date: parseDateSG(cols[0]), description: cols[1] ?? '', reference: '', amount, balance })
    }
  }

  return rows
}

function parseDateSG(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().slice(0, 10)
  // Handle DD/MM/YYYY, DD MMM YYYY, YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const months: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
  const m = dateStr.match(/(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})/)
  if (m) return `${m[3]}-${months[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`
  return new Date(dateStr).toISOString().slice(0, 10)
}

export default function BankPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [bank, setBank] = useState('DBS')
  const [accountNumber, setAccountNumber] = useState('')
  const [preview, setPreview] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const [selectedStatement, setSelectedStatement] = useState<string | null>(null)

  const { data: statements = [], isLoading: statementsLoading } = useQuery({
    queryKey: ['bank-statements'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bank_statements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['bank-transactions', selectedStatement],
    queryFn: async () => {
      if (!selectedStatement) return []
      const { data } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('bank_statement_id', selectedStatement)
        .order('date')
      return data ?? []
    },
    enabled: !!selectedStatement,
  })

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = parseCSV(text, bank)
    setPreview(rows)
  }

  const handleImport = async () => {
    if (preview.length === 0) return
    setImporting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: stmt } = await supabase
        .from('bank_statements')
        .insert({
          import_date: new Date().toISOString().slice(0, 10),
          bank,
          account_number: accountNumber || null,
          rows_imported: preview.length,
          created_by: user?.id,
        })
        .select('id')
        .single()

      if (!stmt) throw new Error('Failed to create statement')

      await supabase.from('bank_transactions').insert(
        preview.map(row => ({
          bank_statement_id: stmt.id,
          date: row.date,
          description: row.description,
          reference: row.reference || null,
          amount: row.amount,
          balance: row.balance ?? null,
        }))
      )

      queryClient.invalidateQueries({ queryKey: ['bank-statements'] })
      setPreview([])
      setSelectedStatement(stmt.id)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: any) {
      alert('Import error: ' + e.message)
    } finally {
      setImporting(false)
    }
  }

  const handleReconcile = async (txId: string) => {
    await supabase.from('bank_transactions').update({ is_reconciled: true, matched_at: new Date().toISOString() }).eq('id', txId)
    queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Reconciliation</h1>
          <p className="text-sm text-gray-500 mt-0.5">Import DBS / OCBC / UOB statements (CSV)</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* Import panel */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Import Statement</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Bank</label>
                <select value={bank} onChange={e => setBank(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                  {BANKS.map(b => <option key={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Account Number</label>
                <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                  placeholder="e.g. 001-234567-0"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none font-mono" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">CSV File</label>
                <label className="mt-1 flex flex-col items-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-lg p-5 cursor-pointer hover:border-gray-300 transition-colors">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-sm text-gray-500">Click to upload CSV</span>
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
                </label>
              </div>

              {preview.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-blue-900">{preview.length} transactions parsed</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    {preview[0]?.date} → {preview[preview.length - 1]?.date}
                  </p>
                </div>
              )}

              <button onClick={handleImport} disabled={preview.length === 0 || importing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? 'Importing…' : `Import ${preview.length} transactions`}
              </button>
            </div>
          </div>

          {/* Statement list */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
            <h2 className="font-semibold text-gray-900 mb-3 text-sm">Past Imports</h2>
            {statementsLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (statements as any[]).length === 0 ? (
              <p className="text-sm text-gray-400">No imports yet</p>
            ) : (
              <div className="space-y-2">
                {(statements as any[]).map((s: any) => (
                  <button key={s.id} onClick={() => setSelectedStatement(s.id)}
                    className={`w-full text-left p-2.5 rounded-lg text-sm transition-colors ${
                      selectedStatement === s.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'
                    }`}>
                    <div className="font-medium">{s.bank} {s.account_number ? `···${s.account_number.slice(-4)}` : ''}</div>
                    <div className={`text-xs ${selectedStatement === s.id ? 'text-gray-300' : 'text-gray-400'}`}>
                      {new Date(s.import_date).toLocaleDateString('en-SG')} · {s.rows_imported} rows
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Transactions */}
        <div className="col-span-2">
          {!selectedStatement ? (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-64">
              <div className="text-center text-gray-400">
                <Link2 size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select or import a bank statement to view transactions</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900 text-sm">Transactions</h2>
                <div className="text-xs text-gray-400">
                  {(transactions as any[]).filter((t: any) => t.is_reconciled).length} / {(transactions as any[]).length} reconciled
                </div>
              </div>
              {txLoading ? (
                <div className="py-12 text-center text-gray-400">Loading…</div>
              ) : (transactions as any[]).length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">No transactions</div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b border-gray-100">
                      <tr className="text-xs text-gray-500 uppercase">
                        <th className="text-left px-4 py-2 font-medium">Date</th>
                        <th className="text-left px-4 py-2 font-medium">Description</th>
                        <th className="text-right px-4 py-2 font-medium">Amount</th>
                        <th className="text-right px-4 py-2 font-medium">Balance</th>
                        <th className="text-right px-4 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(transactions as any[]).map((tx: any) => (
                        <tr key={tx.id} className={`hover:bg-gray-50 ${tx.is_reconciled ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString('en-SG')}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="text-gray-900 truncate max-w-xs">{tx.description}</div>
                            {tx.reference && <div className="text-xs text-gray-400 font-mono">{tx.reference}</div>}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-medium ${tx.amount >= 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                            {tx.amount >= 0 ? '+' : ''}{sgd(tx.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-gray-400 text-xs">
                            {tx.balance != null ? sgd(tx.balance) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {tx.is_reconciled ? (
                              <CheckCircle size={14} className="text-emerald-500 inline" />
                            ) : (
                              <button onClick={() => handleReconcile(tx.id)}
                                className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                                Reconcile
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CSV preview */}
      {preview.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Preview ({preview.length} rows)</h2>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b border-gray-100">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500">{row.date}</td>
                    <td className="px-4 py-2 text-gray-700 truncate max-w-sm">{row.description}</td>
                    <td className={`px-4 py-2 text-right font-mono font-medium ${row.amount >= 0 ? 'text-emerald-700' : 'text-gray-900'}`}>
                      {row.amount >= 0 ? '+' : ''}{sgd(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
