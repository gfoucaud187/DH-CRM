'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Send, Trash2, Camera, Loader2, CheckCircle, ImageIcon, FileText, User, ThumbsUp, ThumbsDown, Banknote } from 'lucide-react'

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
  receipt_url: '',
}

const CLAIM_STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-emerald-100 text-emerald-700',
  paid:      'bg-purple-100 text-purple-700',
  rejected:  'bg-red-100 text-red-600',
}

export default function ExpensesPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [mainTab, setMainTab] = useState<'expenses' | 'claims'>('expenses')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [receiptPreview, setReceiptPreview] = useState<string>('')
  const [fxHint, setFxHint] = useState<string>('')
  const [processingClaim, setProcessingClaim] = useState<string | null>(null)

  const { data: claims = [] } = useQuery({
    queryKey: ['admin-claims'],
    queryFn: async () => {
      const { data } = await supabase
        .from('expense_claims')
        .select('*, expenses(id, vendor, amount_sgd, date, paid_by, receipt_url), user_profiles!submitted_by(full_name, email)')
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: mainTab === 'claims',
  })

  const handleClaimAction = async (claimId: string, action: 'approved' | 'rejected' | 'paid') => {
    setProcessingClaim(claimId)
    const update: any = { status: action }
    if (action === 'approved') update.approved_at = new Date().toISOString()
    if (action === 'paid') update.paid_at = new Date().toISOString()
    await supabase.from('expense_claims').update(update).eq('id', claimId)
    queryClient.invalidateQueries({ queryKey: ['admin-claims'] })
    setProcessingClaim(null)
  }

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
    setReceiptPreview('')
    setFxHint('')
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
      receipt_url: exp.receipt_url ?? '',
    })
    setReceiptPreview(exp.receipt_url ?? '')
    setFxHint('')
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
      receipt_url: form.receipt_url || null,
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
    setFxHint('')

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    setReceiptPreview(localUrl)

    try {
      // Upload to Supabase storage (per-user folder)
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? 'unknown'
      const ext = file.name.split('.').pop() ?? 'jpg'
      const filePath = `expenses/${uid}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(filePath, file, { upsert: false })

      let receiptUrl = ''
      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(filePath)
        receiptUrl = publicUrl
        setForm(prev => ({ ...prev, receipt_url: publicUrl }))
        setReceiptPreview(publicUrl)
      }

      // AI parse
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/finance/parse-receipt', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Parsing failed')
      const parsed = await res.json()

      const detectedCurrency: string = parsed.currency ?? 'SGD'
      const detectedAmount: number | null = parsed.amount ?? null

      // Fetch live exchange rate if currency ≠ SGD
      let amountSgd = ''
      let amountForeign = ''
      let exchangeRate = '1'
      let hint = ''

      if (detectedAmount !== null) {
        if (detectedCurrency === 'SGD') {
          amountSgd = detectedAmount.toString()
        } else {
          amountForeign = detectedAmount.toString()
          try {
            const rateRes = await fetch(`https://open.er-api.com/v6/latest/SGD`)
            const rateData = await rateRes.json()
            const rateToForeign: number = rateData.rates?.[detectedCurrency]
            if (rateToForeign && rateToForeign > 0) {
              const rate = 1 / rateToForeign
              exchangeRate = rate.toFixed(6)
              const converted = detectedAmount * rate
              amountSgd = converted.toFixed(2)
              hint = `Rate: 1 ${detectedCurrency} = ${rate.toFixed(4)} SGD (live)`
            }
          } catch {
            hint = `Currency: ${detectedCurrency} — enter exchange rate manually`
          }
        }
      }

      setFxHint(hint)
      setForm(f => ({
        ...f,
        date: parsed.date ?? f.date,
        vendor: parsed.vendor ?? f.vendor,
        description: parsed.description ?? f.description,
        category: parsed.category ?? f.category,
        currency: detectedCurrency,
        amount_foreign: amountForeign || f.amount_foreign,
        exchange_rate: exchangeRate,
        amount_sgd: amountSgd || f.amount_sgd,
        gst_amount: parsed.gst?.toString() ?? f.gst_amount,
        receipt_url: receiptUrl || f.receipt_url,
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
      <div className="flex items-start justify-between gap-3 mb-4">
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

      {/* Main tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {([['expenses', 'All Expenses', null], ['claims', 'Expense Claims', claims.filter((c:any) => c.status === 'submitted').length]] as any[]).map(([v, l, badge]) => (
          <button key={v} onClick={() => setMainTab(v)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${mainTab === v ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'}`}>
            {l}
            {badge > 0 && <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{badge}</span>}
          </button>
        ))}
      </div>

      {/* Claims tab */}
      {mainTab === 'claims' && (
        <div className="space-y-4">
          {claims.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileText size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No expense claims yet</p>
            </div>
          ) : claims.map((claim: any) => {
            const exps: any[] = claim.expenses ?? []
            const reimbursable = exps.filter((e:any) => e.paid_by === 'employee')
            const reimbursableTotal = reimbursable.reduce((s:number, e:any) => s + Number(e.amount_sgd ?? 0), 0)
            const submitter = claim.user_profiles
            return (
              <div key={claim.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-50">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <User size={13} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">{submitter?.full_name || submitter?.email || 'Unknown'}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{claim.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{exps.length} expense(s) · Created {new Date(claim.created_at).toLocaleDateString('en-SG')}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${CLAIM_STATUS_COLORS[claim.status]}`}>
                    {claim.status}
                  </span>
                </div>

                <div className="flex items-center gap-6 px-5 py-3 border-b border-gray-50 bg-gray-50/50">
                  <div>
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="font-bold text-gray-900">{sgd(claim.total_amount ?? 0)}</p>
                  </div>
                  {reimbursableTotal > 0 && (
                    <div>
                      <p className="text-xs text-orange-500">To reimburse</p>
                      <p className="font-bold text-orange-600">{sgd(reimbursableTotal)}</p>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-gray-50">
                  {exps.map((exp: any) => (
                    <div key={exp.id} className="flex items-center gap-3 px-5 py-2.5">
                      {exp.receipt_url && (
                        <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer">
                          <img src={exp.receipt_url} alt="" className="w-8 h-8 rounded object-cover border border-gray-200 shrink-0" />
                        </a>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-800 truncate block">{exp.vendor}</span>
                        <span className="text-xs text-gray-400">{new Date(exp.date).toLocaleDateString('en-SG')}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-medium text-gray-900">{sgd(exp.amount_sgd)}</span>
                        {exp.paid_by === 'employee' && (
                          <p className="text-xs text-orange-500">reimburse</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {(claim.status === 'submitted' || claim.status === 'approved') && (
                  <div className="flex gap-2 px-5 py-3 border-t border-gray-100">
                    {claim.status === 'submitted' && (
                      <>
                        <button onClick={() => handleClaimAction(claim.id, 'rejected')}
                          disabled={processingClaim === claim.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 disabled:opacity-50">
                          <ThumbsDown size={13} /> Reject
                        </button>
                        <button onClick={() => handleClaimAction(claim.id, 'approved')}
                          disabled={processingClaim === claim.id}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                          {processingClaim === claim.id ? <Loader2 size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
                          Approve
                        </button>
                      </>
                    )}
                    {claim.status === 'approved' && (
                      <button onClick={() => handleClaimAction(claim.id, 'paid')}
                        disabled={processingClaim === claim.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
                        {processingClaim === claim.id ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
                        Mark as Paid
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Filters — only shown on expenses tab */}
      {mainTab === 'expenses' && (<>
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
            <ReceiptIcon size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No expenses found</p>
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-gray-100">
              {expenses.map((exp: any) => (
                <div key={exp.id} className="p-4" onClick={() => exp.status !== 'posted' && openEdit(exp)}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{exp.vendor}</div>
                      {exp.description && <div className="text-xs text-gray-400 truncate">{exp.description}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {exp.receipt_url && (
                        <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="w-8 h-8 rounded overflow-hidden border border-gray-200 shrink-0 block">
                          <img src={exp.receipt_url} alt="receipt" className="w-full h-full object-cover" />
                        </a>
                      )}
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">{sgd(exp.amount_sgd)}</div>
                        <div className="text-xs text-gray-400">{new Date(exp.date).toLocaleDateString('en-SG')}</div>
                      </div>
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
                  <th className="text-center px-3 py-3 font-medium">Receipt</th>
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
                    <td className="px-4 py-3 text-right font-medium">
                      {sgd(exp.amount_sgd)}
                      {exp.currency && exp.currency !== 'SGD' && exp.amount_foreign && (
                        <div className="text-xs text-gray-400">{exp.currency} {exp.amount_foreign}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">{exp.gst_amount > 0 ? sgd(exp.gst_amount) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{PAYMENT_METHODS.find(p => p.value === exp.payment_method)?.label ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {exp.receipt_url ? (
                        <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="inline-block w-9 h-9 rounded border border-gray-200 overflow-hidden hover:border-gray-400 transition-colors">
                          <img src={exp.receipt_url} alt="receipt" className="w-full h-full object-cover" />
                        </a>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
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
      </>)}

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit Expense' : 'New Expense'}</h2>
              <div className="flex items-center gap-2">
                {/* AI Receipt Scan + Photo Attach */}
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

            {/* Receipt thumbnail */}
            {receiptPreview && (
              <div className="px-5 pt-4">
                <div className="relative inline-block">
                  <img src={receiptPreview} alt="Receipt" className="max-h-40 rounded-lg border border-gray-200 object-contain w-full" />
                  <button
                    onClick={() => { setReceiptPreview(''); setForm(p => ({ ...p, receipt_url: '' })) }}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-red-500">
                    <X size={10} />
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 p-5 space-y-4">
              {fxHint && (
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  {fxHint}
                </div>
              )}

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

              {/* Currency section — currency selector always visible */}
              <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase">Amount</label>
                <div className="grid grid-cols-3 gap-2">
                  <select value={form.currency} onChange={e => f('currency', e.target.value)}
                    className="h-9 rounded-md border border-gray-200 px-2 text-sm bg-white focus:outline-none">
                    {['SGD','USD','EUR','GBP','JPY','CNY','HKD','AUD','MYR','IDR','THB','VND'].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" step="0.01" min="0"
                    value={form.currency === 'SGD' ? form.amount_sgd : form.amount_foreign}
                    onChange={e => form.currency === 'SGD'
                      ? f('amount_sgd', e.target.value)
                      : f('amount_foreign', e.target.value)}
                    placeholder="Amount *"
                    className="h-9 rounded-md border border-gray-200 px-3 text-sm bg-white focus:outline-none text-right font-mono" />
                  {form.currency !== 'SGD' ? (
                    <div>
                      <input type="number" step="0.000001" value={form.exchange_rate}
                        onChange={e => f('exchange_rate', e.target.value)}
                        placeholder="Rate to SGD"
                        className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm bg-white focus:outline-none text-right font-mono" />
                    </div>
                  ) : (
                    <div className="h-9 flex items-center justify-end px-3 text-sm font-medium text-gray-900 bg-white rounded-md border border-gray-200">
                      SGD
                    </div>
                  )}
                </div>
                {form.currency !== 'SGD' && (
                  <div>
                    <label className="text-xs text-gray-400">Amount SGD *</label>
                    <input type="number" step="0.01" min="0" value={form.amount_sgd}
                      onChange={e => f('amount_sgd', e.target.value)}
                      placeholder="Equivalent in SGD"
                      className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm bg-white focus:outline-none text-right font-mono" />
                    {form.exchange_rate && form.amount_foreign && (
                      <p className="text-xs text-gray-400 mt-1 text-right">
                        {form.amount_foreign} {form.currency} × {form.exchange_rate} = {(parseFloat(form.amount_foreign) * parseFloat(form.exchange_rate)).toFixed(2)} SGD
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">GST (9%)</label>
                  <input type="number" step="0.01" min="0" value={form.gst_amount} onChange={e => f('gst_amount', e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-right font-mono" />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.gst_claimable} onChange={e => f('gst_claimable', e.target.checked)}
                      className="rounded border-gray-300" />
                    GST claimable
                  </label>
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

              {/* Manual photo attach without scan */}
              {!receiptPreview && (
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer hover:text-gray-700 border border-dashed border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors">
                  <ImageIcon size={16} />
                  Attach photo (no AI scan)
                  <input type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const localUrl = URL.createObjectURL(file)
                      setReceiptPreview(localUrl)
                      const { data: { user } } = await supabase.auth.getUser()
                      const uid = user?.id ?? 'unknown'
                      const ext = file.name.split('.').pop() ?? 'jpg'
                      const filePath = `expenses/${uid}/${Date.now()}.${ext}`
                      const { error } = await supabase.storage.from('receipts').upload(filePath, file)
                      if (!error) {
                        const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(filePath)
                        setReceiptPreview(publicUrl)
                        setForm(p => ({ ...p, receipt_url: publicUrl }))
                      }
                      e.target.value = ''
                    }} />
                </label>
              )}
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

function ReceiptIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" />
    </svg>
  )
}
