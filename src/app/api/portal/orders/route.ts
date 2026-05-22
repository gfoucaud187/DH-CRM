import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles').select('role, customer_id').eq('id', user.id).single()
    if (!profile || profile.role !== 'client')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { order, lines } = await request.json()

    // Generate PO number safely
    let poNum = 'PO-' + Date.now()
    const { data: numData } = await supabase.rpc('fn_generate_doc_number', {
      p_doc_type: 'po', p_is_foc: false,
    })
    if (numData) poNum = numData

    const { data: createdOrder, error: orderErr } = await supabase
      .from('sales_orders')
      .insert({
        ...order,
        order_number: poNum,
        customer_id: profile.customer_id,
        order_date: new Date().toISOString(),
        is_foc: false,
        is_sample: false,
      })
      .select()
      .single()

    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

    if (lines?.length > 0) {
      await supabase.from('sales_order_lines').insert(
        lines.map((l: any) => ({ ...l, order_id: createdOrder.id }))
      )
    }

    return NextResponse.json({ success: true, order: createdOrder })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
