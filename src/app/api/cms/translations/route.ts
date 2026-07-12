import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// GET /api/cms/translations?lang=fr
// Returns flat map { 'namespace.key': value } for the provider cache
export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get('lang') ?? 'fr'
  const supabase = createClient()

  const { data, error } = await supabase
    .from('cms_translations')
    .select('value, cms_labels!inner(namespace, key)')
    .eq('lang_code', lang)

  if (error) {
    return NextResponse.json({}, { status: 500 })
  }

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    const label = row.cms_labels as any
    map[`${label.namespace}.${label.key}`] = row.value
  }

  return NextResponse.json(map, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}

// PUT /api/cms/translations
// Body: { label_id, lang_code, value }
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { label_id, lang_code, value } = body

  if (!label_id || !lang_code || value === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('cms_translations')
    .upsert(
      { label_id, lang_code, value, is_auto_translated: false, updated_at: new Date().toISOString() },
      { onConflict: 'label_id,lang_code' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
