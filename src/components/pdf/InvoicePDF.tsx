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
    const canvas = await html2canvas(el, { useCORS: true })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
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

  const isTT     = (order.is_tt_order || customer?.track_trace_enabled || customer?.eu_compliance_type === 'TT') && order.document_type === 'invoice'
  const isFoc    = order.is_foc
  const isSample = order.is_sample

  // Find Sales contact and format as single line
  const salesContact = customer?.contacts?.find((c: any) => c.role === 'Sales') ?? customer?.contacts?.[0]
  const salesContactLine = salesContact
    ? [
        [salesContact.first_name, salesContact.last_name].filter(Boolean).join(' '),
        salesContact.email,
        salesContact.phone,
      ].filter(Boolean).join(' | ')
    : null

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
`Beneficiary: Nadir y Bohue Pte. Ltd. / 20C Sea avenue / Singapore 424243
Account: 048-904845-0 · Swift/BIC: DBSSSGSG
Bank: DBS Bank Ltd / 12 Marina Boulevard / Marina Bay Financial Centre Tower 3 / Singapore 018982
Bank fees: tick 'OUR'. Amounts received must match amounts invoiced.`

  // A4 landscape = 297mm = ~1122px at 96dpi. 1.5cm margin = 57px each side.
  const HEADERS = [
    { label: 'BRAND & LINE',     w: '13%', align: 'left'   },
    { label: 'VITOLA',           w: '7%',  align: 'left'   },
    { label: 'SKU (REF DH)',     w: '9%',  align: 'left'   },
    { label: 'REF\nFIXMER',     w: '6%',  align: 'left'   },
    { label: 'QTY\nBOXES',      w: '4%',  align: 'right'  },
    { label: 'TOTAL\nARTICLES', w: '5%',  align: 'right'  },
    { label: 'DIM\n(L×CEPO)',   w: '6%',  align: 'center' },
    { label: 'SHAPE',            w: '5%',  align: 'center' },
    { label: 'WRAPPER',          w: '9%',  align: 'left'   },
    { label: 'PACK\nTYPE',      w: '4%',  align: 'center' },
    { label: 'QTY\n/PACK',      w: '4%',  align: 'right'  },
    { label: 'NET WT\n/UNIT g', w: '5%',  align: 'right'  },
    { label: 'NET WT\nTOTAL g', w: '5%',  align: 'right'  },
    { label: 'PRICE\n/UNIT',    w: '5%',  align: 'right'  },
    { label: 'PRICE\nTOTAL',    w: '5%',  align: 'right'  },
  ]

  const td = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    padding: '7px 4px',
    fontSize: '9px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    ...extra,
  })

  return (
    <div>
      <button onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
        <Download className="h-4 w-4" />
        Download PDF
      </button>

      <div
        id={'invoice-print-area-' + order.id}
        style={{
          position: 'fixed', left: '-9999px', top: 0,
          width: '1122px',
          background: '#fff',
          padding: '57px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '11px',
          color: '#1a1a1a',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 'bold', letterSpacing: '-1px' }}>dh.</div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '3px', marginTop: '2px' }}>SIGNATURE</div>
            <div style={{ fontSize: '7px', color: '#aaa', letterSpacing: '1px' }}>CREATING UNIQUE MOMENTS</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{order.order_number}</div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>Date: {docDate}</div>
            {order.shipment_date && <div style={{ fontSize: '10px', color: '#666' }}>Shipment: {new Date(order.shipment_date).toLocaleDateString('en-GB')}</div>}
          </div>
        </div>

        {/* BILL TO + META */}
        <div style={{ display: 'flex', gap: '40px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '8px', color: '#999', letterSpacing: '1px', marginBottom: '6px' }}>
              {isFoc || isSample ? 'DELIVER TO' : order.document_type === 'invoice' ? 'INVOICE TO' : 'SALES ORDER TO'}
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '3px' }}>{billToName}</div>
            {!isTT && salesContactLine && <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>{salesContactLine}</div>}
            {isTT && billToContact && <div style={{ color: '#444', fontSize: '10px' }}>{billToContact}</div>}
            {isTT && billToEmail   && <div style={{ color: '#666', fontSize: '10px' }}>{billToEmail}</div>}
            {isTT && billToPhone   && <div style={{ color: '#666', fontSize: '10px' }}>{billToPhone}</div>}
            {billToAddress && (
              <div style={{ color: '#666', fontSize: '10px', marginTop: '3px' }}>
                {[billToAddress.street1, billToAddress.city, billToAddress.postal_code, billToAddress.country].filter(Boolean).join(', ')}
              </div>
            )}
            {isTT && careOfName && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '8px', color: '#999', letterSpacing: '1px', marginBottom: '4px' }}>C/O (END CUSTOMER)</div>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '3px' }}>{careOfName}</div>
                {salesContactLine && <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>{salesContactLine}</div>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '28px', fontSize: '10px', alignItems: 'flex-start', paddingTop: '18px' }}>
            {order.incoterms     && <div><div style={{ color: '#999', fontSize: '8px', marginBottom: '2px' }}>INCOTERMS</div><div style={{ fontWeight: 'bold' }}>{order.incoterms}</div></div>}
            {order.payment_terms && <div><div style={{ color: '#999', fontSize: '8px', marginBottom: '2px' }}>PAYMENT</div><div style={{ fontWeight: 'bold' }}>{order.payment_terms}</div></div>}
            {order.currency      && <div><div style={{ color: '#999', fontSize: '8px', marginBottom: '2px' }}>CURRENCY</div><div style={{ fontWeight: 'bold' }}>{order.currency}</div></div>}
            {order.warehouse     && <div><div style={{ color: '#999', fontSize: '8px', marginBottom: '2px' }}>WAREHOUSE</div><div style={{ fontWeight: 'bold' }}>{order.warehouse}</div></div>}
          </div>
        </div>

        {isTT && (
          <div style={{ marginBottom: '10px' }}>
            <span style={{ background: '#e6f1fb', color: '#185fa5', fontSize: '8px', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>TRACK & TRACE</span>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: '14px' }} />

        {/* LINES TABLE */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px', tableLayout: 'fixed' }}>
          <colgroup>
            {HEADERS.map((h, i) => <col key={i} style={{ width: h.w }} />)}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #1a1a1a', background: '#f9fafb' }}>
              {HEADERS.map((h, i) => (
                <th key={i} style={{
                  textAlign: h.align as any,
                  padding: '6px 4px',
                  fontSize: '7.5px',
                  color: '#444',
                  fontWeight: 'bold',
                  whiteSpace: 'pre-line',
                  lineHeight: '1.3',
                  overflow: 'hidden',
                }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line: any, idx: number) => {
              // Fields come pre-enriched from order-detail-page.tsx
              const dim        = (line.length_inches && line.ring_gauge) ? `${line.length_inches}×${line.ring_gauge}` : '—'
              const netWtTotal = (line.net_weight_g && line.quantity_units) ? (Number(line.net_weight_g) * Number(line.quantity_units)).toFixed(0) : '—'
              const priceUnit  = (!isFoc && !isSample && line.price_per_unit)  ? Number(line.price_per_unit).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})  : '—'
              const priceTotal = (!isFoc && !isSample && line.line_total)      ? Number(line.line_total).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})      : '—'
              // Brand & Line from product_name "Brand_Line Vitola Pack"
              const parts     = (line.product_name ?? '').split(' ')
              const brandLine = parts[0]?.replace(/_/g, ' ') ?? line.product_name
              const vitola    = line.vitola ?? parts.slice(1, -1).join(' ') ?? '—'
              const bg        = idx % 2 === 0 ? '#fff' : '#fafafa'

              return (
                <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0', background: bg }}>
                  <td style={td({ fontWeight: '500' })}>{brandLine}</td>
                  <td style={td({ color: '#444' })}>{vitola}</td>
                  <td style={td({ fontFamily: 'monospace', fontSize: '8px', color: '#555' })}>{line.sku}</td>
                  <td style={td({ fontFamily: 'monospace', fontSize: '8px', color: '#777' })}>{line.fixmer_reference ?? '—'}</td>
                  <td style={td({ textAlign: 'right', fontWeight: '500' })}>{line.quantity_packs}</td>
                  <td style={td({ textAlign: 'right', fontWeight: '500' })}>{line.quantity_units}</td>
                  <td style={td({ textAlign: 'center', fontFamily: 'monospace' })}>{dim}</td>
                  <td style={td({ textAlign: 'center' })}>{line.shape ?? '—'}</td>
                  <td style={td()}>{line.wrapper ?? '—'}</td>
                  <td style={td({ textAlign: 'center' })}>{line.pack_type ?? '—'}</td>
                  <td style={td({ textAlign: 'right' })}>{line.units_per_pack ?? '—'}</td>
                  <td style={td({ textAlign: 'right' })}>{line.net_weight_g ? Number(line.net_weight_g).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
                  <td style={td({ textAlign: 'right' })}>{netWtTotal}</td>
                  <td style={td({ textAlign: 'right' })}>{priceUnit}</td>
                  <td style={td({ textAlign: 'right', fontWeight: '500' })}>{priceTotal}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* TOTALS */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <div style={{ minWidth: '220px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#666', fontSize: '10px' }}>
              <span>Total Boxes</span><span style={{ fontWeight: '500' }}>{order.total_packs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#666', fontSize: '10px' }}>
              <span>Total Articles</span><span style={{ fontWeight: '500' }}>{order.total_units}</span>
            </div>
            <div style={{ borderTop: '2px solid #1a1a1a', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
              <span>TOTAL</span>
              <span>{(isFoc || isSample) ? 'FOC' : `${order.currency} ${Number(order.total_amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`}</span>
            </div>
          </div>
        </div>

        {/* PAYMENT INFO */}
        {!isFoc && !isSample && order.document_type === 'invoice' && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '14px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '6px', letterSpacing: '0.5px' }}>PAYMENT DETAILS</div>
            <div style={{ fontSize: '9px', color: '#555', lineHeight: '1.7', whiteSpace: 'pre-line' }}>{paymentInfo}</div>
          </div>
        )}

        {order.notes && (
          <div style={{ marginBottom: '16px', fontSize: '10px', color: '#666' }}>
            <strong>Notes:</strong> {order.notes}
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px', textAlign: 'center', fontSize: '9px', color: '#bbb' }}>
          DH Signature · {order.order_number} · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}