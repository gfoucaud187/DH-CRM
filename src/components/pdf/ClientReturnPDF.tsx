'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getFilePath, getNextVersion, getClientReturnFolderName, getClientReturnFileName } from '@/lib/documents'
import { warehouseLabel } from '@/lib/warehouse'

interface ClientReturnPDFProps {
  order: any
  lines: any[]
  sourceDoc?: any
}

export default function ClientReturnPDF({ order, lines, sourceDoc }: ClientReturnPDFProps) {
  const [saving, setSaving] = useState(false)

  const folderName = getClientReturnFolderName(order)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)
  const hasMixedWarehouses = new Set(lines.map((l: any) => l.warehouse ?? order.warehouse)).size > 1

  const generateAndSave = async () => {
    setSaving(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default
      const el = document.querySelector(`[data-client-return-page="${order.id}"]`) as HTMLElement
      if (!el) return

      const canvas = await html2canvas(el, { useCORS: true, scale: 2 })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const imgH = (canvas.height * pdfW) / canvas.width
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH)
      const blob = pdf.output('blob')

      const supabase = createClient()
      const version = await getNextVersion(supabase, order.id, 'client_return')
      const fileName = getClientReturnFileName(order, version)
      const filePath = getFilePath(folderName, fileName)

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { contentType: 'application/pdf', upsert: false })

      if (!uploadError) {
        await supabase.from('document_files').insert({
          folder_name: folderName,
          file_name: fileName,
          file_path: filePath,
          order_id: order.id,
          document_type: 'client_return',
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
        <Download className="h-4 w-4" />{saving ? 'Generating...' : 'Generate Client Return / Credit Note'}
      </button>

      <div data-client-return-page={order.id}
        style={{ position: 'absolute', left: -9999, top: 0, width: '794px', padding: '48px', background: '#fff', fontFamily: 'Arial, sans-serif', color: '#1a1a1a' }}>
        <div style={{ borderBottom: '3px solid #6A1E2A', paddingBottom: '16px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#6A1E2A', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Client Return / Credit Note</div>
          <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px' }}>{order.order_number}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '12px' }}>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Customer</div>
            <div style={{ fontWeight: 600 }}>{order.customer_name}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Original Order</div>
            <div style={{ fontWeight: 600 }}>{sourceDoc?.order_number ?? '—'}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Warehouse</div>
            <div style={{ fontWeight: 600 }}>{hasMixedWarehouses ? 'Mixed' : warehouseLabel(order.warehouse)}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>Date</div>
            <div style={{ fontWeight: 600 }}>{new Date(order.order_date ?? order.created_at).toLocaleDateString('en-GB')}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ background: '#F7EDED', borderBottom: '2px solid #6A1E2A' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>SKU</th>
              <th style={{ textAlign: 'left', padding: '8px 6px' }}>Product</th>
              {hasMixedWarehouses && <th style={{ textAlign: 'left', padding: '8px 6px' }}>Warehouse</th>}
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Qty (boxes)</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Unit Price</th>
              <th style={{ textAlign: 'right', padding: '8px 6px' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #ECE6DB' }}>
                <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{l.sku}</td>
                <td style={{ padding: '8px 6px' }}>{l.product_name}</td>
                {hasMixedWarehouses && <td style={{ padding: '8px 6px' }}>{warehouseLabel(l.warehouse ?? order.warehouse)}</td>}
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{l.quantity_packs}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{Number(l.price_per_unit).toFixed(2)}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #6A1E2A' }}>
              <td colSpan={hasMixedWarehouses ? 5 : 4} style={{ padding: '8px 6px', fontWeight: 700 }}>Total Credit</td>
              <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{order.currency} {totalCredit.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: '32px', fontSize: '9px', color: '#B3AA99', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          DH Signature · {order.order_number} · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}
