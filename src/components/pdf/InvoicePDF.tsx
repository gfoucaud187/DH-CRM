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
    const canvas = await html2canvas(el, { background: '#ffffff' })
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

  const isTT     = order.is_tt_order || customer?.track_trace_enabled
  const isFoc    = order.is_foc
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
    `Beneficiary: Nadir y Bohue Pte. Ltd. / 20C Sea avenue / Singapore 424243
Account: 048-904845-0 · Swift/BIC: DBSSSGSG
Bank: DBS Bank Ltd / 12 Marina Boulevard / Marina Bay Financial Centre Tower 3 / Singapore 018982
Bank fees: tick 'OUR'. Amounts received must match amounts invoiced.`

  // Landscape width ~1122px (A4 landscape at 96dpi)
  const PRINT_W = 1008

  const cell = (content: any, opts: {
    align?: 'left'|'right'|'center',
    mono?: boolean,
    bold?: boolean,
    gray?: boolean,
    small?: boolean,
    nowrap?: boolean,
    width?: string,
  } = {}) => ({
    content,
    textAlign: opts.align ?? 'left',
    fontFamily: opts.mono ? 'monospace' : 'Arial, sans-serif',
    fontWeight: opts.bold ? 'bold' : 'normal',
    color: opts.gray ? '#888' : '#1a1a1a',
    fontSize: opts.small ? '9px' : '10px',
    whiteSpace: opts.nowrap ? 'nowrap' : 'normal',
    width: opts.width,
    padding: '8px 5px',
  })

  return (
    <div>
      <button onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
        <Download className="h-4 w-4" />
        Download PDF
      </button>

      {/* PRINT AREA — landscape A4 = 1122px wide at 96dpi, we use 1060px + padding */}
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
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 'bold', letterSpacing: '-1px' }}>dh.</div>
            <div style={{ fontSize: '9px', fontWeight: 'bold', letterSpacing: '2px', marginTop: '2px' }}>SIGNATURE</div>
            <div style={{ fontSize: '7px', color: '#aaa', letterSpacing: '1px' }}>CREATING UNIQUE MOMENTS</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{order.order_number}</div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>Date: {docDate}</div>
            {order.shipment_date && (
              <div style={{ fontSize: '10px', color: '#666' }}>
                Shipment: {new Date(order.shipment_date).toLocaleDateString('en-GB')}
              </div>
            )}
          </div>
        </div>

        {/* ── BILL TO + META ── */}
        <div style={{ display: 'flex', gap: '48px', marginBottom: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '8px', color: '#999', letterSpacing: '1px', marginBottom: '6px' }}>
              {isFoc || isSample ? 'DELIVER TO' : 'INVOICE TO'}
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '3px' }}>{billToName}</div>
            {billToContact && <div style={{ color: '#444', fontSize: '10px' }}>{billToContact}</div>}
            {billToEmail   && <div style={{ color: '#666', fontSize: '10px' }}>{billToEmail}</div>}
            {billToPhone   && <div style={{ color: '#666', fontSize: '10px' }}>{billToPhone}</div>}
            {billToAddress && (
              <div style={{ color: '#666', fontSize: '10px', marginTop: '3px' }}>
                {[billToAddress.street1, billToAddress.city, billToAddress.postal_code, billToAddress.country].filter(Boolean).join(', ')}
              </div>
            )}
            {isTT && careOfName && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '8px', color: '#999', letterSpacing: '1px', marginBottom: '4px' }}>C/O (END CUSTOMER)</div>
                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{careOfName}</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '32px', fontSize: '10px', alignItems: 'flex-start', paddingTop: '20px' }}>
            {order.incoterms     && <div><div style={{ color: '#999', fontSize: '8px', marginBottom: '2px' }}>INCOTERMS</div><div style={{ fontWeight: 'bold' }}>{order.incoterms}</div></div>}
            {order.payment_terms && <div><div style={{ color: '#999', fontSize: '8px', marginBottom: '2px' }}>PAYMENT</div><div style={{ fontWeight: 'bold' }}>{order.payment_terms}</div></div>}
            {order.currency      && <div><div style={{ color: '#999', fontSize: '8px', marginBottom: '2px' }}>CURRENCY</div><div style={{ fontWeight: 'bold' }}>{order.currency}</div></div>}
            {order.warehouse     && <div><div style={{ color: '#999', fontSize: '8px', marginBottom: '2px' }}>WAREHOUSE</div><div style={{ fontWeight: 'bold' }}>{order.warehouse}</div></div>}
          </div>
        </div>

        {isTT && (
          <div style={{ marginBottom: '12px' }}>
            <span style={{ background: '#e6f1fb', color: '#185fa5', fontSize: '8px', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>TRACK & TRACE</span>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: '16px' }} />

        {/* ── LINES TABLE ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', tableLayout: 'fixed', overflow: 'hidden' }}>
          <colgroup>
            <col style={{ width: '14%' }} />{/* Brand & Line */}
            <col style={{ width: '8%' }} /> {/* Vitola */}
            <col style={{ width: '10%' }} />{/* SKU */}
            <col style={{ width: '7%' }} /> {/* Ref Fixmer */}
            <col style={{ width: '5%' }} /> {/* Qty Packs */}
            <col style={{ width: '5%' }} /> {/* Total Articles */}
            <col style={{ width: '7%' }} /> {/* Dim */}
            <col style={{ width: '6%' }} /> {/* Shape */}
            <col style={{ width: '9%' }} /> {/* Wrapper */}
            <col style={{ width: '5%' }} /> {/* Pack Type */}
            <col style={{ width: '4%' }} /> {/* Qty/Pack */}
            <col style={{ width: '5%' }} /> {/* Net Wt/unit */}
            <col style={{ width: '5%' }} /> {/* Net Wt total */}
            <col style={{ width: '5%' }} /> {/* Price/unit */}
            <col style={{ width: '5%' }} /> {/* Price total */}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #1a1a1a', background: '#f9fafb' }}>
              {[
                { label: 'BRAND & LINE',     align: 'left'  },
                { label: 'VITOLA',            align: 'left'  },
                { label: 'SKU (REF DH)',      align: 'left'  },
                { label: 'REF FIXMER',        align: 'left'  },
                { label: 'QTY\nBOXES',        align: 'right' },
                { label: 'TOTAL\nARTICLES',   align: 'right' },
                { label: 'DIM\n(L×CEPO)',     align: 'center'},
                { label: 'SHAPE',             align: 'center'},
                { label: 'WRAPPER',           align: 'left'  },
                { label: 'PACK\nTYPE',        align: 'center'},
                { label: 'QTY\n/PACK',        align: 'right' },
                { label: 'NET WT\n/UNIT (g)', align: 'right' },
                { label: 'NET WT\nTOTAL (g)', align: 'right' },
                { label: 'PRICE\n/UNIT',      align: 'right' },
                { label: 'PRICE\nTOTAL',      align: 'right' },
              ].map((col, i) => (
                <th key={i} style={{ overflow: 'hidden', wordBreak: 'break-word',
                  textAlign: col.align as any,
                  padding: '6px 5px',
                  fontSize: '7.5px',
                  color: '#555',
                  fontWeight: 'bold',
                  letterSpacing: '0.3px',
                  whiteSpace: 'pre-line',
                  lineHeight: '1.3',
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line: any, idx: number) => {
              const dim = (line.length_inches && line.ring_gauge)
                ? `${line.length_inches}x${line.ring_gauge}`
                : '—'
              const netWtTotal = line.net_weight_g && line.quantity_units
                ? (line.net_weight_g * line.quantity_units).toFixed(0)
                : '—'
              const priceTotal = (!isFoc && !isSample && line.line_total)
                ? Number(line.line_total).toFixed(2)
                : '—'
              const priceUnit = (!isFoc && !isSample && line.price_per_unit)
                ? Number(line.price_per_unit).toFixed(2)
                : '—'

              // Parse brand & line from product_name (format: "Brand_Line Vitola Pack")
              const nameParts = (line.product_name ?? '').split(' ')
              const brandLine = nameParts[0]?.replace(/_/g, ' ') ?? line.product_name
              const vitola    = nameParts.slice(1, -1).join(' ') || '—'

              return (
                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '9px', fontWeight: '500' }}>{brandLine}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '9px', color: '#444' }}>{line.vitola ?? vitola}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace', fontSize: '8.5px', color: '#555' }}>{line.sku}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace', fontSize: '8.5px', color: '#777' }}>{line.fixmer_reference ?? '—'}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', fontWeight: '500' }}>{line.quantity_packs}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', fontWeight: '500' }}>{line.quantity_units}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', fontSize: '9px', fontFamily: 'monospace' }}>{dim}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', fontSize: '9px' }}>{line.shape ?? '—'}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '9px' }}>{line.wrapper ?? '—'}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', fontSize: '9px' }}>{line.pack_type ?? '—'}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', fontSize: '9px' }}>{line.units_per_pack ?? '—'}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', fontSize: '9px' }}>{line.net_weight_g ? Number(line.net_weight_g).toFixed(2) : '—'}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', fontSize: '9px' }}>{netWtTotal}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{priceUnit}</td>
                  <td style={{ padding: '7px 5px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right', fontWeight: '500' }}>{priceTotal}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ── TOTALS ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
          <div style={{ minWidth: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#666', fontSize: '10px' }}>
              <span>Total Boxes</span><span style={{ fontWeight: '500' }}>{order.total_packs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#666', fontSize: '10px' }}>
              <span>Total Articles</span><span style={{ fontWeight: '500' }}>{order.total_units}</span>
            </div>
            {!isFoc && !isSample && (
              <>
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold' }}>
                  <span>TOTAL</span>
                  <span>{order.currency} {Number(order.total_amount).toFixed(2)}</span>
                </div>
              </>
            )}
            {(isFoc || isSample) && (
              <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold' }}>
                <span>TOTAL</span><span>FOC</span>
              </div>
            )}
          </div>
        </div>

        {/* ── PAYMENT INFO ── */}
        {!isFoc && !isSample && order.document_type === 'invoice' && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '14px', marginBottom: '24px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '6px', letterSpacing: '0.5px' }}>PAYMENT DETAILS</div>
            <div style={{ fontSize: '9px', color: '#555', lineHeight: '1.7', whiteSpace: 'pre-line' }}>{paymentInfo}</div>
          </div>
        )}

        {order.notes && (
          <div style={{ marginBottom: '20px', fontSize: '10px', color: '#666' }}>
            <strong>Notes:</strong> {order.notes}
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', textAlign: 'center', fontSize: '9px', color: '#bbb' }}>
          DH Signature · {order.order_number} · Generated {new Date().toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  )
}