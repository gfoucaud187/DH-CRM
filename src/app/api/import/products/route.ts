import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const text = await file.text()
    const lines = text.split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

    const supabase = createServiceClient()
    let imported = 0
    let errors = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
      const row: any = {}
      headers.forEach((h, idx) => row[h] = values[idx])

      if (!row.sku || !row.full_name) continue

      const { error } = await supabase.from('products').upsert({
        sku: row.sku,
        full_name: row.full_name,
        brand: row.brand ?? '',
        fixmer_reference: row.fixmer_reference,
        line: row.line,
        vitola: row.vitola,
        shape: row.shape,
        wrapper: row.wrapper,
        units_per_pack: parseInt(row.units_per_pack) || null,
        pack_type: row.pack_type,
        status: row.status ?? 'active',
        product_role: 'original',
      }, { onConflict: 'sku,product_role' })

      if (error) errors.push({ sku: row.sku, error: error.message })
      else imported++
    }

    return NextResponse.json({ success: true, imported, errors })
  } catch (err) {
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
