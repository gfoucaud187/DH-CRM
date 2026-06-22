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
    const pageEls = document.querySelectorAll(`[data-pdf-page="${order.id}"]`)
    if (!pageEls.length) return
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pdfW = pdf.internal.pageSize.getWidth()
    const pdfH = pdf.internal.pageSize.getHeight()
    for (let i = 0; i < pageEls.length; i++) {
      const el = pageEls[i] as HTMLElement
      const canvas = await html2canvas(el, { useCORS: true, allowTaint: false })
      const imgData = canvas.toDataURL('image/png')
      const imgH = (canvas.height * pdfW) / canvas.width
      if (i > 0) pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, Math.min(imgH, pdfH))
    }
    pdf.save(order.order_number + '.pdf')
  }

  const isInvoice = order.document_type === 'invoice'
  const isFoc     = order.is_foc
  const isSample  = order.is_sample
  const isTT      = (order.is_tt_order || customer?.track_trace_enabled || customer?.eu_compliance_type === 'TT') && isInvoice

  const accent   = isInvoice ? '#6A1E2A' : '#1C4B3C'
  const tint     = isInvoice ? '#F7EDED' : '#EEF3F0'
  const onAccent = isInvoice ? '#D9A6AC' : '#9FBDB0'

  const salesContact = customer?.contacts?.find((c: any) => c.role === 'Sales') ?? customer?.contacts?.[0]
  const salesContactLine = salesContact
    ? [
        [salesContact.first_name, salesContact.last_name].filter(Boolean).join(' '),
        salesContact.email,
        salesContact.phone,
      ].filter(Boolean).join(' | ')
    : null

  const fixmerName        = appSettings?.tt_company   ?? 'Fixmer Belgium S.A.'
  const fixmerContactLine = [
    appSettings?.tt_attention ?? 'Mr Jérémy JACQUES',
    appSettings?.tt_email     ?? 'jjacques@fixmer.lu',
    appSettings?.tt_phone     ?? '+352 621 366 634',
  ].join(' | ')

  const billToName        = isTT ? fixmerName        : (customer?.legal_name ?? order.customer_name)
  const billToContactLine = isTT ? fixmerContactLine : salesContactLine
  const endCustomerName   = isTT ? (customer?.legal_name ?? order.customer_name) : null
  const primaryAddress    = customer?.addresses?.[0]

  const docDate = order.order_date
    ? new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' / ')
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' / ')

  const totalNetWeightKg = lines.reduce((sum: number, l: any) =>
    l.net_weight_g && l.quantity_units ? sum + Number(l.net_weight_g) * Number(l.quantity_units) : sum, 0)
  const netTobaccoKg = (totalNetWeightKg / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  const totalValue = (!isFoc && !isSample && order.total_amount)
    ? Number(order.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'FOC'

  const fmt2 = (n: any) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Split lines into pages
  const LINES_P1 = 10
  const LINES_PN = 14
  const pages: any[][] = []
  const remaining = [...lines]
  pages.push(remaining.splice(0, LINES_P1))
  while (remaining.length > 0) pages.push(remaining.splice(0, LINES_PN))
  const totalPages = pages.length

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .doc { width: 1123px; min-height: 794px; background: #FBF9F4; font-family: 'IBM Plex Sans', sans-serif; color: #221C18; display: flex; flex-direction: column; }
    .accent-bar { height: 6px; background: ${accent}; width: 100%; flex-shrink: 0; }
    .inner { padding: 38px 56px 32px; flex: 1; display: flex; flex-direction: column; gap: 18px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; }
    .header-right { text-align: right; }
    .doc-eyebrow { font-family: 'Cormorant Garamond', serif; font-size: 14px; font-weight: 600; color: ${accent}; letter-spacing: 0.34em; text-transform: uppercase; margin-bottom: 4px; }
    .doc-number { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; line-height: 1.2; letter-spacing: 0.04em; margin-bottom: 4px; }
    .doc-ref { font-family: 'Cormorant Garamond', serif; font-size: 32px; font-weight: 600; color: #8C8475; margin-top: 2px; font-variant-numeric: lining-nums; }
    .doc-date { font-size: 11px; color: #8C8475; margin-top: 6px; }
    .kpi-strip { display: flex; border: 1px solid #E6E0D5; border-radius: 6px; overflow: hidden; background: #fff; flex-shrink: 0; height: 72px; }
    .kpi-seg { flex: 1; padding: 4px 16px; border-right: 1px solid #E6E0D5; height: 72px; display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; }
    .kpi-seg-accent { flex: 1.2; padding: 4px 16px; background: ${accent}; height: 72px; display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; }
    .kpi-label { font-size: 9px; font-weight: 600; color: #A39A8A; letter-spacing: 0.18em; text-transform: uppercase; }
    .kpi-label-accent { font-size: 9px; font-weight: 600; color: ${onAccent}; letter-spacing: 0.18em; text-transform: uppercase; }
    .kpi-value { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; line-height: 1; font-variant-numeric: lining-nums; }
    .kpi-value-accent { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; line-height: 1; color: #fff; font-variant-numeric: lining-nums; }
    .parties { display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; }
    .party-block { flex: 1; }
    .party-eyebrow { font-size: 9px; font-weight: 600; color: #A39A8A; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 6px; }
    .party-name { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; margin-bottom: 3px; line-height: 1.2; }
    .party-contact { font-size: 11px; color: #3A352E; line-height: 1.6; }
    .party-addr { font-size: 11px; color: #6E665A; margin-top: 2px; }
    .co-block { margin-top: 12px; padding-top: 12px; border-top: 1px solid #E6E0D5; }
; border-radius: 999px; padding: 2px 10px; font-size: 9px; font-weight: 600; color: ${accent}; letter-spacing: 0.12em; margin-top: 6px; }
    .meta-block { flex: 1.6; padding-left: 40px; border-left: 1px solid #E6E0D5; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 24px; padding-top: 4px; }
    .meta-label { font-size: 9px; font-weight: 600; color: #A39A8A; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 3px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #221C18; }
    .line-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .line-table thead tr { background: ${tint}; border-bottom: 2px solid ${accent}; }
    .line-table th { font-size: 8px; font-weight: 600; color: ${accent}; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 6px; white-space: nowrap; overflow: hidden; }
    .line-table td { font-size: 11px; color: #3A352E; padding: 10px 6px; border-bottom: 1px solid #ECE6DB; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mono { font-family: 'IBM Plex Mono', monospace; font-size: 10px; }
    .ink { font-weight: 600; color: #221C18; }
    .muted { color: #6E665A; }
    .bottom-row { display: flex; gap: 48px; align-items: flex-end; margin-top: 16px; }
    .payment-card { flex: 1; background: #fff; border: 1px solid #E6E0D5; border-radius: 6px; padding: 14px 18px; }
    .payment-title { font-size: 9px; font-weight: 600; color: ${accent}; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 8px; }
    .payment-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 10px; color: #3A352E; line-height: 1.5; }
    .payment-key { color: #A39A8A; font-weight: 600; font-size: 9px; white-space: nowrap; }
    .totals-block { width: 300px; text-align: right; }
    .total-line { display: flex; justify-content: space-between; font-size: 11px; color: #6E665A; padding: 3px 0; }
    .total-line span:last-child { font-family: 'IBM Plex Mono', monospace; }
    .total-hr { border: none; border-top: 1px solid #E6E0D5; margin: 8px 0; }
    .grand-row { display: flex; justify-content: space-between; align-items: baseline; }
    .grand-label { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; }
    .grand-value { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 700; color: ${accent}; font-variant-numeric: lining-nums; }
    .footer { border-top: 1px solid #E6E0D5; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; margin-top: auto; }
    .footer-notes { font-size: 10px; color: #6E665A; max-width: 500px; }
    .footer-right { font-size: 9px; color: #B3AA99; letter-spacing: 0.12em; text-transform: uppercase; text-align: right; }
    .page-num { font-size: 9px; color: #B3AA99; letter-spacing: 0.08em; margin-top: 3px; }
  `

  const TableHead = () => (
    <thead>
      <tr>
        {[
          ['Brand & Line','left','14%'],['Vitola','left','8%'],['SKU · Ref DH','left','9%'],['Ref Fixmer','left','7%'],
          ['Boxes','center','4%'],['Articles','center','5%'],['Dim L×Cepo','center','6%'],['Shape','left','5%'],
          ['Wrapper','left','8%'],['Pack','center','4%'],['Net/U g','right','5%'],['Net Tot g','right','6%'],
          ['Price/U','right','6%'],['Total','right','7%'],
        ].map(([h, a, w], i) => (
          <th key={i} style={{ textAlign: a as any, width: w }}>{h}</th>
        ))}
      </tr>
    </thead>
  )

  const TableRow = ({ line, idx }: { line: any; idx: number }) => {
    const dim        = (line.length_inches && line.ring_gauge) ? `${line.length_inches}×${line.ring_gauge}` : '—'
    const netWtTotal = (line.net_weight_g && line.quantity_units)
      ? Number((Number(line.net_weight_g) * Number(line.quantity_units)).toFixed(2)).toLocaleString('en-US')
      : '—'
    const priceUnit  = (!isFoc && !isSample && line.price_per_unit != null) ? fmt2(line.price_per_unit) : '—'
    const priceTotal = (!isFoc && !isSample && line.line_total != null)     ? fmt2(line.line_total)     : '—'
    const brandLine  = line.brand
      ? (line.line_name ? line.brand + ' ' + line.line_name : line.brand)
      : (line.product_name ?? '').split(' ')[0]?.replace(/_/g, ' ') ?? line.product_name
    const vitola     = line.vitola ?? '—'
    return (
      <tr key={idx}>
        <td className="ink" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{brandLine}</td>
        <td>{vitola}</td>
        <td className="mono muted">{line.sku}</td>
        <td className="mono muted">{line.fixmer_reference ?? '—'}</td>
        <td style={{ textAlign: 'center' }}>{line.quantity_packs}</td>
        <td style={{ textAlign: 'center' }}>{line.quantity_units}</td>
        <td className="mono" style={{ textAlign: 'center' }}>{dim}</td>
        <td>{line.shape ?? '—'}</td>
        <td>{line.wrapper ?? '—'}</td>
        <td style={{ textAlign: 'center' }}>{line.pack_type ?? '—'}</td>
        <td className="mono" style={{ textAlign: 'right' }}>{line.net_weight_g ? fmt2(line.net_weight_g) : '—'}</td>
        <td className="mono" style={{ textAlign: 'right' }}>{netWtTotal}</td>
        <td className="mono" style={{ textAlign: 'right' }}>{priceUnit}</td>
        <td className="mono ink" style={{ textAlign: 'right' }}>{priceTotal}</td>
      </tr>
    )
  }

  return (
    <div>
      <button onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
        <Download className="h-4 w-4" />
        Download PDF
      </button>

      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />

        {pages.map((pageLines, pageIdx) => {
          const isFirst = pageIdx === 0
          const isLast  = pageIdx === pages.length - 1
          return (
            <div key={pageIdx} data-pdf-page={order.id} className="doc">
              <div className="accent-bar" />
              <div className="inner">

                {/* HEADER — first page only */}
                {isFirst && (
                  <div className="header">
                    <div>
                      <img src="https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/Logo_DH_signature_color_white_background.png" alt="DH Signature" style={{ height: '72px', width: 'auto' }} />
                    </div>
                    <div className="header-right">
                      <div className="doc-eyebrow">{isInvoice ? 'Invoice' : 'Sales Order'}</div>
                      <div className="doc-number">{order.order_number}</div>
                      {isInvoice && order.promoted_from_number && <div className="doc-ref">{order.promoted_from_number}</div>}
                      <div className="doc-date">{docDate}</div>
                    </div>
                  </div>
                )}

                {/* KPI STRIP — first page only */}
                {isFirst && (
                  <div className="kpi-strip">
                    {[
                      { label: 'Total Packs',    value: String(order.total_packs ?? 0), accent: false },
                      { label: 'Total Articles', value: String(order.total_units ?? 0), accent: false },
                      { label: 'Net Tobacco kg', value: netTobaccoKg,                   accent: false },
                      { label: isInvoice ? 'Amount Due' : 'Total Value',
                        value: isFoc || isSample ? 'FOC' : `USD ${totalValue}`,          accent: true  },
                    ].map((k, i) => (
                      <div key={i} className={k.accent ? 'kpi-seg-accent' : 'kpi-seg'}>
                        <div className={k.accent ? 'kpi-label-accent' : 'kpi-label'}>{k.label}</div>
                        <div className={k.accent ? 'kpi-value-accent' : 'kpi-value'}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* PARTIES + META — first page only */}
                {isFirst && (
                  <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start', flexShrink: 0 }}>
                    <div className="party-block">
                      <div className="party-eyebrow">
                        {isFoc || isSample ? 'Deliver To' : isInvoice ? 'Invoice To' : 'Sales Order To'}
                      </div>
                      <div className="party-name">{billToName}</div>
                      {billToContactLine && <div className="party-contact">{billToContactLine}</div>}
                      {!isTT && primaryAddress && (
                        <div className="party-addr">
                          {[primaryAddress.street1, primaryAddress.city, primaryAddress.postal_code, primaryAddress.country].filter(Boolean).join(', ')}
                        </div>
                      )}
                      {isTT && endCustomerName && (
                        <div className="co-block">
                          <div className="party-eyebrow">C/O — End Customer</div>
                          <div className="party-name">{endCustomerName}</div>
                          {salesContactLine && <div className="party-contact">{salesContactLine}</div>}
                          <span style={{ backgroundColor: isInvoice ? '#6A1E2A' : '#1C4B3C', borderRadius: '999px', paddingTop: '2px', paddingBottom: '6px', paddingLeft: '12px', paddingRight: '12px', fontSize: '9px', fontWeight: 600, color: '#ffffff', letterSpacing: '0.12em', marginTop: '6px', fontFamily: 'Arial, sans-serif', display: 'inline-block', lineHeight: '1' }}>TRACK &amp; TRACE</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '28px', alignItems: 'flex-start', paddingTop: '4px', borderLeft: '1px solid #E6E0D5', paddingLeft: '40px' }}>
                      {[
                        { label: 'Incoterms', value: order.incoterms },
                        { label: 'Payment',   value: order.payment_terms },
                        { label: 'Currency',  value: order.currency },
                        { label: 'Warehouse', value: order.warehouse },
                      ].filter(m => m.value).map((m, i) => (
                        <div key={i}>
                          <div className="meta-label">{m.label}</div>
                          <div className="meta-value">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TABLE — all pages */}
                <table className="line-table">
                  <TableHead />
                  <tbody>
                    {pageLines.map((line: any, idx: number) => (
                      <TableRow key={idx} line={line} idx={idx} />
                    ))}
                  </tbody>
                </table>

                {/* TOTALS + PAYMENT — last page only */}
                {isLast && (
                  <div className="bottom-row">
                    {isInvoice && !isFoc && !isSample && (
                      <div className="payment-card">
                        <div className="payment-title">Payment Details</div>
                        <div className="payment-grid">
                          <span className="payment-key">Beneficiary</span>
                          <span>{appSettings?.payment_beneficiary ?? 'Nadir y Bohue Pte. Ltd. · 20C Sea Avenue · Singapore 424243'}</span>
                          <span className="payment-key">Account</span>
                          <span className="mono">{appSettings?.payment_account ?? '048-904845-0'}</span>
                          <span className="payment-key">Swift/BIC</span>
                          <span className="mono">{appSettings?.payment_swift ?? 'DBSSSGSG'}</span>
                          <span className="payment-key">Bank</span>
                          <span>{appSettings?.payment_bank ?? 'DBS Bank Ltd · 12 Marina Blvd · MBFC Tower 3 · Singapore 018982'}</span>
                          <span className="payment-key">Fees</span>
                          <span>{appSettings?.payment_fees ?? "Tick 'OUR' · amounts received must match amounts invoiced"}</span>
                        </div>
                      </div>
                    )}
                    <div style={{ flex: 1 }} />
                    <div className="totals-block">
                      <div className="total-line"><span>Total Boxes</span><span>{order.total_packs}</span></div>
                      <div className="total-line"><span>Total Articles</span><span>{order.total_units}</span></div>
                      <hr className="total-hr" />
                      <div className="grand-row">
                        <span className="grand-label">{isInvoice ? 'Amount Due' : 'Total'}</span>
                        <span className="grand-value">
                          {isFoc || isSample ? 'FOC' : `${order.currency} ${totalValue}`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* FOOTER — all pages */}
                <div className="footer">
                  <div className="footer-notes">
                    {isLast && order.notes && <span><strong>Notes:</strong> {order.notes}</span>}
                  </div>
                  <div className="footer-right">
                    {isLast && `DH Signature · ${order.order_number} · Generated ${new Date().toLocaleDateString('en-GB')}`}
                    {totalPages > 1 && (
                      <div className="page-num">{pageIdx + 1} / {totalPages}</div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}