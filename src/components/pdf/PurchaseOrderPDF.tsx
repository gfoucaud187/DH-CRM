'use client'

import { Download } from 'lucide-react'

interface PurchaseOrderPDFProps {
  order: any
  lines: any[]
  customer?: any
}

export default function PurchaseOrderPDF({ order, lines, customer }: PurchaseOrderPDFProps) {

  const handleDownload = async () => {
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const pageEls = document.querySelectorAll(`[data-pdf-page-po="${order.id}"]`)
    if (!pageEls.length) return
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pdfW = pdf.internal.pageSize.getWidth()
    for (let i = 0; i < pageEls.length; i++) {
      const el = pageEls[i] as HTMLElement
      const canvas = await html2canvas(el, { useCORS: true, allowTaint: false })
      const imgData = canvas.toDataURL('image/png')
      const imgH = (canvas.height * pdfW) / canvas.width
      if (i > 0) {
        pdf.addPage([pdfW, imgH], 'landscape')
      } else {
        pdf.internal.pageSize.height = imgH
      }
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, imgH)
    }
    pdf.save(order.order_number + '.pdf')
  }

  const accent   = '#4F3A8A'
  const tint     = '#F0ECF8'
  const onAccent = '#C4B3E8'

  const salesContact = customer?.contacts?.find((c: any) => c.role === 'Sales') ?? customer?.contacts?.[0]
  const salesContactLine = salesContact
    ? [
        [salesContact.first_name, salesContact.last_name].filter(Boolean).join(' '),
        salesContact.email,
        salesContact.phone,
      ].filter(Boolean).join(' | ')
    : null

  const primaryAddress = customer?.addresses?.[0]

  const docDate = order.order_date
    ? new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' / ')
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, ' / ')

  const submittedAt = order.created_at
    ? new Date(order.created_at).toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).replace(',', ' at')
    : null

  const totalNetWeightKg = lines.reduce((sum: number, l: any) =>
    l.net_weight_g && l.quantity_units ? sum + Number(l.net_weight_g) * Number(l.quantity_units) : sum, 0)
  const netTobaccoKg = (totalNetWeightKg / 1000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

  const fmt2 = (n: any) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const totalValue = Number(order.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
    .doc { width: 1123px; background: #FBF9F4; font-family: 'IBM Plex Sans', sans-serif; color: #221C18; display: flex; flex-direction: column; }
    .accent-bar { height: 6px; background: ${accent}; width: 100%; flex-shrink: 0; }
    .inner { padding: 38px 56px 32px; display: flex; flex-direction: column; gap: 18px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; }
    .header-right { text-align: right; }
    .doc-eyebrow { font-family: 'Cormorant Garamond', serif; font-size: 14px; font-weight: 600; color: ${accent}; letter-spacing: 0.34em; text-transform: uppercase; margin-bottom: 4px; }
    .doc-number { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; line-height: 1.2; letter-spacing: 0.04em; margin-bottom: 4px; }
    .doc-date { font-size: 11px; color: #8C8475; margin-top: 4px; }
    .doc-submitted { font-size: 10px; color: ${accent}; margin-top: 3px; font-weight: 500; }
    .kpi-strip { display: flex; border: 1px solid #E6E0D5; border-radius: 6px; overflow: hidden; background: #fff; flex-shrink: 0; height: 72px; }
    .kpi-seg { flex: 1; padding: 4px 16px; border-right: 1px solid #E6E0D5; height: 72px; display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; }
    .kpi-seg-accent { flex: 1.2; padding: 4px 16px; background: ${accent}; height: 72px; display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; }
    .kpi-label { font-size: 9px; font-weight: 600; color: #A39A8A; letter-spacing: 0.18em; text-transform: uppercase; }
    .kpi-label-accent { font-size: 9px; font-weight: 600; color: ${onAccent}; letter-spacing: 0.18em; text-transform: uppercase; }
    .kpi-value { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; line-height: 1; font-variant-numeric: lining-nums; }
    .kpi-value-accent { font-family: 'Cormorant Garamond', serif; font-size: 26px; font-weight: 600; line-height: 1; color: #fff; font-variant-numeric: lining-nums; }
    .party-eyebrow { font-size: 9px; font-weight: 600; color: #A39A8A; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 6px; }
    .party-name { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; margin-bottom: 3px; line-height: 1.2; }
    .party-contact { font-size: 11px; color: #3A352E; line-height: 1.6; }
    .party-addr { font-size: 11px; color: #6E665A; margin-top: 2px; }
    .meta-label { font-size: 9px; font-weight: 600; color: #A39A8A; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 3px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #221C18; }
    .line-table { width: 100%; border-collapse: collapse; table-layout: auto; }
    .line-table thead tr { background: ${tint}; border-bottom: 2px solid ${accent}; }
    .line-table th { font-size: 8px; font-weight: 600; color: ${accent}; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 6px; white-space: nowrap; }
    .line-table td { font-size: 11px; color: #3A352E; padding: 10px 6px; border-bottom: 1px solid #ECE6DB; overflow: hidden; text-overflow: ellipsis; }
    .mono { font-family: 'IBM Plex Mono', monospace; font-size: 10px; }
    .ink { font-weight: 600; color: #221C18; }
    .muted { color: #6E665A; }
    .bottom-row { display: flex; gap: 48px; align-items: flex-end; margin-top: 16px; }
    .totals-block { width: 300px; text-align: right; }
    .total-line { display: flex; justify-content: space-between; font-size: 11px; color: #6E665A; padding: 3px 0; }
    .total-line span:last-child { font-family: 'IBM Plex Mono', monospace; }
    .total-hr { border: none; border-top: 1px solid #E6E0D5; margin: 8px 0; }
    .grand-row { display: flex; justify-content: space-between; align-items: baseline; }
    .grand-label { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; }
    .grand-value { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 700; color: ${accent}; font-variant-numeric: lining-nums; }
    .footer { border-top: 1px solid #E6E0D5; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
    .footer-notes { font-size: 10px; color: #6E665A; max-width: 500px; }
    .footer-right { font-size: 9px; color: #B3AA99; letter-spacing: 0.12em; text-transform: uppercase; text-align: right; }
    .page-num { font-size: 9px; color: #B3AA99; letter-spacing: 0.08em; margin-top: 3px; }
  `

  const TableHead = () => (
    <thead>
      <tr>
        {[
          ['Brand & Line', 'left'], ['Vitola', 'left'], ['SKU · Ref DH', 'left'], ['Ref Fixmer', 'left'],
          ['Boxes', 'center'], ['Articles', 'center'], ['Dim L×Cepo', 'center'], ['Shape', 'left'],
          ['Wrapper', 'left'], ['Pack Type', 'center'], ['Qty/Pack', 'left'], ['Net/U g', 'right'],
          ['Net Tot g', 'right'], ['Price/U', 'right'], ['Total', 'right'],
        ].map(([h, a], i) => (
          <th key={i} style={{ textAlign: a as any }}>{h}</th>
        ))}
      </tr>
    </thead>
  )

  const TableRow = ({ line, idx }: { line: any; idx: number }) => {
    const dim = (line.length_inches && line.ring_gauge) ? `${line.length_inches}×${line.ring_gauge}` : '—'
    const netWtTotal = (line.net_weight_g && line.quantity_units)
      ? Math.round(Number(line.net_weight_g) * Number(line.quantity_units)).toLocaleString('en-US')
      : '—'
    const brandLine = line.brand
      ? (line.line_name ? line.brand + ' ' + line.line_name : line.brand)
      : (line.product_name ?? '').split(' ')[0]?.replace(/_/g, ' ') ?? line.product_name
    return (
      <tr key={idx}>
        <td className="ink" style={{ whiteSpace: 'nowrap' }}>{brandLine}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{line.vitola ?? '—'}</td>
        <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{line.sku}</td>
        <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{line.fixmer_reference ?? '—'}</td>
        <td style={{ textAlign: 'center' }}>{line.quantity_packs}</td>
        <td style={{ textAlign: 'center' }}>{line.quantity_units}</td>
        <td className="mono" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{dim}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{line.shape ?? '—'}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{line.wrapper ?? '—'}</td>
        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{line.pack_type ?? '—'}</td>
        <td className="mono" style={{ textAlign: 'left' }}>{line.units_per_pack ?? '—'}</td>
        <td className="mono" style={{ textAlign: 'right' }}>{line.net_weight_g ? fmt2(line.net_weight_g) : '—'}</td>
        <td className="mono" style={{ textAlign: 'right' }}>{netWtTotal}</td>
        <td className="mono" style={{ textAlign: 'right' }}>{line.price_per_unit != null ? fmt2(line.price_per_unit) : '—'}</td>
        <td className="mono ink" style={{ textAlign: 'right' }}>{line.line_total != null ? fmt2(line.line_total) : '—'}</td>
      </tr>
    )
  }

  return (
    <div>
      <button onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ background: accent }}>
        <Download className="h-4 w-4" />
        Download PDF
      </button>

      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />

        {pages.map((pageLines, pageIdx) => {
          const isFirst = pageIdx === 0
          const isLast  = pageIdx === pages.length - 1
          return (
            <div key={pageIdx} data-pdf-page-po={order.id} className="doc">
              <div className="accent-bar" />
              <div className="inner">

                {/* HEADER */}
                {isFirst && (
                  <div className="header">
                    <div>
                      <img src="https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/Logo_DH_signature_color_white_background.png" alt="DH Signature" style={{ height: '72px', width: 'auto' }} />
                    </div>
                    <div className="header-right">
                      <div className="doc-eyebrow">Purchase Order</div>
                      <div className="doc-number">{order.order_number}</div>
                      <div className="doc-date">{docDate}</div>
                      {submittedAt && (
                        <div className="doc-submitted">Submitted {submittedAt}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* KPI STRIP */}
                {isFirst && (
                  <div className="kpi-strip">
                    {[
                      { label: 'Total Packs',    value: String(order.total_packs ?? 0), accent: false },
                      { label: 'Total Articles', value: String(order.total_units ?? 0), accent: false },
                      { label: 'Net Tobacco kg', value: netTobaccoKg,                   accent: false },
                      { label: 'Order Total',    value: `${order.currency} ${totalValue}`, accent: true },
                    ].map((k, i) => (
                      <div key={i} className={k.accent ? 'kpi-seg-accent' : 'kpi-seg'}>
                        <div className={k.accent ? 'kpi-label-accent' : 'kpi-label'}>{k.label}</div>
                        <div className={k.accent ? 'kpi-value-accent' : 'kpi-value'}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* PARTIES + META */}
                {isFirst && (
                  <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start', flexShrink: 0 }}>
                    <div style={{ flex: 1 }}>
                      <div className="party-eyebrow">Purchase Order From</div>
                      <div className="party-name">{customer?.legal_name ?? order.customer_name}</div>
                      {salesContactLine && <div className="party-contact">{salesContactLine}</div>}
                      {primaryAddress && (
                        <div className="party-addr">
                          {[primaryAddress.street1, primaryAddress.city, primaryAddress.postal_code, primaryAddress.country].filter(Boolean).join(', ')}
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

                {/* TABLE */}
                <table className="line-table">
                  <TableHead />
                  <tbody>
                    {pageLines.map((line: any, idx: number) => (
                      <TableRow key={idx} line={line} idx={idx} />
                    ))}
                  </tbody>
                </table>

                {/* TOTALS */}
                {isLast && (
                  <div className="bottom-row">
                    <div style={{ flex: 1 }} />
                    <div className="totals-block">
                      <div className="total-line"><span>Total Boxes</span><span>{Number(order.total_packs).toLocaleString('en-US')}</span></div>
                      <div className="total-line"><span>Total Articles</span><span>{Number(order.total_units).toLocaleString('en-US')}</span></div>
                      <hr className="total-hr" />
                      <div className="grand-row">
                        <span className="grand-label">Order Total</span>
                        <span className="grand-value">{order.currency} {totalValue}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* FOOTER */}
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