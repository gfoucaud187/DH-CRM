'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Save, Plus, Trash2, KeyRound } from 'lucide-react'

export default function PortalProfilePage() {
  const supabase = createClient()
  const router = useRouter()

  const [customer, setCustomer] = useState<any>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/portal-login'); return }
      const { data: profile } = await supabase
        .from('user_profiles').select('customer_id').eq('id', user.id).single()
      const { data: c } = await supabase
        .from('customers').select('*').eq('id', profile?.customer_id).single()
      if (c) { setCustomer(c); setContacts(c.contacts ?? []) }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('customers').update({ contacts }).eq('id', customer.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handlePasswordChange = async () => {
    setPwError('')
    if (newPassword.length < 6) { setPwError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setPwError(error.message); return }
    setNewPassword(''); setConfirmPassword('')
    setPwSaved(true)
    setTimeout(() => setPwSaved(false), 2000)
  }

  const addContact = () => setContacts(c => [...c, { name: '', role: '', email: '', phone: '' }])
  const removeContact = (i: number) => setContacts(c => c.filter((_, idx) => idx !== i))
  const updateContact = (i: number, field: string, value: string) =>
    setContacts(c => c.map((ct, idx) => idx === i ? { ...ct, [field]: value } : ct))

  if (!customer) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 text-sm mt-0.5">{customer.legal_name}</p>
      </div>

      {/* Company info (read-only) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">Company Information</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'Legal name',     value: customer.legal_name },
            { label: 'Country',        value: customer.country },
            { label: 'Currency',       value: customer.currency },
            { label: 'Price list',     value: customer.assigned_price_list },
            { label: 'Incoterms',      value: customer.incoterms },
            { label: 'Payment terms',  value: customer.payment_terms },
            { label: 'VAT number',     value: customer.vat_number },
            { label: 'Excise number',  value: customer.excise_number },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className="font-medium text-gray-900">{value ?? '—'}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">To update company information, please contact DH Signature.</p>
      </div>

      {/* Contacts (editable) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Contacts</h2>
          <button onClick={addContact}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
            <Plus className="h-3.5 w-3.5" /> Add contact
          </button>
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400">No contacts added yet</p>
        ) : contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-4 gap-3 mb-3 p-3 bg-gray-50 rounded-lg">
            <div>
              <label className="text-xs text-gray-400">Name</label>
              <input value={c.name} onChange={e => updateContact(i,'name',e.target.value)}
                className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Role</label>
              <input value={c.role} onChange={e => updateContact(i,'role',e.target.value)}
                className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Email</label>
              <input value={c.email} onChange={e => updateContact(i,'email',e.target.value)}
                className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400">Phone</label>
                <input value={c.phone} onChange={e => updateContact(i,'phone',e.target.value)}
                  className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
              </div>
              <button onClick={() => removeContact(i)} className="mb-0.5 text-gray-300 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <button onClick={handleSave} disabled={saving}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save contacts'}
        </button>
      </div>

      {/* Password */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-4 w-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Change Password</h2>
        </div>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">New password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Confirm password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
          </div>
          {pwError && <p className="text-red-500 text-xs">{pwError}</p>}
          {pwSaved && <p className="text-green-600 text-xs font-medium">✓ Password updated!</p>}
          <button onClick={handlePasswordChange}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            Update password
          </button>
        </div>
      </div>
    </div>
  )
}