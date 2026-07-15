'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Archive, X } from 'lucide-react'

interface ExportTypeDef {
  key: string
  label: string
  fileType: string
  soDocType?: string
}

const EXPORT_TYPES: ExportTypeDef[] = [
  { key: 'so', label: 'SO', fileType: 'so', soDocType: 'so' },
  { key: 'so_int', label: 'Internal Transfer', fileType: 'so', soDocType: 'so_int' },
  { key: 'so_do', label: 'SO(DO)', fileType: 'so_do', soDocType: 'so_do' },
  { key: 'invoice', label: 'Invoice', fileType: 'invoice', soDocType: 'invoice' },
  { key: 'client_return', label: 'Client Return', fileType: 'client_return', soDocType: 'client_return' },
  { key: 'po', label: 'Purchase Order', fileType: 'po' },
  { key: 'stock_inbound', label: 'Stock Inbound', fileType: 'stock_inbound' },
  { key: 'stocktake_diff', label: 'Stocktake', fileType: 'stocktake_diff' },
  { key: 'external', label: 'External', fileType: 'external' },
]

const SALES_LINKED_FILE_TYPES = new Set(['so', 'so_do', 'invoice', 'client_return'])

type Preset = 'last_month' | 'ytd' | 'custom'

interface Row {
  file: any
  typeLabel: string
  refNumber: string
  date: string
  party: string
  quantityDisplay: string
  valueDisplay: string
  valueAmount: number | null
  currency: string | null
}

function presetRange(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().split('T')[0]
  if (preset === 'ytd') return { from: `${today.getFullYear()}-01-01`, to: iso(today) }
  if (preset === 'last_month') {
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const lastMonthEnd = new Date(firstOfThisMonth.getTime() - 86400000)
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)
    return { from: iso(lastMonthStart), to: iso(lastMonthEnd) }
  }
  return { from: customFrom, to: customTo }
}

function fmtMoney(n: number, currency: string) {
  return `${currency} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Wraps a step so failures say WHERE they happened instead of a bare "Failed to fetch" —
// that message is a raw browser network error and gives no clue which call actually failed.
async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e: any) {
    console.error(`[ExportBundle] ${label} failed:`, e)
    throw new Error(`${label}: ${e?.message ?? String(e)}`)
  }
}

async function generateSummaryPdf(rows: Row[], meta: { from: string; to: string; customerName?: string }): Promise<Blob> {
  const jsPDF = (await import('jspdf')).default
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const marginX = 14
  let y = 18

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('Document Bundle Summary', marginX, y)
  y += 8
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text(`Period: ${meta.from} to ${meta.to}`, marginX, y)
  y += 5
  if (meta.customerName) { pdf.text(`Client: ${meta.customerName}`, marginX, y); y += 5 }
  pdf.text(`Generated: ${new Date().toLocaleString('en-GB')} - ${rows.length} document(s)`, marginX, y)
  y += 10

  const cols = [
    { key: 'refNumber', label: 'Document', w: 45 },
    { key: 'typeLabel', label: 'Type', w: 32 },
    { key: 'party', label: 'Customer / Partner', w: 60 },
    { key: 'date', label: 'Date', w: 25 },
    { key: 'quantityDisplay', label: 'Quantity', w: 40 },
    { key: 'valueDisplay', label: 'Value', w: 40 },
  ]
  const drawHeader = () => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    let x = marginX
    cols.forEach(c => { pdf.text(c.label, x, y); x += c.w })
    y += 2
    pdf.setDrawColor(180)
    pdf.line(marginX, y, pageW - marginX, y)
    y += 5
    pdf.setFont('helvetica', 'normal')
  }
  drawHeader()

  for (const row of rows) {
    if (y > pageH - 25) { pdf.addPage(); y = 18; drawHeader() }
    let x = marginX
    cols.forEach(c => {
      const raw = String((row as any)[c.key] ?? '')
      const val = raw.length > 38 ? raw.slice(0, 35) + '...' : raw
      pdf.text(val, x, y)
      x += c.w
    })
    y += 6
  }

  const totalsByCurrency: Record<string, number> = {}
  rows.forEach(r => { if (r.currency && r.valueAmount != null) totalsByCurrency[r.currency] = (totalsByCurrency[r.currency] ?? 0) + r.valueAmount })
  if (Object.keys(totalsByCurrency).length > 0) {
    y += 4
    pdf.setDrawColor(180)
    pdf.line(marginX, y, pageW - marginX, y)
    y += 6
    pdf.setFont('helvetica', 'bold')
    Object.entries(totalsByCurrency).forEach(([cur, amt]) => {
      if (y > pageH - 20) { pdf.addPage(); y = 18 }
      pdf.text(`Total (${cur}): ${fmtMoney(amt, cur)}`, marginX, y)
      y += 6
    })
  }

  return pdf.output('blob')
}

export default function ExportBundleModal() {
  const [open, setOpen] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(EXPORT_TYPES.map(t => t.key)))
  const [customerId, setCustomerId] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [preset, setPreset] = useState<Preset>('last_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    // Reset to "all types selected" every time the modal opens, rather than keeping whatever
    // was left checked from a previous session.
    setSelectedTypes(new Set(EXPORT_TYPES.map(t => t.key)))
    setError('')
    const run = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.from('customers').select('id, legal_name').eq('status', 'active').order('legal_name')
        if (error) console.error('[ExportBundle] Loading customers failed:', error)
        setCustomers(data ?? [])
      } catch (e) {
        console.error('[ExportBundle] Loading customers failed:', e)
      }
    }
    run()
  }, [open])

  const toggleType = (key: string) => setSelectedTypes(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const handleGenerate = async () => {
    setError('')
    if (selectedTypes.size === 0) { setError('Select at least one document type'); return }
    const { from, to } = presetRange(preset, customFrom, customTo)
    if (!from || !to) { setError('Select a valid period'); return }

    setGenerating(true)
    setProgress('Finding documents...')
    try {
      const supabase = createClient()
      const rows: Row[] = []
      const activeTypes = EXPORT_TYPES.filter(t => selectedTypes.has(t.key))
      const fileTypesNeeded = Array.from(new Set(activeTypes.map(t => t.fileType)))

      for (const fileType of fileTypesNeeded) {
        const matchingDefs = activeTypes.filter(t => t.fileType === fileType)
        const { data: files, error: filesErr } = await step(`Loading ${fileType} documents`, async () =>
          supabase.from('document_files').select('*').eq('document_type', fileType)
        )
        if (filesErr) throw new Error(`Loading ${fileType} documents: ${filesErr.message}`)
        if (!files || files.length === 0) continue

        if (fileType === 'external') {
          for (const f of files as any[]) {
            const d = (f.created_at as string).split('T')[0]
            if (d < from || d > to) continue
            rows.push({
              file: f, typeLabel: 'External', refNumber: f.file_name, date: d,
              party: '—', quantityDisplay: '—', valueDisplay: '—', valueAmount: null, currency: null,
            })
          }
          continue
        }

        const byOrder: Record<string, any[]> = {}
        ;(files as any[]).forEach(f => { if (f.order_id) (byOrder[f.order_id] ??= []).push(f) })
        const orderIds = Object.keys(byOrder)
        if (orderIds.length === 0) continue

        if (fileType === 'po' || fileType === 'stock_inbound') {
          const { data: pos, error: posErr } = await step('Loading purchase orders', async () =>
            supabase.from('purchase_orders')
              .select('id, po_number, order_date, partner_name, total_amount, currency')
              .in('id', orderIds)
          )
          if (posErr) throw new Error(`Loading purchase orders: ${posErr.message}`)
          const byId = Object.fromEntries((pos ?? []).map((p: any) => [p.id, p]))
          for (const [orderId, group] of Object.entries(byOrder)) {
            const po = byId[orderId]
            if (!po?.order_date) continue
            const d = po.order_date
            if (d < from || d > to) continue
            const latest = group.reduce((a, b) => (Number(b.version) > Number(a.version) ? b : a))
            rows.push({
              file: latest, typeLabel: fileType === 'po' ? 'Purchase Order' : 'Stock Inbound',
              refNumber: po.po_number, date: d, party: po.partner_name,
              quantityDisplay: '—', valueDisplay: fmtMoney(po.total_amount ?? 0, po.currency ?? 'USD'),
              valueAmount: Number(po.total_amount ?? 0), currency: po.currency ?? 'USD',
            })
          }
          continue
        }

        if (fileType === 'stocktake_diff') {
          const { data: events, error: eventsErr } = await step('Loading stocktake sessions', async () =>
            supabase.from('inventory_events').select('id, event_number, event_date').in('id', orderIds)
          )
          if (eventsErr) throw new Error(`Loading stocktake sessions: ${eventsErr.message}`)
          const byId = Object.fromEntries((events ?? []).map((e: any) => [e.id, e]))
          for (const [orderId, group] of Object.entries(byOrder)) {
            const ev = byId[orderId]
            if (!ev?.event_date) continue
            const d = ev.event_date
            if (d < from || d > to) continue
            const latest = group.reduce((a, b) => (Number(b.version) > Number(a.version) ? b : a))
            rows.push({
              file: latest, typeLabel: 'Stocktake', refNumber: ev.event_number, date: d,
              party: '—', quantityDisplay: '—', valueDisplay: '—', valueAmount: null, currency: null,
            })
          }
          continue
        }

        // Sales-linked: so, so_int, so_do, invoice, client_return — share the underlying
        // sales_orders table, disambiguated by its own document_type/is_foc, not the
        // document_files.document_type bucket alone (so and so_int both save as 'so').
        const { data: orders, error: ordersErr } = await step('Loading sales orders', async () =>
          supabase.from('sales_orders')
            .select('id, order_number, order_date, customer_id, customer_name, document_type, is_foc, total_amount, total_units, total_packs, currency')
            .in('id', orderIds)
        )
        if (ordersErr) throw new Error(`Loading sales orders: ${ordersErr.message}`)
        const byId = Object.fromEntries((orders ?? []).map((o: any) => [o.id, o]))

        for (const [orderId, group] of Object.entries(byOrder)) {
          const so = byId[orderId]
          if (!so?.order_date) continue
          const d = so.order_date
          if (d < from || d > to) continue
          if (customerId && SALES_LINKED_FILE_TYPES.has(fileType) && so.customer_id !== customerId) continue

          const def = matchingDefs.find(t => t.soDocType === so.document_type)
          if (!def) continue

          const latest = group.reduce((a, b) => (Number(b.version) > Number(a.version) ? b : a))
          rows.push({
            file: latest, typeLabel: def.label, refNumber: so.order_number, date: d,
            party: so.customer_name,
            quantityDisplay: `${so.total_packs ?? 0} pk / ${so.total_units ?? 0} u`,
            valueDisplay: so.is_foc ? 'FOC' : fmtMoney(so.total_amount ?? 0, so.currency ?? 'USD'),
            valueAmount: so.is_foc ? null : Number(so.total_amount ?? 0),
            currency: so.is_foc ? null : (so.currency ?? 'USD'),
          })
        }
      }

      if (rows.length === 0) { setError('No documents matched these filters'); setGenerating(false); setProgress(''); return }

      rows.sort((a, b) => a.date.localeCompare(b.date))

      setProgress(`Generating summary (${rows.length} document${rows.length !== 1 ? 's' : ''})...`)
      const summaryBlob = await step('Generating summary PDF', () => generateSummaryPdf(rows, {
        from, to, customerName: customers.find(c => c.id === customerId)?.legal_name,
      }))

      const JSZip = (await step('Loading ZIP library', async () => (await import('jszip')).default))
      const zip = new JSZip()
      let done = 0
      for (const row of rows) {
        setProgress(`Downloading files... (${done}/${rows.length})`)
        // Neither storage.download() nor fetch(signedUrl) work here — both are browser-side
        // fetches to the Supabase storage host, which is blocked by CORS on this self-hosted
        // setup (only full-page navigations to it are exempt, which is why the per-file download
        // button works). Proxy through our own origin instead, where CORS doesn't apply.
        const blob = await step(`Downloading "${row.file.file_name}"`, async () => {
          const res = await fetch(`/api/documents/download?path=${encodeURIComponent(row.file.file_path)}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.blob()
        })
        zip.file(row.file.file_name, blob)
        done++
      }
      zip.file('Summary.pdf', summaryBlob)

      setProgress('Packaging ZIP...')
      const zipBlob = await step('Packaging ZIP', () => zip.generateAsync({ type: 'blob' }))
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Document Bundle ${from}_to_${to}.zip`
      a.click()
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setGenerating(false)
      setProgress('')
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '40px', padding: '0 16px', borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#374151' }}
      >
        <Archive size={16} />
        Export Bundle
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '560px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>Export Document Bundle</h3>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '3px' }}>Download every matching document plus a summary PDF, zipped together</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                <X size={20} />
              </button>
            </div>

            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Document Types
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '18px' }}>
              {EXPORT_TYPES.map(t => (
                <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedTypes.has(t.key)} onChange={() => toggleType(t.key)} />
                  {t.label}
                </label>
              ))}
            </div>

            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              Client <span style={{ fontWeight: 400, textTransform: 'none', color: '#9CA3AF' }}>(applies to SO / Invoice / SO(DO) / Internal Transfer / Client Return only)</span>
            </label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}
              style={{ width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #E5E7EB', padding: '0 12px', fontSize: '14px', outline: 'none', color: '#111827', marginBottom: '18px' }}>
              <option value="">All clients</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
            </select>

            <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Period
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              {([['last_month', 'Last Month'], ['ytd', 'Year to Date'], ['custom', 'Custom Range']] as [Preset, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setPreset(key)}
                  style={{ flex: 1, height: '36px', borderRadius: '8px', border: preset === key ? '1px solid #111827' : '1px solid #E5E7EB', background: preset === key ? '#111827' : '#fff', color: preset === key ? '#fff' : '#374151', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  style={{ flex: 1, height: '38px', borderRadius: '10px', border: '1px solid #E5E7EB', padding: '0 12px', fontSize: '14px', outline: 'none', color: '#111827' }} />
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  style={{ flex: 1, height: '38px', borderRadius: '10px', border: '1px solid #E5E7EB', padding: '0 12px', fontSize: '14px', outline: 'none', color: '#111827' }} />
              </div>
            )}
            {preset !== 'custom' && <div style={{ marginBottom: '18px' }} />}

            {error && <p style={{ fontSize: '13px', color: '#DC2626', marginBottom: '12px' }}>{error}</p>}
            {generating && progress && <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '12px' }}>{progress}</p>}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} disabled={generating}
                style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff', fontSize: '14px', color: '#374151', cursor: generating ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleGenerate} disabled={generating}
                style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', background: '#111827', fontSize: '14px', fontWeight: 500, color: '#fff', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}>
                {generating ? 'Generating...' : 'Generate & Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
