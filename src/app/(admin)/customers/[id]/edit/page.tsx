'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Save, Plus, Trash2, Copy, Upload, X, AlertTriangle, Info, Globe } from 'lucide-react'
import Link from 'next/link'

const PRICE_LISTS = ['G', 'G1', 'A1', 'SPECIAL']
const CURRENCIES = ['USD', 'EUR', 'GBP']
const INCOTERMS = ['EXW', 'FOB', 'CIF', 'DAP', 'DDP']

const STATUSES = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'lead',     label: 'Lead' },
  { value: 'dying',    label: 'Dying' },
  { value: 'closed',   label: 'Closed' },
]

const CONTACT_ROLES = ['Sales', 'Finance', 'Logistics', 'Marketing', 'Other']
const PHONE_TYPES = ['Mobile', 'Fix']
const ADDRESS_TYPES = [
  { value: 'office',    label: 'Office' },
  { value: 'billing',   label: 'Billing' },
  { value: 'delivery',  label: 'Delivery' },
  { value: 'warehouse', label: 'Warehouse' },
]

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

const getDefaultStock = (isEu: boolean, complianceType: string) => {
  if (!isEu) return { default: 'Central', available: ['Central', 'T1'], note: 'Export via entrepôt fiscal (DAU/EX1). T1 possible for duty-suspended transit.' }
  if (complianceType === 'PR') return { default: 'T1', available: ['T1', 'Central'], note: 'Primary Repository — authorized tax warehouse. Access to T1 (duty suspended) and Central (EMCS).' }
  if (complianceType === 'TT') return { default: 'Central', available: ['Central'], note: 'Track & Trace via EMCS. Products must travel with e-AD under duty suspension from Central warehouse.' }
  return { default: 'Central', available: ['Central'], note: '⚠️ EU compliance type not configured. Set TT or PR to activate ordering.' }
}

export default function EditCustomerPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [legalName, setLegalName] = useState('')
  const [tradingName, setTradingName] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [status, setStatus] = useState('active')
  const [priceList, setPriceList] = useState('G')
  const [currency, setCurrency] = useState('USD')
  const [incoterms, setIncoterms] = useState('EXW')
  const [paymentTerms, setPaymentTerms] = useState('Net 30')
  const [vatNumber, setVatNumber] = useState('')
  const [exciseNumber, setExciseNumber] = useState('')
  const [internalOwner, setInternalOwner] = useState('')
  const [contactPersonFirstName, setContactPersonFirstName] = useState('')
  const [contactPersonLastName, setContactPersonLastName] = useState('')
  const [notes, setNotes] = useState('')
  const [contacts, setContacts] = useState<any[]>([])
  const [addresses, setAddresses] = useState<any[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)

  // EU Compliance
  const [isEuropean, setIsEuropean] = useState(false)
  const [euComplianceType, setEuComplianceType] = useState<'TT'|'PR'|''>('')
  const [trackTrace, setTrackTrace] = useState(false)
  const [tpdActivated, setTpdActivated] = useState(false)
  const [primaryRepository, setPrimaryRepository] = useState(false)
  const [prContracted, setPrContracted] = useState(false)
  const [authorizedWarehouse, setAuthorizedWarehouse] = useState(false)
  const [fiscalWarehouseNumber, setFiscalWarehouseNumber] = useState('')
  const [exportProcedure, setExportProcedure] = useState<'central'|'t1'|'both'>('central')

  // Portal Access
  const [portalStatus, setPortalStatus] = useState('not_invited')
  const [portalUserId, setPortalUserId] = useState('')
  const [portalEmail, setPortalEmail] = useState('')
  const [portalPassword, setPortalPassword] = useState('')

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer-edit', id],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('*').eq('id', id).single()
      return data
    }
  })

  useEffect(() => {
    if (country) setIsEuropean(EU_COUNTRY_CODES.has(country))
  }, [country])

  useEffect(() => {
    if (isEuropean && euComplianceType === '') setEuComplianceType('TT')
    if (!isEuropean) setEuComplianceType('')
  }, [isEuropean])

  useEffect(() => {
    if (!customer) return
    setLegalName(customer.legal_name ?? '')
    setTradingName(customer.trading_name ?? '')
    setCountry(customer.country ?? '')
    setRegion(customer.region ?? '')
    setStatus(customer.status ?? 'active')
    setPriceList(customer.assigned_price_list ?? 'G')
    setCurrency(customer.currency ?? 'USD')
    setIncoterms(customer.incoterms ?? 'EXW')
    setPaymentTerms(customer.payment_terms ?? 'Net 30')
    setVatNumber(customer.vat_number ?? '')
    setExciseNumber(customer.excise_number ?? '')
    setInternalOwner(customer.internal_owner ?? '')
    const nameParts = (customer.sales_manager ?? '').split(' ')
    setContactPersonFirstName(customer.contact_person_first_name ?? nameParts[0] ?? '')
    setContactPersonLastName(customer.contact_person_last_name ?? nameParts.slice(1).join(' ') ?? '')
    setNotes(customer.notes ?? '')
    setContacts(customer.contacts ?? [])
    setAddresses(customer.addresses ?? [])
    setLogoUrl(customer.logo_url ?? null)
    setLogoPreview(customer.logo_url ?? null)
    setIsEuropean(customer.is_european ?? false)
    setEuComplianceType(customer.eu_compliance_type ?? '')
    setTrackTrace(customer.track_trace_enabled ?? false)
    setTpdActivated(customer.tpd_activated ?? false)
    setPrimaryRepository(customer.primary_repository ?? false)
    setPrContracted(customer.pr_contracted ?? false)
    setAuthorizedWarehouse(customer.authorized_warehouse ?? false)
    setFiscalWarehouseNumber(customer.fiscal_warehouse_number ?? '')
    setExportProcedure(customer.export_procedure ?? 'central')
    setPortalStatus(customer.portal_status ?? 'not_invited')
    setPortalUserId(customer.portal_user_id ?? '')
    setPortalEmail(customer.portal_email ?? '')
    setPortalPassword(customer.portal_password ?? '')
  }, [customer])

  const stockInfo = getDefaultStock(isEuropean, euComplianceType)

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) { alert('Only JPEG and PNG allowed'); return }
    if (file.size > 200 * 1024) { alert('Max size is 200KB'); return }
    setUploadingLogo(true)
    try {
      const ext = file.type === 'image/png' ? 'png' : 'jpg'
      const path = `${id}/logo.${ext}`
      const { error } = await supabase.storage.from('customer-logos').upload(path, file, { upsert: true, contentType: file.type })
      if (error) { alert('Upload error: ' + error.message); return }
      const { data: urlData } = supabase.storage.from('customer-logos').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      setLogoUrl(url); setLogoPreview(url)
    } catch (err: any) { alert('Error: ' + err.message) }
    setUploadingLogo(false)
  }

  const handleRemoveLogo = async () => {
    if (!confirm('Remove logo?')) return
    await supabase.storage.from('customer-logos').remove([`${id}/logo.jpg`, `${id}/logo.png`])
    setLogoUrl(null); setLogoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('customers').update({
      legal_name: legalName, trading_name: tradingName || null,
      country, region: region || null, status,
      assigned_price_list: priceList, currency, incoterms,
      payment_terms: paymentTerms, vat_number: vatNumber || null,
      excise_number: exciseNumber || null,
      internal_owner: internalOwner || null,
      contact_person_first_name: contactPersonFirstName || null,
      contact_person_last_name: contactPersonLastName || null,
      sales_manager: [contactPersonFirstName, contactPersonLastName].filter(Boolean).join(' ') || null,
      notes: notes || null, contacts, addresses, logo_url: logoUrl || null,
      is_european: isEuropean, eu_compliance_type: euComplianceType || null,
      track_trace_enabled: trackTrace, tpd_activated: tpdActivated,
      primary_repository: primaryRepository, pr_contracted: prContracted,
      authorized_warehouse: authorizedWarehouse,
      fiscal_warehouse_number: fiscalWarehouseNumber || null,
      export_procedure: isEuropean ? null : exportProcedure,
      portal_status: portalStatus,
      portal_user_id: portalUserId || null,
      portal_email: portalEmail || null,
      portal_password: portalPassword || null,
    }).eq('id', id as string)

    // Link user to customer in user_profiles when activating
    if (!error && portalUserId && portalStatus === 'active') {
      await supabase.from('user_profiles').upsert({
        id: portalUserId,
        role: 'client',
        customer_id: id,
      })
    }

    setSaving(false)
    if (!error) { queryClient.invalidateQueries({ queryKey: ['customers'] }); router.push('/customers') }
    else alert('Error: ' + error.message)
  }

  const addContact = () => setContacts(c => [...c, { first_name: '', last_name: '', role: 'Sales', role_other: '', email: '', phone: '', phone_type: 'Mobile' }])
  const removeContact = (i: number) => setContacts(c => c.filter((_, idx) => idx !== i))
  const updateContact = (i: number, field: string, value: string) =>
    setContacts(c => c.map((ct, idx) => idx === i ? { ...ct, [field]: value } : ct))
  const copyContactName = (i: number) =>
    setContacts(c => c.map((ct, idx) => idx === i ? { ...ct, first_name: contactPersonFirstName, last_name: contactPersonLastName } : ct))

  const addAddress = () => setAddresses(a => [...a, { type: 'office', street1: '', city: '', postal_code: '', country: '', is_default_billing: false, is_default_delivery: false }])
  const removeAddress = (i: number) => setAddresses(a => a.filter((_, idx) => idx !== i))
  const updateAddress = (i: number, field: string, value: any) =>
    setAddresses(a => a.map((ad, idx) => idx === i ? { ...ad, [field]: value } : ad))

  const selectedCountry = EU_COUNTRIES.find(c => c.code === country)

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!customer) return <div className="text-center py-12 text-gray-400">Not found</div>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/customers" className="text-gray-400 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Edit {customer.legal_name}</h1>
          <p className="text-gray-500 text-sm">Distributor profile</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
          <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-6">

        {/* Logo */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Company Logo</h2>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
              {logoPreview
                ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                : <span className="text-gray-300 text-xs text-center">No logo</span>}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">JPEG or PNG, max 200KB.</p>
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  <Upload className="h-4 w-4" />{uploadingLogo ? 'Uploading...' : 'Upload logo'}
                </button>
                {logoPreview && (
                  <button onClick={handleRemoveLogo}
                    className="flex items-center gap-2 px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50">
                    <X className="h-4 w-4" /> Remove
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handleLogoUpload} className="hidden" />
            </div>
          </div>
        </div>

        {/* General Information */}
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
              <select value={country} onChange={e => setCountry(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">Select country...</option>
                {EU_COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}{c.eu ? ' 🇪🇺' : ''}</option>
                ))}
              </select>
              {selectedCountry && (
                <p className="text-xs mt-1 text-gray-400">
                  {selectedCountry.eu ? '✅ EU member — TPD2 compliance required' : '❌ Non-EU — export procedure applies'}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Region</label>
              <input value={region} onChange={e => setRegion(e.target.value)}
                placeholder="e.g. Western Europe, MENA..."
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Internal Owner</label>
              <input value={internalOwner} onChange={e => setInternalOwner(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Contact Person — First Name</label>
              <input value={contactPersonFirstName} onChange={e => setContactPersonFirstName(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Contact Person — Last Name</label>
              <input value={contactPersonLastName} onChange={e => setContactPersonLastName(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
          </div>
        </div>

        {/* Commercial Terms */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Commercial Terms</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Price List</label>
              <select value={priceList} onChange={e => setPriceList(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {PRICE_LISTS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Incoterms</label>
              <select value={incoterms} onChange={e => setIncoterms(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {INCOTERMS.map(i => <option key={i}>{i}</option>)}
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
          </div>
        </div>

        {/* Compliance & Stock Rules */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">Compliance & Stock Rules</h2>
            {isEuropean && euComplianceType === '' && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
                <AlertTriangle className="h-3.5 w-3.5" /> Compliance not configured
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-4">
            {selectedCountry
              ? `${selectedCountry.flag} ${selectedCountry.name} · ${selectedCountry.eu ? 'EU member state — TPD2 + EMCS required (since May 2024)' : 'Non-EU country — Export procedure via entrepôt fiscal'}`
              : 'Select a country to configure compliance rules'}
          </p>

          <div className="flex items-center gap-3 mb-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isEuropean} onChange={e => setIsEuropean(e.target.checked)} className="rounded w-4 h-4" />
              <span className="text-sm font-medium text-gray-700">🇪🇺 European client (EU member state)</span>
            </label>
            {isEuropean && euComplianceType !== '' && (
              <span className="ml-2 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full font-medium">TPD2 active since May 2024</span>
            )}
          </div>

          {isEuropean && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 block">EU Compliance Type *</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'TT', title: 'Track & Trace (TT)', desc: 'EMCS + TPD2. Products travel via e-AD under duty suspension. Stock: Central warehouse.', badge: 'Default for EU', color: 'border-blue-400 bg-blue-50', badgeColor: 'bg-blue-100 text-blue-700' },
                    { value: 'PR', title: 'Primary Repository (PR)', desc: 'Authorized tax warehouse. Contracted data storage for TPD2. Access: T1 + Central.', badge: 'Extended access', color: 'border-green-400 bg-green-50', badgeColor: 'bg-green-100 text-green-700' },
                    { value: '', title: '⚠️ Not configured', desc: 'EU compliance not set. Order creation will be blocked until TT or PR is configured.', badge: 'Blocked', color: 'border-red-300 bg-red-50', badgeColor: 'bg-red-100 text-red-600' },
                  ].map(opt => (
                    <label key={opt.value} className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${euComplianceType === opt.value ? opt.color : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <div className="flex items-start gap-3">
                        <input type="radio" value={opt.value} checked={euComplianceType === opt.value}
                          onChange={() => setEuComplianceType(opt.value as any)} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{opt.title}</p>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</p>
                          <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${opt.badgeColor}`}>{opt.badge}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {euComplianceType === 'TT' && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3">Track & Trace Configuration</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={trackTrace} onChange={e => setTrackTrace(e.target.checked)} className="rounded" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Track & Trace activated</p>
                        <p className="text-xs text-gray-400">Products carry Unique Identifiers (UI). Movements reported via EMCS e-AD.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={tpdActivated} onChange={e => setTpdActivated(e.target.checked)} className="rounded" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">TPD2 serialization active</p>
                        <p className="text-xs text-gray-400">EU Tobacco Products Directive 2014/40/EU — mandatory since May 2024 for OTP.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {euComplianceType === 'PR' && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                  <h3 className="text-sm font-semibold text-green-900 mb-3">Primary Repository Configuration</h3>
                  <div className="space-y-2 mb-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={primaryRepository} onChange={e => setPrimaryRepository(e.target.checked)} className="rounded" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Primary Repository contracted</p>
                        <p className="text-xs text-gray-400">Data storage module contracted and notified to EU regulators.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={trackTrace} onChange={e => setTrackTrace(e.target.checked)} className="rounded" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Track & Trace activated</p>
                        <p className="text-xs text-gray-400">Unique Identifiers active. Full EMCS reporting.</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={authorizedWarehouse} onChange={e => setAuthorizedWarehouse(e.target.checked)} className="rounded" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Authorized Tax Warehouse</p>
                        <p className="text-xs text-gray-400">Can receive T1 (duty suspended) stock.</p>
                      </div>
                    </label>
                  </div>
                  {authorizedWarehouse && (
                    <div>
                      <label className="text-xs font-medium text-gray-600 uppercase">Fiscal Warehouse Number</label>
                      <input value={fiscalWarehouseNumber} onChange={e => setFiscalWarehouseNumber(e.target.value)}
                        placeholder="e.g. BE00A00001234"
                        className="mt-1 w-full h-9 rounded-md border border-green-200 bg-white px-3 text-sm focus:outline-none font-mono" />
                    </div>
                  )}
                </div>
              )}

              <div className={`rounded-xl p-4 border ${euComplianceType === 'PR' ? 'bg-green-50 border-green-200' : euComplianceType === 'TT' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-800">Stock Assignment Rule</span>
                </div>
                <p className="text-sm text-gray-700">Default warehouse: <strong>{stockInfo.default}</strong>
                  {stockInfo.available.length > 1 && <span className="ml-2 text-xs text-gray-500">Available: {stockInfo.available.join(', ')}</span>}
                </p>
                <p className="text-xs text-gray-500 mt-1">{stockInfo.note}</p>
              </div>
            </div>
          )}

          {!isEuropean && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 block">Export Procedure</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'central', title: 'Central (Standard)', desc: 'Export via entrepôt fiscal. EX1/DAU document.', color: 'border-blue-400 bg-blue-50' },
                    { value: 't1',     title: 'T1 Transit',          desc: 'Duty-suspended transit. T1 document.',           color: 'border-amber-400 bg-amber-50' },
                    { value: 'both',   title: 'Both available',      desc: 'Central export and T1 transit.',                color: 'border-green-400 bg-green-50' },
                  ].map(opt => (
                    <label key={opt.value} className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${exportProcedure === opt.value ? opt.color : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <div className="flex items-start gap-3">
                        <input type="radio" value={opt.value} checked={exportProcedure === opt.value}
                          onChange={() => setExportProcedure(opt.value as any)} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{opt.title}</p>
                          <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-800">Stock Assignment Rule</span>
                </div>
                <p className="text-sm text-gray-700">Default warehouse: <strong>{stockInfo.default}</strong>
                  {stockInfo.available.length > 1 && <span className="ml-2 text-xs text-gray-500">Available: {stockInfo.available.join(', ')}</span>}
                </p>
                <p className="text-xs text-gray-500 mt-1">{stockInfo.note}</p>
              </div>
            </div>
          )}
        </div>

        {/* Portal Access */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Portal Access</h2>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
              portalStatus === 'active'      ? 'bg-green-100 text-green-700' :
              portalStatus === 'invited'     ? 'bg-blue-100 text-blue-700' :
              portalStatus === 'disabled'    ? 'bg-red-100 text-red-600' :
              'bg-gray-100 text-gray-500'
            }`}>
              {portalStatus === 'not_invited' ? 'Not invited' :
               portalStatus === 'invited'     ? 'Invited' :
               portalStatus === 'active'      ? 'Active' : 'Disabled'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Create the user in <strong>Supabase → Authentication → Users → Add user</strong> with email + password, then paste the UUID below and set Active.
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Status</label>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { value: 'not_invited', label: '⬜ Not invited', color: 'border-gray-200 text-gray-500' },
                  { value: 'invited',     label: '📧 Invited',     color: 'border-blue-300 text-blue-700 bg-blue-50' },
                  { value: 'active',      label: '✅ Active',      color: 'border-green-400 text-green-700 bg-green-50' },
                  { value: 'disabled',    label: '⛔ Disabled',    color: 'border-red-300 text-red-600 bg-red-50' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setPortalStatus(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                      portalStatus === opt.value ? opt.color : 'border-gray-200 text-gray-400 bg-white hover:bg-gray-50'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Supabase User ID (UUID)</label>
              <input value={portalUserId} onChange={e => setPortalUserId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm font-mono focus:outline-none" />
              <p className="text-xs text-gray-400 mt-1">Supabase → Authentication → Users → copy UUID of the user you created</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Portal Email</label>
                <input value={portalEmail} onChange={e => setPortalEmail(e.target.value)}
                  placeholder="email@dh.com"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none font-mono" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Portal Password</label>
                <input value={portalPassword} onChange={e => setPortalPassword(e.target.value)}
                  placeholder="temporary password"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none font-mono" />
                <p className="text-xs text-gray-400 mt-1">For reference only — distributor should change it</p>
              </div>
            </div>
            {portalStatus === 'active' && portalUserId && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700">
                ✅ Portal active — distributor can log in at <strong>/portal-login</strong>
              </div>
            )}
            {portalStatus === 'active' && !portalUserId && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                ⚠️ Status is Active but no User ID — please add the Supabase UUID
              </div>
            )}
            {portalStatus === 'disabled' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-600">
                ⛔ Portal disabled — distributor cannot access the portal
              </div>
            )}
          </div>
        </div>

        {/* Contacts */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Contacts</h2>
            <button onClick={addContact}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          {contacts.length === 0 ? <p className="text-sm text-gray-400">No contacts yet</p> :
            contacts.map((c, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg mb-3">
                <div className="grid grid-cols-5 gap-3 mb-2">
                  <div>
                    <label className="text-xs text-gray-400">First Name</label>
                    <input value={c.first_name ?? c.name ?? ''} onChange={e => updateContact(i,'first_name',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Last Name</label>
                    <input value={c.last_name ?? ''} onChange={e => updateContact(i,'last_name',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Role</label>
                    <select value={CONTACT_ROLES.includes(c.role) ? c.role : 'Other'}
                      onChange={e => updateContact(i,'role',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none">
                      {CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Email</label>
                    <input value={c.email ?? ''} onChange={e => updateContact(i,'email',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                  </div>
                  <div className="flex items-end gap-1">
                    <button onClick={() => copyContactName(i)} title="Copy contact person name"
                      className="mb-0.5 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeContact(i)}
                      className="mb-0.5 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {(c.role === 'Other' || !CONTACT_ROLES.includes(c.role)) && (
                  <div className="mb-2">
                    <input value={c.role_other ?? ''} onChange={e => updateContact(i,'role_other',e.target.value)}
                      placeholder="Specify role..."
                      className="w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                  </div>
                )}
                <div className="flex gap-3 mt-1">
                  <select value={c.phone_type ?? 'Mobile'} onChange={e => updateContact(i,'phone_type',e.target.value)}
                    className="h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none w-24 flex-shrink-0">
                    {PHONE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input value={c.phone ?? ''} onChange={e => updateContact(i,'phone',e.target.value)}
                    placeholder="Phone number"
                    className="flex-1 h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                </div>
              </div>
            ))}
        </div>

        {/* Addresses */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Addresses</h2>
            <button onClick={addAddress}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          {addresses.length === 0 ? <p className="text-sm text-gray-400">No addresses yet</p> :
            addresses.map((a, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg mb-3">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-400">Type</label>
                    <select value={a.type} onChange={e => updateAddress(i,'type',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none">
                      {ADDRESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400">Street</label>
                    <input value={a.street1 ?? ''} onChange={e => updateAddress(i,'street1',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-400">City</label>
                    <input value={a.city ?? ''} onChange={e => updateAddress(i,'city',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Postal Code</label>
                    <input value={a.postal_code ?? ''} onChange={e => updateAddress(i,'postal_code',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Country</label>
                    <select value={a.country ?? ''} onChange={e => updateAddress(i,'country',e.target.value)}
                      className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none">
                      <option value="">Select...</option>
                      {EU_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={a.is_default_billing ?? false}
                      onChange={e => updateAddress(i,'is_default_billing',e.target.checked)} className="rounded" />
                    Default billing
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={a.is_default_delivery ?? false}
                      onChange={e => updateAddress(i,'is_default_delivery',e.target.checked)} className="rounded" />
                    Default delivery
                  </label>
                  <button onClick={() => removeAddress(i)} className="ml-auto text-gray-300 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>

      </div>
    </div>
  )
}