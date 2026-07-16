'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getFilePath, getNextVersion, getTransformationFolderName, getTransformationFileName } from '@/lib/documents'
import { warehouseLabel } from '@/lib/warehouse'

interface TransformationPDFProps {
  transformation: any
}

export default function TransformationPDF({ transformation: tr }: TransformationPDFProps) {
  const [saving, setSaving] = useState(false)

  const folderName = getTransformationFolderName(tr)

  const generateAndSave = async () => {
    setSaving(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default
      const el = document.querySelector(`[data-transformation-page="${tr.id}"]`) as HTMLElement
      if (!el) return

      const canvas = await html2canvas(el, { useCORS: true })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const imgH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, imgH)
      const blob = pdf.output('blob')

      const supabase = createClient()
      const version = await getNextVersion(supabase, tr.id, 'transformation')
      const fileName = getTransformationFileName(tr, version)
      const filePath = getFilePath(folderName, fileName)

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { contentType: 'application/pdf', upsert: false })

      if (!uploadError) {
        await supabase.from('document_files').insert({
          folder_name: folderName,
          file_name: fileName,
          file_path: filePath,
          order_id: tr.id,
          document_type: 'transformation',
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
        <Download className="h-4 w-4" />{saving ? 'Generating...' : 'Generate Transformation Report'}
      </button>

      <div data-transformation-page={tr.id}
        style={{ position: 'absolute', left: -9999, top: 0, width: '794px', padding: '48px', background: '#fff', fontFamily: 'Arial, sans-serif', color: '#1a1a1a' }}>
        <div style={{ borderBottom: '3px solid #4338CA', paddingBottom: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4338CA', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Stock Transformation</div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>{tr.transformation_number}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '12px' }}>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Warehouse</div>
            <div style={{ fontWeight: 600 }}>{warehouseLabel(tr.warehouse)}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Date</div>
            <div style={{ fontWeight: 600 }}>{new Date(tr.transformation_date).toLocaleDateString('en-GB')}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '20px' }}>
          <thead>
            <tr style={{ background: '#EEF2FF', borderBottom: '2px solid #4338CA' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}></th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>SKU</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Product</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Boxes</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Units</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #ECE6DB' }}>
              <td style={{ padding: '8px 6px', fontWeight: 700, color: '#dc2626' }}>FROM</td>
              <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{tr.source_sku}</td>
              <td style={{ padding: '8px 6px' }}>{tr.source_product_name}</td>
              <td style={{ padding: '8px 6px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{tr.source_quantity_packs}</td>
              <td style={{ padding: '8px 6px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{tr.source_quantity_units}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #ECE6DB' }}>
              <td style={{ padding: '8px 6px', fontWeight: 700, color: '#16a34a' }}>TO</td>
              <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{tr.destination_sku}</td>
              <td style={{ padding: '8px 6px' }}>{tr.destination_product_name}</td>
              <td style={{ padding: '8px 6px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>+{tr.destination_quantity_packs}</td>
              <td style={{ padding: '8px 6px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>+{tr.destination_quantity_units}</td>
            </tr>
          </tbody>
        </table>

        {tr.notes && (
          <div style={{ marginBottom: '16px', fontSize: '11px', color: '#6E665A' }}>
            <strong>Notes:</strong> {tr.notes}
          </div>
        )}

        <div style={{ marginTop: '32px', fontSize: '9px', color: '#B3AA99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          DH Signature · {tr.transformation_number} · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}
