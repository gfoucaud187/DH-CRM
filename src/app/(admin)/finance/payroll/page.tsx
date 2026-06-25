'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Send, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { calculateCPF, CPF_BRACKET_LABELS, CPF_OW_CEILING } from '@/lib/finance/cpf'

const sgd = (n: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(n)

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

const STATUS_COLORS: Record<string, string> = {
  draft:  'bg-gray-100 text-gray-600',
  posted: 'bg-blue-100 text-blue-700',
  paid:   'bg-emerald-100 text-emerald-700',
}

const EMPTY_FORM = {
  employee_name: '',
  employee_nric: '',
  age_bracket: 'le55',
  nationality: 'SG_PR',
  employment_type: 'full_time',
  gross_salary: '',
  notes: '',
}

export default function PayrollPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['payroll', year, month],
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_entries')
        .select('*')
        .eq('period_year', year)
        .eq('period_month', month)
        .order('employee_name')
      return data ?? []
    },
  })

  const cpf = form.gross_salary
    ? calculateCPF(parseFloat(form.gross_salary) || 0, form.age_bracket, form.nationality)
    : null

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setDrawerOpen(true) }
  const openEdit = (e: any) => {
    setEditing(e)
    setForm({
      employee_name: e.employee_name,
      employee_nric: e.employee_nric ?? '',
      age_bracket: e.age_bracket,
      nationality: e.nationality,
      employment_type: e.employment_type,
      gross_salary: e.gross_salary?.toString() ?? '',
      notes: e.notes ?? '',
    })
    setDrawerOpen(true)
  }

  const handleSave = async () => {
    if (!form.employee_name.trim() || !form.gross_salary) { alert('Employee name and salary are required'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const gross = parseFloat(form.gross_salary)
    const calc = calculateCPF(gross, form.age_bracket, form.nationality)
    const payload = {
      period_year: year,
      period_month: month,
      employee_name: form.employee_name,
      employee_nric: form.employee_nric || null,
      age_bracket: form.age_bracket,
      nationality: form.nationality,
      employment_type: form.employment_type,
      gross_salary: gross,
      cpf_employee: calc.cpfEmployee,
      cpf_employer: calc.cpfEmployer,
      net_salary: calc.netSalary,
      sdl: calc.sdl,
      notes: form.notes || null,
    }
    let error
    if (editing) {
      const res = await supabase.from('payroll_entries').update(payload).eq('id', editing.id)
      error = res.error
    } else {
      const res = await supabase.from('payroll_entries').insert({ ...payload, created_by: user?.id, status: 'draft' })
      error = res.error
    }
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    queryClient.invalidateQueries({ queryKey: ['payroll'] })
    setDrawerOpen(false)
  }

  const handleDelete = async (e: any) => {
    if (!confirm(`Delete payroll entry for ${e.employee_name}?`)) return
    await supabase.from('payroll_entries').delete().eq('id', e.id)
    queryClient.invalidateQueries({ queryKey: ['payroll'] })
  }

  const handlePostAll = async () => {
    const draftEntries = (entries as any[]).filter(e => e.status === 'draft')
    if (draftEntries.length === 0) { alert('No draft entries to post'); return }
    if (!confirm(`Post ${draftEntries.length} payroll entries to the journal?`)) return
    setPosting(true)
    try {
      const res = await fetch('/api/finance/post-payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      queryClient.invalidateQueries({ queryKey: ['payroll'] })
      queryClient.invalidateQueries({ queryKey: ['finance-kpis'] })
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setPosting(false)
    }
  }

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const f = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  const totalGross = (entries as any[]).reduce((s, e) => s + Number(e.gross_salary ?? 0), 0)
  const totalNet   = (entries as any[]).reduce((s, e) => s + Number(e.net_salary ?? 0), 0)
  const totalCPFEmp = (entries as any[]).reduce((s, e) => s + Number(e.cpf_employee ?? 0), 0)
  const totalCPFEmr = (entries as any[]).reduce((s, e) => s + Number(e.cpf_employer ?? 0), 0)
  const hasDraft = (entries as any[]).some(e => e.status === 'draft')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-0.5">CPF auto-calculated per Singapore CPF Board rates</p>
        </div>
        <div className="flex items-center gap-2">
          {hasDraft && (
            <button onClick={handlePostAll} disabled={posting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Post to Journal
            </button>
          )}
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
            <Plus size={16} /> Add Employee
          </button>
        </div>
      </div>

      {/* Month picker */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={18} />
        </button>
        <div className="font-semibold text-gray-900 text-lg w-40 text-center">
          {MONTHS[month - 1]} {year}
        </div>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Summary */}
      {(entries as any[]).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Gross Payroll', value: sgd(totalGross) },
            { label: 'CPF Employee', value: sgd(totalCPFEmp) },
            { label: 'CPF Employer', value: sgd(totalCPFEmr) },
            { label: 'Net Payable', value: sgd(totalNet) },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">{s.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading…</div>
        ) : (entries as any[]).length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <p className="text-sm">No payroll entries for {MONTHS[month - 1]} {year}</p>
            <button onClick={openNew} className="mt-3 text-xs text-indigo-600 hover:underline">Add first employee</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-right px-4 py-3 font-medium">Gross</th>
                <th className="text-right px-4 py-3 font-medium">CPF (Emp)</th>
                <th className="text-right px-4 py-3 font-medium">CPF (Emr)</th>
                <th className="text-right px-4 py-3 font-medium">SDL</th>
                <th className="text-right px-4 py-3 font-medium">Net Salary</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(entries as any[]).map((e: any) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{e.employee_name}</div>
                    {e.employee_nric && <div className="text-xs text-gray-400 font-mono">{e.employee_nric}</div>}
                    <div className="text-xs text-gray-400">{CPF_BRACKET_LABELS[e.age_bracket]} · {e.nationality === 'SG_PR' ? 'SG/PR' : 'Foreigner'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 capitalize">{e.employment_type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-right font-medium">{sgd(e.gross_salary)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{sgd(e.cpf_employee)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{sgd(e.cpf_employer)}</td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">{sgd(e.sdl)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{sgd(e.net_salary)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[e.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {e.status === 'draft' && (
                        <button onClick={() => openEdit(e)} className="text-xs px-2 py-1 rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100">
                          Edit
                        </button>
                      )}
                      {e.status === 'draft' && (
                        <button onClick={() => handleDelete(e)} className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-md bg-white shadow-xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit Employee' : 'Add Employee'}</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>

            <div className="flex-1 p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Full Name *</label>
                <input value={form.employee_name} onChange={e => f('employee_name', e.target.value)}
                  placeholder="e.g. John Tan Wei Ming"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">NRIC / FIN</label>
                <input value={form.employee_nric} onChange={e => f('employee_nric', e.target.value)}
                  placeholder="e.g. S1234567A"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Nationality</label>
                  <select value={form.nationality} onChange={e => f('nationality', e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="SG_PR">Singapore Citizen / PR</option>
                    <option value="foreigner">Foreigner (no CPF)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Age Bracket</label>
                  <select value={form.age_bracket} onChange={e => f('age_bracket', e.target.value)}
                    disabled={form.nationality === 'foreigner'}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400">
                    {Object.entries(CPF_BRACKET_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Employment Type</label>
                  <select value={form.employment_type} onChange={e => f('employment_type', e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Gross Salary (SGD) *</label>
                  <input type="number" step="0.01" min="0" value={form.gross_salary} onChange={e => f('gross_salary', e.target.value)}
                    placeholder="e.g. 4500"
                    className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-right font-mono" />
                </div>
              </div>

              {/* CPF Preview */}
              {cpf && form.gross_salary && parseFloat(form.gross_salary) > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 text-sm">
                  <p className="font-medium text-blue-900 mb-2">CPF Calculation Preview</p>
                  {form.nationality === 'SG_PR' && parseFloat(form.gross_salary) > CPF_OW_CEILING && (
                    <p className="text-xs text-blue-600 mb-2">OW capped at SGD {CPF_OW_CEILING.toLocaleString()}</p>
                  )}
                  <div className="space-y-1 text-blue-800">
                    <div className="flex justify-between"><span>Employee CPF deduction</span><span className="font-mono">({sgd(cpf.cpfEmployee)})</span></div>
                    <div className="flex justify-between"><span>Net take-home salary</span><span className="font-mono font-semibold">{sgd(cpf.netSalary)}</span></div>
                    <div className="border-t border-blue-200 pt-1 mt-1">
                      <div className="flex justify-between"><span>Employer CPF contribution</span><span className="font-mono">{sgd(cpf.cpfEmployer)}</span></div>
                      <div className="flex justify-between text-blue-600"><span>SDL</span><span className="font-mono">{sgd(cpf.sdl)}</span></div>
                      <div className="flex justify-between font-semibold border-t border-blue-200 pt-1 mt-1">
                        <span>Total employer cost</span>
                        <span className="font-mono">{sgd(parseFloat(form.gross_salary) + cpf.cpfEmployer + cpf.sdl)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
