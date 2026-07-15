'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getFilePath, getNextVersion, getStockInboundFolderName, getStockInboundFileName } from '@/lib/documents'
import { warehouseLabel } from '@/lib/warehouse'

interface StockInboundPDFProps {
  po: any
  lines: any[]
}

export default function StockInboundPDF({ po, lines }: StockInboundPDFProps) {
  const [saving, setSaving] = useState(false)

  const folderName = getStockInboundFolderName(po)

  const generateAndSave = async () => {
    setSaving(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default
      const el = document.querySelector(`[data-stock-inbound-page="${po.id}"]`) as HTMLElement
      if (!el) return

      const canvas = await html2canvas(el, { useCORS: true })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const imgH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, imgH)
      const blob = pdf.output('blob')

      const supabase = createClient()
      const version = await getNextVersion(supabase, po.id, 'stock_inbound')
      const fileName = getStockInboundFileName(po, version)
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
          document_type: 'stock_inbound',
          version,
          file_size: blob.size,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)

  return (
    <div>
      <button onClick={generateAndSave} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
        <Download className="h-4 w-4" />{saving ? 'Generating...' : 'Generate Stock Inbound Receipt'}
      </button>

      <div data-stock-inbound-page={po.id}
        style={{ position: 'absolute', left: -9999, top: 0, width: '794px', padding: '48px', background: '#fff', fontFamily: 'Arial, sans-serif', color: '#1a1a1a' }}>
        <div style={{ borderBottom: '3px solid #1C4B3C', paddingBottom: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1C4B3C', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Stock Inbound Receipt</div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>{po.po_number}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '12px' }}>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Supplier</div>
            <div style={{ fontWeight: 600 }}>{po.partner_name}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Warehouse</div>
            <div style={{ fontWeight: 600 }}>{warehouseLabel(po.warehouse)}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Date Received</div>
            <div style={{ fontWeight: 600 }}>{new Date().toLocaleDateString('en-GB')}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#EEF3F0', borderBottom: '2px solid #1C4B3C' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>SKU</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Qty (boxes)</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Unit Cost</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #ECE6DB' }}>
                <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{l.sku}</td>
                <td style={{ padding: '8px 6px' }}>{l.description}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{l.quantity}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{l.received_unit_price != null ? Number(l.received_unit_price).toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #1C4B3C' }}>
              <td colSpan={2} style={{ padding: '8px 6px', fontWeight: 700 }}>Total</td>
              <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{totalQty}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: '32px', fontSize: '9px', color: '#B3AA99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          DH Signature · {po.po_number} · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}
