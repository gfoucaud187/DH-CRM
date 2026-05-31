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

      const { data: product, error } = await supabase.from('products').upsert({
        sku:              row.sku,
        full_name:        row.full_name,
        brand:            row.brand ?? '',
        fixmer_reference: row.fixmer_reference || null,
        line:             row.line || null,
        vitola:           row.vitola || null,
        shape:            row.shape || null,
        wrapper:          row.wrapper || null,
        binder:           row.binder || null,
        filler:           row.filler || null,
        units_per_pack:   parseInt(row.units_per_pack) || null,
        pack_type:        row.pack_type || null,
        eu_ceg_id:        row.eu_ceg_id || null,
        status:           row.status ?? 'active',
        product_role:     'original',
        length_inches:    parseFloat(row.length_inches) || null,
        ring_gauge:       parseFloat(row.ring_gauge) || null,
        net_weight_g:     parseFloat(row.net_weight_g) || null,
        notes:            row.notes || null,
      }, { onConflict: 'sku,product_role' }).select().single()

      if (error) {
        errors.push({ sku: row.sku, error: error.message })
        continue
      }

      imported++

      // Import price list entries if present in CSV
      const priceLists = ['G', 'G1', 'A1', 'SPECIAL']
      for (const list of priceLists) {
        const colName = `price_${list.toLowerCase()}`
        const price = parseFloat(row[colName])
        if (!isNaN(price) && price > 0) {
          await supabase.from('price_list_entries').upsert({
            sku: row.sku,
            product_name: row.full_name,
            price_list: list,
            price_per_unit: price,
            currency: row.currency ?? 'USD',
          }, { onConflict: 'sku,price_list' })
        }
      }
    }

    return NextResponse.json({ success: true, imported, errors })
  } catch (err) {
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}