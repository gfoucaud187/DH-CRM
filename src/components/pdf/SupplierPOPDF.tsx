'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getFilePath, getNextVersion, getStockInboundFolderName, getPurchaseOrderFileName } from '@/lib/documents'
import { warehouseLabel } from '@/lib/warehouse'

interface SupplierPOPDFProps {
  po: any
  lines: any[]
  partner?: any
}

const DH_LOGO_URL = 'https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_white_background.png'

export default function SupplierPOPDF({ po, lines, partner }: SupplierPOPDFProps) {
  const [saving, setSaving] = useState(false)

  const isCigars = po.po_type === 'cigars'
  const folderName = getStockInboundFolderName(po)

  const generateAndSave = async () => {
    setSaving(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default
      const el = document.querySelector(`[data-supplier-po-page="${po.id}"]`) as HTMLElement
      if (!el) return

      const canvas = await html2canvas(el, { useCORS: true, scale: 2 })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const imgH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH)
      const blob = pdf.output('blob')

      const supabase = createClient()
      const version = await getNextVersion(supabase, po.id, 'po')
      const fileName = getPurchaseOrderFileName(po, version)
      const filePath = getFilePath(folderName, fileName)

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { contentType: 'application/pdf', upsert: false })

      if (!uploadError) {
        await supabase.from('document_files').insert({
          folder_name: folderName,
          file_name: fileName,
          file_path: filePath,
          order_id: po.id,
          document_type: 'po',
          version,
          file_size: blob.size,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const totalAmount = isCigars
    ? lines.reduce((s, l) => s + (l.quantity * (l.received_unit_price ?? 0)), 0)
    : lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0)

  const supplierAddressLine = [partner?.address, partner?.address2, partner?.city, partner?.postal_code, partner?.country]
    .filter(Boolean).join(', ')

  return (
    <div>
      <button onClick={generateAndSave} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
        <Download className="h-4 w-4" />{saving ? 'Generating...' : 'Generate Purchase Order PDF'}
      </button>

      <div data-supplier-po-page={po.id}
        style={{ position: 'absolute', left: -9999, top: 0, width: '794px', padding: '48px', background: '#fff', fontFamily: 'Arial, sans-serif', color: '#1a1a1a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1C4B3C', paddingBottom: '16px', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#1C4B3C', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Purchase Order</div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>{po.po_number}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={DH_LOGO_URL} alt="DH Signature" style={{ height: '40px', width: 'auto' }} />
        </div>

        <div style={{ display: 'flex', gap: '48px', marginBottom: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Buyer</div>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>DH Signature</div>
            <div style={{ fontSize: '11px', color: '#6E665A', marginTop: '2px' }}>Nadir y Bohue Pte. Ltd. · 20C Sea Avenue · Singapore 424243</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Supplier</div>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>{po.partner_name}</div>
            {supplierAddressLine && <div style={{ fontSize: '11px', color: '#6E665A', marginTop: '2px' }}>{supplierAddressLine}</div>}
            {partner?.contact_name && <div style={{ fontSize: '11px', color: '#6E665A' }}>{partner.contact_name}{partner.contact_email ? ` · ${partner.contact_email}` : ''}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '28px', marginBottom: '24px', fontSize: '12px', borderTop: '1px solid #E6E0D5', paddingTop: '12px' }}>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Order Date</div>
            <div style={{ fontWeight: 600 }}>{po.order_date ? new Date(po.order_date).toLocaleDateString('en-GB') : '—'}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Expected Delivery</div>
            <div style={{ fontWeight: 600 }}>{po.delivery_tba ? 'TBA' : po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString('en-GB') : '—'}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Currency</div>
            <div style={{ fontWeight: 600 }}>{po.currency}</div>
          </div>
          {isCigars && (
            <div>
              <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Warehouse</div>
              <div style={{ fontWeight: 600 }}>{warehouseLabel(po.warehouse)}</div>
            </div>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#EEF3F0', borderBottom: '2px solid #1C4B3C' }}>
              {isCigars && <th style={{ textAlign: 'left', padding: '8px 6px' }}>SKU</th>}
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Unit Price</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any, i: number) => {
              const unitPrice = isCigars ? (l.received_unit_price ?? null) : l.unit_price
              const lineTotal = unitPrice != null ? l.quantity * unitPrice : null
              return (
                <tr key={i} style={{ borderBottom: '1px solid #ECE6DB' }}>
                  {isCigars && <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{l.sku ?? '—'}</td>}
                  <td style={{ padding: '8px 6px' }}>{l.description}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{l.quantity}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{unitPrice != null ? Number(unitPrice).toFixed(2) : '—'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{lineTotal != null ? Number(lineTotal).toFixed(2) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #1C4B3C' }}>
              <td colSpan={isCigars ? 4 : 3} style={{ padding: '8px 6px', fontWeight: 700 }}>Total</td>
              <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{po.currency} {totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <div style={{ marginTop: '16px', fontSize: '11px', color: '#6E665A' }}>
            <strong>Notes:</strong> {po.notes}
          </div>
        )}

        <div style={{ marginTop: '32px', fontSize: '9px', color: '#B3AA99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          DH Signature · {po.po_number} · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}
