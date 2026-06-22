'use client'

import { useRef } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { Download } from 'lucide-react'

interface OrderLine {
  sku: string
  product_name: string
  quantity_packs: number
  quantity_units: number
  price_per_unit: number
  line_total: number
}

interface InvoicePDFProps {
  order: {
    order_number: string
    document_type: string
    is_foc: boolean
    is_sample: boolean
    customer_name: string
    currency: string
    total_amount: number
    total_packs: number
    total_units: number
    incoterms?: string
    payment_terms?: string
    order_date?: string
    shipment_date?: string
    warehouse?: string
    // TT fields
    is_tt_order?: boolean
    bill_to_name?: string
    bill_to_address?: any
    care_of_name?: string
    care_of_address?: any
    // SO(SAMPLE) / SO(DO)
    notes?: string
  }
  lines: OrderLine[]
  customer?: {
    legal_name: string
    contacts?: any[]
    addresses?: any[]
    vat_number?: string
    eori_number?: string
  }
  appSettings?: {
    tt_company?: string
    tt_attention?: string
    tt_email?: string
    tt_phone?: string
    payment_info?: string
  }
}

export default function InvoicePDF({ order, lines, customer, appSettings }: InvoicePDFProps) {
  const printRef = useRef<HTMLDivElement>(null)

  const handleDownload = async () => {
    if (!printRef.current) return
    const canvas = await html2canvas(printRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width

    let position = 0
    let remainingHeight = pdfHeight

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight)
    remainingHeight -= pdf.internal.pageSize.getHeight()

    while (remainingHeight > 0) {
      position -= pdf.internal.pageSize.getHeight()
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight)
      remainingHeight -= pdf.internal.pageSize.getHeight()
    }

    pdf.save(`${order.order_number}.pdf`)
  }

  const isTT = order.is_tt_order
  const billTo = isTT
    ? { name: order.bill_to_name ?? appSettings?.tt_company, address: order.bill_to_address }
    : { name: customer?.legal_name, address: customer?.addresses?.[0] }
  const careOf = isTT ? { name: order.care_of_name, address: order.care_of_address } : null

  const primaryContact = customer?.contacts?.[0]
  const docDate = order.order_date
    ? new Date(order.order_date).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : new Date().toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' })

  const paymentInfo = appSettings?.payment_info ?? `Beneficiary name and address: Nadir y Bohue Pte. Ltd. / 20C Sea avenue / Singapore 424243 / Singapore
Account number: 048-904845-0
Swift/BIC: DBSSSGSG
Beneficiary bank and address: DBS Bank Ltd / 12 Marina Boulevard / DBS Asia Central / Marina Bay Financial Centre Tower 3 / Singapore 018982 / Singapore

Bank fees: Please make sure to tick 'OUR' in the payment bank fees details.
Amounts received need to coincide with amounts invoiced.`

  return (
    <div>
      {/* Download button */}
      <button
        onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
      >
        <Download className="h-4 w-4" />
        Download PDF
      </button>

      {/* Hidden printable area */}
      <div className="fixed -left-[9999px] top-0">
        <div
          ref={printRef}
          style={{
            width: '794px',
            minHeight: '1123px',
            backgroundColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            color: '#1a1a1a',
            padding: '48px 56px',
            boxSizing: 'border-box',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
            {/* Logo */}
            <div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', letterSpacing: '-1px' }}>dh.</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', letterSpacing: '2px', marginTop: '2px' }}>SIGNATURE</div>
              <div style={{ fontSize: '8px', color: '#888', letterSpacing: '1px' }}>CREATING UNIQUE MOMENTS</div>
            </div>

            {/* Doc number + date */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#1a1a1a' }}>{order.order_number}</div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Date: {docDate}</div>
            </div>
          </div>

          {/* Bill to + C/O */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ fontSize: '9px', color: '#999', letterSpacing: '1px', marginBottom: '8px' }}>
              {order.is_foc || order.is_sample ? 'DELIVER TO' : 'INVOICE TO'}
            </div>

            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
              {billTo.name}
            </div>
            {!isTT && primaryContact && (
              <>
                <div>{primaryContact.name}</div>
                {primaryContact.email && <div style={{ color: '#555' }}>{primaryContact.email}</div>}
                {primaryContact.phone && <div style={{ color: '#555' }}>{primaryContact.phone}</div>}
              </>
            )}
            {billTo.address && (
              <div style={{ color: '#555', marginTop: '2px' }}>
                {[billTo.address.street1, billTo.address.city, billTo.address.country]
                  .filter(Boolean).join(', ')}
              </div>
            )}

            {/* C/O for TT */}
            {careOf && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '9px', color: '#999', letterSpacing: '1px', marginBottom: '6px' }}>
                  C/O (END CUSTOMER)
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{careOf.name}</div>
                {order.care_of_address && (
                  <div style={{ color: '#555' }}>
                    {[order.care_of_address.street1, order.care_of_address.city, order.care_of_address.country]
                      .filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Incoterms / Payment */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '40px' }}>
              {order.incoterms && (
                <div>
                  <span style={{ color: '#999', fontSize: '10px' }}>Incoterms: </span>
                  <span>{order.incoterms}</span>
                </div>
              )}
              {order.payment_terms && (
                <div>
                  <span style={{ color: '#999', fontSize: '10px' }}>Payment: </span>
                  <span>{order.payment_terms}</span>
                </div>
              )}
              {order.warehouse && (
                <div>
                  <span style={{ color: '#999', fontSize: '10px' }}>Warehouse: </span>
                  <span>{order.warehouse}</span>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: '24px' }} />

          {/* Lines table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: '10px', color: '#999', fontWeight: 'normal', letterSpacing: '0.5px' }}>PRODUCT</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: '10px', color: '#999', fontWeight: 'normal' }}>SKU</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '10px', color: '#999', fontWeight: 'normal' }}>PRICE/UNIT</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '10px', color: '#999', fontWeight: 'normal' }}>PACKS</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '10px', color: '#999', fontWeight: 'normal' }}>UNITS</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: '10px', color: '#999', fontWeight: 'normal' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 4px', fontWeight: '500' }}>{line.product_name}</td>
                  <td style={{ padding: '12px 4px', color: '#666', fontFamily: 'monospace', fontSize: '11px' }}>{line.sku}</td>
                  <td style={{ padding: '12px 4px', textAlign: 'right' }}>
                    {order.is_foc || order.is_sample ? '—' : line.price_per_unit.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 4px', textAlign: 'right' }}>{line.quantity_packs}</td>
                  <td style={{ padding: '12px 4px', textAlign: 'right' }}>{line.quantity_units}</td>
                  <td style={{ padding: '12px 4px', textAlign: 'right', fontWeight: '500' }}>
                    {order.is_foc || order.is_sample ? '—' : line.line_total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
            <div style={{ minWidth: '220px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#666', fontSize: '11px' }}>
                <span>Total Packs</span>
                <span>{order.total_packs}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#666', fontSize: '11px' }}>
                <span>Total Units</span>
                <span>{order.total_units}</span>
              </div>
              <div style={{ borderTop: '2px solid #1a1a1a', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
                <span>TOTAL</span>
                <span style={{ color: order.is_foc || order.is_sample ? '#888' : '#1a1a1a' }}>
                  {order.is_foc || order.is_sample
                    ? 'FOC'
                    : `${order.currency} ${order.total_amount.toFixed(2)}`}
                </span>
              </div>
            </div>
          </div>

          {/* Payment info — only for invoices with value */}
          {!order.is_foc && !order.is_sample && order.document_type === 'invoice' && (
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '32px',
            }}>
              <div style={{ fontWeight: 'bold', fontSize: '11px', color: '#1a1a1a', marginBottom: '8px' }}>
                FOR PAYMENT
              </div>
              <div style={{ fontSize: '10px', color: '#555', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                {paymentInfo}
              </div>
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div style={{ marginBottom: '24px', fontSize: '11px', color: '#666' }}>
              <strong>Notes:</strong> {order.notes}
            </div>
          )}

          {/* Footer */}
          <div style={{
            borderTop: '1px solid #e5e7eb',
            paddingTop: '16px',
            textAlign: 'center',
            fontSize: '10px',
            color: '#aaa',
          }}>
            DH Signature · Generated {new Date().toLocaleDateString('en-GB')}
          </div>
        </div>
      </div>
    </div>
  )
}
