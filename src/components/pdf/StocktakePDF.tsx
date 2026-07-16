'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getFilePath, getNextVersion, getStocktakeFolderName, getStocktakeFileName } from '@/lib/documents'
import { warehouseLabel } from '@/lib/warehouse'

interface StocktakePDFProps {
  event: any
  lines: any[]
}

export default function StocktakePDF({ event, lines }: StocktakePDFProps) {
  const [saving, setSaving] = useState(false)

  const folderName = getStocktakeFolderName(event)

  const generateAndSave = async () => {
    setSaving(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default
      const el = document.querySelector(`[data-stocktake-page="${event.id}"]`) as HTMLElement
      if (!el) return

      const canvas = await html2canvas(el, { useCORS: true, scale: 2 })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const imgH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH)
      const blob = pdf.output('blob')

      const supabase = createClient()
      const version = await getNextVersion(supabase, event.id, 'stocktake_diff')
      const fileName = getStocktakeFileName(event, version)
      const filePath = getFilePath(folderName, fileName)

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { contentType: 'application/pdf', upsert: false })

      if (!uploadError) {
        await supabase.from('document_files').insert({
          folder_name: folderName,
          file_name: fileName,
          file_path: filePath,
          order_id: event.id,
          document_type: 'stocktake_diff',
          version,
          file_size: blob.size,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button onClick={generateAndSave} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
        <Download className="h-4 w-4" />{saving ? 'Generating...' : 'Generate Stocktake Report'}
      </button>

      <div data-stocktake-page={event.id}
        style={{ position: 'absolute', left: -9999, top: 0, width: '794px', padding: '48px', background: '#fff', fontFamily: 'Arial, sans-serif', color: '#1a1a1a' }}>
        <div style={{ borderBottom: '3px solid #ca8a04', paddingBottom: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#ca8a04', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Stocktake Difference Report</div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>{event.event_number}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '12px' }}>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Warehouse</div>
            <div style={{ fontWeight: 600 }}>{warehouseLabel(event.warehouse)}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Date</div>
            <div style={{ fontWeight: 600 }}>{new Date(event.event_date).toLocaleDateString('en-GB')}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Lines</div>
            <div style={{ fontWeight: 600 }}>{lines.length}</div>
          </div>
        </div>

        {event.notes && (
          <div style={{ marginBottom: '16px', fontSize: '11px', color: '#6E665A' }}>
            <strong>Notes:</strong> {event.notes}
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#FEF9E7', borderBottom: '2px solid #ca8a04' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>SKU</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Product</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Warehouse</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>System</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Counted</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Delta</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #ECE6DB' }}>
                <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{l.sku}</td>
                <td style={{ padding: '8px 6px' }}>{l.product_name}</td>
                <td style={{ padding: '8px 6px' }}>{warehouseLabel(l.warehouse)}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{l.system_quantity_packs}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{l.counted_quantity_packs}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: l.delta_packs >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  {l.delta_packs > 0 ? '+' : ''}{l.delta_packs}
                </td>
                <td style={{ padding: '8px 6px' }}>{l.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '32px', fontSize: '9px', color: '#B3AA99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          DH Signature · {event.event_number} · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}
