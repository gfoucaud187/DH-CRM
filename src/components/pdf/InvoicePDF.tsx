'use client'

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
    const el = document.getElementById('invoice-print-area-' + order.id)
    if (!el) return
    const canvas = await html2canvas(el, {  background: '#ffffff' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const w = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const h = (canvas.height * w) / canvas.width
    const totalPages = Math.ceil(h / pageHeight)
    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, -(i * pageHeight), w, h)
    }
    pdf.save(order.order_number + '.pdf')
  }

  const isTT = order.is_tt_order || customer?.track_trace_enabled
  const isFoc = order.is_foc
  const isSample = order.is_sample

  const fixmerName    = appSettings?.tt_company   ?? 'Fixmer Belgium S.A.'
  const fixmerContact = appSettings?.tt_attention  ?? 'Mr Jérémy JACQUES'
  const fixmerEmail   = appSettings?.tt_email      ?? 'jjacques@fixmer.lu'
  const fixmerPhone   = appSettings?.tt_phone      ?? '+352 621 366 634'

  const billToName    = isTT ? fixmerName    : (order.bill_to_name ?? customer?.legal_name ?? order.customer_name)
  const billToContact = isTT ? fixmerContact : customer?.contacts?.[0]?.name
  const billToEmail   = isTT ? fixmerEmail   : customer?.contacts?.[0]?.email
  const billToPhone   = isTT ? fixmerPhone   : customer?.contacts?.[0]?.phone
  const careOfName    = isTT ? (order.care_of_name ?? customer?.legal_name ?? order.customer_name) : null

  const primaryAddress = customer?.addresses?.[0]
  const billToAddress  = isTT ? null : primaryAddress

  const docDate = order.order_date
    ? new Date(order.order_date).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB')

  const paymentInfo = appSettings?.payment_info ??
    `Beneficiary name and address: Nadir y Bohue Pte. Ltd. / 20C Sea avenue / Singapore 424243 / Singapore
Account number: 048-904845-0
Swift/BIC: DBSSSGSG
Beneficiary bank and address: DBS Bank Ltd / 12 Marina Boulevard / DBS Asia Central / Marina Bay Financial Centre Tower 3 / Singapore 018982 / Singapore

Bank fees: Please make sure to tick 'OUR' in the payment bank fees details.
Amounts received need to coincide with amounts invoiced.`

  const COLS = [
    { label: 'PRODUCT',       align: 'left'  },
    { label: 'SKU (DH)',      align: 'left'  },
    { label: 'REF. FIXMER',   align: 'left'  },
    { label: 'PRICE/UNIT',    align: 'right' },
    { label: 'PACKS',         align: 'right' },
    { label: 'UNITS',         align: 'right' },
    { label: 'TOTAL',         align: 'right' },
  ]

  return (
    <div>
      <button onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
        <Download className="h-4 w-4" />
        Download PDF
      </button>

      <div
        id={'invoice-print-area-' + order.id}
        style={{ position: 'fixed', left: '-9999px', top: 0, width: '794px', background: '#fff', padding: '48px 56px', fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#1a1a1a', boxSizing: 'border-box' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', letterSpacing: '-1px' }}>dh.</div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '2px', marginTop: '2px' }}>SIGNATURE</div>
            <div style={{ fontSize: '8px', color: '#888', letterSpacing: '1px' }}>CREATING UNIQUE MOMENTS</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{order.order_number}</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Date: {docDate}</div>
          </div>
        </div>

        {/* Bill To */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '9px', color: '#999', letterSpacing: '1px', marginBottom: '8px' }}>
            {isFoc || isSample ? 'DELIVER TO' : 'INVOICE TO'}
          </div>
          <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>{billToName}</div>
          {billToContact && <div style={{ color: '#333' }}>{billToContact}</div>}
          {billToEmail && <div style={{ color: '#555' }}>{billToEmail}</div>}
          {billToPhone && <div style={{ color: '#555' }}>{billToPhone}</div>}
          {billToAddress && (
            <div style={{ color: '#555', marginTop: '4px' }}>
              {[billToAddress.street1, billToAddress.city, billToAddress.postal_code, billToAddress.country].filter(Boolean).join(', ')}
            </div>
          )}

          {isTT && careOfName && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '9px', color: '#999', letterSpacing: '1px', marginBottom: '8px' }}>C/O (END CUSTOMER)</div>
              <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>{careOfName}</div>
            </div>
          )}

          <div style={{ marginTop: '16px', display: 'flex', gap: '40px', fontSize: '11px' }}>
            {order.incoterms && <div><span style={{ color: '#999' }}>Incoterms: </span><span>{order.incoterms}</span></div>}
            {order.payment_terms && <div><span style={{ color: '#999' }}>Payment: </span><span>{order.payment_terms}</span></div>}
            {order.warehouse && <div><span style={{ color: '#999' }}>Warehouse: </span><span>{order.warehouse}</span></div>}
          </div>

          {isTT && (
            <div style={{ marginTop: '12px', display: 'inline-block', background: '#e6f1fb', color: '#185fa5', fontSize: '9px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
              TRACK & TRACE
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: '24px' }} />

        {/* Lines table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {COLS.map(col => (
                <th key={col.label} style={{
                  textAlign: col.align as any,
                  padding: '8px 4px',
                  fontSize: '9px',
                  color: '#999',
                  fontWeight: 'normal',
                  letterSpacing: '0.5px'
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '12px 4px', fontWeight: '500', maxWidth: '180px' }}>{line.product_name}</td>
                <td style={{ padding: '12px 4px', color: '#666', fontFamily: 'monospace', fontSize: '10px' }}>{line.sku}</td>
                <td style={{ padding: '12px 4px', color: '#666', fontFamily: 'monospace', fontSize: '10px' }}>{line.fixmer_reference ?? '—'}</td>
                <td style={{ padding: '12px 4px', textAlign: 'right' }}>
                  {isFoc || isSample ? '—' : Number(line.price_per_unit).toFixed(2)}
                </td>
                <td style={{ padding: '12px 4px', textAlign: 'right' }}>{line.quantity_packs}</td>
                <td style={{ padding: '12px 4px', textAlign: 'right' }}>{line.quantity_units}</td>
                <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: '500' }}>
                  {isFoc || isSample ? '—' : Number(line.line_total).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
          <div style={{ minWidth: '220px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#666', fontSize: '11px' }}>
              <span>Total Packs</span><span>{order.total_packs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#666', fontSize: '11px' }}>
              <span>Total Units</span><span>{order.total_units}</span>
            </div>
            <div style={{ borderTop: '2px solid #1a1a1a', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
              <span>TOTAL</span>
              <span>{isFoc || isSample ? 'FOC' : order.currency + ' ' + Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment info */}
        {!isFoc && !isSample && order.document_type === 'invoice' && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '32px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '8px' }}>FOR PAYMENT</div>
            <div style={{ fontSize: '10px', color: '#555', lineHeight: '1.6', whiteSpace: 'pre-line' }}>{paymentInfo}</div>
          </div>
        )}

        {order.notes && (
          <div style={{ marginBottom: '24px', fontSize: '11px', color: '#666' }}>
            <strong>Notes:</strong> {order.notes}
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', textAlign: 'center', fontSize: '10px', color: '#aaa' }}>
          DH Signature · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}