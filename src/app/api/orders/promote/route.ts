import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { order_id, target_type } = await request.json()
    const supabase = createClient()

    const { data: so, error: soErr } = await supabase
      .from('sales_orders')
      .select('*, lines:sales_order_lines(*), services:sales_order_services(*)')
      .eq('id', order_id)
      .single()

    if (soErr || !so) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Proforma → SO conversion
    if (so.document_type === 'proforma' || target_type === 'so') {
      const { data: soNum } = await supabase.rpc('fn_generate_doc_number', {
        p_doc_type: 'so', p_is_foc: false,
      })
      const { data: newSO, error: soCreateErr } = await supabase
        .from('sales_orders')
        .insert({
          order_number:   soNum,
          document_type:  'so',
          is_foc:         false,
          promoted_from:  so.id,
          customer_id:    so.customer_id,
          customer_name:  so.customer_name,
          price_list:     so.price_list,
          currency:       so.currency,
          status:         'draft',
          warehouse:      so.warehouse,
          total_amount:   so.total_amount,
          total_units:    so.total_units,
          total_packs:    so.total_packs,
          incoterms:      so.incoterms,
          payment_terms:  so.payment_terms,
          notes:          so.notes,
          order_date:     so.order_date,
          shipment_date:  so.shipment_date,
        })
        .select()
        .single()

      if (soCreateErr) return NextResponse.json({ error: soCreateErr.message }, { status: 500 })

      if ((so.lines ?? []).length > 0) {
        await supabase.from('sales_order_lines').insert(
          (so.lines ?? []).map((l: any) => ({
            order_id:         newSO.id,
            line_type:        'commercial',
            sku:              l.sku,
            product_name:     l.product_name,
            brand:            l.brand,
            units_per_pack:   l.units_per_pack,
            quantity_packs:   l.quantity_packs,
            quantity_units:   l.quantity_units,
            price_per_unit:   l.price_per_unit,
            line_total:       l.line_total,
            fixmer_reference: l.fixmer_reference ?? null,
            warehouse:        l.warehouse ?? null,
          }))
        )
      }

      if ((so.services ?? []).length > 0) {
        await supabase.from('sales_order_services').insert(
          (so.services ?? []).map((s: any) => ({
            order_id:     newSO.id,
            service_type: s.service_type,
            description:  s.description,
            price:        s.price,
            currency:     s.currency,
          }))
        )
      }

      await supabase.from('sales_orders')
        .update({ linked_order_id: newSO.id })
        .eq('id', so.id)

      return NextResponse.json({ success: true, invoice: newSO })
    }

    // SO or SO(DO) → Invoice
    const isFocSource = so.is_foc

    // Vérifie si le client est T&T directement sur le customer
    const { data: customer } = await supabase
      .from('customers')
      .select('is_european, track_trace_enabled, eu_compliance_type, manual_pricing_enabled, reference_price_list')
      .eq('id', so.customer_id)
      .single()

    const isTT = !!(customer?.is_european && (customer?.track_trace_enabled || customer?.eu_compliance_type === 'TT'))

    // Pour T&T: récupère les prix SPECIAL
    let specialPriceMap: Record<string, number> = {}
    if (isTT && !isFocSource) {
      const skus = (so.lines ?? []).map((l: any) => l.sku)
      const { data: specialPrices } = await supabase
        .from('price_list_entries')
        .select('sku, price_per_unit')
        .eq('price_list', 'SPECIAL')
        .in('sku', skus)
      for (const p of specialPrices ?? []) {
        specialPriceMap[p.sku] = Number(p.price_per_unit)
      }
    }

    // Calcule les lignes de l'invoice principale
    // T&T → prix SPECIAL, sinon prix du SO
    const invoiceLines = (so.lines ?? []).map((l: any) => {
      if (isTT && !isFocSource) {
        const specialPrice = specialPriceMap[l.sku] ?? Number(l.price_per_unit)
        return {
          ...l,
          price_per_unit: specialPrice,
          line_total: isFocSource ? 0 : specialPrice * l.quantity_units,
        }
      }
      return l
    })

    const servicesTotal = isFocSource ? 0 : (so.services ?? []).reduce((s: number, sv: any) => s + Number(sv.price), 0)
    const invoiceTotalAmount = isFocSource ? 0 : invoiceLines.reduce((s: number, l: any) => s + Number(l.line_total), 0) + servicesTotal

    const { data: invNum } = await supabase.rpc('fn_generate_doc_number', {
      p_doc_type: 'invoice',
      p_is_foc: isFocSource,
    })

    const { data: invoice, error: invErr } = await supabase
      .from('sales_orders')
      .insert({
        order_number:    invNum,
        document_type:   'invoice',
        is_foc:          isFocSource,
        promoted_from:   so.id,
        linked_order_id: isFocSource ? so.id : null,
        customer_id:     so.customer_id,
        customer_name:   so.customer_name,
        price_list:      isTT ? 'SPECIAL' : so.price_list,
        currency:        so.currency,
        status:          'draft',
        warehouse:       so.warehouse,
        total_amount:    invoiceTotalAmount,
        total_units:     so.total_units,
        total_packs:     so.total_packs,
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
      })
      .select()
      .single()

    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

    // Insert invoice lines (prix SPECIAL pour T&T)
    await supabase.from('sales_order_lines').insert(
      invoiceLines.map((l: any) => ({
        order_id:         invoice.id,
        line_type:        l.line_type,
        sku:              l.sku,
        product_name:     l.product_name,
        brand:            l.brand,
        units_per_pack:   l.units_per_pack,
        quantity_packs:   l.quantity_packs,
        quantity_units:   l.quantity_units,
        price_per_unit:   l.price_per_unit,
        line_total:       l.line_total,
        fixmer_reference: l.fixmer_reference ?? null,
        warehouse:        l.warehouse ?? null,
      }))
    )

    // Carry additional services over to the main invoice
    if (!isFocSource && (so.services ?? []).length > 0) {
      await supabase.from('sales_order_services').insert(
        (so.services ?? []).map((s: any) => ({
          order_id:     invoice.id,
          service_type: s.service_type,
          description:  s.description,
          price:        s.price,
          currency:     s.currency,
        }))
      )
    }

    // ─── T&T: invoice LINKED pour la différence de prix ──────────────────────
    if (isTT && !isFocSource) {
      const diffLines = (so.lines ?? [])
        .filter((l: any) => l.line_type === 'commercial')
        .map((l: any) => {
          const specialPrice = specialPriceMap[l.sku] ?? Number(l.price_per_unit)
          const clientPrice  = Number(l.price_per_unit)
          const priceDiff    = clientPrice - specialPrice
          if (Math.abs(priceDiff) < 0.0001) return null
          return {
            sku:              l.sku,
            product_name:     l.product_name,
            brand:            l.brand,
            units_per_pack:   l.units_per_pack,
            quantity_packs:   l.quantity_packs,
            quantity_units:   l.quantity_units,
            price_per_unit:   priceDiff,
            line_total:       priceDiff * l.quantity_units,
            fixmer_reference: l.fixmer_reference ?? null,
          }
        })
        .filter(Boolean)

      if (diffLines.length > 0) {
        const totalDiff = diffLines.reduce((s: number, l: any) => s + l.line_total, 0)

        const { data: linkedInvNum } = await supabase.rpc('fn_generate_doc_number', {
          p_doc_type: 'invoice',
          p_is_foc: false,
        })

        const { data: linkedInvoice, error: linkedErr } = await supabase
          .from('sales_orders')
          .insert({
            order_number:    `${linkedInvNum} LINKED`,
            document_type:   'invoice',
            is_foc:          false,
            is_tt_order:     true,
            promoted_from:   so.id,
            linked_order_id: invoice.id,
            customer_id:     so.customer_id,
            customer_name:   so.customer_name,
            price_list:      so.price_list,
            currency:        so.currency,
            status:          'draft',
            warehouse:       so.warehouse,
            total_amount:    totalDiff,
            total_units:     so.total_units,
            total_packs:     so.total_packs,
            incoterms:       so.incoterms,
            payment_terms:   so.payment_terms,
            notes:           `Price difference for ${so.order_number}`,
            order_date:      so.order_date,
            shipment_date:   so.shipment_date,
          })
          .select()
          .single()

        if (!linkedErr && linkedInvoice) {
          await supabase.from('sales_order_lines').insert(
            diffLines.map((l: any) => ({
              order_id:         linkedInvoice.id,
              line_type:        'commercial',
              sku:              l.sku,
              product_name:     l.product_name,
              brand:            l.brand,
              units_per_pack:   l.units_per_pack,
              quantity_packs:   l.quantity_packs,
              quantity_units:   l.quantity_units,
              price_per_unit:   l.price_per_unit,
              line_total:       l.line_total,
              fixmer_reference: l.fixmer_reference ?? null,
            }))
          )
        }
      }
    }

    // ─── Manual pricing: invoice "Service & Marketing" pour combler l'écart vs la liste de référence ──
    // Le gap (diff_price_per_unit) est figé à la création de la ligne de commande, pas recalculé ici —
    // ça évite toute dérive si la liste de référence change entre la commande et la promotion.
    if (customer?.manual_pricing_enabled && !isFocSource) {
      const serviceLines = (so.lines ?? [])
        .filter((l: any) => l.line_type === 'commercial' && l.diff_price_per_unit != null && Number(l.diff_price_per_unit) > 0.0001)
        .map((l: any) => {
          const gap = Number(l.diff_price_per_unit)
          return {
            sku:              l.sku,
            product_name:     l.product_name,
            brand:            l.brand,
            units_per_pack:   l.units_per_pack,
            quantity_packs:   l.quantity_packs,
            quantity_units:   l.quantity_units,
            price_per_unit:   gap,
            line_total:       gap * l.quantity_units,
            fixmer_reference: l.fixmer_reference ?? null,
          }
        })

      if (serviceLines.length > 0) {
        const totalGap = serviceLines.reduce((s: number, l: any) => s + l.line_total, 0)

        const { data: svcInvNum } = await supabase.rpc('fn_generate_doc_number', {
          p_doc_type: 'invoice',
          p_is_foc: false,
        })

        const { data: serviceInvoice, error: svcErr } = await supabase
          .from('sales_orders')
          .insert({
            order_number:        `${svcInvNum} SVC`,
            document_type:       'invoice',
            is_foc:              false,
            is_service_invoice:  true,
            promoted_from:       so.id,
            linked_order_id:     invoice.id,
            customer_id:         so.customer_id,
            customer_name:       so.customer_name,
            price_list:          so.price_list,
            currency:            so.currency,
            status:              'draft',
            warehouse:           so.warehouse,
            total_amount:        totalGap,
            total_units:         so.total_units,
            total_packs:         so.total_packs,
            incoterms:           so.incoterms,
            payment_terms:       so.payment_terms,
            notes:               `Service & Marketing — ${so.order_number}`,
            order_date:          so.order_date,
            shipment_date:       so.shipment_date,
          })
          .select()
          .single()

        if (!svcErr && serviceInvoice) {
          await supabase.from('sales_order_lines').insert(
            serviceLines.map((l: any) => ({
              order_id:         serviceInvoice.id,
              line_type:        'commercial',
              sku:              l.sku,
              product_name:     l.product_name,
              brand:            l.brand,
              units_per_pack:   l.units_per_pack,
              quantity_packs:   l.quantity_packs,
              quantity_units:   l.quantity_units,
              price_per_unit:   l.price_per_unit,
              line_total:       l.line_total,
              fixmer_reference: l.fixmer_reference ?? null,
            }))
          )
        }
      }
    }

    // For a regular SO: also handle FOC companion if exists
    if (!isFocSource) {
      const { data: focSo } = await supabase
        .from('sales_orders')
        .select('*, lines:sales_order_lines(*)')
        .eq('promoted_from', so.id)
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
            warehouse:       so.warehouse,
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
              order_id:         focInvoice.id,
              line_type:        'foc',
              sku:              l.sku,
              product_name:     l.product_name,
              brand:            l.brand,
              units_per_pack:   l.units_per_pack,
              quantity_packs:   l.quantity_packs,
              quantity_units:   l.quantity_units,
              price_per_unit:   l.price_per_unit,
              line_total:       0,
              fixmer_reference: l.fixmer_reference ?? null,
            }))
          )
          await supabase.from('sales_orders')
            .update({ linked_order_id: focInvoice.id })
            .eq('id', focSo.id)
        }
      }

      // Link SO → invoice
      await supabase.from('sales_orders')
        .update({ linked_order_id: invoice.id })
        .eq('id', so.id)
    }

    return NextResponse.json({ success: true, invoice })
  } catch (err: any) {
    console.error('Promote error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}