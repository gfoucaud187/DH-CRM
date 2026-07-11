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
const MATERIALS = [
  { key: 'tobacco_leaf', label: 'Tobacco leaf' },
  { key: 'carton', label: 'Carton' },
  { key: 'cellulose', label: 'Cellulose-based materials' },
  { key: 'paper', label: 'Paper' },
  { key: 'textile', label: 'Textile' },
  { key: 'veg_gum', label: 'Vegetable gum' },
  { key: 'wood', label: 'Wood' },
  { key: 'metal', label: 'Metal' },
  { key: 'plastic', label: 'Plastic' },
  { key: 'adhesives', label: 'Adhesives' },
]

type MA = Record<string, string>
const emptyMA = (): MA => Object.fromEntries(MATERIALS.flatMap(m => [[m.key + '_box', ''], [m.key + '_unit', '']]))

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  )
}
const inputCls = 'w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none'
const selectCls = 'w-full h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none'

export default function EditProductPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()

  // Basic
  const [sku, setSku] = useState('')
  const [fullName, setFullName] = useState('')
  const [commercialName, setCommercialName] = useState('')
  const [brand, setBrand] = useState('')
  const [line, setLine] = useState('')
  const [category, setCategory] = useState('')
  const [edition, setEdition] = useState('')
  const [countryOfOrigin, setCountryOfOrigin] = useState('')
  const [status, setStatus] = useState('active')
  const [productRole, setProductRole] = useState('original')

  // Craftsmanship
  const [rollingMethod, setRollingMethod] = useState('')
  const [fermentation, setFermentation] = useState('')
  const [leafAgeing, setLeafAgeing] = useState('')
  const [cigarIntegration, setCigarIntegration] = useState('')
  const [binder, setBinder] = useState('')
  const [filler, setFiller] = useState('')
  const [wrapper, setWrapper] = useState('')

  // Physical
  const [vitola, setVitola] = useState('')
  const [shape, setShape] = useState('')
  const [lengthInches, setLengthInches] = useState('')
  const [ringGauge, setRingGauge] = useState('')

  // Weight
  const [netWeightG, setNetWeightG] = useState('')
  const [grossWeightG, setGrossWeightG] = useState('')
  const [netTobaccoWeightG, setNetTobaccoWeightG] = useState('')

  // Packaging & references
  const [unitsPerPack, setUnitsPerPack] = useState('')
  const [packType, setPackType] = useState('Box')
  const [gtin, setGtin] = useState('')
  const [gtinUnit, setGtinUnit] = useState('')
  const [fixmerReference, setFixmerReference] = useState('')
  const [euCegId, setEuCegId] = useState('')
  const [euCegUuid, setEuCegUuid] = useState('')
  const [hsCode, setHsCode] = useState('')
  const [boxesPerMastercase, setBoxesPerMastercase] = useState('')
  const [mastercaseGrossWeightKg, setMastercaseGrossWeightKg] = useState('')
  const [boxLengthCm, setBoxLengthCm] = useState('')
  const [boxWidthCm, setBoxWidthCm] = useState('')
  const [boxHeightCm, setBoxHeightCm] = useState('')
  const [notes, setNotes] = useState('')

  // Regulatory
  const [applicableRegulation, setApplicableRegulation] = useState('')
  const [productClassification, setProductClassification] = useState('')
  const [flavourCategory, setFlavourCategory] = useState('')

  // Packaging system
  const [pkgMaterial, setPkgMaterial] = useState('')
  const [pkgFinish, setPkgFinish] = useState('')
  const [pkgInks, setPkgInks] = useState('')
  const [pkgLining, setPkgLining] = useState('')
  const [pkgCellophane, setPkgCellophane] = useState<string>('')
  const [pkgOuterCarton, setPkgOuterCarton] = useState<string>('')
  const [pkgPlastic, setPkgPlastic] = useState<string>('')

  // Material accounting
  const [ma, setMa] = useState<MA>(emptyMA())

  const [prices, setPrices] = useState<Record<string, string>>({ G: '', G1: '', A1: '', SPECIAL: '' })
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
    setCommercialName(product.commercial_name ?? '')
    setBrand(product.brand ?? '')
    setLine(product.line ?? '')
    setCategory(product.category ?? '')
    setEdition(product.edition ?? '')
    setCountryOfOrigin(product.country_of_origin ?? '')
    setStatus(product.status ?? 'active')
    setProductRole(product.product_role ?? 'original')
    setRollingMethod(product.rolling_method ?? '')
    setFermentation(product.fermentation ?? '')
    setLeafAgeing(product.leaf_ageing ?? '')
    setCigarIntegration(product.cigar_integration ?? '')
    setBinder(product.binder ?? '')
    setFiller(product.filler ?? '')
    setWrapper(product.wrapper ?? '')
    setVitola(product.vitola ?? '')
    setShape(product.shape ?? '')
    setLengthInches(product.length_inches?.toString() ?? '')
    setRingGauge(product.ring_gauge?.toString() ?? '')
    setNetWeightG(product.net_weight_g?.toString() ?? '')
    setGrossWeightG(product.gross_weight_g?.toString() ?? '')
    setNetTobaccoWeightG(product.net_tobacco_weight_g?.toString() ?? '')
    setUnitsPerPack(product.units_per_pack?.toString() ?? '')
    setPackType(product.pack_type ?? 'Box')
    setGtin(product.gtin ?? '')
    setGtinUnit(product.gtin_unit ?? '')
    setFixmerReference(product.fixmer_reference ?? '')
    setEuCegId(product.eu_ceg_id ?? '')
    setEuCegUuid(product.eu_ceg_uuid ?? '')
    setHsCode(product.hs_code ?? '')
    setBoxesPerMastercase(product.boxes_per_mastercase?.toString() ?? '')
    setMastercaseGrossWeightKg(product.mastercase_gross_weight_kg?.toString() ?? '')
    setBoxLengthCm(product.box_length_cm?.toString() ?? '')
    setBoxWidthCm(product.box_width_cm?.toString() ?? '')
    setBoxHeightCm(product.box_height_cm?.toString() ?? '')
    setNotes(product.notes ?? '')
    setApplicableRegulation(product.applicable_regulation ?? '')
    setProductClassification(product.product_classification ?? '')
    setFlavourCategory(product.flavour_category ?? '')
    setPkgMaterial(product.pkg_material ?? '')
    setPkgFinish(product.pkg_finish ?? '')
    setPkgInks(product.pkg_inks ?? '')
    setPkgLining(product.pkg_lining ?? '')
    setPkgCellophane(product.pkg_cellophane == null ? '' : product.pkg_cellophane ? 'true' : 'false')
    setPkgOuterCarton(product.pkg_outer_carton == null ? '' : product.pkg_outer_carton ? 'true' : 'false')
    setPkgPlastic(product.pkg_plastic == null ? '' : product.pkg_plastic ? 'true' : 'false')

    const raw = product.material_accounting ?? {}
    const merged = emptyMA()
    for (const k of Object.keys(merged)) { if (raw[k] != null) merged[k] = String(raw[k]) }
    setMa(merged)
  }, [product])

  useEffect(() => {
    if ((priceEntries as any[]).length === 0) return
    const p: Record<string, string> = { G: '', G1: '', A1: '', SPECIAL: '' }
    ;(priceEntries as any[]).forEach((e: any) => { if (p.hasOwnProperty(e.price_list)) p[e.price_list] = e.price_per_unit?.toString() ?? '' })
    setPrices(p)
  }, [priceEntries])

  const buildMaJson = () => {
    const out: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(ma)) {
      out[k] = v && v.trim() !== '' ? parseFloat(v) : null
    }
    return out
  }

  const boolOrNull = (v: string) => v === 'true' ? true : v === 'false' ? false : null

  const handleDuplicate = async () => {
    const newSku = window.prompt('New SKU for the duplicate:', sku + '-COPY')
    if (!newSku || newSku.trim() === '') return
    const trimmedSku = newSku.trim().toUpperCase()
    const { data: existing } = await supabase.from('products').select('id').eq('sku', trimmedSku).single()
    if (existing) { alert('SKU ' + trimmedSku + ' already exists.'); return }
    const { data: newProduct, error } = await supabase.from('products').insert({
      sku: trimmedSku, full_name: fullName + ' (copy)', commercial_name: commercialName || null,
      brand, line: line || null, vitola: vitola || null, shape: shape || null,
      binder: binder || null, filler: filler || null, wrapper: wrapper || null,
      units_per_pack: unitsPerPack ? parseInt(unitsPerPack) : null,
      pack_type: packType || null, fixmer_reference: fixmerReference || null,
      eu_ceg_id: euCegId || null, eu_ceg_uuid: euCegUuid || null,
      status, notes: notes || null, product_role: productRole,
      length_inches: lengthInches ? parseFloat(lengthInches) : null,
      ring_gauge: ringGauge ? parseFloat(ringGauge) : null,
      net_weight_g: netWeightG ? parseFloat(netWeightG) : null,
      gross_weight_g: grossWeightG ? parseFloat(grossWeightG) : null,
      net_tobacco_weight_g: netTobaccoWeightG ? parseFloat(netTobaccoWeightG) : null,
    }).select().single()
    if (error) { alert('Error: ' + error.message); return }
    for (const list of LISTS) {
      const priceVal = parseFloat(prices[list])
      if (prices[list] && !isNaN(priceVal) && priceVal > 0) {
        await supabase.from('price_list_entries').insert({ sku: trimmedSku, product_name: fullName + ' (copy)', price_list: list, price_per_unit: priceVal, currency: 'USD' })
      }
    }
    queryClient.invalidateQueries({ queryKey: ['products'] })
    router.push('/products/' + newProduct.id + '/edit')
  }

  const handleSave = async () => {
    if (!fullName) return alert('Product name is required')
    setSaving(true)
    const { error } = await supabase.from('products').update({
      full_name: fullName, commercial_name: commercialName || null,
      brand, line: line || null, category: category || null, edition: edition || null,
      country_of_origin: countryOfOrigin || null,
      vitola: vitola || null, shape: shape || null,
      binder: binder || null, filler: filler || null, wrapper: wrapper || null,
      units_per_pack: unitsPerPack ? parseInt(unitsPerPack) : null,
      pack_type: packType || null, fixmer_reference: fixmerReference || null,
      eu_ceg_id: euCegId || null, eu_ceg_uuid: euCegUuid || null,
      status, product_role: productRole, notes: notes || null,
      length_inches: lengthInches ? parseFloat(lengthInches) : null,
      ring_gauge: ringGauge ? parseFloat(ringGauge) : null,
      net_weight_g: netWeightG ? parseFloat(netWeightG) : null,
      gross_weight_g: grossWeightG ? parseFloat(grossWeightG) : null,
      net_tobacco_weight_g: netTobaccoWeightG ? parseFloat(netTobaccoWeightG) : null,
      gtin: gtin || null, gtin_unit: gtinUnit || null,
      hs_code: hsCode || null,
      boxes_per_mastercase: boxesPerMastercase ? parseInt(boxesPerMastercase) : null,
      mastercase_gross_weight_kg: mastercaseGrossWeightKg ? parseFloat(mastercaseGrossWeightKg) : null,
      box_length_cm: boxLengthCm ? parseFloat(boxLengthCm) : null,
      box_width_cm: boxWidthCm ? parseFloat(boxWidthCm) : null,
      box_height_cm: boxHeightCm ? parseFloat(boxHeightCm) : null,
      rolling_method: rollingMethod || null, fermentation: fermentation || null,
      leaf_ageing: leafAgeing || null, cigar_integration: cigarIntegration || null,
      applicable_regulation: applicableRegulation || null,
      product_classification: productClassification || null,
      flavour_category: flavourCategory || null,
      pkg_material: pkgMaterial || null, pkg_finish: pkgFinish || null,
      pkg_inks: pkgInks || null, pkg_lining: pkgLining || null,
      pkg_cellophane: boolOrNull(pkgCellophane),
      pkg_outer_carton: boolOrNull(pkgOuterCarton),
      pkg_plastic: boolOrNull(pkgPlastic),
      material_accounting: buildMaJson(),
    }).eq('id', id as string)
    if (error) { setSaving(false); alert('Error: ' + error.message); return }

    for (const list of LISTS) {
      const priceVal = parseFloat(prices[list])
      const existing = (priceEntries as any[]).find((e: any) => e.price_list === list)
      if (prices[list] && !isNaN(priceVal) && priceVal > 0) {
        if (existing) await supabase.from('price_list_entries').update({ price_per_unit: priceVal }).eq('id', existing.id)
        else await supabase.from('price_list_entries').insert({ sku, product_name: fullName, price_list: list, price_per_unit: priceVal, currency: 'USD' })
      } else if (existing) {
        await supabase.from('price_list_entries').delete().eq('id', existing.id)
      }
    }

    await logActivity({ action: 'update_product', entityType: 'product', entityId: id as string, entityRef: sku, metadata: { name: fullName, brand, status } })
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

        {/* Product Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Product Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU (Ref. DH)">
              <input value={sku} disabled className={inputCls + ' bg-gray-50 text-gray-400 font-mono cursor-not-allowed border-gray-100'} />
            </Field>
            <Field label="Status">
              <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Inventory">
              <select value={productRole} onChange={e => setProductRole(e.target.value)} className={selectCls}>
                <option value="original">Original</option>
                <option value="aged">Aged</option>
                <option value="sample">Sample</option>
                <option value="foc">FOC</option>
              </select>
            </Field>
            <Field label="Category">
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Handmade Premium Cigar" className={inputCls} />
            </Field>
            <div className="col-span-2">
              <Field label="Official Product Name *">
                <input value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Commercial Product Name">
                <input value={commercialName} onChange={e => setCommercialName(e.target.value)} placeholder="e.g. Inanna 2" className={inputCls} />
              </Field>
            </div>
            <Field label="Brand">
              <input value={brand} onChange={e => setBrand(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Line">
              <input value={line} onChange={e => setLine(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Edition">
              <input value={edition} onChange={e => setEdition(e.target.value)} placeholder="e.g. 24,000 cigars individually numbered" className={inputCls} />
            </Field>
            <Field label="Country of Origin">
              <input value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} placeholder="e.g. Nicaragua" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Craftsmanship & Composition */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Craftsmanship & Cigar Composition</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Rolling Method">
              <input value={rollingMethod} onChange={e => setRollingMethod(e.target.value)} placeholder="e.g. Handmade" className={inputCls} />
            </Field>
            <Field label="Fermentation">
              <input value={fermentation} onChange={e => setFermentation(e.target.value)} placeholder="e.g. Natural (Slow)" className={inputCls} />
            </Field>
            <Field label="Leaf Ageing (pre-rolling)">
              <input value={leafAgeing} onChange={e => setLeafAgeing(e.target.value)} placeholder="e.g. Tier 1 (4 to 7 years minimum)" className={inputCls} />
            </Field>
            <Field label="Cigar Integration (post-rolling)">
              <input value={cigarIntegration} onChange={e => setCigarIntegration(e.target.value)} placeholder="e.g. Level A (20 months minimum)" className={inputCls} />
            </Field>
            <Field label="Binder">
              <input value={binder} onChange={e => setBinder(e.target.value)} placeholder="e.g. Nicaragua" className={inputCls} />
            </Field>
            <Field label="Filler">
              <input value={filler} onChange={e => setFiller(e.target.value)} placeholder="e.g. Nicaragua" className={inputCls} />
            </Field>
            <Field label="Wrapper">
              <input value={wrapper} onChange={e => setWrapper(e.target.value)} placeholder="e.g. Ecuador Connecticut" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Physical Specifications */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Physical Specifications</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vitola">
              <input value={vitola} onChange={e => setVitola(e.target.value)} placeholder="e.g. Corona Gorda" className={inputCls} />
            </Field>
            <Field label="Shape">
              <select value={shape} onChange={e => setShape(e.target.value)} className={selectCls}>
                <option value="">Select...</option>
                {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Length (inches)">
              <input type="number" step="0.1" min="0" value={lengthInches} onChange={e => setLengthInches(e.target.value)} placeholder="e.g. 6" className={inputCls} />
            </Field>
            <Field label="Ring Gauge (1/64&quot;)">
              <input type="number" step="0.5" min="0" value={ringGauge} onChange={e => setRingGauge(e.target.value)} placeholder="e.g. 48" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Weight Data */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Weight Data</h2>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Net Tobacco Weight (g)">
              <input type="number" step="0.01" min="0" value={netTobaccoWeightG} onChange={e => setNetTobaccoWeightG(e.target.value)} placeholder="e.g. 145.00" className={inputCls} />
            </Field>
            <Field label="Net Weight of Presentation (g)">
              <input type="number" step="0.01" min="0" value={netWeightG} onChange={e => setNetWeightG(e.target.value)} placeholder="e.g. 118.80" className={inputCls} />
            </Field>
            <Field label="Gross Weight per Presentation (g)">
              <input type="number" step="0.01" min="0" value={grossWeightG} onChange={e => setGrossWeightG(e.target.value)} placeholder="e.g. 263.80" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Price Lists */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Price Lists</h2>
          <p className="text-xs text-gray-400 mb-4">Price per unit in USD — set to 0 or leave blank to remove</p>
          <div className="sm:grid sm:grid-cols-2 sm:gap-4 space-y-2 sm:space-y-0">
            {LISTS.map(list => (
              <div key={list} className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded font-semibold w-16 flex-shrink-0 text-center ${LIST_COLORS[list]}`}>{list}</span>
                <input type="number" step="0.01" min="0"
                  value={prices[list]} onChange={e => setPrices(p => ({ ...p, [list]: e.target.value }))}
                  placeholder="0.00" className="flex-1 min-w-0 h-9 rounded-md border border-gray-200 px-3 text-sm focus:outline-none text-right" />
                <span className="text-xs text-gray-400 flex-shrink-0">USD</span>
              </div>
            ))}
          </div>
        </div>

        {/* Packaging & References */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Packaging & References</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Units per Pack">
              <input type="number" min="1" value={unitsPerPack} onChange={e => setUnitsPerPack(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Pack Type">
              <select value={packType} onChange={e => setPackType(e.target.value)} className={selectCls}>
                {PACK_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="GTIN13 (Box)">
              <input value={gtin} onChange={e => setGtin(e.target.value)} placeholder="e.g. 5404021008413" className={inputCls + ' font-mono'} />
            </Field>
            <Field label="GTIN13 (Product/Unit)">
              <input value={gtinUnit} onChange={e => setGtinUnit(e.target.value)} placeholder="e.g. 5404021008420" className={inputCls + ' font-mono'} />
            </Field>
            <Field label="Ref. Fixmer">
              <input value={fixmerReference} onChange={e => setFixmerReference(e.target.value)} className={inputCls} />
            </Field>
            <Field label="EU-CEG TP_ID">
              <input value={euCegId} onChange={e => setEuCegId(e.target.value)} placeholder="e.g. 00903-23-03001" className={inputCls} />
            </Field>
            <div className="col-span-2">
              <Field label="EU-CEG UUID">
                <input value={euCegUuid} onChange={e => setEuCegUuid(e.target.value)} placeholder="e.g. c2d9779a-c479-48fb-bb06-45698912fe02" className={inputCls + ' font-mono'} />
              </Field>
            </div>
            <Field label="HS Code">
              <input value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="e.g. 2402.1" className={inputCls} />
            </Field>
            <Field label="Boxes per Mastercase">
              <input type="number" min="1" value={boxesPerMastercase} onChange={e => setBoxesPerMastercase(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Mastercase Gross Weight (kg)">
              <input type="number" step="0.1" min="0" value={mastercaseGrossWeightKg} onChange={e => setMastercaseGrossWeightKg(e.target.value)} placeholder="e.g. 21.5" className={inputCls} />
            </Field>
            <div className="col-span-2">
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Box Dimensions (cm)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Length</label>
                  <input type="number" step="0.1" min="0" value={boxLengthCm} onChange={e => setBoxLengthCm(e.target.value)} placeholder="16.5" className={inputCls + ' mt-1'} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Width</label>
                  <input type="number" step="0.1" min="0" value={boxWidthCm} onChange={e => setBoxWidthCm(e.target.value)} placeholder="10.4" className={inputCls + ' mt-1'} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Height</label>
                  <input type="number" step="0.1" min="0" value={boxHeightCm} onChange={e => setBoxHeightCm(e.target.value)} placeholder="4.7" className={inputCls + ' mt-1'} />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Field label="Notes">
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
            </Field>
          </div>
        </div>

        {/* Regulatory & Compliance */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Regulatory & Compliance</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Applicable Regulation">
              <input value={applicableRegulation} onChange={e => setApplicableRegulation(e.target.value)} placeholder="e.g. EU Directive 2014/40/EU" className={inputCls} />
            </Field>
            <Field label="Product Classification">
              <input value={productClassification} onChange={e => setProductClassification(e.target.value)} placeholder="e.g. Handmade cigar" className={inputCls} />
            </Field>
            <Field label="Flavour Category">
              <input value={flavourCategory} onChange={e => setFlavourCategory(e.target.value)} placeholder="e.g. Non-flavoured" className={inputCls} />
            </Field>
          </div>
        </div>

        {/* Packaging System */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Packaging System</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Material">
              <input value={pkgMaterial} onChange={e => setPkgMaterial(e.target.value)} placeholder="e.g. Recycled carton" className={inputCls} />
            </Field>
            <Field label="Finish">
              <input value={pkgFinish} onChange={e => setPkgFinish(e.target.value)} placeholder="e.g. Embossing during printing" className={inputCls} />
            </Field>
            <Field label="Inks">
              <input value={pkgInks} onChange={e => setPkgInks(e.target.value)} placeholder="e.g. Mineral & Natural (Non-metallic)" className={inputCls} />
            </Field>
            <Field label="Interior Lining">
              <input value={pkgLining} onChange={e => setPkgLining(e.target.value)} placeholder="e.g. None" className={inputCls} />
            </Field>
            <Field label="Individual Cellophane">
              <select value={pkgCellophane} onChange={e => setPkgCellophane(e.target.value)} className={selectCls}>
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>
            <Field label="Outer Carton">
              <select value={pkgOuterCarton} onChange={e => setPkgOuterCarton(e.target.value)} className={selectCls}>
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>
            <Field label="Plastic">
              <select value={pkgPlastic} onChange={e => setPkgPlastic(e.target.value)} className={selectCls}>
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>
          </div>
        </div>

        {/* Material Accounting */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-1">Material Accounting</h2>
          <p className="text-xs text-gray-400 mb-4">Weight in grams — enter values for both box/presentation and per individual cigar</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase w-48">Material</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase w-36">Box (g)</th>
                  <th className="text-right py-2 pl-3 text-xs font-medium text-gray-500 uppercase w-36">Per Cigar (g)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MATERIALS.map(m => (
                  <tr key={m.key}>
                    <td className="py-2 pr-4 text-sm text-gray-700">{m.label}</td>
                    <td className="py-1 px-3">
                      <input type="number" step="0.001" min="0"
                        value={ma[m.key + '_box']}
                        onChange={e => setMa(prev => ({ ...prev, [m.key + '_box']: e.target.value }))}
                        placeholder="—"
                        className="w-full h-8 rounded border border-gray-200 px-2 text-sm text-right focus:outline-none" />
                    </td>
                    <td className="py-1 pl-3">
                      <input type="number" step="0.001" min="0"
                        value={ma[m.key + '_unit']}
                        onChange={e => setMa(prev => ({ ...prev, [m.key + '_unit']: e.target.value }))}
                        placeholder="—"
                        className="w-full h-8 rounded border border-gray-200 px-2 text-sm text-right focus:outline-none" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
