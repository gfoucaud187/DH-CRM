import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { so_id } = await request.json()
    const supabase = createClient()

    // Load the source SO
    const { data: so } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', so_id)
      .single()

    if (!so) return NextResponse.json({ error: 'SO not found' }, { status: 404 })
    if (so.is_foc) return NextResponse.json({ error: 'Cannot create FOC from a FOC document' }, { status: 400 })

    // Check if FOC already exists for this SO
    const { data: existing } = await supabase
      .from('sales_orders')
      .select('id, order_number')
      .eq('linked_order_id', so_id)
      .eq('is_foc', true)
      .maybeSingle()

    if (existing) return NextResponse.json({ 
      error: `FOC document already exists: ${existing.order_number}`,
      existing_id: existing.id 
    }, { status: 409 })

    // Generate SO(DO) number
    const { data: focNum } = await supabase.rpc('fn_generate_doc_number', {
      p_doc_type: so.document_type,
      p_is_foc: true,
    })

    // Create the SO(DO)
    const { data: focOrder, error } = await supabase
      .from('sales_orders')
      .insert({
        order_number:    focNum,
        document_type:   so.document_type,
        is_foc:          true,
        linked_order_id: so.id,
        customer_id:     so.customer_id,
        customer_name:   so.customer_name,
        currency:        so.currency,
        status:          'draft',
        warehouse:       so.warehouse,
        total_amount:    0,
        total_units:     0,
        total_packs:     0,
        incoterms:       so.incoterms,
        payment_terms:   so.payment_terms,
        order_date:      so.order_date,
        shipment_date:   so.shipment_date,
        notes:           `FOC document — ref. ${so.order_number}`,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, foc_order: focOrder })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}