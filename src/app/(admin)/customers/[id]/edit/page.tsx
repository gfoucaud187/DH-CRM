'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'

const PRICE_LISTS = ['G', 'G1', 'A1', 'SPECIAL']
const CURRENCIES = ['USD', 'EUR', 'GBP']
const INCOTERMS = ['EXW', 'FOB', 'CIF', 'DAP', 'DDP']
const STATUSES = ['active', 'inactive', 'lead', 'dying', 'closed']

export default function EditCustomerPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [legalName, setLegalName] = useState('')
  const [tradingName, setTradingName] = useState('')
  const [country, setCountry] = useState('')
  const [status, setStatus] = useState('active')
  const [priceList, setPriceList] = useState('G')
  const [currency, setCurrency] = useState('USD')
  const [incoterms, setIncoterms] = useState('EXW')
  const [paymentTerms, setPaymentTerms] = useState('Net 30')
  const [vatNumber, setVatNumber] = useState('')
  const [exciseNumber, setExciseNumber] = useState('')
  const [fiscalWarehouse, setFiscalWarehouse] = useState('')
  const [trackTrace, setTrackTrace] = useState(false)
  const [isEuropean, setIsEuropean] = useState(false)
  const [euComplianceType, setEuComplianceType] = useState('')
  const [market, setMarket] = useState('')
  const [internalOwner, setInternalOwner] = useState('')
  const [salesManager, setSalesManager] = useState('')
  const [notes, setNotes] = useState('')
  const [contacts, setContacts] = useState<any[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer-edit', id],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', id).single()
      return data
    }
  })

  useEffect(() => {
    if (!customer) return
    setLegalName(customer.legal_name ?? '')
    setTradingName(customer.trading_name ?? '')
    setCountry(customer.country ?? '')
    setStatus(customer.status ?? 'active')
    setPriceList(customer.assigned_price_list ?? 'G')
    setCurrency(customer.currency ?? 'USD')
    setIncoterms(customer.incoterms ?? 'EXW')
    setPaymentTerms(customer.payment_terms ?? 'Net 30')
    setVatNumber(customer.vat_number ?? '')
    setExciseNumber(customer.excise_number ?? '')
    setFiscalWarehouse(customer.fiscal_warehouse_number ?? '')
    setTrackTrace(customer.track_trace_enabled ?? false)
    setIsEuropean(customer.is_european ?? false)
    setEuComplianceType(customer.eu_compliance_type ?? '')
    setMarket(customer.market ?? '')
    setInternalOwner(customer.internal_owner ?? '')
    setSalesManager(customer.sales_manager ?? '')
    setNotes(customer.notes ?? '')
    setContacts(customer.contacts ?? [])
    setAddresses(customer.addresses ?? [])
  }, [customer])

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('customers').update({
      legal_name: legalName,
      trading_name: tradingName || null,
      country,
      status,
      assigned_price_list: priceList,
      currency,
      incoterms,
      payment_terms: paymentTerms,
      vat_number: vatNumber || null,
      excise_number: exciseNumber || null,
      fiscal_warehouse_number: fiscalWarehouse || null,
      track_trace_enabled: trackTrace,
      is_european: isEuropean,
      eu_compliance_type: euComplianceType || null,
      market: market || null,
      internal_owner: internalOwner || null,
      sales_manager: salesManager || null,
      notes: notes || null,
      contacts,
      addresses,
    }).eq('id', id as string)
    setSaving(false)
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      router.push('/customers')
    } else {
      alert('Error: ' + error.message)
    }
  }

  const addContact = () => setContacts(c => [...c, { name: '', role: '', email: '', phone: '' }])
  const removeContact = (i: number) => setContacts(c => c.filter((_, idx) => idx !== i))
  const updateContact = (i: number, field: string, value: string) =>
    setContacts(c => c.map((ct, idx) => idx === i ? { ...ct, [field]: value } : ct))

  const addAddress = () => setAddresses(a => [...a, { type: 'office', company_name: '', street1: '', city: '', postal_code: '', country: '', is_default_billing: false, is_default_delivery: false }])
  const removeAddress = (i: number) => setAddresses(a => a.filter((_, idx) => idx !== i))
  const updateAddress = (i: number, field: string, value: any) =>
    setAddresses(a => a.map((ad, idx) => idx === i ? { ...ad, [field]: value } : ad))

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!customer) return <div className="text-center py-12 text-gray-400">Not found</div>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/customers" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Edit {customer.legal_name}</h1>
          <p className="text-gray-500 text-sm">Distributor profile</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">General Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Legal Name *</label>
              <input value={legalName} onChange={e => setLegalName(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Trading Name</label>
              <input value={tradingName} onChange={e => setTradingName(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Country</label>
              <input value={country} onChange={e => setCountry(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Market</label>
              <input value={market} onChange={e => setMarket(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Sales Manager</label>
              <input value={salesManager} onChange={e => setSalesManager(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Commercial Terms</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Price List</label>
              <select value={priceList} onChange={e => setPriceList(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {PRICE_LISTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Incoterms</label>
              <select value={incoterms} onChange={e => setIncoterms(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Payment Terms</label>
              <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">VAT Number</label>
              <input value={vatNumber} onChange={e => setVatNumber(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Excise Number</label>
              <input value={exciseNumber} onChange={e => setExciseNumber(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div className="col-span-3">
              <label className="text-xs font-medium text-gray-500 uppercase">Fiscal Warehouse Number</label>
              <input value={fiscalWarehouse} onChange={e => setFiscalWarehouse(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">European Compliance</h2>
          <div className="flex flex-wrap gap-6 mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isEuropean} onChange={e => setIsEuropean(e.target.checked)} className="rounded" />
              <span className="text-sm font-medium text-gray-700">European client</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={trackTrace} onChange={e => setTrackTrace(e.target.checked)} className="rounded" />
              <span className="text-sm font-medium text-gray-700">Track & Trace enabled</span>
            </label>
          </div>
          {isEuropean && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">EU Compliance Type</label>
              <div className="flex gap-4 mt-2">
                {['TT', 'PR', ''].map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={t} checked={euComplianceType === t} onChange={() => setEuComplianceType(t)} />
                    <span className="text-sm text-gray-700">{t || 'None'}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Contacts</h2>
            <button onClick={addContact}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" />Add
            </button>
          </div>
          {contacts.length === 0 ? <p className="text-sm text-gray-400">No contacts yet</p> :
            contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-4 gap-3 mb-3 p-3 bg-gray-50 rounded-lg">
                <div><label className="text-xs text-gray-400">Name</label>
                  <input value={c.name} onChange={e => updateContact(i,'name',e.target.value)}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                <div><label className="text-xs text-gray-400">Role</label>
                  <input value={c.role} onChange={e => updateContact(i,'role',e.target.value)}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                <div><label className="text-xs text-gray-400">Email</label>
                  <input value={c.email} onChange={e => updateContact(i,'email',e.target.value)}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                <div className="flex items-end gap-2">
                  <div className="flex-1"><label className="text-xs text-gray-400">Phone</label>
                    <input value={c.phone} onChange={e => updateContact(i,'phone',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                  <button onClick={() => removeContact(i)} className="mb-0.5 text-gray-300 hover:text-red-500">
                    <Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Addresses</h2>
            <button onClick={addAddress}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" />Add
            </button>
          </div>
          {addresses.length === 0 ? <p className="text-sm text-gray-400">No addresses yet</p> :
            addresses.map((a, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg mb-3">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div><label className="text-xs text-gray-400">Type</label>
                    <select value={a.type} onChange={e => updateAddress(i,'type',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none">
                      {['office','billing','delivery','warehouse'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select></div>
                  <div className="col-span-2"><label className="text-xs text-gray-400">Company name</label>
                    <input value={a.company_name} onChange={e => updateAddress(i,'company_name',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="col-span-3"><label className="text-xs text-gray-400">Street</label>
                    <input value={a.street1} onChange={e => updateAddress(i,'street1',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                  <div><label className="text-xs text-gray-400">City</label>
                    <input value={a.city} onChange={e => updateAddress(i,'city',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                  <div><label className="text-xs text-gray-400">Postal code</label>
                    <input value={a.postal_code} onChange={e => updateAddress(i,'postal_code',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                  <div><label className="text-xs text-gray-400">Country</label>
                    <input value={a.country} onChange={e => updateAddress(i,'country',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" /></div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={a.is_default_billing}
                      onChange={e => updateAddress(i,'is_default_billing',e.target.checked)} className="rounded" />
                    Default billing</label>
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={a.is_default_delivery}
                      onChange={e => updateAddress(i,'is_default_delivery',e.target.checked)} className="rounded" />
                    Default delivery</label>
                  <button onClick={() => removeAddress(i)} className="ml-auto text-gray-300 hover:text-red-500">
                    <Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
