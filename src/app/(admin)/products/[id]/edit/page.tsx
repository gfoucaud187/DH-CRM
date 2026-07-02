'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Copy } from 'lucide-react'
import Link from 'next/link'
import { logActivity } from '@/lib/log-activity'

const SHAPES = ['Round', 'Pointed', 'Figurado', 'Robusto', 'Toro', 'Churchill', 'Corona', 'Petit Corona', 'Lancero', 'Belicoso', 'Torpedo', 'Gordo', 'Minuto', 'Perfecto', 'Other']
const PACK_TYPES = ['Box', 'Bundle', 'Tube', 'Jar', 'Tin', 'Other']
const STATUSES = ['active', 'inactive', 'discontinued']
const LISTS = ['G', 'G1', 'A1', 'SPECIAL']
const LIST_COLORS: Record<string, string> = {
  G: 'bg-blue-100 text-blue-700', G1: 'bg-purple-100 text-purple-700',
  A1: 'bg-amber-100 text-amber-700', SPECIAL: 'bg-red-100 text-red-700',
}

export default function EditProductPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  const [sku, setSku] = useState('')
  const [fullName, setFullName] = useState('')
  const [brand, setBrand] = useState('')
  const [line, setLine] = useState('')
  const [vitola, setVitola] = useState('')
  const [shape, setShape] = useState('')
  const [wrapper, setWrapper] = useState('')
  const [unitsPerPack, setUnitsPerPack] = useState('')
  const [packType, setPackType] = useState('Box')
  const [fixmerReference, setFixmerReference] = useState('')
  const [euCegId, setEuCegId] = useState('')
  const [status, setStatus] = useState('active')
  const [notes, setNotes] = useState('')
  const [lengthInches, setLengthInches] = useState('')
  const [ringGauge, setRingGauge] = useState('')
  const [netWeightG, setNetWeightG] = useState('')
  const [gtin, setGtin] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({ G: '', G1: '', A1: '', SPECIAL: '' })
  const [productRole, setProductRole] = useState('original')
  const [saving, setSaving] = useState(false)

  const { data: product, isLoading } = useQuery({
    queryKey: ['product-edit', id],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('id', id).single()
      return data
    }
  })

  const { data: priceEntries = [] } = useQuery({
    queryKey: ['product-prices', id],
    queryFn: async () => {
      if (!product?.sku) return []
      const { data } = await supabase.from('price_list_entries').select('*').eq('sku', product.sku)
      return data ?? []
    },
    enabled: !!product?.sku
  })

  useEffect(() => {
    if (!product) return
    setSku(product.sku ?? '')
    setFullName(product.full_name ?? '')
    setBrand(product.brand ?? '')
    setLine(product.line ?? '')
    setVitola(product.vitola ?? '')
    setShape(product.shape ?? '')
    setWrapper(product.wrapper ?? '')
    setUnitsPerPack(product.units_per_pack?.toString() ?? '')
    setPackType(product.pack_type ?? 'Box')
    setFixmerReference(product.fixmer_reference ?? '')
    setEuCegId(product.eu_ceg_id ?? '')
    setStatus(product.status ?? 'active')
    setProductRole(product.product_role ?? 'original')
    setNotes(product.notes ?? '')
    setGtin(product.gtin ?? '')
    setLengthInches(product.length_inches?.toString() ?? '')
    setRingGauge(product.ring_gauge?.toString() ?? '')
    setNetWeightG(product.net_weight_g?.toString() ?? '')
  }, [product])

  useEffect(() => {
    if ((priceEntries as any[]).length === 0) return
    const p: Record<string, string> = { G: '', G1: '', A1: '', SPECIAL: '' }
    ;(priceEntries as any[]).forEach((e: any) => {
      if (p.hasOwnProperty(e.price_list)) p[e.price_list] = e.price_per_unit?.toString() ?? ''
    })
    setPrices(p)
  }, [priceEntries])

  const handleDuplicate = async () => {
    const newSku = window.prompt('New SKU for the duplicate:', sku + '-COPY')
    if (!newSku || newSku.trim() === '') return
    const trimmedSku = newSku.trim().toUpperCase()

    const { data: existing } = await supabase.from('products').select('id').eq('sku', trimmedSku).single()
    if (existing) { alert('SKU ' + trimmedSku + ' already exists.'); return }

    const { data: newProduct, error } = await supabase.from('products').insert({
      sku: trimmedSku, full_name: fullName + ' (copy)', brand, line: line || null,
      vitola: vitola || null, shape: shape || null, wrapper: wrapper || null,
      units_per_pack: unitsPerPack ? parseInt(unitsPerPack) : null,
      pack_type: packType || null, fixmer_reference: fixmerReference || null,
      eu_ceg_id: euCegId || null, status, notes: notes || null,
      length_inches: lengthInches ? parseFloat(lengthInches) : null,
      ring_gauge: ringGauge ? parseFloat(ringGauge) : null,
      net_weight_g: netWeightG ? parseFloat(netWeightG) : null,
      product_role: product.product_role ?? 'original',
    }).select().single()

    if (error) { alert('Error: ' + error.message); return }

    for (const list of LISTS) {
      const priceVal = parseFloat(prices[list])
      if (prices[list] && !isNaN(priceVal) && priceVal > 0) {
        await supabase.from('price_list_entries').insert({
          sku: trimmedSku, product_name: fullName + ' (copy)',
          price_list: list, price_per_unit: priceVal, currency: 'USD',
        })
      }
    }

    queryClient.invalidateQueries({ queryKey: ['products'] })
    router.push('/products/' + newProduct.id + '/edit')
  }

  const handleSave = async () => {
    if (!fullName) return alert('Product name is required')
    setSaving(true)

    // Update product
    const { error } = await supabase.from('products').update({
      full_name: fullName, brand, line: line || null, vitola: vitola || null,
      shape: shape || null, wrapper: wrapper || null,
      units_per_pack: unitsPerPack ? parseInt(unitsPerPack) : null,
      pack_type: packType || null, fixmer_reference: fixmerReference || null,
      eu_ceg_id: euCegId || null, status, product_role: productRole, notes: notes || null,
      length_inches: lengthInches ? parseFloat(lengthInches) : null,
      ring_gauge: ringGauge ? parseFloat(ringGauge) : null,
      net_weight_g: netWeightG ? parseFloat(netWeightG) : null,
    }).eq('id', id as string)

    if (error) { setSaving(false); alert('Error: ' + error.message); return }

    // Upsert price entries
    for (const list of LISTS) {
      const priceVal = parseFloat(prices[list])
      const existing = (priceEntries as any[]).find((e: any) => e.price_list === list)
      if (prices[list] && !isNaN(priceVal) && priceVal > 0) {
        if (existing) {
          await supabase.from('price_list_entries').update({ price_per_unit: priceVal }).eq('id', existing.id)
        } else {
          await supabase.from('price_list_entries').insert({ sku, product_name: fullName, price_list: list, price_per_unit: priceVal, currency: 'USD' })
        }
      } else if (existing && (!prices[list] || priceVal === 0)) {
        await supabase.from('price_list_entries').delete().eq('id', existing.id)
      }
    }

    await logActivity({
      action: 'update_product',
      entityType: 'product',
      entityId: id as string,
      entityRef: sku,
      metadata: { name: fullName, brand, status },
    })
    setSaving(false)
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['price-entries-all'] })
    router.push('/products')
  }

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Loading...</div>
  if (!product) return <div className="text-center py-12 text-gray-400">Product not found</div>

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/products" className="text-gray-400 hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Edit {product.full_name}</h1>
          <p className="text-gray-500 text-sm font-mono">{product.sku}</p>
        </div>
        <button onClick={handleDuplicate}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Copy className="h-4 w-4" />Duplicate
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
          <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Product Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Product Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">SKU (Ref. DH)</label>
              <input value={sku} disabled
                className="mt-1 w-full h-9 rounded-md border border-gray-100 bg-gray-50 px-3 text-sm text-gray-400 font-mono cursor-not-allowed" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Product Role</label>
              <select value={productRole} onChange={e => setProductRole(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="original">Original</option>
                <option value="aged">Aged</option>
                <option value="sample">Sample</option>
                <option value="foc">FOC</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 uppercase">Full Name *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
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
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Wrapper</label>
              <input value={wrapper} onChange={e => setWrapper(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        {/* Dimensions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Dimensions & Weight</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Length (inches)</label>
              <input type="number" step="0.1" min="0" value={lengthInches} onChange={e => setLengthInches(e.target.value)}
                placeholder="e.g. 5.5"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Ring Gauge (1/64")</label>
              <input type="number" step="0.1" min="0" value={ringGauge} onChange={e => setRingGauge(e.target.value)}
                placeholder="e.g. 50"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">Net Weight (g)</label>
              <input type="number" step="0.1" min="0" value={netWeightG} onChange={e => setNetWeightG(e.target.value)}
                placeholder="e.g. 12.5"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        {/* Price Lists */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Price Lists</h2>
          <p className="text-xs text-gray-400 mb-4">Price per unit in USD — set to 0 or leave blank to remove</p>
          <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
            {LISTS.map(list => (
              <div key={list} className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded font-semibold w-16 flex-shrink-0 text-center ${LIST_COLORS[list]}`}>{list}</span>
                <input type="number" step="0.01" min="0"
                  value={prices[list]} onChange={e => setPrices(p => ({ ...p, [list]: e.target.value }))}
                  placeholder="0.00"
                  className="flex-1 min-w-0 h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-right" />
                <span className="text-xs text-gray-400 flex-shrink-0">USD</span>
              </div>
            ))}
          </div>
        </div>

        {/* Packaging */}
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
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase">GTIN (Barcode)</label>
              <input value={gtin} onChange={e => setGtin(e.target.value)}
                placeholder="e.g. 5404021000011"
                className="mt-1 w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none font-mono" />
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