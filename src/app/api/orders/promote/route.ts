import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { order_id } = await request.json()
    const supabase = createClient()

    // Load original SO with lines
    const { data: so, error: soErr } = await supabase
      .from('sales_orders')
      .select('*, lines:sales_order_lines(*)')
      .eq('id', order_id)
      .single()

    if (soErr || !so) return NextResponse.json({ error: 'SO not found' }, { status: 404 })

    console.log('SO warehouse:', so.warehouse) // debug

    // Generate invoice number
    const { data: invNum } = await supabase.rpc('fn_generate_doc_number', {
      p_doc_type: 'invoice', p_is_foc: false,
    })

    // Create invoice — warehouse MUST match SO
    const invoiceData = {
      order_number:    invNum,
      document_type:   'invoice',
      is_foc:          false,
      promoted_from:   so.id,
      customer_id:     so.customer_id,
      customer_name:   so.customer_name,
      price_list:      so.price_list,
      currency:        so.currency,
      status:          'draft',
      warehouse:       so.warehouse,  // always from SO
      total_amount:    so.total_amount,
      total_units:     so.total_units,
      total_packs:     so.total_packs,
      foc_total_units: so.foc_total_units,
      foc_total_packs: so.foc_total_packs,
      incoterms:       so.incoterms,
      payment_terms:   so.payment_terms,
      notes:           so.notes,
      order_date:      so.order_date,
      shipment_date:   so.shipment_date,
      is_tt_order:     so.is_tt_order,
      bill_to_name:    so.bill_to_name,
      bill_to_address: so.bill_to_address,
      care_of_name:    so.care_of_name,
      care_of_address: so.care_of_address,
      so_price_list:   so.so_price_list,
      so_total_amount: so.so_total_amount,
    }

    console.log('Invoice warehouse:', invoiceData.warehouse) // debug

    const { data: invoice, error: invErr } = await supabase
      .from('sales_orders')
      .insert(invoiceData)
      .select()
      .single()

    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

    // Copy lines
    await supabase.from('sales_order_lines').insert(
      (so.lines ?? []).map((l: any) => ({
        order_id:       invoice.id,
        line_type:      l.line_type,
        sku:            l.sku,
        product_name:   l.product_name,
        brand:          l.brand,
        units_per_pack: l.units_per_pack,
        quantity_packs: l.quantity_packs,
        quantity_units: l.quantity_units,
        price_per_unit: l.price_per_unit,
        line_total:     l.line_total,
      }))
    )

    // Check for FOC companion
    const { data: focSo } = await supabase
      .from('sales_orders')
      .select('*, lines:sales_order_lines(*)')
      .eq('linked_order_id', so.id)
      .eq('is_foc', true)
      .maybeSingle()

    if (focSo) {
      const { data: focInvNum } = await supabase.rpc('fn_generate_doc_number', {
        p_doc_type: 'invoice', p_is_foc: true,
      })
      const { data: focInvoice } = await supabase
        .from('sales_orders')
        .insert({
          order_number:    focInvNum,
          document_type:   'invoice',
          is_foc:          true,
          promoted_from:   focSo.id,
          linked_order_id: invoice.id,
          customer_id:     focSo.customer_id,
          customer_name:   focSo.customer_name,
          currency:        focSo.currency,
          status:          'draft',
          warehouse:       so.warehouse, // same as SO
          total_amount:    0,
          total_units:     focSo.total_units,
          total_packs:     focSo.total_packs,
          incoterms:       focSo.incoterms,
          payment_terms:   focSo.payment_terms,
          order_date:      focSo.order_date,
        })
        .select().single()

      if (focInvoice) {
        await supabase.from('sales_order_lines').insert(
          (focSo.lines ?? []).map((l: any) => ({
            order_id:       focInvoice.id,
            line_type:      'foc',
            sku:            l.sku,
            product_name:   l.product_name,
            brand:          l.brand,
            units_per_pack: l.units_per_pack,
            quantity_packs: l.quantity_packs,
            quantity_units: l.quantity_units,
            price_per_unit: 0,
            line_total:     0,
          }))
        )
        await supabase.from('sales_orders')
          .update({ linked_order_id: focInvoice.id })
          .eq('id', invoice.id)
      }
    }

    // Link SO to invoice — SO keeps its own status
    await supabase.from('sales_orders')
      .update({ linked_order_id: invoice.id })
      .eq('id', so.id)

    return NextResponse.json({ success: true, invoice })
  } catch (err: any) {
    console.error('Promote error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}