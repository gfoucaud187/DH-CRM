'use client'

import { useRef } from 'react'
import { X, Download } from 'lucide-react'

const LOGO_URL = 'https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_white_background.png'
const RED = '#C41919'

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

function fmtG(v: number | null | undefined, decimals = 2) {
  if (v == null || v === 0) return ''
  return v % 1 === 0 ? v + '.00 g' : v.toFixed(decimals) + ' g'
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
      <td style={{ padding: '3px 8px', fontSize: 10, color: '#6b7280', width: '45%', verticalAlign: 'top' }}>{label}</td>
      <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, color: '#111827', verticalAlign: 'top' }}>
        {value ?? '—'}
      </td>
    </tr>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={2} style={{ padding: '8px 8px 4px', fontSize: 10, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1.5px solid #111827' }}>
        {title}
      </td>
    </tr>
  )
}

export interface ProductSheetProduct {
  sku: string
  full_name?: string
  commercial_name?: string
  brand?: string
  line?: string
  vitola?: string
  shape?: string
  wrapper?: string
  binder?: string
  filler?: string
  units_per_pack?: number
  pack_type?: string
  fixmer_reference?: string
  eu_ceg_id?: string
  eu_ceg_uuid?: string
  status?: string
  notes?: string
  length_inches?: number
  ring_gauge?: number
  net_weight_g?: number
  gross_weight_g?: number
  net_tobacco_weight_g?: number
  gtin?: string
  gtin_unit?: string
  product_role?: string
  category?: string
  edition?: string
  country_of_origin?: string
  rolling_method?: string
  fermentation?: string
  leaf_ageing?: string
  cigar_integration?: string
  applicable_regulation?: string
  product_classification?: string
  flavour_category?: string
  hs_code?: string
  box_length_cm?: number
  box_width_cm?: number
  box_height_cm?: number
  boxes_per_mastercase?: number
  mastercase_gross_weight_kg?: number
  pkg_material?: string
  pkg_finish?: string
  pkg_inks?: string
  pkg_lining?: string
  pkg_cellophane?: boolean | null
  pkg_outer_carton?: boolean | null
  pkg_plastic?: boolean | null
  material_accounting?: Record<string, number | null>
}

interface ProductSheetProps {
  product: ProductSheetProduct
  onClose: () => void
}

export default function ProductSheet({ product, onClose }: ProductSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  const ma = product.material_accounting ?? {}
  const boxDims = [product.box_length_cm, product.box_width_cm, product.box_height_cm].every(v => v != null)
    ? `${product.box_length_cm} cm x ${product.box_width_cm} cm x ${product.box_height_cm} cm`
    : undefined
  const lengthMm = product.length_inches ? (product.length_inches * 25.4).toFixed(1) + ' mm' : undefined
  const ringMm = product.ring_gauge ? ((product.ring_gauge / 64) * 25.4).toFixed(2) + ' mm' : undefined
  const totalCigarsPerMastercase = (product.units_per_pack && product.boxes_per_mastercase)
    ? product.units_per_pack * product.boxes_per_mastercase
    : undefined
  const boolVal = (v: boolean | null | undefined) => v == null ? '—' : v ? 'Yes' : 'No'

  const handleDownload = async () => {
    if (!sheetRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const jsPDF = (await import('jspdf')).default

    const canvas = await html2canvas(sheetRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgW = pageW
    const imgH = (canvas.height * pageW) / canvas.width

    if (imgH <= pageH) {
      pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH)
    } else {
      let posY = 0
      let remaining = imgH
      while (remaining > 0) {
        pdf.addImage(imgData, 'PNG', 0, -posY, imgW, imgH)
        remaining -= pageH
        posY += pageH
        if (remaining > 0) pdf.addPage()
      }
    }

    pdf.save(`Product-Sheet-${product.sku}.pdf`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-6">
      <div className="relative w-full max-w-4xl mx-4">
        {/* Controls */}
        <div className="flex justify-between items-center mb-3">
          <button onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-sm font-medium shadow hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> Download PDF
          </button>
          <button onClick={onClose} className="p-2 bg-white rounded-full shadow hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Sheet */}
        <div ref={sheetRef} style={{ background: '#fff', fontFamily: 'Arial, Helvetica, sans-serif', padding: '24px 28px', minWidth: 700 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1.1 }}>TECHNICAL PRODUCT SHEET</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginTop: 2 }}>SINGLE SOURCE OF TRUTH</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>(Internal)</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="DH Signature" style={{ height: 52, width: 'auto', objectFit: 'contain' }} crossOrigin="anonymous" />
          </div>

          {/* Red product banner */}
          <div style={{ background: RED, padding: '8px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>
              {product.brand ?? ''} {product.full_name ?? product.sku}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
              {product.vitola && <span style={{ fontSize: 10, color: '#fecaca', fontWeight: 600 }}>{product.vitola}</span>}
              {product.length_inches && product.ring_gauge && (
                <span style={{ fontSize: 10, color: '#fecaca', fontWeight: 600 }}>
                  {product.length_inches} x {product.ring_gauge}
                </span>
              )}
              {product.net_weight_g && (
                <span style={{ fontSize: 10, color: '#fecaca', fontWeight: 600 }}>
                  {product.net_weight_g} g (approx.)
                </span>
              )}
              {product.units_per_pack && product.pack_type && (
                <span style={{ fontSize: 10, color: '#fecaca', fontWeight: 600 }}>
                  {product.pack_type} of {product.units_per_pack}
                </span>
              )}
              {product.sku && (
                <span style={{ fontSize: 10, color: '#fecaca', fontWeight: 700, marginLeft: 'auto' }}>
                  {product.sku}
                </span>
              )}
            </div>
          </div>

          {/* Two-column grid — Identity + Craftsmanship */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* PRODUCT IDENTITY */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <SectionHeader title="Product Identity" />
                <Row label="Brand" value={product.brand} />
                <Row label="Commercial Product Name" value={product.commercial_name || product.line} />
                <Row label="Official Product Name" value={product.full_name} />
                <Row label="Presentation" value={product.units_per_pack && product.pack_type ? `${product.pack_type} of ${product.units_per_pack} cigars` : undefined} />
                <Row label="Presentation Product Code" value={product.sku} />
                <Row label="Category" value={product.category} />
                <Row label="Edition" value={product.edition} />
                <Row label="Country of Origin" value={product.country_of_origin} />
              </tbody>
            </table>

            {/* CRAFTSMANSHIP */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <SectionHeader title="Craftsmanship & Cigar Composition" />
                <Row label="Rolling Method" value={product.rolling_method} />
                <Row label="Fermentation" value={product.fermentation} />
                <Row label="Leaf ageing (pre-rolling)" value={product.leaf_ageing} />
                <Row label="Cigar Integration (post-rolling)" value={product.cigar_integration} />
                <Row label="Binder" value={product.binder} />
                <Row label="Filler" value={product.filler} />
                <Row label="Wrapper" value={product.wrapper} />
              </tbody>
            </table>
          </div>

          {/* Two-column — Physical + Regulatory */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* PHYSICAL SPECIFICATIONS */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <SectionHeader title="Physical Specifications" />
                <Row label="Vitola" value={product.vitola} />
                <Row label="Length" value={product.length_inches ? `${product.length_inches}″  /  ${lengthMm}` : undefined} />
                <Row label="Ring Gauge / Diameter" value={product.ring_gauge ? `${product.ring_gauge}  /  ${ringMm}` : undefined} />
                <Row label="Shape" value={product.shape} />
              </tbody>
            </table>

            {/* REGULATORY */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <SectionHeader title="Regulatory & Compliance" />
                <Row label="EU-CEG TP_ID" value={product.eu_ceg_id} />
                <Row label="EU-CEG UUID" value={product.eu_ceg_uuid} />
                <Row label="Applicable Regulation" value={product.applicable_regulation} />
                <Row label="Product Classification" value={product.product_classification} />
                <Row label="Flavour Category" value={product.flavour_category} />
              </tbody>
            </table>
          </div>

          {/* Two-column — Weight data + Logistics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* WEIGHT DATA */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <SectionHeader title="Weight Data (average & approximative)" />
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '3px 8px', fontSize: 10, color: '#6b7280', width: '45%' }}></td>
                  <td style={{ padding: '3px 8px', fontSize: 9, fontWeight: 700, color: '#374151', textAlign: 'right' }}>Box</td>
                  <td style={{ padding: '3px 8px', fontSize: 9, fontWeight: 700, color: '#374151', textAlign: 'right' }}>Per cigar</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '3px 8px', fontSize: 10, color: '#6b7280' }}>Net tobacco weight</td>
                  <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{fmtG(product.net_tobacco_weight_g)}</td>
                  <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{product.net_tobacco_weight_g && product.units_per_pack ? fmtG(product.net_tobacco_weight_g / product.units_per_pack) : ''}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '3px 8px', fontSize: 10, color: '#6b7280' }}>Net weight of presentation</td>
                  <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{fmtG(product.net_weight_g)}</td>
                  <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{product.net_weight_g && product.units_per_pack ? fmtG(product.net_weight_g / product.units_per_pack) : ''}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '3px 8px', fontSize: 10, color: '#6b7280' }}>Gross weight per presentation</td>
                  <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{fmtG(product.gross_weight_g)}</td>
                  <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{product.gross_weight_g && product.units_per_pack ? fmtG(product.gross_weight_g / product.units_per_pack) : ''}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '3px 8px', fontSize: 10, color: '#6b7280' }}>Master Case gross weight</td>
                  <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>
                    {product.mastercase_gross_weight_kg ? product.mastercase_gross_weight_kg + ' kg' : ''}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>

            {/* DIMENSIONS & LOGISTICS */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <SectionHeader title="Dimensions & Logistics Info." />
                <Row label="Box dimensions (L × W × H)" value={boxDims} />
                <Row label="HS Code" value={product.hs_code} />
                <Row label="GTIN13 (Box)" value={product.gtin} />
                <Row label="GTIN13 (Product/Unit)" value={product.gtin_unit} />
                <Row label="Cigars per box" value={product.units_per_pack ? `${product.units_per_pack} units` : undefined} />
                <Row label="Boxes per mastercase" value={product.boxes_per_mastercase ? `${product.boxes_per_mastercase} boxes` : undefined} />
                <Row label="Total cigars per mastercase" value={totalCigarsPerMastercase ? `${totalCigarsPerMastercase} units` : undefined} />
              </tbody>
            </table>
          </div>

          {/* Two-column — Material Accounting + Packaging System */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* MATERIAL ACCOUNTING */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <SectionHeader title="Material Accounting" />
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <td style={{ padding: '3px 8px', fontSize: 9, color: '#6b7280', width: '45%' }}></td>
                  <td style={{ padding: '3px 8px', fontSize: 9, fontWeight: 700, color: '#374151', textAlign: 'right' }}>{product.sku}</td>
                  <td style={{ padding: '3px 8px', fontSize: 9, fontWeight: 700, color: '#374151', textAlign: 'right' }}>Per cigar</td>
                </tr>
                {MATERIALS.map(m => (
                  <tr key={m.key} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '3px 8px', fontSize: 10, color: '#6b7280' }}>{m.label}</td>
                    <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{fmtG(ma[m.key + '_box'])}</td>
                    <td style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, textAlign: 'right' }}>{fmtG(ma[m.key + '_unit'], 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* PACKAGING SYSTEM */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <SectionHeader title="Packaging System" />
                <Row label="Cigar Component" value="Natural Tobacco Leaves" />
                <tr>
                  <td colSpan={2} style={{ padding: '6px 8px 2px', fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Presentation (retail pack)
                  </td>
                </tr>
                <Row label="Material" value={product.pkg_material} />
                <Row label="Finish" value={product.pkg_finish} />
                <Row label="Inks" value={product.pkg_inks} />
                <Row label="Interior Lining" value={product.pkg_lining} />
                <Row label="Individual cellophane" value={boolVal(product.pkg_cellophane)} />
                <Row label="Outer carton" value={boolVal(product.pkg_outer_carton)} />
                <Row label="Plastic" value={boolVal(product.pkg_plastic)} />
                <tr>
                  <td colSpan={2} style={{ padding: '6px 8px 2px', fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Secondary Packaging
                  </td>
                </tr>
                <Row label="Outer carton" value={product.pkg_outer_carton != null ? boolVal(product.pkg_outer_carton) : undefined} />
                <Row label="Plastic" value={product.pkg_plastic != null ? boolVal(product.pkg_plastic) : undefined} />
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {product.notes && (
            <div style={{ marginTop: 12, padding: '6px 8px', background: '#f9fafb', borderRadius: 4, borderLeft: `3px solid ${RED}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: 2 }}>Notes</div>
              <div style={{ fontSize: 10, color: '#374151' }}>{product.notes}</div>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: 16, paddingTop: 8, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 8, color: '#9ca3af' }}>DH Signature — Internal Document — Single Source of Truth</div>
            <div style={{ fontSize: 8, color: '#9ca3af' }}>{product.sku} — {new Date().toLocaleDateString('en-GB')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
