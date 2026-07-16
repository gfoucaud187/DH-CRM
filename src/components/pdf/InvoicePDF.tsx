'use client'

import { Download } from 'lucide-react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { warehouseLabel } from '@/lib/warehouse'
import {
  getFolderName,
  getSOFileName,
  getInvoiceFileName,
  getFilePath,
  getNextVersion,
} from '@/lib/documents'

interface InvoicePDFProps {
  order: any
  lines: any[]
  services?: any[]
  customer?: any
  appSettings?: any
  sourceDoc?: any
}

export default function InvoicePDF({ order, lines, services = [], customer, appSettings, sourceDoc }: InvoicePDFProps) {
  const [saving, setSaving] = useState(false)
  const [refPrices, setRefPrices] = useState<Record<string, number>>({})
  const [saveStatus, setSaveStatus] = useState<'saved' | 'stale' | 'loading'>('loading')

  // Green once the current state of the order has a matching saved document; falls back to
  // orange the moment the order is modified afterward (a save now would create a new version).
  useEffect(() => {
    let cancelled = false
    const docType = order.document_type === 'credit_note' ? 'credit_note'
      : order.document_type === 'invoice' ? 'invoice' : (order.is_foc ? 'so_do' : 'so')
    const checkSaveStatus = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('document_files')
        .select('created_at')
        .eq('order_id', order.id)
        .eq('document_type', docType)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      const isSaved = !!data && new Date(data.created_at) >= new Date(order.updated_at)
      setSaveStatus(isSaved ? 'saved' : 'stale')
    }
    checkSaveStatus()
    return () => { cancelled = true }
  }, [order.id, order.updated_at, order.document_type, order.is_foc])

  const isLinked = order.order_number?.includes('LINKED')
  const isCreditNote = order.document_type === 'credit_note'
  const skusKey = lines.map((l: any) => l.sku).join(',')

  // FOC lines are stored at price_per_unit=0 (the order really is free) — for display on
  // SO(DO)/INV(DO) we still want to show what the customer would normally pay. Look that up
  // fresh here rather than trusting the stored (zeroed) value, walking up via promoted_from to
  // find a price_list if this document doesn't carry one itself (older SO(DO)s didn't).
  useEffect(() => {
    const isFocDocument = order.is_foc && order.document_type !== 'so_int'
    if (!isFocDocument || !skusKey) { setRefPrices({}); return }
    let cancelled = false
    const run = async () => {
      const supabase = createClient()
      let priceList = order.price_list as string | null
      let cursorPromotedFrom = order.promoted_from as string | null
      while (!priceList && cursorPromotedFrom) {
        const { data } = await supabase
          .from('sales_orders')
          .select('price_list, promoted_from')
          .eq('id', cursorPromotedFrom)
          .single()
        if (!data) break
        priceList = data.price_list
        cursorPromotedFrom = data.promoted_from
      }
      if (!priceList) { if (!cancelled) setRefPrices({}); return }

      const skus = skusKey.split(',')
      const priceMap: Record<string, number> = {}

      const { data: custRow } = await supabase
        .from('customers')
        .select('manual_pricing_enabled')
        .eq('id', order.customer_id)
        .single()

      if (custRow?.manual_pricing_enabled) {
        const { data: negotiated } = await supabase
          .from('customer_negotiated_prices')
          .select('sku, price_per_unit')
          .eq('customer_id', order.customer_id)
          .in('sku', skus)
        ;(negotiated ?? []).forEach((n: any) => { priceMap[n.sku] = Number(n.price_per_unit) })
      }

      const missingSkus = skus.filter(s => priceMap[s] === undefined)
      if (missingSkus.length > 0) {
        const { data: entries } = await supabase
          .from('price_list_entries')
          .select('sku, price_per_unit')
          .eq('price_list', priceList)
          .in('sku', missingSkus)
        ;(entries ?? []).forEach((e: any) => { priceMap[e.sku] = Number(e.price_per_unit) })
      }

      if (!cancelled) setRefPrices(priceMap)
    }
    run()
    return () => { cancelled = true }
  }, [order.id, order.is_foc, order.document_type, order.price_list, order.promoted_from, order.customer_id, skusKey])

  // ─── Génère le PDF en blob ───────────────────────────────────────────────────
  const generatePdfBlob = async (): Promise<Blob | null> => {
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const pageEls = document.querySelectorAll(`[data-pdf-page="${order.id}"]`)
    if (!pageEls.length) return null

    const LOGO_URL = 'https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_white_background.png'
    let logoBase64 = ''
    try {
      const resp = await fetch(LOGO_URL)
      const blob2 = await resp.blob()
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(blob2)
      })
    } catch { /* logo absent */ }

    if (logoBase64) {
      pageEls.forEach(el => {
        el.querySelectorAll('img').forEach(img => {
          if (img.src.includes('Logo_DH_signature')) img.src = logoBase64
        })
      })
      await new Promise(r => setTimeout(r, 100))
    }

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pdfW = pdf.internal.pageSize.getWidth()

    for (let i = 0; i < pageEls.length; i++) {
      const el = pageEls[i] as HTMLElement
      const canvas = await html2canvas(el, { useCORS: true, allowTaint: false, scale: 2 })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const imgH = (canvas.height * pdfW) / canvas.width
      if (i > 0) {
        pdf.addPage([pdfW, imgH], 'landscape')
      } else {
        pdf.internal.pageSize.height = imgH
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH)
    }

    return pdf.output('blob')
  }

  // ─── Détermine le dossier et le nom de fichier ───────────────────────────────
  const getDocNames = async (supabase: any): Promise<{ folderName: string; fileName: string; docType: 'so' | 'invoice' | 'so_do' | 'credit_note'; version: number } | null> => {
    const isInvoice = order.document_type === 'invoice'
    const isFoc = order.is_foc
    let rootSO = order

    if (isInvoice && sourceDoc) {
      if (sourceDoc.is_foc && sourceDoc.promoted_from) {
        // promoted_from, not linked_order_id: a SO(DO)'s linked_order_id gets overwritten to
        // point at its own promoted invoice once it's promoted, so it's not stable for this walk
        const { data } = await supabase
          .from('sales_orders')
          .select('order_number, customer_name, warehouse, created_at, is_foc')
          .eq('id', sourceDoc.promoted_from)
          .single()
        if (data) rootSO = data
      } else {
        rootSO = sourceDoc
      }
    } else if (isInvoice && order.promoted_from) {
      const { data: src } = await supabase
        .from('sales_orders')
        .select('id, order_number, customer_name, warehouse, created_at, is_foc, promoted_from')
        .eq('id', order.promoted_from)
        .single()
      if (src) {
        if (src.is_foc && src.promoted_from) {
          const { data: parent } = await supabase
            .from('sales_orders')
            .select('order_number, customer_name, warehouse, created_at')
            .eq('id', src.promoted_from)
            .single()
          if (parent) rootSO = parent
        } else {
          rootSO = src
        }
      }
    } else if ((isInvoice && isLinked || isCreditNote) && order.linked_order_id) {
      // Invoice LINKED / Credit Note → remonter via l'invoice principale → SO racine
      const { data: mainInv } = await supabase
        .from('sales_orders')
        .select('promoted_from, order_number, customer_name, warehouse, created_at')
        .eq('id', order.linked_order_id)
        .single()
      if (mainInv?.promoted_from) {
        const { data: soRacine } = await supabase
          .from('sales_orders')
          .select('order_number, customer_name, warehouse, created_at')
          .eq('id', mainInv.promoted_from)
          .single()
        if (soRacine) rootSO = soRacine
        else if (mainInv) rootSO = mainInv
      }
    } else if (isFoc && order.promoted_from) {
      const { data } = await supabase
        .from('sales_orders')
        .select('order_number, customer_name, warehouse, created_at')
        .eq('id', order.promoted_from)
        .single()
      if (data) rootSO = data
    }

    if (!rootSO.customer_name) rootSO = order

    const folderName = getFolderName(rootSO)

    if (isInvoice) {
      const srcDoc = sourceDoc ?? rootSO
      const version = await getNextVersion(supabase, order.id, 'invoice')
      // Pour T&T: le destinataire est Fixmer, pas le client original
      const { data: cust } = await supabase
        .from('customers')
        .select('is_european, track_trace_enabled, eu_compliance_type')
        .eq('id', order.customer_id)
        .single()
      // T&T only applies to Central-warehouse shipments, not T1.
      const isTTInvoice = !!(cust?.is_european && (cust?.track_trace_enabled || cust?.eu_compliance_type === 'TT') && order.warehouse === 'Central')
      const invoiceForNaming = isTTInvoice
        ? { ...order, customer_name: 'Fixmer' }
        : order
      const fileName = getInvoiceFileName(invoiceForNaming, srcDoc, version)
      return { folderName, fileName, docType: 'invoice' as const, version }
    } else if (isCreditNote) {
      const srcDoc = sourceDoc ?? rootSO
      const version = await getNextVersion(supabase, order.id, 'credit_note')
      const fileName = getInvoiceFileName(order, srcDoc, version)
      return { folderName, fileName, docType: 'credit_note' as const, version }
    } else if (isFoc) {
      const version = await getNextVersion(supabase, order.id, 'so_do')
      const fileName = getSOFileName(order, version)
      return { folderName, fileName, docType: 'so_do' as const, version }
    } else {
      const version = await getNextVersion(supabase, order.id, 'so')
      const fileName = getSOFileName(order, version)
      return { folderName, fileName, docType: 'so' as const, version }
    }
  }

  // ─── Sauvegarde dans Storage ─────────────────────────────────────────────────
  const savePdfToStorage = async (blob: Blob, isManualDownload = false) => {
    try {
      const supabase = createClient()
      const names = await getDocNames(supabase)
      if (!names) return

      const { folderName, fileName, docType } = names

      const { data: existing } = await supabase
        .from('document_files')
        .select('id')
        .eq('order_id', order.id)
        .eq('file_name', fileName)
        .maybeSingle()

      if (existing && !isManualDownload) return

      const filePath = getFilePath(folderName, fileName)

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, { contentType: 'application/pdf', upsert: false })

      if (uploadError && !uploadError.message.includes('already exists')) {
        console.error('Storage upload error:', uploadError.message)
        return
      }

      if (!uploadError) {
        await supabase.from('document_files').insert({
          folder_name: folderName,
          file_name: fileName,
          file_path: filePath,
          order_id: order.id,
          document_type: docType,
          version: names.version,
          file_size: blob.size,
        })
      }
    } catch (err) {
      console.error('savePdfToStorage error:', err)
    }
  }

  const handleDownload = async () => {
    const blob = await generatePdfBlob()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = order.order_number + '.pdf'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveToDocuments = async () => {
    setSaving(true)
    try {
      const blob = await generatePdfBlob()
      if (blob) {
        await savePdfToStorage(blob, true)
        setSaveStatus('saved')
      }
    } finally {
      setSaving(false)
    }
  }

  const isInvoice = order.document_type === 'invoice'
  const isFoc     = order.is_foc
  const isSample  = order.is_sample
  // T&T (Fixmer billing) only applies to Central-warehouse shipments — T1 goods aren't
  // routed through Fixmer regardless of the customer's compliance type.
  const isTT      = (order.is_tt_order || (customer?.is_european && (customer?.track_trace_enabled || customer?.eu_compliance_type === 'TT'))) && isInvoice && order.warehouse === 'Central'
  const isInt     = order.document_type === 'so_int'
  const isDO      = order.is_foc && !isInvoice && !isInt
  // SO(DO) and INV(DO): show the real commercial value per line, then zero it out with an
  // equal-and-opposite Discount line so the document still reads as FOC overall.
  const isFocDoc  = isFoc && !isInt
  const hasMixedWarehouses = !isInt && new Set(lines.map((l: any) => l.warehouse ?? order.warehouse)).size > 1
  const warehouseDisplay = hasMixedWarehouses ? 'Mixed' : warehouseLabel(order.warehouse)

  const accent   = isInvoice ? '#6A1E2A' : '#1C4B3C'
  const tint     = isInvoice ? '#F7EDED' : '#EEF3F0'
  const onAccent = isInvoice ? '#D9A6AC' : '#9FBDB0'

  const salesContact = customer?.contacts?.find((c: any) => c.role === 'Sales') ?? customer?.contacts?.[0]
  const salesContactLine = salesContact
    ? [[salesContact.first_name, salesContact.last_name].filter(Boolean).join(' '), salesContact.email, salesContact.phone].filter(Boolean).join(' | ')
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
  const totalValue = isInt ? 'INT' : (isFoc || isSample)
    ? 'FOC'
    : Number(order.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const fmt2 = (n: any) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Real commercial value of the FOC lines, before the Discount line cancels it back out to 0.
  // The stored price_per_unit is 0 for FOC lines, so use the looked-up reference price instead.
  const focSubtotal = isFocDoc
    ? lines.reduce((s: number, l: any) => {
        const refPrice = refPrices[l.sku]
        return s + (refPrice != null && l.quantity_units != null ? refPrice * Number(l.quantity_units) : 0)
      }, 0)
    : 0

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
    .doc-date { font-size: 11px; color: #8C8475; margin-top: 6px; }
    .kpi-strip { display: flex; border: 1px solid #E6E0D5; border-radius: 6px; overflow: hidden; background: #fff; flex-shrink: 0; height: 72px; }
    .kpi-seg { flex: 1; padding: 4px 16px; border-right: 1px solid #E6E0D5; height: 72px; display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; }
    .kpi-seg-accent { flex: 1.2; padding: 4px 16px; background: ${accent}; height: 72px; display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; }
    .kpi-label { font-size: 9px; font-weight: 600; color: #A39A8A; letter-spacing: 0.18em; text-transform: uppercase; }
    .kpi-label-accent { font-size: 9px; font-weight: 600; color: ${onAccent}; letter-spacing: 0.18em; text-transform: uppercase; }
    .kpi-value { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; line-height: 1.15; white-space: nowrap; }
    .kpi-value-accent { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; line-height: 1.15; color: #fff; white-space: nowrap; }
    .party-eyebrow { font-size: 9px; font-weight: 600; color: #A39A8A; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 6px; }
    .party-name { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; margin-bottom: 3px; line-height: 1.2; }
    .party-contact { font-size: 11px; color: #3A352E; line-height: 1.6; }
    .party-addr { font-size: 11px; color: #6E665A; margin-top: 2px; }
    .co-block { margin-top: 12px; padding-top: 12px; border-top: 1px solid #E6E0D5; }
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
    .payment-card { flex: 1; background: #fff; border: 1px solid #E6E0D5; border-radius: 6px; padding: 14px 18px; }
    .payment-title { font-size: 9px; font-weight: 600; color: ${accent}; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 8px; }
    .payment-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 10px; color: #3A352E; line-height: 1.5; }
    .payment-key { color: #A39A8A; font-weight: 600; font-size: 9px; white-space: nowrap; }
    .totals-block { width: 300px; text-align: right; }
    .total-line { display: flex; justify-content: space-between; font-size: 11px; color: #6E665A; padding: 3px 0; }
    .total-line span:last-child { font-family: 'IBM Plex Mono', monospace; }
    .total-hr { border: none; border-top: 1px solid #E6E0D5; margin: 8px 0; }
    .grand-row { display: flex; justify-content: space-between; align-items: baseline; }
    .grand-label { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
    .grand-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 700; color: ${accent}; white-space: nowrap; }
    .footer { border-top: 1px solid #E6E0D5; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
    .footer-notes { font-size: 10px; color: #6E665A; max-width: 500px; }
    .footer-right { font-size: 9px; color: #B3AA99; letter-spacing: 0.12em; text-transform: uppercase; text-align: right; }
    .page-num { font-size: 9px; color: #B3AA99; letter-spacing: 0.08em; margin-top: 3px; }
  `

  const TableHead = () => {
    const cols = isInt
      ? [['Brand & Line', 'left'],['Vitola', 'left'],['SKU · Ref DH', 'left'],['Boxes', 'center'],['Articles', 'center']]
      : [
          ['Brand & Line', 'left'],['Vitola', 'left'],['SKU · Ref DH', 'left'],['Ref Fixmer', 'left'],
          ['Boxes', 'center'],['Articles', 'center'],['Dim L×Cepo', 'center'],['Shape', 'left'],
          ['Wrapper', 'left'],['Pack Type', 'center'],['Qty/Pack', 'left'],['Net/U g', 'right'],
          ['Net Tot g', 'right'],['Price/U', 'right'],['Total', 'right'],
        ]
    return (
      <thead>
        <tr>{cols.map(([h, a], i) => <th key={i} style={{ textAlign: a as any }}>{h}</th>)}</tr>
      </thead>
    )
  }

  const TableRow = ({ line, idx }: { line: any; idx: number }) => {
    const dim        = (line.length_inches && line.ring_gauge) ? `${line.length_inches}×${line.ring_gauge}` : '—'
    const netWtTotal = (line.net_weight_g && line.quantity_units)
      ? Math.round(Number(line.net_weight_g) * Number(line.quantity_units)).toLocaleString('en-US') : '—'
    const effectiveUnitPrice = isFocDoc ? (refPrices[line.sku] ?? null) : line.price_per_unit
    const priceUnit  = (!isInt && effectiveUnitPrice != null) ? fmt2(effectiveUnitPrice) : null
    const effectiveLineTotal = isFocDoc
      ? (effectiveUnitPrice != null && line.quantity_units != null ? effectiveUnitPrice * Number(line.quantity_units) : null)
      : line.line_total
    const priceTotal = (!isInt && effectiveLineTotal != null) ? fmt2(effectiveLineTotal) : null
    const brandLine  = line.brand
      ? (line.line_name ? line.brand + ' ' + line.line_name : line.brand)
      : (line.product_name ?? '').split(' ')[0]?.replace(/_/g, ' ') ?? line.product_name
    const vitola = line.vitola ?? '—'
    if (isInt) return (
      <tr key={idx}>
        <td className="ink" style={{ whiteSpace: 'nowrap' }}>{brandLine}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{vitola}</td>
        <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{line.sku}</td>
        <td style={{ textAlign: 'center' }}>{line.quantity_packs}</td>
        <td style={{ textAlign: 'center' }}>{line.quantity_units}</td>
      </tr>
    )
    return (
      <tr key={idx}>
        <td className="ink" style={{ whiteSpace: 'nowrap' }}>{brandLine}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{vitola}</td>
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
        {priceUnit !== null && <td className="mono" style={{ textAlign: 'right' }}>{priceUnit}</td>}
        {priceTotal !== null && <td className="mono ink" style={{ textAlign: 'right' }}>{priceTotal}</td>}
      </tr>
    )
  }

  // ─── Layout LINKED simplifié ─────────────────────────────────────────────────
  if (isLinked || isCreditNote) {
    const linkedTotal = Number(order.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const creditRecipientName = customer?.legal_name ?? order.customer_name
    const creditRecipientContact = salesContactLine
    return (
      <div>
        <div className="flex items-center gap-3">
          <button onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
            <Download className="h-4 w-4" />
            Download PDF
          </button>
          <button onClick={handleSaveToDocuments} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="12" x2="12" y2="18"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            {saving ? 'Saving…' : 'Save to Documents'}
          </button>
          {saveStatus !== 'loading' && (
            <span
              className={`h-2.5 w-2.5 rounded-full ${saveStatus === 'saved' ? 'bg-green-500' : 'bg-orange-500'}`}
              title={saveStatus === 'saved' ? 'Saved — matches the current version' : 'Not saved — saving now will create a new version'}
            />
          )}
        </div>

        <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
          <style dangerouslySetInnerHTML={{ __html: css }} />
          <div data-pdf-page={order.id} className="doc">
            <div className="accent-bar" />
            <div className="inner">
              <div className="header">
                <div>
                  <img src="https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_white_background.png" alt="DH Signature" style={{ height: '72px', width: 'auto' }} />
                </div>
                <div className="header-right">
                  <div className="doc-eyebrow">{isCreditNote ? 'Credit Note' : 'Invoice — Price Difference'}</div>
                  <div className="doc-number">{order.order_number}</div>
                  <div className="doc-date">{docDate}</div>
                </div>
              </div>

              {/* Parties */}
              <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  {isCreditNote ? (
                    <>
                      <div className="party-eyebrow">Credit To</div>
                      <div className="party-name">{creditRecipientName}</div>
                      {creditRecipientContact && <div className="party-contact">{creditRecipientContact}</div>}
                    </>
                  ) : (
                    <>
                      <div className="party-eyebrow">Invoice To</div>
                      <div className="party-name">{fixmerName}</div>
                      <div className="party-contact">{fixmerContactLine}</div>
                      {endCustomerName && (
                        <div className="co-block">
                          <div className="party-eyebrow">C/O — End Customer</div>
                          <div className="party-name">{endCustomerName}</div>
                          {salesContactLine && <div className="party-contact">{salesContactLine}</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '28px', borderLeft: '1px solid #E6E0D5', paddingLeft: '40px' }}>
                  {[
                    { label: 'Incoterms', value: order.incoterms },
                    { label: 'Payment',   value: order.payment_terms },
                    { label: 'Currency',  value: order.currency },
                    { label: 'Warehouse', value: warehouseDisplay },
                  ].filter(m => m.value).map((m, i) => (
                    <div key={i}>
                      <div className="meta-label">{m.label}</div>
                      <div className="meta-value">{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Single line */}
              <table className="line-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="ink">{order.notes ?? `Price difference for linked SO`}</td>
                    <td className="mono ink" style={{ textAlign: 'right' }}>{order.currency} {linkedTotal}</td>
                  </tr>
                </tbody>
              </table>

              {/* Total */}
              <div className="bottom-row">
                {isCreditNote ? <div style={{ flex: 1 }} /> : (
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
                    </div>
                  </div>
                )}
                <div style={{ flex: 1 }} />
                <div className="totals-block">
                  <hr className="total-hr" />
                  <div className="grand-row">
                    <span className="grand-label">{isCreditNote ? 'Amount Owed to Client' : 'Amount Due'}</span>
                    <span className="grand-value">{order.currency} {linkedTotal}</span>
                  </div>
                </div>
              </div>

              <div className="footer">
                <div className="footer-notes" />
                <div className="footer-right">
                  DH Signature · {order.order_number} · Generated {new Date().toLocaleDateString('en-GB')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Layout standard ─────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center gap-3">
        <button onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">
          <Download className="h-4 w-4" />
          Download PDF
        </button>
        <button onClick={handleSaveToDocuments} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="12" x2="12" y2="18"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          {saving ? 'Saving…' : 'Save to Documents'}
        </button>
        {saveStatus !== 'loading' && (
          <span
            className={`h-2.5 w-2.5 rounded-full ${saveStatus === 'saved' ? 'bg-green-500' : 'bg-orange-500'}`}
            title={saveStatus === 'saved' ? 'Saved — matches the current version' : 'Not saved — saving now will create a new version'}
          />
        )}
      </div>

      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />

        {pages.map((pageLines, pageIdx) => {
          const isFirst = pageIdx === 0
          const isLast  = pageIdx === pages.length - 1
          return (
            <div key={pageIdx} data-pdf-page={order.id} className="doc">
              <div className="accent-bar" />
              <div className="inner">

                {isFirst && (
                  <div className="header">
                    <div>
                      <img src="https://soaemvmboawhjfzhhumi.supabase.co/storage/v1/object/public/customer-logos/DH-Logo/Logo_DH_signature_color_white_background.png" alt="DH Signature" style={{ height: '72px', width: 'auto' }} />
                    </div>
                    <div className="header-right">
                      <div className="doc-eyebrow">{isInvoice ? 'Invoice' : isInt ? 'Internal Transfer' : isDO ? 'Delivery Order' : 'Sales Order'}</div>
                      <div className="doc-number">{order.order_number}</div>
                      {isInvoice && sourceDoc?.order_number && (
                        <div style={{ fontSize: '15px', fontFamily: "'IBM Plex Mono', monospace", color: '#8C8475', marginTop: '2px', lineHeight: 1.2 }}>
                          <span style={{ fontFamily: 'Arial, sans-serif', fontSize: '9px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A39A8A' }}>Internal SO reference: </span>
                          {sourceDoc.order_number}
                        </div>
                      )}
                      <div className="doc-date">{docDate}</div>
                    </div>
                  </div>
                )}

                {isFirst && (
                  <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start', flexShrink: 0 }}>
                    <div style={{ flex: 1 }}>
                      {isInt ? (
                        <div style={{ display: 'flex', gap: '40px' }}>
                          <div>
                            <div className="party-eyebrow">From Warehouse</div>
                            <div className="party-name" style={{ fontSize: '18px' }}>{warehouseLabel(order.warehouse) || '—'}</div>
                          </div>
                          <div>
                            <div className="party-eyebrow">To Warehouse</div>
                            <div className="party-name" style={{ fontSize: '18px' }}>{warehouseLabel(order.warehouse_destination) || '—'}</div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="party-eyebrow">
                            {isDO ? 'Delivery Order To' : isInvoice ? 'Invoice To' : 'Sales Order To'}
                          </div>
                          <div className="party-name">{billToName}</div>
                          {billToContactLine && <div className="party-contact">{billToContactLine}</div>}
                          {!isTT && primaryAddress && (
                            <div className="party-addr">
                              {[primaryAddress.street1, primaryAddress.city, primaryAddress.postal_code, primaryAddress.country].filter(Boolean).join(', ')}
                            </div>
                          )}
                        </>
                      )}
                      {isTT && endCustomerName && (
                        <div className="co-block">
                          <div className="party-eyebrow">C/O — End Customer</div>
                          <div className="party-name">{endCustomerName}</div>
                          {salesContactLine && <div className="party-contact">{salesContactLine}</div>}
                          <span style={{ backgroundColor: isInvoice ? '#6A1E2A' : '#1C4B3C', borderRadius: '999px', paddingTop: '1px', paddingBottom: '12px', paddingLeft: '12px', paddingRight: '12px', fontSize: '9px', fontWeight: 600, color: '#ffffff', letterSpacing: '0.12em', marginTop: '6px', fontFamily: 'Arial, sans-serif', display: 'inline-block', lineHeight: '1' }}>TRACK &amp; TRACE</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '28px', alignItems: 'flex-start', paddingTop: '4px', borderLeft: '1px solid #E6E0D5', paddingLeft: '40px' }}>
                      {[
                        { label: 'Incoterms', value: order.incoterms },
                        { label: 'Payment',   value: order.payment_terms },
                        { label: 'Currency',  value: order.currency },
                        { label: 'Warehouse', value: warehouseDisplay },
                      ].filter(m => m.value).map((m, i) => (
                        <div key={i}>
                          <div className="meta-label">{m.label}</div>
                          <div className="meta-value">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isFirst && (
                  <div className="kpi-strip">
                    {[
                      { label: 'Total Packs',    value: String(order.total_packs ?? 0), accent: false },
                      { label: 'Total Articles', value: String(order.total_units ?? 0), accent: false },
                      { label: 'Net Tobacco kg', value: netTobaccoKg,                   accent: false },
                      { label: isInvoice ? 'Amount Due' : isInt ? 'Transfer' : 'Total Value',
                        value: isInt ? 'INT' : (isFoc || isSample) ? `0 ${order.currency} (FOC)` : `USD ${totalValue}`, accent: true },
                    ].map((k, i) => (
                      <div key={i} className={k.accent ? 'kpi-seg-accent' : 'kpi-seg'}>
                        <div className={k.accent ? 'kpi-label-accent' : 'kpi-label'}>{k.label}</div>
                        <div className={k.accent ? 'kpi-value-accent' : 'kpi-value'}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                <table className="line-table">
                  <TableHead />
                  <tbody>
                    {pageLines.map((line: any, idx: number) => (
                      <TableRow key={idx} line={line} idx={idx} />
                    ))}
                  </tbody>
                </table>

                {isLast && (
                  <div className="bottom-row">
                    {isInvoice && !isFoc && !isSample && !isInt && (
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
                      <div className="total-line"><span>Total Boxes</span><span>{Number(order.total_packs).toLocaleString('en-US')}</span></div>
                      <div className="total-line"><span>Total Articles</span><span>{Number(order.total_units).toLocaleString('en-US')}</span></div>
                      {isFocDoc && (
                        <div className="total-line"><span>Discount</span><span>-{order.currency} {fmt2(focSubtotal)}</span></div>
                      )}
                      {services.map((s: any) => (
                        <div className="total-line" key={s.id}>
                          <span>{s.description}</span>
                          <span>{s.currency} {Number(s.price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                        </div>
                      ))}
                      <hr className="total-hr" />
                      {!isInt && (
                        <div className="grand-row">
                          <span className="grand-label">{isInvoice ? 'Amount Due' : isDO ? 'Total Value' : 'Total'}</span>
                          <span className="grand-value">{isFocDoc ? `${order.currency} 0.00 (FOC)` : `${order.currency} ${totalValue}`}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="footer">
                  <div className="footer-notes">
                    {isLast && order.notes && <span><strong>Notes:</strong> {order.notes}</span>}
                  </div>
                  <div className="footer-right">
                    {isLast && `DH Signature · ${order.order_number} · Generated ${new Date().toLocaleDateString('en-GB')}`}
                    {totalPages > 1 && <div className="page-num">{pageIdx + 1} / {totalPages}</div>}
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