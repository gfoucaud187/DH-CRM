'use client'

import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, MapPin, Phone, Mail, Camera, Trash2, X, ChevronDown, ChevronUp, Edit, Save, ArrowLeft } from 'lucide-react'

const EU_COUNTRIES = [
  { code: 'AT', name: 'Austria', flag: '🇦🇹' }, { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' }, { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' }, { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' }, { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' }, { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', name: 'United States', flag: '🇺🇸' }, { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' }, { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' }, { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' }, { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰' }, { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺' }, { code: 'MC', name: 'Monaco', flag: '🇲🇨' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦' }, { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' }, { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
].sort((a, b) => a.name.localeCompare(b.name))

const emptyForm = () => ({
  shop_name: '', country: '', street: '', city: '', postal_code: '',
  contacts: [] as any[], photos: [] as string[], comments: '',
})

export default function RetailersPage() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'new' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: retailers = [], isLoading } = useQuery({
    queryKey: ['retailers'],
    queryFn: async () => {
      const { data } = await supabase.from('retailers').select('*').order('shop_name')
      return data ?? []
    }
  })

  const filtered = (retailers as any[]).filter((r: any) =>
    !search ||
    r.shop_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.city?.toLowerCase().includes(search.toLowerCase()) ||
    r.country?.toLowerCase().includes(search.toLowerCase())
  )

  const openNew = () => { setForm(emptyForm()); setEditingId(null); setView('new') }
  const openEdit = (r: any) => {
    setForm({
      shop_name: r.shop_name ?? '',
      country: r.country ?? '',
      street: r.street ?? '',
      city: r.city ?? '',
      postal_code: r.postal_code ?? '',
      contacts: r.contacts ?? [],
      photos: r.photos ?? [],
      comments: r.comments ?? '',
    })
    setEditingId(r.id)
    setView('edit')
  }

  const handleSave = async () => {
    if (!form.shop_name.trim()) return alert('Shop name is required')
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    if (editingId) {
      await supabase.from('retailers').update(payload).eq('id', editingId)
    } else {
      await supabase.from('retailers').insert(payload)
    }
    queryClient.invalidateQueries({ queryKey: ['retailers'] })
    setView('list')
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this retailer?')) return
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
      setForm(f => ({ ...f, photos: [...f.photos, urlData.publicUrl] }))
    } catch (err: any) { alert('Error: ' + err.message) }
    setUploadingPhoto(false)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const removePhoto = (url: string) => setForm(f => ({ ...f, photos: f.photos.filter(p => p !== url) }))

  const addContact = () => setForm(f => ({ ...f, contacts: [...f.contacts, { first_name: '', last_name: '', email: '', mobile: '' }] }))
  const removeContact = (i: number) => setForm(f => ({ ...f, contacts: f.contacts.filter((_, idx) => idx !== i) }))
  const updateContact = (i: number, field: string, value: string) =>
    setForm(f => ({ ...f, contacts: f.contacts.map((c, idx) => idx === i ? { ...c, [field]: value } : c) }))

  const countryFlag = (code: string) => EU_COUNTRIES.find(c => c.code === code)?.flag ?? '🌍'
  const countryName = (code: string) => EU_COUNTRIES.find(c => c.code === code)?.name ?? code

  // ── FORM VIEW ──
  if (view === 'new' || view === 'edit') {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{view === 'new' ? 'Add Retailer' : 'Edit ' + form.shop_name}</h1>
            <p className="text-gray-500 text-sm mt-0.5">Retail shop profile</p>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="space-y-5">
          {/* Shop Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Shop Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 uppercase">Shop Name *</label>
                <input value={form.shop_name} onChange={e => setForm(f => ({ ...f, shop_name: e.target.value }))}
                  placeholder="e.g. La Casa del Habano Paris"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Country</label>
                <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="">Select country...</option>
                  {EU_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">City</label>
                <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 uppercase">Street & Number</label>
                <input value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                  placeholder="e.g. 156 Rue Saint-Honoré"
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Postal Code</label>
                <input value={form.postal_code} onChange={e => setForm(f => ({ ...f, postal_code: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-gray-500 uppercase">Comments</label>
              <textarea value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
                rows={3} placeholder="Visit notes, product preferences, key info..."
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>
          </div>

          {/* Contacts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Contacts</h2>
              <button onClick={addContact}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Plus className="h-3.5 w-3.5" /> Add contact
              </button>
            </div>
            {form.contacts.length === 0 ? (
              <p className="text-sm text-gray-400">No contacts yet — add the people you met</p>
            ) : (
              <div className="space-y-3">
                {form.contacts.map((c, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      <div>
                        <label className="text-xs text-gray-400">First Name</label>
                        <input value={c.first_name} onChange={e => updateContact(i, 'first_name', e.target.value)}
                          className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Last Name</label>
                        <input value={c.last_name} onChange={e => updateContact(i, 'last_name', e.target.value)}
                          className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Email</label>
                        <input value={c.email} onChange={e => updateContact(i, 'email', e.target.value)}
                          type="email"
                          className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                      </div>
                      <div className="flex gap-1">
                        <div className="flex-1">
                          <label className="text-xs text-gray-400">Mobile</label>
                          <input value={c.mobile} onChange={e => updateContact(i, 'mobile', e.target.value)}
                            className="mt-1 w-full h-8 rounded border border-gray-200 px-2 text-sm focus:outline-none" />
                        </div>
                        <button onClick={() => removeContact(i)} className="mt-5 text-gray-300 hover:text-red-500 flex-shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Photos */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Photos</h2>
              <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                <Camera className="h-3.5 w-3.5" />
                {uploadingPhoto ? 'Uploading...' : 'Add photo'}
              </button>
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload} className="hidden" />
            </div>
            {form.photos.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
                <Camera className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No photos yet</p>
                <p className="text-xs text-gray-300 mt-1">JPEG, PNG or WebP · max 5MB</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {form.photos.map((url, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden aspect-square">
                    <img src={url} alt={`Photo ${i+1}`} className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(url)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => photoInputRef.current?.click()}
                  className="aspect-square border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors">
                  <Plus className="h-6 w-6" />
                  <span className="text-xs mt-1">Add</span>
                </button>
              </div>
            )}
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
          <h1 className="text-2xl font-bold text-gray-900">Retailers</h1>
          <p className="text-gray-500 text-sm mt-0.5">{(retailers as any[]).length} shops in database</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Plus className="h-4 w-4" /> Add retailer
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search by shop name, city, country..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-3 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MapPin className="h-8 w-8 mx-auto mb-2" />
          <p>{search ? 'No retailers match your search' : 'No retailers yet — add your first shop!'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r: any) => {
            const isExpanded = expandedId === r.id
            const contacts = r.contacts ?? []
            const photos = r.photos ?? []
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                  <div className="text-2xl">{countryFlag(r.country)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{r.shop_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {(r.city || r.country) && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[r.city, countryName(r.country)].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {contacts.length > 0 && (
                        <span className="text-xs text-gray-400">· {contacts.length} contact{contacts.length > 1 ? 's' : ''}</span>
                      )}
                      {photos.length > 0 && (
                        <span className="text-xs text-gray-400">· {photos.length} photo{photos.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); openEdit(r) }}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(r.id) }}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                    {/* Address */}
                    {(r.street || r.postal_code) && (
                      <div className="flex items-start gap-2 text-sm text-gray-600">
                        <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span>{[r.street, r.postal_code, r.city].filter(Boolean).join(', ')}</span>
                      </div>
                    )}

                    {/* Contacts */}
                    {contacts.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">Contacts</p>
                        <div className="space-y-2">
                          {contacts.map((c: any, i: number) => (
                            <div key={i} className="flex items-center gap-4 text-sm">
                              <span className="font-medium text-gray-800 w-32 truncate">
                                {[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Contact ' + (i+1)}
                              </span>
                              {c.email && (
                                <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-800">
                                  <Mail className="h-3.5 w-3.5" />{c.email}
                                </a>
                              )}
                              {c.mobile && (
                                <a href={`tel:${c.mobile}`} className="flex items-center gap-1 text-gray-500 hover:text-gray-800">
                                  <Phone className="h-3.5 w-3.5" />{c.mobile}
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Comments */}
                    {r.comments && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">Comments</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.comments}</p>
                      </div>
                    )}

                    {/* Photos */}
                    {photos.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">Photos</p>
                        <div className="flex gap-2 flex-wrap">
                          {photos.map((url: string, i: number) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity">
                              <img src={url} alt={`Photo ${i+1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-300">
                      Added {new Date(r.created_at).toLocaleDateString('en-GB')}
                      {r.updated_at !== r.created_at && ` · Updated ${new Date(r.updated_at).toLocaleDateString('en-GB')}`}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}