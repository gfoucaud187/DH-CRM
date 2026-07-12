'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Save, Plus, Trash2, KeyRound, Send, CheckCircle, Clock, AlertCircle } from 'lucide-react'

const CONTACT_ROLES = ['Sales', 'Finance', 'Logistics', 'Marketing', 'Other']
const PHONE_TYPES = ['Mobile', 'Fix']
const INCOTERMS = ['EXW', 'FOB', 'CIF', 'DAP', 'DDP']

const EU_COUNTRIES = [
  { code: 'AT', name: 'Austria', flag: '🇦🇹', eu: true },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', eu: true },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', eu: true },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷', eu: true },
  { code: 'CY', name: 'Cyprus', flag: '🇨🇾', eu: true },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', eu: true },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', eu: true },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪', eu: true },
  { code: 'FI', name: 'Finland', flag: '🇫🇮', eu: true },
  { code: 'FR', name: 'France', flag: '🇫🇷', eu: true },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', eu: true },
  { code: 'GR', name: 'Greece', flag: '🇬🇷', eu: true },
  { code: 'HU', name: 'Hungary', flag: '🇭🇺', eu: true },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', eu: true },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', eu: true },
  { code: 'LV', name: 'Latvia', flag: '🇱🇻', eu: true },
  { code: 'LT', name: 'Lithuania', flag: '🇱🇹', eu: true },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺', eu: true },
  { code: 'MT', name: 'Malta', flag: '🇲🇹', eu: true },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', eu: true },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', eu: true },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', eu: true },
  { code: 'RO', name: 'Romania', flag: '🇷🇴', eu: true },
  { code: 'SK', name: 'Slovakia', flag: '🇸🇰', eu: true },
  { code: 'SI', name: 'Slovenia', flag: '🇸🇮', eu: true },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', eu: true },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', eu: true },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', eu: false },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', eu: false },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', eu: false },
  { code: 'CN', name: 'China', flag: '🇨🇳', eu: false },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰', eu: false },
  { code: 'IN', name: 'India', flag: '🇮🇳', eu: false },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', eu: false },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', eu: false },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦', eu: false },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', eu: false },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', eu: false },
  { code: 'RU', name: 'Russia', flag: '🇷🇺', eu: false },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', eu: false },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', eu: false },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', eu: false },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', eu: false },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', eu: false },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', eu: false },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', eu: false },
  { code: 'US', name: 'United States', flag: '🇺🇸', eu: false },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', eu: false },
].sort((a, b) => a.name.localeCompare(b.name))

const EU_COUNTRY_CODES = new Set(EU_COUNTRIES.filter(c => c.eu).map(c => c.code))

export default function PortalProfilePage() {
  const supabase = createClient()
  const router = useRouter()

  const [customer, setCustomer] = useState<any>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingRequest, setPendingRequest] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const [legalName, setLegalName] = useState('')
  const [tradingName, setTradingName] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [exciseNumber, setExciseNumber] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [incoterms, setIncoterms] = useState('')
  const [isEuropean, setIsEuropean] = useState(false)
  const [euComplianceType, setEuComplianceType] = useState('')
  const [trackTrace, setTrackTrace] = useState(false)
  const [primaryRepository, setPrimaryRepository] = useState(false)
  const [fiscalWarehouseNumber, setFiscalWarehouseNumber] = useState('')
  const [contacts, setContacts] = useState<any[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [notes, setNotes] = useState('')

  // Password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaved, setPwSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/portal_login'); return }
      const { data: profile } = await supabase.from('user_profiles').select('customer_id').eq('id', user.id).single()
      setCustomerId(profile?.customer_id ?? null)
      const { data: c } = await supabase.from('customers').select('*').eq('id', profile?.customer_id).single()
      if (c) {
        setCustomer(c)
        setLegalName(c.legal_name ?? '')
        setTradingName(c.trading_name ?? '')
        setCountry(c.country ?? '')
        setRegion(c.region ?? '')
        setVatNumber(c.vat_number ?? '')
        setExciseNumber(c.excise_number ?? '')
        setPaymentTerms(c.payment_terms ?? '')
        setIncoterms(c.incoterms ?? '')
        setIsEuropean(c.is_european ?? false)
        setEuComplianceType(c.eu_compliance_type ?? '')
        setTrackTrace(c.track_trace_enabled ?? false)
        setPrimaryRepository(c.primary_repository ?? false)
        setFiscalWarehouseNumber(c.fiscal_warehouse_number ?? '')
        setContacts(c.contacts ?? [])
        setAddresses(c.addresses ?? [])
        setNotes(c.notes ?? '')
      }
      const { data: req } = await supabase.from('profile_change_requests')
        .select('*').eq('customer_id', profile?.customer_id).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setPendingRequest(req)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (country) setIsEuropean(EU_COUNTRY_CODES.has(country))
  }, [country])

  useEffect(() => {
    if (!customer) return
    const changed =
      legalName !== (customer.legal_name ?? '') ||
      tradingName !== (customer.trading_name ?? '') ||
      country !== (customer.country ?? '') ||
      region !== (customer.region ?? '') ||
      vatNumber !== (customer.vat_number ?? '') ||
      exciseNumber !== (customer.excise_number ?? '') ||
      paymentTerms !== (customer.payment_terms ?? '') ||
      incoterms !== (customer.incoterms ?? '') ||
      isEuropean !== (customer.is_european ?? false) ||
      euComplianceType !== (customer.eu_compliance_type ?? '') ||
      trackTrace !== (customer.track_trace_enabled ?? false) ||
      primaryRepository !== (customer.primary_repository ?? false) ||
      fiscalWarehouseNumber !== (customer.fiscal_warehouse_number ?? '') ||
      notes !== (customer.notes ?? '') ||
      JSON.stringify(contacts) !== JSON.stringify(customer.contacts ?? []) ||
      JSON.stringify(addresses) !== JSON.stringify(customer.addresses ?? [])
    setHasChanges(changed)
  }, [legalName, tradingName, country, region, vatNumber, exciseNumber, paymentTerms, incoterms, isEuropean, euComplianceType, trackTrace, primaryRepository, fiscalWarehouseNumber, contacts, addresses, notes, customer])

  const handleSubmitRequest = async () => {
    if (!hasChanges || !customer) return
    setSubmitting(true)
    const current: Record<string, any> = {}
    const requested: Record<string, any> = {}
    const fields = [
      { key: 'legal_name',              curr: customer.legal_name ?? '',              req: legalName },
      { key: 'trading_name',            curr: customer.trading_name ?? '',            req: tradingName },
      { key: 'country',                 curr: customer.country ?? '',                 req: country },
      { key: 'region',                  curr: customer.region ?? '',                  req: region },
      { key: 'vat_number',              curr: customer.vat_number ?? '',              req: vatNumber },
      { key: 'excise_number',           curr: customer.excise_number ?? '',           req: exciseNumber },
      { key: 'payment_terms',           curr: customer.payment_terms ?? '',           req: paymentTerms },
      { key: 'incoterms',               curr: customer.incoterms ?? '',               req: incoterms },
      { key: 'eu_compliance_type',      curr: customer.eu_compliance_type ?? '',      req: euComplianceType },
      { key: 'fiscal_warehouse_number', curr: customer.fiscal_warehouse_number ?? '', req: fiscalWarehouseNumber },
      { key: 'notes',                   curr: customer.notes ?? '',                   req: notes },
    ]
    fields.forEach(({ key, curr, req }) => {
      if (curr !== req) { current[key] = curr; requested[key] = req }
    })
    const boolFields = [
      { key: 'is_european',         curr: customer.is_european ?? false,         req: isEuropean },
      { key: 'track_trace_enabled', curr: customer.track_trace_enabled ?? false, req: trackTrace },
      { key: 'primary_repository',  curr: customer.primary_repository ?? false,  req: primaryRepository },
    ]
    boolFields.forEach(({ key, curr, req }) => {
      if (curr !== req) { current[key] = curr; requested[key] = req }
    })
    if (JSON.stringify(contacts) !== JSON.stringify(customer.contacts ?? [])) {
      current.contacts = customer.contacts ?? []; requested.contacts = contacts
    }
    if (JSON.stringify(addresses) !== JSON.stringify(customer.addresses ?? [])) {
      current.addresses = customer.addresses ?? []; requested.addresses = addresses
    }
    const { data, error } = await supabase.from('profile_change_requests').insert({
      customer_id: customer.id,
      customer_name: customer.legal_name,
      current_values: current,
      requested_changes: requested,
      status: 'pending',
    }).select().single()
    if (!error) {
      setPendingRequest(data); setSubmitted(true)
    }
    else alert('Error: ' + error.message)
    setSubmitting(false)
  }

  const handlePasswordChange = async () => {
    setPwError('')
    if (newPassword.length < 6) { setPwError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return }

    // Update Supabase auth password
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setPwError(error.message); return }

    // Also update portal_password in customers table so admin can see it
    if (customerId) {
      await supabase.from('customers').update({ portal_password: newPassword }).eq('id', customerId)
    }

    setNewPassword(''); setConfirmPassword('')
    setPwSaved(true); setTimeout(() => setPwSaved(false), 3000)
  }

  const addContact = () => setContacts(c => [...c, { first_name: '', last_name: '', role: 'Sales', email: '', phone: '', phone_type: 'Mobile' }])
  const removeContact = (i: number) => setContacts(c => c.filter((_, idx) => idx !== i))
  const updateContact = (i: number, field: string, value: string) =>
    setContacts(c => c.map((ct, idx) => idx === i ? { ...ct, [field]: value } : ct))

  const addAddress = () => setAddresses(a => [...a, { type: 'billing', street1: '', city: '', postal_code: '', country: '' }])
  const removeAddress = (i: number) => setAddresses(a => a.filter((_, idx) => idx !== i))
  const updateAddress = (i: number, field: string, value: string) =>
    setAddresses(a => a.map((ad, idx) => idx === i ? { ...ad, [field]: value } : ad))

  const disabled = !!pendingRequest
  const selectedCountry = EU_COUNTRIES.find(c => c.code === country)

  if (loading || !customer) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 text-sm mt-0.5">{customer.legal_name}</p>
      </div>

      {pendingRequest && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Modification request pending</p>
            <p className="text-sm text-amber-700 mt-0.5">Submitted {new Date(pendingRequest.created_at).toLocaleDateString()} — awaiting review by DH Signature. Fields are locked until approved.</p>
          </div>
        </div>
      )}

      {submitted && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <p className="text-sm font-medium text-green-800">Modification request submitted. DH Signature will review it shortly.</p>
        </div>
      )}

      {hasChanges && !pendingRequest && (
        <div className="mb-4 p-3 bg-gray-900 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-white text-sm">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            You have unsaved changes
          </div>
          <button onClick={handleSubmitRequest} disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-900 rounded-lg text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 transition-colors">
            <Send className="h-4 w-4" />
            {submitting ? 'Submitting...' : 'Submit for approval'}
          </button>
        </div>
      )}

      {/* General Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">General Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Legal Name</label>
            <input value={legalName} onChange={e => setLegalName(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Trading Name</label>
            <input value={tradingName} onChange={e => setTradingName(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Country</label>
            <select value={country} onChange={e => setCountry(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">Select country...</option>
              {EU_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}{c.eu ? ' 🇪🇺' : ''}</option>)}
            </select>
            {selectedCountry && <p className="text-xs text-gray-400 mt-1">{selectedCountry.eu ? '✅ EU member' : '❌ Non-EU'}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Region</label>
            <input value={region} onChange={e => setRegion(e.target.value)} disabled={disabled}
              placeholder="e.g. Western Europe, MENA..."
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">VAT Number</label>
            <input value={vatNumber} onChange={e => setVatNumber(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Excise Number</label>
            <input value={exciseNumber} onChange={e => setExciseNumber(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Incoterms</label>
            <select value={incoterms} onChange={e => setIncoterms(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400">
              {INCOTERMS.map(i => <option key={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">Payment Terms</label>
            <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} disabled={disabled}
              className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={disabled} rows={2}
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none disabled:bg-gray-50 disabled:text-gray-400" />
        </div>
        <p className="text-xs text-gray-400 mt-3">Read-only: Currency ({customer.currency}) · Status ({customer.status})</p>
      </div>

      {/* EU Compliance */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="font-semibold text-gray-900 mb-4">EU Compliance Declaration</h2>
        <p className="text-xs text-gray-400 mb-4">Please declare your compliance status accurately. Changes require DH Signature approval.</p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isEuropean} onChange={e => setIsEuropean(e.target.checked)} disabled={disabled} className="rounded w-4 h-4" />
            <span className="text-sm font-medium text-gray-700">🇪🇺 European client (EU member state)</span>
          </label>
          {isEuropean && (
            <div className="ml-7 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" value="TT" checked={euComplianceType === 'TT'} onChange={() => setEuComplianceType('TT')} disabled={disabled} />
                <div>
                  <p className="text-sm font-medium text-gray-700">Track & Trace (TT)</p>
                  <p className="text-xs text-gray-400">EMCS + TPD2 — mandatory since May 2024</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" value="PR" checked={euComplianceType === 'PR'} onChange={() => setEuComplianceType('PR')} disabled={disabled} />
                <div>
                  <p className="text-sm font-medium text-gray-700">Primary Repository (PR)</p>
                  <p className="text-xs text-gray-400">Authorized tax warehouse with contracted data storage</p>
                </div>
              </label>
              {euComplianceType === 'PR' && (
                <div className="ml-6 space-y-2 mt-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={primaryRepository} onChange={e => setPrimaryRepository(e.target.checked)} disabled={disabled} className="rounded" />
                    <span className="text-sm text-gray-700">Primary Repository contracted</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={trackTrace} onChange={e => setTrackTrace(e.target.checked)} disabled={disabled} className="rounded" />
                    <span className="text-sm text-gray-700">Track & Trace activated</span>
                  </label>
                  <div>
                    <label className="text-xs text-gray-400">Fiscal Warehouse Number</label>
                    <input value={fiscalWarehouseNumber} onChange={e => setFiscalWarehouseNumber(e.target.value)} disabled={disabled}
                      placeholder="e.g. BE00A00001234"
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm font-mono focus:outline-none disabled:bg-gray-50" />
                  </div>
                </div>
              )}
              {euComplianceType === 'TT' && (
                <div className="ml-6 mt-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={trackTrace} onChange={e => setTrackTrace(e.target.checked)} disabled={disabled} className="rounded" />
                    <span className="text-sm text-gray-700">Track & Trace activated</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Contacts</h2>
          {!disabled && (
            <button onClick={addContact}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          )}
        </div>
        {contacts.length === 0 ? <p className="text-sm text-gray-400">No contacts yet</p> :
          contacts.map((c, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded-lg mb-2">
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div>
                  <label className="text-xs text-gray-400">First Name</label>
                  <input value={c.first_name ?? c.name ?? ''} onChange={e => updateContact(i,'first_name',e.target.value)} disabled={disabled}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Last Name</label>
                  <input value={c.last_name ?? ''} onChange={e => updateContact(i,'last_name',e.target.value)} disabled={disabled}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Role</label>
                  <select value={CONTACT_ROLES.includes(c.role) ? c.role : 'Other'} onChange={e => updateContact(i,'role',e.target.value)} disabled={disabled}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50">
                    {CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Email</label>
                  <input value={c.email ?? ''} onChange={e => updateContact(i,'email',e.target.value)} disabled={disabled}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50" />
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <select value={c.phone_type ?? 'Mobile'} onChange={e => updateContact(i,'phone_type',e.target.value)} disabled={disabled}
                  className="h-8 rounded border border-gray-200 px-2 text-sm w-20 disabled:bg-gray-50">
                  {PHONE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <input value={c.phone ?? ''} onChange={e => updateContact(i,'phone',e.target.value)} disabled={disabled}
                  placeholder="Phone" className="flex-1 h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50" />
                {!disabled && <button onClick={() => removeContact(i)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
              </div>
            </div>
          ))}
      </div>

      {/* Addresses */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Addresses</h2>
          {!disabled && (
            <button onClick={addAddress}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          )}
        </div>
        {addresses.length === 0 ? <p className="text-sm text-gray-400">No addresses yet</p> :
          addresses.map((a, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded-lg mb-2">
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="col-span-3">
                  <label className="text-xs text-gray-400">Street</label>
                  <input value={a.street1 ?? ''} onChange={e => updateAddress(i,'street1',e.target.value)} disabled={disabled}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">City</label>
                  <input value={a.city ?? ''} onChange={e => updateAddress(i,'city',e.target.value)} disabled={disabled}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Postal Code</label>
                  <input value={a.postal_code ?? ''} onChange={e => updateAddress(i,'postal_code',e.target.value)} disabled={disabled}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Country</label>
                  <select value={a.country ?? ''} onChange={e => updateAddress(i,'country',e.target.value)} disabled={disabled}
                    className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none disabled:bg-gray-50">
                    <option value="">Select...</option>
                    {EU_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                  </select>
                </div>
              </div>
              {!disabled && <button onClick={() => removeAddress(i)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
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
          {pwSaved && (
            <p className="text-green-600 text-xs font-medium flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> Password updated! DH Signature can see your new password in your profile.
            </p>
          )}
          <button onClick={handlePasswordChange}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            Update password
          </button>
          <p className="text-xs text-gray-400">Your new password will be visible to DH Signature for support purposes.</p>
        </div>
      </div>
    </div>
  )
}