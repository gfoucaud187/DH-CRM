'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { COUNTRIES } from '@/lib/countries'

const CURRENCIES   = ['USD', 'EUR', 'GBP']
const PARTNER_TYPES = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'agent',    label: 'Agent' },
  { value: 'broker',   label: 'Broker' },
]

const COUNTRY_LIST = COUNTRIES.map(c => ({
  ...c,
  name: new Intl.DisplayNames(['en'], { type: 'region' }).of(c.code) ?? c.name
})).sort((a, b) => a.name.localeCompare(b.name))

export default function EditPartnerPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const isNew = id === 'new'
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [name, setName]               = useState('')
  const [type, setType]               = useState('supplier')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress]         = useState('')
  const [city, setCity]               = useState('')
  const [country, setCountry]         = useState('')
  const [vatNumber, setVatNumber]     = useState('')
  const [paymentTerms, setPaymentTerms] = useState('Net 30')
  const [currency, setCurrency]       = useState('USD')
  const [notes, setNotes]             = useState('')
  const [status, setStatus]           = useState('active')
  const [saving, setSaving]           = useState(false)

  const { data: partner, isLoading } = useQuery({
    queryKey: ['partner', id],
    queryFn: async () => {
      if (isNew) return null
      const { data } = await supabase.from('partners').select('*').eq('id', id).single()
      return data
    }
  })

  useEffect(() => {
    if (!partner) return
    setName(partner.name ?? '')
    setType(partner.type ?? 'supplier')
    setContactName(partner.contact_name ?? '')
    setContactEmail(partner.contact_email ?? '')
    setContactPhone(partner.contact_phone ?? '')
    setAddress(partner.address ?? '')
    setCity(partner.city ?? '')
    setCountry(partner.country ?? '')
    setVatNumber(partner.vat_number ?? '')
    setPaymentTerms(partner.payment_terms ?? 'Net 30')
    setCurrency(partner.currency ?? 'USD')
    setNotes(partner.notes ?? '')
    setStatus(partner.status ?? 'active')
  }, [partner])

  const handleSave = async () => {
    if (!name.trim()) { alert('Name is required'); return }
    setSaving(true)

    const payload = {
      name, type,
      contact_name:  contactName  || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      address:       address      || null,
      city:          city         || null,
      country:       country      || null,
      vat_number:    vatNumber    || null,
      payment_terms: paymentTerms || null,
      currency,
      notes:         notes        || null,
      status,
      updated_at: new Date().toISOString(),
    }

    let error
    if (isNew) {
      const res = await supabase.from('partners').insert(payload)
      error = res.error
    } else {
      const res = await supabase.from('partners').update(payload).eq('id', id as string)
      error = res.error
    }

    setSaving(false)
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['partners'] })
      router.push('/partners')
    } else {
      alert('Error: ' + error.message)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this partner?')) return
    await supabase.from('partners').delete().eq('id', id as string)
    queryClient.invalidateQueries({ queryKey: ['partners'] })
    router.push('/partners')
  }

  if (!isNew && isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/partners" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'New Partner' : name}</h1>
          <p className="text-gray-500 text-sm">Partner profile</p>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
            <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="space-y-6">

        {/* General */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">General Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Company Name *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {PARTNER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Contact Name</label>
              <input value={contactName} onChange={e => setContactName(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Email</label>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Phone</label>
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Address</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Street Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">City</label>
              <input value={city} onChange={e => setCity(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Country</label>
              <select value={country} onChange={e => setCountry(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">Select country...</option>
                {COUNTRY_LIST.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Commercial */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Commercial Terms</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Payment Terms</label>
              <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">VAT Number</label>
              <input value={vatNumber} onChange={e => setVatNumber(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Notes</h2>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
        </div>

      </div>
    </div>
  )
}