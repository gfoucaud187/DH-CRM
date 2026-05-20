import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient()

    // Load all products
    const { data: products } = await supabase
      .from('products')
      .select('id, sku, full_name')
      .eq('product_role', 'original')

    if (!products) return NextResponse.json({ error: 'No products found' }, { status: 400 })

    let imported = 0
    const errors: any[] = []

    for (const product of products) {
      // We'll read prices from the request body instead
      // This endpoint accepts JSON: [{sku, price_G, price_G1, price_A1, price_SPECIAL}]
    }

    return NextResponse.json({ success: true, imported })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}