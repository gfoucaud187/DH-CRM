'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, X, Camera, Loader2, CheckCircle,
  Receipt, FileText, Send, Trash2, ImageIcon, Check, LogOut, Banknote
} from 'lucide-react'

const CATEGORIES = [
  { value: 'office',       label: 'Office & Admin' },
  { value: 'travel',       label: 'Travel & Transport' },
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

const CLAIM_STATUS_COLORS: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-emerald-100 text-emerald-700',
  paid:      'bg-purple-100 text-purple-700',
  rejected:  'bg-red-100 text-red-600',
}

const sgd = (n: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(n)

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  vendor: '',
  description: '',
  category: 'other',
  amount_sgd: '',
  currency: 'SGD',
  amount_foreign: '',
  exchange_rate: '1',
  gst_amount: '',
  gst_claimable: false,
  payment_method: 'cash',
  notes: '',
  receipt_url: '',
  paid_by: 'employee' as 'employee' | 'company',
}

type Tab = 'pool' | 'claims'

export default function ScanPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('pool')
  const [user, setUser] = useState<any>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [receiptPreview, setReceiptPreview] = useState('')
  const [fxHint, setFxHint] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [claimMode, setClaimMode] = useState(false)
  const [claimTitle, setClaimTitle] = useState('')
  const [creatingClaim, setCreatingClaim] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
  }, [])

  const { data: pool = [] } = useQuery({
    queryKey: ['scan-pool'],
    queryFn: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .is('claim_id', null)
        .neq('status', 'rejected')
        .order('date', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const { data: claims = [] } = useQuery({
    queryKey: ['scan-claims'],
    queryFn: async () => {
      const { data } = await supabase
        .from('expense_claims')
        .select('*, expenses(id, vendor, amount_sgd, date, paid_by, receipt_url)')
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!user,
  })

  const f = (k: keyof typeof form, v: any) => setForm(prev => ({ ...prev, [k]: v }))

  const openNew = () => {
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    setReceiptPreview('')
    setFxHint('')
    setFormOpen(true)
  }

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setScanning(true)
    setFxHint('')
    setReceiptPreview(URL.createObjectURL(file))
    setFormOpen(true)

    try {
      const uid = user?.id ?? 'unknown'
      const ext = file.name.split('.').pop() ?? 'jpg'
      const filePath = `expenses/${uid}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('receipts').upload(filePath, file, { upsert: false })
      let receiptUrl = ''
      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(filePath)
        receiptUrl = publicUrl
        setReceiptPreview(publicUrl)
        setForm(p => ({ ...p, receipt_url: publicUrl }))
      }

      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/finance/parse-receipt', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Failed')
      const parsed = await res.json()

      const currency: string = parsed.currency ?? 'SGD'
      const amount: number | null = parsed.amount ?? null
      let amountSgd = '', amountForeign = '', exchangeRate = '1', hint = ''

      if (amount !== null) {
        if (currency === 'SGD') {
          amountSgd = amount.toString()
        } else {
          amountForeign = amount.toString()
          try {
            const rateRes = await fetch(`https://open.er-api.com/v6/latest/SGD`)
            const rateData = await rateRes.json()
            const rateToForeign: number = rateData.rates?.[currency]
            if (rateToForeign && rateToForeign > 0) {
              const rate = 1 / rateToForeign
              exchangeRate = rate.toFixed(6)
              amountSgd = (amount * rate).toFixed(2)
              hint = `1 ${currency} = ${rate.toFixed(4)} SGD (live rate)`
            }
          } catch { hint = `Currency: ${currency} — enter exchange rate manually` }
        }
      }

      setFxHint(hint)
      setForm(p => ({
        ...p,
        date: parsed.date ?? p.date,
        vendor: parsed.vendor ?? p.vendor,
        description: parsed.description ?? p.description,
        category: parsed.category ?? p.category,
        currency,
        amount_foreign: amountForeign || p.amount_foreign,
        exchange_rate: exchangeRate,
        amount_sgd: amountSgd || p.amount_sgd,
        gst_amount: parsed.gst?.toString() ?? p.gst_amount,
        receipt_url: receiptUrl || p.receipt_url,
      }))
    } catch {
      alert('Scan failed — please fill in manually')
    } finally {
      setScanning(false)
      e.target.value = ''
    }
  }

  const handleAttachPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptPreview(URL.createObjectURL(file))
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
  }

  const handleSave = async () => {
    if (!form.vendor.trim() || !form.amount_sgd) { alert('Vendor and amount are required'); return }
    setSaving(true)
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
      paid_by: form.paid_by,
      created_by: user?.id,
      status: 'pending',
    }
    const { error } = await supabase.from('expenses').insert(payload)
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    queryClient.invalidateQueries({ queryKey: ['scan-pool'] })
    setFormOpen(false)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const handleCreateClaim = async () => {
    if (selected.size === 0) { alert('Select at least one expense'); return }
    setCreatingClaim(true)
    const selectedExpenses = pool.filter((e: any) => selected.has(e.id))
    const total = selectedExpenses.reduce((s: number, e: any) => s + Number(e.amount_sgd ?? 0), 0)

    const { data: claim, error: claimErr } = await supabase
      .from('expense_claims')
      .insert({
        title: claimTitle || `Expense Report — ${new Date().toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })}`,
        submitted_by: user?.id,
        status: 'draft',
        total_amount: total,
      })
      .select()
      .single()

    if (claimErr || !claim) { alert('Error creating claim'); setCreatingClaim(false); return }

    await supabase.from('expenses').update({ claim_id: claim.id }).in('id', Array.from(selected))

    setCreatingClaim(false)
    setClaimMode(false)
    setSelected(new Set())
    setClaimTitle('')
    queryClient.invalidateQueries({ queryKey: ['scan-pool'] })
    queryClient.invalidateQueries({ queryKey: ['scan-claims'] })
    setTab('claims')
  }

  const handleSubmitClaim = async (claimId: string) => {
    await supabase.from('expense_claims').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).eq('id', claimId)
    queryClient.invalidateQueries({ queryKey: ['scan-claims'] })
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['scan-pool'] })
  }

  const poolTotal = pool.reduce((s: number, e: any) => s + Number(e.amount_sgd ?? 0), 0)
  const poolReimbursableTotal = pool
    .filter((e: any) => e.paid_by === 'employee')
    .reduce((s: number, e: any) => s + Number(e.amount_sgd ?? 0), 0)

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 pt-12 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-lg font-bold">My Expenses</h1>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/login')}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400">
            <LogOut size={16} />
          </button>
        </div>
        <div className="flex gap-1 mt-3">
          {([['pool', 'Expenses'], ['claims', 'Expense Reports']] as [Tab, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>
              {l}
              {v === 'pool' && pool.length > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === v ? 'bg-gray-900 text-white' : 'bg-gray-700 text-gray-300'}`}>
                  {pool.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* POOL TAB */}
      {tab === 'pool' && (
        <div className="px-4 pt-4">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Total</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{sgd(poolTotal)}</p>
            </div>
            <div className="bg-orange-50 rounded-xl border border-orange-100 px-4 py-3">
              <p className="text-xs text-orange-600 uppercase font-medium">To Reimburse</p>
              <p className="text-lg font-bold text-orange-700 mt-0.5">{sgd(poolReimbursableTotal)}</p>
            </div>
          </div>

          {claimMode && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm font-medium text-blue-800 mb-2">
                {selected.size === 0 ? 'Select expenses to include' : `${selected.size} expense(s) selected`}
              </p>
              <input
                value={claimTitle}
                onChange={e => setClaimTitle(e.target.value)}
                placeholder="Report title (e.g. June 2026)"
                className="w-full h-9 rounded-lg border border-blue-200 px-3 text-sm bg-white mb-2 focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={() => { setClaimMode(false); setSelected(new Set()) }}
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white">
                  Cancel
                </button>
                <button onClick={handleCreateClaim} disabled={creatingClaim || selected.size === 0}
                  className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
                  {creatingClaim ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Create Report'}
                </button>
              </div>
            </div>
          )}

          {pool.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Receipt size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No pending expenses</p>
              <p className="text-xs mt-1">Tap + to add one</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pool.map((exp: any) => (
                <div key={exp.id}
                  className={`bg-white rounded-xl border transition-all ${claimMode && selected.has(exp.id) ? 'border-blue-400 shadow-sm' : 'border-gray-200'}`}
                  onClick={() => claimMode && toggleSelect(exp.id)}>
                  <div className="flex items-center gap-3 p-4">
                    {claimMode && (
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected.has(exp.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                        {selected.has(exp.id) && <Check size={11} className="text-white" />}
                      </div>
                    )}
                    {exp.receipt_url && (
                      <img src={exp.receipt_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate text-sm">{exp.vendor}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(exp.date).toLocaleDateString('en-SG')}
                        {exp.description && ` · ${exp.description}`}
                      </div>
                      {exp.paid_by === 'employee' && (
                        <span className="text-xs text-orange-600 font-medium">Out of pocket</span>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold text-sm text-gray-900">{sgd(exp.amount_sgd)}</div>
                      {!claimMode && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp.id) }}
                          className="text-gray-300 hover:text-red-500 mt-1 block ml-auto">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pool.length > 0 && !claimMode && (
            <button onClick={() => setClaimMode(true)}
              className="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center justify-center gap-2">
              <FileText size={16} />
              Create Expense Report
            </button>
          )}
        </div>
      )}

      {/* CLAIMS TAB */}
      {tab === 'claims' && (
        <div className="px-4 pt-4">
          {claims.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No expense reports yet</p>
              <p className="text-xs mt-1">Go to Expenses tab to create one</p>
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map((claim: any) => {
                const exps: any[] = claim.expenses ?? []
                const reimbursableTotal = exps
                  .filter(e => e.paid_by === 'employee')
                  .reduce((s: number, e: any) => s + Number(e.amount_sgd ?? 0), 0)
                return (
                  <div key={claim.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-gray-900 text-sm">{claim.title}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(claim.created_at).toLocaleDateString('en-SG')} · {exps.length} expense(s)
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${CLAIM_STATUS_COLORS[claim.status]}`}>
                          {claim.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
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
                    </div>

                    <div className="divide-y divide-gray-50">
                      {exps.slice(0, 4).map((exp: any) => (
                        <div key={exp.id} className="flex items-center gap-3 px-4 py-2">
                          {exp.receipt_url && (
                            <img src={exp.receipt_url} alt="" className="w-7 h-7 rounded object-cover border border-gray-100 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700 truncate block">{exp.vendor}</span>
                            <span className="text-xs text-gray-400">{new Date(exp.date).toLocaleDateString('en-SG')}</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900 shrink-0">{sgd(exp.amount_sgd)}</span>
                        </div>
                      ))}
                      {exps.length > 4 && (
                        <p className="px-4 py-2 text-xs text-gray-400">+{exps.length - 4} more</p>
                      )}
                    </div>

                    {claim.status === 'draft' && (
                      <div className="px-4 py-3 border-t border-gray-100">
                        <button onClick={() => handleSubmitClaim(claim.id)}
                          className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-700">
                          <Send size={14} />
                          Submit for Approval
                        </button>
                      </div>
                    )}
                    {claim.status === 'submitted' && (
                      <div className="px-4 py-3 border-t border-gray-100 text-center text-xs text-blue-600 font-medium">
                        Pending approval
                      </div>
                    )}
                    {claim.status === 'approved' && (
                      <div className="px-4 py-3 border-t border-gray-100 text-center text-xs text-emerald-600 font-medium flex items-center justify-center gap-1">
                        <CheckCircle size={12} /> Approved — reimbursement in progress
                      </div>
                    )}
                    {claim.status === 'paid' && (
                      <div className="px-4 py-3 border-t border-gray-100 text-center text-xs text-purple-600 font-medium flex items-center justify-center gap-1">
                        <Banknote size={12} /> Reimbursed
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      {!claimMode && (
        <div className="fixed bottom-6 right-4 flex flex-col items-end gap-3">
          <label className={`flex items-center gap-2 bg-white border border-gray-200 shadow-lg rounded-full px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 ${scanning ? 'opacity-70' : ''}`}>
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} className="text-gray-500" />}
            {scanning ? 'Scanning…' : 'Scan Receipt'}
            <input type="file" accept="image/*" className="hidden" onChange={handleScan} disabled={scanning} />
          </label>
          <button onClick={openNew}
            className="w-14 h-14 bg-gray-900 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-700 active:scale-95 transition-transform">
            <Plus size={24} />
          </button>
        </div>
      )}

      {/* Expense form drawer */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setFormOpen(false)} />
          <div className="bg-white rounded-t-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">New Expense</h2>
              <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {receiptPreview && (
                <div className="relative">
                  <img src={receiptPreview} alt="Receipt" className="w-full max-h-36 object-contain rounded-xl border border-gray-200" />
                  <button onClick={() => { setReceiptPreview(''); setForm(p => ({ ...p, receipt_url: '' })) }}
                    className="absolute top-2 right-2 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center">
                    <X size={12} />
                  </button>
                </div>
              )}

              {scanning && (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                  <Loader2 size={14} className="animate-spin" /> Scanning receipt…
                </div>
              )}

              {fxHint && (
                <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{fxHint}</div>
              )}

              {/* Paid by */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Paid by</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'employee', l: 'Out of pocket', sub: 'Reimbursable', color: 'border-orange-400 bg-orange-50 text-orange-700' },
                    { v: 'company',  l: 'Company card',  sub: 'Not reimbursable', color: 'border-gray-300 bg-gray-50 text-gray-600' },
                  ].map(opt => (
                    <button key={opt.v} type="button" onClick={() => f('paid_by', opt.v as any)}
                      className={`py-2.5 px-3 rounded-xl border-2 text-xs font-medium text-center transition-all ${form.paid_by === opt.v ? opt.color : 'border-gray-200 text-gray-400'}`}>
                      <div>{opt.l}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Date</label>
                  <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Category</label>
                  <select value={form.category} onChange={e => f('category', e.target.value)}
                    className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Vendor / Payee *</label>
                <input value={form.vendor} onChange={e => f('vendor', e.target.value)}
                  placeholder="e.g. Grab, 7-Eleven"
                  className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Description</label>
                <input value={form.description} onChange={e => f('description', e.target.value)}
                  placeholder="What was this for?"
                  className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>

              {/* Amount */}
              <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/50 space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase">Amount</label>
                <div className="grid grid-cols-3 gap-2">
                  <select value={form.currency} onChange={e => f('currency', e.target.value)}
                    className="h-10 rounded-xl border border-gray-200 px-2 text-sm bg-white focus:outline-none">
                    {['SGD','USD','EUR','GBP','JPY','CNY','HKD','AUD','MYR','IDR','THB'].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" step="0.01" min="0"
                    value={form.currency === 'SGD' ? form.amount_sgd : form.amount_foreign}
                    onChange={e => form.currency === 'SGD' ? f('amount_sgd', e.target.value) : f('amount_foreign', e.target.value)}
                    placeholder="Amount *"
                    className="h-10 rounded-xl border border-gray-200 px-3 text-sm bg-white focus:outline-none text-right font-mono" />
                  {form.currency !== 'SGD' ? (
                    <input type="number" step="0.000001" value={form.exchange_rate}
                      onChange={e => f('exchange_rate', e.target.value)}
                      placeholder="Rate"
                      className="h-10 rounded-xl border border-gray-200 px-3 text-sm bg-white focus:outline-none text-right font-mono" />
                  ) : (
                    <div className="h-10 flex items-center justify-center text-sm font-medium text-gray-500 bg-white rounded-xl border border-gray-200">SGD</div>
                  )}
                </div>
                {form.currency !== 'SGD' && (
                  <div>
                    <label className="text-xs text-gray-400">SGD Equivalent *</label>
                    <input type="number" step="0.01" value={form.amount_sgd}
                      onChange={e => f('amount_sgd', e.target.value)}
                      placeholder="Amount in SGD"
                      className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-white focus:outline-none text-right font-mono" />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Payment Method</label>
                <select value={form.payment_method} onChange={e => f('payment_method', e.target.value)}
                  className="mt-1 w-full h-10 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none">
                  {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {!receiptPreview && (
                <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer border border-dashed border-gray-300 rounded-xl px-4 py-3 hover:border-gray-400">
                  <ImageIcon size={16} />
                  Attach photo
                  <input type="file" accept="image/*" className="hidden" onChange={handleAttachPhoto} />
                </label>
              )}
            </div>

            <div className="px-4 pb-8 pt-3 border-t border-gray-100">
              <button onClick={handleSave} disabled={saving}
                className="w-full py-3.5 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {saving ? 'Saving…' : 'Add Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
