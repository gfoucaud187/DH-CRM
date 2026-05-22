'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

const SHAPES = ['Robusto', 'Toro', 'Churchill', 'Corona', 'Petit Corona', 'Lancero', 'Belicoso', 'Torpedo', 'Gordo', 'Minuto', 'Perfecto', 'Other']
const PACK_TYPES = ['Box', 'Bundle', 'Tube', 'Jar', 'Tin', 'Other']
const STATUSES = ['active', 'inactive', 'discontinued']

export default function NewProductPage() {
  const router = useRouter()
  const supabase = createClient()

  const [sku, setSku] = useState('')
  const [fullName, setFullName] = useState('')
  const [brand, setBrand] = useState('')
  const [line, setLine] = useState('')
  const [vitola, setVitola] = useState('')
  const [shape, setShape] = useState('')
  const [wrapper, setWrapper] = useState('')
  const [binder, setBinder] = useState('')
  const [filler, setFiller] = useState('')
  const [unitsPerPack, setUnitsPerPack] = useState('')
  const [packType, setPackType] = useState('Box')
  const [fixmerReference, setFixmerReference] = useState('')
  const [euCegId, setEuCegId] = useState('')
  const [status, setStatus] = useState('active')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!sku) return alert('SKU is required')
    if (!fullName) return alert('Product name is required')
    setSaving(true)
    const { error } = await supabase.from('products').insert({
      sku,
      full_name: fullName,
      brand: brand || null,
      line: line || null,
      vitola: vitola || null,
      shape: shape || null,
      wrapper: wrapper || null,
      binder: binder || null,
      filler: filler || null,
      units_per_pack: unitsPerPack ? parseInt(unitsPerPack) : null,
      pack_type: packType || null,
      fixmer_reference: fixmerReference || null,
      eu_ceg_id: euCegId || null,
      status,
      notes: notes || null,
      product_role: 'original',
    })
    setSaving(false)
    if (!error) router.push('/products')
    else alert('Error: ' + error.message)
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/products" className="text-gray-400 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">New Product</h1>
          <p className="text-gray-500 text-sm">Add a new product to the catalogue</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Create Product'}
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Product Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">SKU (Ref. DH) *</label>
              <input value={sku} onChange={e => setSku(e.target.value.toUpperCase())}
                placeholder="e.g. NI-ROBUS-B10"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Full Name *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Nicarao Exclusivo Robusto B10"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Brand</label>
              <input value={brand} onChange={e => setBrand(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Line</label>
              <input value={line} onChange={e => setLine(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Vitola</label>
              <input value={vitola} onChange={e => setVitola(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Shape</label>
              <select value={shape} onChange={e => setShape(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">Select...</option>
                {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Blend</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Wrapper</label>
              <input value={wrapper} onChange={e => setWrapper(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Binder</label>
              <input value={binder} onChange={e => setBinder(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Filler</label>
              <input value={filler} onChange={e => setFiller(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Packaging & References</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Units per Pack</label>
              <input type="number" min="1" value={unitsPerPack} onChange={e => setUnitsPerPack(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Pack Type</label>
              <select value={packType} onChange={e => setPackType(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {PACK_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Ref. Fixmer</label>
              <input value={fixmerReference} onChange={e => setFixmerReference(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">EU-CEG ID</label>
              <input value={euCegId} onChange={e => setEuCegId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-gray-500 uppercase">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
          </div>
        </div>
      </div>
    </div>
  )
}