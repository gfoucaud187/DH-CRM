'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Send, Trash2, Camera, Loader2, CheckCircle } from 'lucide-react'

const CATEGORIES = [
  { value: 'office',       label: 'Office & Admin' },
  { value: 'travel',       label: 'Travel & Entertainment' },
  { value: 'meals',        label: 'Meals & Beverages' },
  { value: 'utilities',    label: 'Utilities' },
  { value: 'professional', label: 'Professional Fees' },
  { value: 'marketing',    label: 'Marketing & Events' },
  { value: 'rent',         label: 'Rent' },
  { value: 'bank_charges', label: 'Bank Charges' },
  { value: 'freight',      label: 'Freight & Logistics' },
  { value: 'other',        label: 'Other' },
]

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card',          label: 'Credit/Debit Card' },
  { value: 'cash',          label: 'Cash' },
  { value: 'cheque',        label: 'Cheque' },
]

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  posted:   'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
}

const sgd = (n: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(n)

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  vendor: '',
  description: '',
  category: 'office',
  amount_sgd: '',
  currency: 'SGD',
  amount_foreign: '',
  exchange_rate: '1',
  gst_amount: '',
  gst_claimable: true,
  payment_method: 'bank_transfer',
  notes: '',
}

export default function ExpensesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', filterStatus, filterCategory],
    queryFn: async () => {
      let q = supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (filterStatus !== 'all') q = q.eq('status', filterStatus)
      if (filterCategory !== 'all') q = q.eq('category', filterCategory)
      const { data } = await q
      return data ?? []
    },
  })

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDrawerOpen(true)
  }

  const openEdit = (exp: any) => {
    setEditing(exp)
    setForm({
      date: exp.date,
      vendor: exp.vendor,
      description: exp.description ?? '',
      category: exp.category,
      amount_sgd: exp.amount_sgd?.toString() ?? '',
      currency: exp.currency ?? 'SGD',
      amount_foreign: exp.amount_foreign?.toString() ?? '',
      exchange_rate: exp.exchange_rate?.toString() ?? '1',
      gst_amount: exp.gst_amount?.toString() ?? '',
      gst_claimable: exp.gst_claimable ?? true,
      payment_method: exp.payment_method ?? 'bank_transfer',
      notes: exp.notes ?? '',
    })
    setDrawerOpen(true)
  }

  const handleSave = async () => {
    if (!form.vendor.trim() || !form.amount_sgd) { alert('Vendor and amount are required'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      date: form.date,
      vendor: form.vendor,
      description: form.description || null,
      category: form.category,
      amount_sgd: parseFloat(form.amount_sgd),
      currency: form.currency,
      amount_foreign: form.amount_foreign ? parseFloat(form.amount_foreign) : null,
      exchange_rate: parseFloat(form.exchange_rate) || 1,
      gst_amount: form.gst_amount ? parseFloat(form.gst_amount) : 0,
      gst_claimable: form.gst_claimable,
      payment_method: form.payment_method,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editing) {
      const res = await supabase.from('expenses').update(payload).eq('id', editing.id)
      error = res.error
    } else {
      const res = await supabase.from('expenses').insert({ ...payload, created_by: user?.id, status: 'pending' })
      error = res.error
    }
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
    setDrawerOpen(false)
  }

  const handleDelete = async (exp: any) => {
    if (!confirm(`Delete expense from ${exp.vendor}?`)) return
    await supabase.from('expenses').delete().eq('id', exp.id)
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
  }

  const handleApprove = async (exp: any) => {
    await supabase.from('expenses').update({ status: 'approved' }).eq('id', exp.id)
    queryClient.invalidateQueries({ queryKey: ['expenses'] })
  }

  const handlePostToJournal = async (exp: any) => {
    setPosting(exp.id)
    try {
      const res = await fetch('/api/finance/post-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseId: exp.id }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    } catch (e: any) {
      alert('Error posting: ' + e.message)
    } finally {
      setPosting(null)
    }
  }

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/finance/parse-receipt', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Parsing failed')
      const parsed = await res.json()
      setForm(f => ({
        ...f,
        date: parsed.date ?? f.date,
        vendor: parsed.vendor ?? f.vendor,
        description: parsed.description ?? f.description,
        amount_sgd: parsed.amount?.toString() ?? f.amount_sgd,
        gst_amount: parsed.gst?.toString() ?? f.gst_amount,
        category: parsed.category ?? f.category,
      }))
    } catch {
      alert('Receipt scanning failed — please fill in manually')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  const f = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  const totalAmt = expenses.reduce((s: number, e: any) => s + Number(e.amount_sgd ?? 0), 0)
  const postedAmt = expenses.filter((e: any) => e.status === 'posted').reduce((s: number, e: any) => s + Number(e.amount_sgd ?? 0), 0)

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {expenses.length} entries · {sgd(totalAmt)} · Posted {sgd(postedAmt)}
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 shrink-0">
          <Plus size={16} /> <span className="hidden sm:inline">New Expense</span><span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['all','pending','approved','posted','rejected'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <div className="ml-2 h-5 border-l border-gray-200" />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 border-0 focus:outline-none">
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Mobile cards + Desktop table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading...</div>
        ) : expenses.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Receipt size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No expenses found</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-gray-100">
              {expenses.map((exp: any) => (
                <div key={exp.id} className="p-4" onClick={() => exp.status !== 'posted' && openEdit(exp)}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{exp.vendor}</div>
                      {exp.description && <div className="text-xs text-gray-400 truncate">{exp.description}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-gray-900">{sgd(exp.amount_sgd)}</div>
                      <div className="text-xs text-gray-400">{new Date(exp.date).toLocaleDateString('en-SG')}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[exp.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {exp.status}
                      </span>
                      <span className="text-xs text-gray-400">{CATEGORIES.find(c => c.value === exp.category)?.label ?? exp.category}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {exp.status === 'pending' && (
                        <button onClick={e => { e.stopPropagation(); handleApprove(exp) }}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50" title="Approve">
                          <CheckCircle size={15} />
                        </button>
                      )}
                      {exp.status === 'approved' && (
                        <button onClick={e => { e.stopPropagation(); handlePostToJournal(exp) }}
                          disabled={posting === exp.id}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                          {posting === exp.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          Post
                        </button>
                      )}
                      {exp.status !== 'posted' && (
                        <button onClick={e => { e.stopPropagation(); handleDelete(exp) }}
                          className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Vendor</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-right px-4 py-3 font-medium">Amount (SGD)</th>
                  <th className="text-right px-4 py-3 font-medium">GST</th>
                  <th className="text-left px-4 py-3 font-medium">Payment</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map((exp: any) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(exp.date).toLocaleDateString('en-SG')}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{exp.vendor}</div>
                      {exp.description && <div className="text-xs text-gray-400">{exp.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{CATEGORIES.find(c => c.value === exp.category)?.label ?? exp.category}</td>
                    <td className="px-4 py-3 text-right font-medium">{sgd(exp.amount_sgd)}</td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">{exp.gst_amount > 0 ? sgd(exp.gst_amount) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{PAYMENT_METHODS.find(p => p.value === exp.payment_method)?.label ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[exp.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {exp.status === 'pending' && (
                          <button onClick={() => handleApprove(exp)}
                            className="p-1.5 rounded text-xs text-blue-600 hover:bg-blue-50" title="Approve">
                            <CheckCircle size={14} />
                          </button>
                        )}
                        {exp.status === 'approved' && (
                          <button onClick={() => handlePostToJournal(exp)}
                            disabled={posting === exp.id}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                            {posting === exp.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                            Post
                          </button>
                        )}
                        {exp.status !== 'posted' && (
                          <button onClick={() => openEdit(exp)}
                            className="p-1.5 rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100 text-xs">
                            Edit
                          </button>
                        )}
                        {exp.status !== 'posted' && (
                          <button onClick={() => handleDelete(exp)}
                            className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit Expense' : 'New Expense'}</h2>
              <div className="flex items-center gap-2">
                {/* AI Receipt Scan */}
                <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium cursor-pointer transition-colors ${scanning ? 'opacity-50' : 'hover:bg-gray-50'}`}>
                  {scanning ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  {scanning ? 'Scanning…' : 'Scan Receipt'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleScanReceipt} disabled={scanning} />
                </label>
                <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Date *</label>
                  <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Category</label>
                  <select value={form.category} onChange={e => f('category', e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Vendor / Payee *</label>
                <input value={form.vendor} onChange={e => f('vendor', e.target.value)}
                  placeholder="e.g. DHL Express, WeWork"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Description</label>
                <input value={form.description} onChange={e => f('description', e.target.value)}
                  placeholder="What was this for?"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Amount SGD *</label>
                  <input type="number" step="0.01" min="0" value={form.amount_sgd} onChange={e => f('amount_sgd', e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-right font-mono" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">GST (9%)</label>
                  <input type="number" step="0.01" min="0" value={form.gst_amount} onChange={e => f('gst_amount', e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-right font-mono" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="gst_claimable" checked={form.gst_claimable} onChange={e => f('gst_claimable', e.target.checked)}
                  className="rounded border-gray-300" />
                <label htmlFor="gst_claimable" className="text-sm text-gray-700">GST input tax claimable from IRAS</label>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <label className="text-xs font-medium text-gray-500 uppercase">Foreign Currency (optional)</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <select value={form.currency} onChange={e => f('currency', e.target.value)}
                    className="h-9 rounded-md border border-gray-200 px-2 text-sm focus:outline-none">
                    {['SGD','USD','EUR','GBP','JPY','CNY','HKD','AUD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" step="0.01" value={form.amount_foreign} onChange={e => f('amount_foreign', e.target.value)}
                    placeholder="Amount"
                    className="h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-right font-mono" />
                  <div className="relative">
                    <input type="number" step="0.000001" value={form.exchange_rate} onChange={e => f('exchange_rate', e.target.value)}
                      placeholder="Rate"
                      className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-right font-mono" />
                    <span className="absolute left-2 top-2 text-xs text-gray-400">×</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Payment Method</label>
                <select value={form.payment_method} onChange={e => f('payment_method', e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                  {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => setDrawerOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Receipt({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" />
    </svg>
  )
}
