import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const text = await file.text()
    const lines = text.split('\n')
    const headers = parseCSVLine(lines[0])

    const supabase = createServiceClient()
    let imported = 0
    const errors: any[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const values = parseCSVLine(line)
      const row: any = {}
      headers.forEach((h, idx) => row[h] = values[idx] ?? '')

      if (!row.legal_name) continue

      try {
        let contacts = []
        let addresses = []
        
        try { contacts = JSON.parse(row.contacts || '[]') } catch {}
        try { addresses = JSON.parse(row.addresses || '[]') } catch {}

        const { error } = await supabase.from('customers').insert({
          legal_name: row.legal_name,
          trading_name: row.trading_name || null,
          country: row.country || '',
          status: row.status || 'active',
          assigned_price_list: row.assigned_price_list || null,
          currency: row.currency || 'USD',
          contact_type: 'Distributor',
          vat_number: row.vat_number || null,
          track_trace_enabled: row.track_trace_enabled === 'true',
          contacts,
          addresses,
          incoterms: row.incoterms || null,
          payment_terms: row.payment_terms || null,
          excise_number: row.excise_number || null,
          fiscal_warehouse_number: row.fiscal_warehouse_number || null,
          type: row.type || null,
          internal_owner: row.internal_owner || null,
          sales_manager: row.sales_manager || null,
          market: row.market || null,
        })

        if (error) errors.push({ name: row.legal_name, error: error.message })
        else imported++
      } catch (e: any) {
        errors.push({ name: row.legal_name, error: e.message })
      }
    }

    return NextResponse.json({ success: true, imported, errors })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}