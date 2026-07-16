import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { order, commercial_lines, foc_lines, services } = body
    const supabase = createClient()
    const hasFoc = foc_lines && foc_lines.length > 0

    // 1. Generate document numbers
    const { data: docNum } = await supabase.rpc('fn_generate_doc_number', {
      p_doc_type: order.document_type,
      p_is_foc: order.is_foc ?? false,
    })

    let focDocNum = null
    if (hasFoc) {
      const { data: fn } = await supabase.rpc('fn_generate_doc_number', {
        p_doc_type: order.document_type,
        p_is_foc: true,
      })
      focDocNum = fn
    }

    // 2. Calculate totals
    const servicesTotal = (services ?? []).reduce((s: number, sv: any) => s + (sv.price ?? 0), 0)
    const totalAmount = commercial_lines.reduce((s: number, l: any) => s + (l.line_total ?? 0), 0) + servicesTotal
    const totalUnits  = commercial_lines.reduce((s: number, l: any) => s + (l.quantity_units ?? 0), 0)
    const totalPacks  = commercial_lines.reduce((s: number, l: any) => s + (l.quantity_packs ?? 0), 0)
    const focUnits    = (foc_lines ?? []).reduce((s: number, l: any) => s + (l.quantity_units ?? 0), 0)
    const focPacks    = (foc_lines ?? []).reduce((s: number, l: any) => s + (l.quantity_packs ?? 0), 0)

    // 3. Create sales order
    const { data: createdOrder, error: orderError } = await supabase
      .from('sales_orders')
      .insert({
        order_number:     docNum,
        foc_order_number: focDocNum,
        document_type:    order.document_type,
        is_foc:           order.is_foc ?? false,
        is_sample:        order.is_sample ?? false,
        customer_id:      order.customer_id,
        customer_name:    order.customer_name,
        price_list:       order.price_list,
        currency:         order.currency,
        status:           'draft',
        warehouse:        order.warehouse,
        warehouse_destination: order.warehouse_destination ?? null,
        total_amount:     totalAmount,
        total_units:      totalUnits,
        total_packs:      totalPacks,
        foc_total_units:  focUnits,
        foc_total_packs:  focPacks,
        incoterms:        order.incoterms,
        payment_terms:    order.payment_terms,
        payment_terms_days: order.payment_terms_days ?? null,
        notes:            order.notes,
        order_date:       order.order_date || new Date().toISOString().split('T')[0],
        shipment_date:    order.shipment_date,
        order_received_date: order.order_received_date ?? null,
      })
      .select()
      .single()

    if (orderError) {
      console.error('Order error:', orderError)
      return NextResponse.json({ error: orderError.message }, { status: 500 })
    }

    // 4. Create commercial lines
    if (commercial_lines.length > 0) {
      const { error: linesError } = await supabase
        .from('sales_order_lines')
        .insert(commercial_lines.map((l: any) => ({
          order_id:       createdOrder.id,
          line_type:      'commercial',
          sku:            l.sku,
          product_name:   l.product_name,
          brand:          l.brand,
          units_per_pack: l.units_per_pack,
          quantity_packs: l.quantity_packs,
          quantity_units: l.quantity_units,
          price_per_unit: l.price_per_unit,
          fixmer_reference  : l.fixmer_reference,
          line_total:     l.line_total,
          diff_price_per_unit: l.diff_price_per_unit ?? null,
          warehouse:      l.warehouse ?? order.warehouse,
        })))

      if (linesError) {
        console.error('Lines error:', linesError)
        return NextResponse.json({ error: linesError.message }, { status: 500 })
      }
    }

    // 5. Create additional services
    if (services && services.length > 0) {
      const { error: servicesError } = await supabase
        .from('sales_order_services')
        .insert(services.map((sv: any) => ({
          order_id:     createdOrder.id,
          service_type: sv.service_type,
          description:  sv.description,
          price:        sv.price,
          currency:     sv.currency ?? order.currency,
        })))

      if (servicesError) {
        console.error('Services error:', servicesError)
        return NextResponse.json({ error: servicesError.message }, { status: 500 })
      }
    }

    // 6. Create FOC companion if needed
    let focOrder = null
    if (hasFoc && focDocNum) {
      const { data: createdFoc } = await supabase
        .from('sales_orders')
        .insert({
          order_number:    focDocNum,
          document_type:   order.document_type,
          is_foc:          true,
          linked_order_id: createdOrder.id,
          promoted_from:   createdOrder.id, // stable parent reference — linked_order_id gets overwritten once this doc is itself promoted to an invoice
          customer_id:     order.customer_id,
          customer_name:   order.customer_name,
          price_list:      order.price_list, // needed to look up the reference (commercial) price of FOC lines later
          currency:        order.currency,
          status:          'draft',
          warehouse:       order.warehouse,
          total_amount:    0,
          total_units:     focUnits,
          total_packs:     focPacks,
          incoterms:       order.incoterms,
          payment_terms:   order.payment_terms,
          order_date:      order.order_date || new Date().toISOString().split('T')[0],
        })
        .select()
        .single()

      if (createdFoc) {
        await supabase.from('sales_order_lines').insert(
          foc_lines.map((l: any) => ({
            order_id:       createdFoc.id,
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
        focOrder = createdFoc
      }
    }

    return NextResponse.json({ success: true, order: createdOrder, foc_order: focOrder })
  } catch (err: any) {
    console.error('Create order error:', err)
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 })
  }
}