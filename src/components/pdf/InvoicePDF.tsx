'use client'

import { useRef } from 'react'
import { Download } from 'lucide-react'

interface InvoicePDFProps {
  order: any
  lines: any[]
  customer?: any
  appSettings?: any
}

export default function InvoicePDF({ order, lines, customer, appSettings }: InvoicePDFProps) {
  const handleDownload = async () => {
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const el = document.getElementById('invoice-print-area')
    if (!el) return
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const w = pdf.internal.pageSize.getWidth()
    const h = (canvas.height * w) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, w, h)
    pdf.save(order.order_number + '.pdf')
  }

  return (
    <div>
      <button onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
        <Download className="h-4 w-4" />
        Download PDF
      </button>

      <div id="invoice-print-area" style={{ position: 'fixed', left: '-9999px', top: 0, width: '794px', backgroundColor: '#fff', padding: '48px', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>dh.</div>
            <div style={{ fontSize: '9px', letterSpacing: '2px' }}>SIGNATURE</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{order.order_number}</div>
            <div style={{ fontSize: '11px', color: '#666' }}>Date: {order.order_date ? new Date(order.order_date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}</div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '9px', color: '#999', marginBottom: '6px' }}>INVOICE TO</div>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{order.customer_name}</div>
          {customer?.contacts?.[0] && <div>{customer.contacts[0].name}</div>}
          {customer?.contacts?.[0]?.email && <div style={{ color: '#555' }}>{customer.contacts[0].email}</div>}
          <div style={{ marginTop: '8px', display: 'flex', gap: '32px', fontSize: '11px' }}>
            {order.incoterms && <span>Incoterms: {order.incoterms}</span>}
            {order.payment_terms && <span>Payment: {order.payment_terms}</span>}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: '20px' }} />

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['PRODUCT','SKU','PRICE/UNIT','PACKS','UNITS','TOTAL'].map(h => (
                <th key={h} style={{ textAlign: h === 'PRODUCT' || h === 'SKU' ? 'left' : 'right', padding: '8px 4px', fontSize: '10px', color: '#999', fontWeight: 'normal' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 4px', fontWeight: '500' }}>{line.product_name}</td>
                <td style={{ padding: '10px 4px', color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>{line.sku}</td>
                <td style={{ padding: '10px 4px', textAlign: 'right' }}>{order.is_foc ? '—' : Number(line.price_per_unit).toFixed(2)}</td>
                <td style={{ padding: '10px 4px', textAlign: 'right' }}>{line.quantity_packs}</td>
                <td style={{ padding: '10px 4px', textAlign: 'right' }}>{line.quantity_units}</td>
                <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: '500' }}>{order.is_foc ? '—' : Number(line.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <div style={{ minWidth: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', padding: '3px 0' }}>
              <span>Total Packs</span><span>{order.total_packs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', padding: '3px 0' }}>
              <span>Total Units</span><span>{order.total_units}</span>
            </div>
            <div style={{ borderTop: '2px solid #1a1a1a', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
              <span>TOTAL</span>
              <span>{order.is_foc ? 'FOC' : order.currency + ' ' + Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {!order.is_foc && order.document_type === 'invoice' && appSettings?.payment_info && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', fontSize: '10px', color: '#555', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
            <strong style={{ display: 'block', marginBottom: '8px' }}>FOR PAYMENT</strong>
            {appSettings.payment_info}
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '32px', paddingTop: '12px', textAlign: 'center', fontSize: '10px', color: '#aaa' }}>
          DH Signature · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}