'use client'

import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, MapPin, Phone, Mail, Camera, Trash2, X, ChevronDown, ChevronUp, Edit, Save, ArrowLeft, Users, Store, User, Map, Download } from 'lucide-react'
import { logActivity } from '@/lib/log-activity'
import dynamic from 'next/dynamic'

const RetailersMap = dynamic(() => import('./map'), { ssr: false, loading: () => (
  <div className="flex items-center justify-center h-96 text-gray-400">
    <MapPin className="h-6 w-6 mr-2 animate-pulse" /> Loading map...
  </div>
) })

import { COUNTRIES, countryFlag, countryName } from '@/lib/countries'

const emptyShopForm = () => ({
  shop_name: '', country: '', street: '', city: '', postal_code: '',
  contacts: [] as any[], photos: [] as string[], comments: '',
})

const emptyB2cForm = () => ({
  first_name: '', last_name: '', email: '', mobile: '',
  country: '', retailer_id: '', event: '', comments: '',
})

export default function RetailersPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<'shops' | 'b2c' | 'map'>('shops')
  const [showExport, setShowExport] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'new' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [shopForm, setShopForm] = useState(emptyShopForm())
  const [b2cForm, setB2cForm] = useState(emptyB2cForm())
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: retailers = [] } = useQuery({
    queryKey: ['retailers'],
    queryFn: async () => {
      const { data } = await supabase.from('retailers').select('*').order('shop_name')
      return data ?? []
    }
  })

  const { data: b2cContacts = [] } = useQuery({
    queryKey: ['b2c-contacts'],
    queryFn: async () => {
      const { data } = await supabase.from('b2c_contacts').select('*').order('last_name')
      return data ?? []
    }
  })

  // ── SHOPS ──
  const filteredShops = (retailers as any[]).filter((r: any) =>
    !search ||
    r.shop_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.city?.toLowerCase().includes(search.toLowerCase()) ||
    r.country?.toLowerCase().includes(search.toLowerCase())
  )

  const exportCSV = () => {
    const isShops = tab !== 'b2c'
    const headers = isShops
      ? ['Shop Name', 'Country', 'City', 'Street', 'Postal Code', 'Comments']
      : ['First Name', 'Last Name', 'Email', 'Mobile', 'Country', 'Comments']
    const rows = isShops
      ? filteredShops.map((r: any) => [r.shop_name, r.country, r.city, r.street, r.postal_code, r.comments])
      : (b2cContacts as any[]).map((c: any) => [c.first_name, c.last_name, c.email, c.mobile, c.country, c.comments])
    const csv = [headers, ...rows].map(r => r.map((v: any) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = isShops ? 'retailers.csv' : 'b2c-contacts.csv'; a.click()
  }

  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const isShops = tab !== 'b2c'
    const rows = isShops
      ? filteredShops.map((r: any) => ({ 'Shop Name': r.shop_name, Country: r.country, City: r.city, Street: r.street, 'Postal Code': r.postal_code, Comments: r.comments }))
      : (b2cContacts as any[]).map((c: any) => ({ 'First Name': c.first_name, 'Last Name': c.last_name, Email: c.email, Mobile: c.mobile, Country: c.country, Comments: c.comments }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, isShops ? 'Retailers' : 'B2C Contacts')
    XLSX.writeFile(wb, isShops ? 'retailers.xlsx' : 'b2c-contacts.xlsx')
  }

  const openNewShop = () => { setShopForm(emptyShopForm()); setEditingId(null); setView('new') }
  const openEditShop = (r: any) => {
    setShopForm({
      shop_name: r.shop_name ?? '', country: r.country ?? '',
      street: r.street ?? '', city: r.city ?? '', postal_code: r.postal_code ?? '',
      contacts: r.contacts ?? [], photos: r.photos ?? [], comments: r.comments ?? '',
    })
    setEditingId(r.id); setView('edit')
  }

  const handleSaveShop = async () => {
    if (!shopForm.shop_name.trim()) return alert('Shop name is required')
    setSaving(true)
    const payload = { ...shopForm, updated_at: new Date().toISOString() }
    if (editingId) await supabase.from('retailers').update(payload).eq('id', editingId)
    else await supabase.from('retailers').insert(payload)
    await logActivity({
      action: editingId ? 'update_retailer' : 'create_retailer',
      entityType: 'retailer',
      entityId: editingId ?? undefined,
      entityRef: shopForm.shop_name,
      metadata: { city: shopForm.city || null, country: shopForm.country || null },
    })
    queryClient.invalidateQueries({ queryKey: ['retailers'] })
    setView('list'); setSaving(false)
  }

  const handleDeleteShop = async (id: string) => {
    if (!confirm('Delete this retailer?')) return
    const shop = (retailers as any[]).find((r: any) => r.id === id)
    await logActivity({
      action: 'delete_retailer',
      entityType: 'retailer',
      entityId: id,
      entityRef: shop?.shop_name,
    })
    await supabase.from('retailers').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['retailers'] })
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return alert('JPEG, PNG or WebP only')
    if (file.size > 5 * 1024 * 1024) return alert('Max 5MB')
    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('retailer-photos').upload(path, file, { contentType: file.type })
      if (error) { alert('Upload error: ' + error.message); return }
      const { data: urlData } = supabase.storage.from('retailer-photos').getPublicUrl(path)
      setShopForm(f => ({ ...f, photos: [...f.photos, urlData.publicUrl] }))
    } catch (err: any) { alert('Error: ' + err.message) }
    setUploadingPhoto(false)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const removePhoto = (url: string) => setShopForm(f => ({ ...f, photos: f.photos.filter(p => p !== url) }))
  const addContact = () => setShopForm(f => ({ ...f, contacts: [...f.contacts, { first_name: '', last_name: '', email: '', mobile: '' }] }))
  const removeContact = (i: number) => setShopForm(f => ({ ...f, contacts: f.contacts.filter((_, idx) => idx !== i) }))
  const updateContact = (i: number, field: string, value: string) =>
    setShopForm(f => ({ ...f, contacts: f.contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c) }))

  // ── B2C ──
  const filteredB2c = (b2cContacts as any[]).filter((c: any) =>
    !search ||
    c.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.last_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.event?.toLowerCase().includes(search.toLowerCase()) ||
    c.country?.toLowerCase().includes(search.toLowerCase())
  )

  const openNewB2c = () => { setB2cForm(emptyB2cForm()); setEditingId(null); setView('new') }
  const openEditB2c = (c: any) => {
    setB2cForm({
      first_name: c.first_name ?? '', last_name: c.last_name ?? '',
      email: c.email ?? '', mobile: c.mobile ?? '',
      country: c.country ?? '', retailer_id: c.retailer_id ?? '',
      event: c.event ?? '', comments: c.comments ?? '',
    })
    setEditingId(c.id); setView('edit')
  }

  const handleSaveB2c = async () => {
    if (!b2cForm.first_name && !b2cForm.last_name) return alert('At least a name is required')
    setSaving(true)
    const payload = { ...b2cForm, retailer_id: b2cForm.retailer_id || null }
    if (editingId) await supabase.from('b2c_contacts').update(payload).eq('id', editingId)
    else await supabase.from('b2c_contacts').insert(payload)
    await logActivity({
      action: editingId ? 'update_b2c_contact' : 'create_b2c_contact',
      entityType: 'b2c_contact',
      entityId: editingId ?? undefined,
      entityRef: `${b2cForm.first_name} ${b2cForm.last_name}`.trim(),
      metadata: { event: b2cForm.event || null, country: b2cForm.country || null },
    })
    queryClient.invalidateQueries({ queryKey: ['b2c-contacts'] })
    setView('list'); setSaving(false)
  }

  const handleDeleteB2c = async (id: string) => {
    if (!confirm('Delete this contact?')) return
    const contact = (b2cContacts as any[]).find((c: any) => c.id === id)
    await logActivity({
      action: 'delete_b2c_contact',
      entityType: 'b2c_contact',
      entityId: id,
      entityRef: contact ? `${contact.first_name} ${contact.last_name}`.trim() : undefined,
    })
    await supabase.from('b2c_contacts').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['b2c-contacts'] })
  }

  // ── SHOP FORM ──
  if (view !== 'list' && tab === 'shops') {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{view === 'new' ? 'Add Shop' : 'Edit ' + shopForm.shop_name}</h1>
          </div>
          <button onClick={handleSaveShop} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Shop Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 uppercase">Shop Name *</label>
                <input value={shopForm.shop_name} onChange={e => setShopForm(f => ({ ...f, shop_name: e.target.value }))}
                  placeholder="e.g. La Casa del Habano Paris"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Country</label>
                <select value={shopForm.country} onChange={e => setShopForm(f => ({ ...f, country: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="">Select country...</option>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">City</label>
                <input value={shopForm.city} onChange={e => setShopForm(f => ({ ...f, city: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 uppercase">Street & Number</label>
                <input value={shopForm.street} onChange={e => setShopForm(f => ({ ...f, street: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Postal Code</label>
                <input value={shopForm.postal_code} onChange={e => setShopForm(f => ({ ...f, postal_code: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-gray-500 uppercase">Comments</label>
              <textarea value={shopForm.comments} onChange={e => setShopForm(f => ({ ...f, comments: e.target.value }))}
                rows={3} placeholder="Visit notes, product preferences..."
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Contacts</h2>
              <button onClick={addContact}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            {shopForm.contacts.length === 0
              ? <p className="text-sm text-gray-400">No contacts yet</p>
              : shopForm.contacts.map((c, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg mb-3">
                  <div className="grid grid-cols-4 gap-2">
                    {[['first_name','First Name'],['last_name','Last Name'],['email','Email'],['mobile','Mobile']].map(([field, label]) => (
                      <div key={field} className={field === 'email' ? 'relative' : ''}>
                        <label className="text-xs text-gray-400">{label}</label>
                        <input value={(c as any)[field]} onChange={e => updateContact(i, field, e.target.value)}
                          className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => removeContact(i)} className="mt-2 text-xs text-gray-400 hover:text-red-500">Remove</button>
                </div>
              ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Photos</h2>
              <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                <Camera className="h-3.5 w-3.5" />{uploadingPhoto ? 'Uploading...' : 'Add photo'}
              </button>
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
            </div>
            {shopForm.photos.length === 0
              ? <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">No photos yet</div>
              : <div className="grid grid-cols-3 gap-3">
                  {shopForm.photos.map((url, i) => (
                    <div key={i} className="relative group rounded-lg overflow-hidden aspect-square">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removePhoto(url)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => photoInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50">
                    <Plus className="h-6 w-6" />
                  </button>
                </div>}
          </div>
        </div>
      </div>
    )
  }

  // ── B2C FORM ──
  if (view !== 'list' && tab === 'b2c') {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {view === 'new' ? 'Add B2C Contact' : `Edit ${b2cForm.first_name} ${b2cForm.last_name}`}
            </h1>
          </div>
          <button onClick={handleSaveB2c} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 mb-2">Contact Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">First Name</label>
              <input value={b2cForm.first_name} onChange={e => setB2cForm(f => ({ ...f, first_name: e.target.value }))}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Last Name</label>
              <input value={b2cForm.last_name} onChange={e => setB2cForm(f => ({ ...f, last_name: e.target.value }))}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Email</label>
              <input type="email" value={b2cForm.email} onChange={e => setB2cForm(f => ({ ...f, email: e.target.value }))}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Mobile</label>
              <input value={b2cForm.mobile} onChange={e => setB2cForm(f => ({ ...f, mobile: e.target.value }))}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Country</label>
              <select value={b2cForm.country} onChange={e => setB2cForm(f => ({ ...f, country: e.target.value }))}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">Select country...</option>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Linked Retailer</label>
              <select value={b2cForm.retailer_id} onChange={e => setB2cForm(f => ({ ...f, retailer_id: e.target.value }))}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">None</option>
                {(retailers as any[]).map((r: any) => (
                  <option key={r.id} value={r.id}>{countryFlag(r.country)} {r.shop_name} — {r.city}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Event / Occasion</label>
              <input value={b2cForm.event} onChange={e => setB2cForm(f => ({ ...f, event: e.target.value }))}
                placeholder="e.g. ProCigar 2026, Geneva Nov 2025, Cannes Film Festival..."
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Comments</label>
              <textarea value={b2cForm.comments} onChange={e => setB2cForm(f => ({ ...f, comments: e.target.value }))}
                rows={3} placeholder="Preferences, notes..."
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── LIST VIEW ──
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Retailers & Contacts</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {(retailers as any[]).length} shops · {(b2cContacts as any[]).length} B2C contacts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab !== 'map' && (
            <div className="relative">
              <button onClick={() => setShowExport(v => !v)}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                <Download className="h-4 w-4" /> Export
              </button>
              {showExport && (
                <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                  <button onClick={() => { exportExcel(); setShowExport(false) }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-t-lg">Excel (.xlsx)</button>
                  <button onClick={() => { exportCSV(); setShowExport(false) }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-b-lg">CSV (.csv)</button>
                </div>
              )}
            </div>
          )}
          <button onClick={tab === 'shops' ? openNewShop : tab === 'b2c' ? openNewB2c : undefined}
            className={`flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors ${tab === 'map' ? 'invisible' : ''}`}>
            <Plus className="h-4 w-4" /> {tab === 'shops' ? 'Add shop' : 'Add contact'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => { setTab('shops'); setSearch('') }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'shops' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Store className="h-4 w-4" /> Shops
          <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{(retailers as any[]).length}</span>
        </button>
        <button onClick={() => { setTab('b2c'); setSearch('') }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'b2c' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Users className="h-4 w-4" /> B2C Contacts
          <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{(b2cContacts as any[]).length}</span>
        </button>
        <button onClick={() => { setTab('map'); setSearch('') }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Map className="h-4 w-4" /> Map
        </button>
      </div>

      {/* Search — hidden on map */}
      {tab !== 'map' && (
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input type="text"
          placeholder={tab === 'shops' ? 'Search by shop, city, country...' : 'Search by name, email, event, country...'}
          value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none" />
      </div>
      )}

      {/* ── SHOPS LIST ── */}
      {tab === 'shops' && (
        filteredShops.length === 0
          ? <div className="text-center py-16 text-gray-400">
              <Store className="h-8 w-8 mx-auto mb-2" />
              <p>{search ? 'No shops match' : 'No shops yet'}</p>
            </div>
          : <div className="space-y-2">
              {filteredShops.map((r: any) => {
                const isExpanded = expandedId === r.id
                const contacts = r.contacts ?? []
                const photos = r.photos ?? []
                return (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                      <div className="text-2xl">{countryFlag(r.country)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{r.shop_name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {(r.city || r.country) && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {[r.city, countryName(r.country)].filter(Boolean).join(', ')}
                            </span>
                          )}
                          {contacts.length > 0 && <span className="text-xs text-gray-400">· {contacts.length} contact{contacts.length > 1 ? 's' : ''}</span>}
                          {photos.length > 0 && <span className="text-xs text-gray-400">· {photos.length} photo{photos.length > 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={e => { e.stopPropagation(); openEditShop(r) }} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><Edit className="h-4 w-4" /></button>
                        <button onClick={e => { e.stopPropagation(); handleDeleteShop(r.id) }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                        {(r.street || r.postal_code) && (
                          <div className="flex items-start gap-2 text-sm text-gray-600">
                            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span>{[r.street, r.postal_code, r.city].filter(Boolean).join(', ')}</span>
                          </div>
                        )}
                        {contacts.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase mb-2">Contacts</p>
                            <div className="space-y-2">
                              {contacts.map((c: any, i: number) => (
                                <div key={i} className="flex items-center gap-4 text-sm">
                                  <span className="font-medium text-gray-800 w-32 truncate">{[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Contact ' + (i+1)}</span>
                                  {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-800"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
                                  {c.mobile && <a href={`tel:${c.mobile}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-800"><Phone className="h-3.5 w-3.5" />{c.mobile}</a>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {r.comments && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Comments</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.comments}</p>
                          </div>
                        )}
                        {photos.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase mb-2">Photos</p>
                            <div className="flex gap-2 flex-wrap">
                              {photos.map((url: string, i: number) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90">
                                  <img src={url} alt="" className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* B2C contacts linked to this shop */}
                        {(() => {
                          const linked = (b2cContacts as any[]).filter((c: any) => c.retailer_id === r.id)
                          if (!linked.length) return null
                          return (
                            <div>
                              <p className="text-xs font-medium text-gray-500 uppercase mb-2">B2C Contacts ({linked.length})</p>
                              <div className="space-y-1.5">
                                {linked.map((c: any) => (
                                  <div key={c.id} className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2 text-sm">
                                    <User className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                                    <span className="font-medium text-gray-800 w-36 truncate">
                                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                                    </span>
                                    {c.mobile && (
                                      <a href={`tel:${c.mobile}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-900 text-xs">
                                        <Phone className="h-3 w-3" />{c.mobile}
                                      </a>
                                    )}
                                    {c.email && (
                                      <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-900 text-xs">
                                        <Mail className="h-3 w-3" />{c.email}
                                      </a>
                                    )}
                                    {c.event && (
                                      <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full truncate max-w-40">{c.event}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                        <p className="text-xs text-gray-300">Added {new Date(r.created_at).toLocaleDateString('en-GB')}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
      )}

      {/* ── MAP ── */}
      {tab === 'map' && <RetailersMap />}
      {tab === 'b2c' && (
        filteredB2c.length === 0
          ? <div className="text-center py-16 text-gray-400">
              <Users className="h-8 w-8 mx-auto mb-2" />
              <p>{search ? 'No contacts match' : 'No B2C contacts yet — add people you meet at events'}</p>
            </div>
          : <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Retailer</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredB2c.map((c: any) => {
                    const linkedShop = (retailers as any[]).find((r: any) => r.id === c.retailer_id)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <User className="h-4 w-4 text-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</p>
                              {c.comments && <p className="text-xs text-gray-400 truncate max-w-40">{c.comments}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {c.country ? <span>{countryFlag(c.country)} {countryName(c.country)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"><Mail className="h-3 w-3" />{c.email}</a>}
                            {c.mobile && <a href={`tel:${c.mobile}`} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"><Phone className="h-3 w-3" />{c.mobile}</a>}
                            {!c.email && !c.mobile && <span className="text-gray-300 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.event
                            ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{c.event}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {linkedShop
                            ? <span className="text-xs text-gray-600">{countryFlag(linkedShop.country)} {linkedShop.shop_name}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEditB2c(c)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"><Edit className="h-3.5 w-3.5" /></button>
                            <button onClick={() => handleDeleteB2c(c.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
      )}
    </div>
  )
}