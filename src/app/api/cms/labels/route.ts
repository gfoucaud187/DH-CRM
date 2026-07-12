import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// GET /api/cms/labels?lang=fr&namespace=common
// Returns labels with their translation for the given lang
export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get('lang') ?? 'fr'
  const namespace = request.nextUrl.searchParams.get('namespace')

  const supabase = createClient()

  let query = supabase
    .from('cms_labels')
    .select(`
      id, namespace, key, description,
      cms_translations!left(value, is_auto_translated, updated_at, lang_code)
    `)
    .order('namespace')
    .order('key')

  if (namespace) {
    query = query.eq('namespace', namespace)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter translations to only the requested lang
  const labels = (data ?? []).map((label: any) => {
    const translations: any[] = label.cms_translations ?? []
    const translation = translations.find((t: any) => t.lang_code === lang) ?? null
    return {
      id: label.id,
      namespace: label.namespace,
      key: label.key,
      description: label.description,
      translation: translation
        ? { value: translation.value, is_auto_translated: translation.is_auto_translated, updated_at: translation.updated_at }
        : null,
    }
  })

  return NextResponse.json(labels)
}

// GET /api/cms/labels/namespaces - distinct namespace list
// POST /api/cms/labels - create new label
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { namespace, key, description } = body

  if (!namespace || !key) {
    return NextResponse.json({ error: 'namespace and key are required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('cms_labels')
    .insert({ namespace, key, description: description ?? null })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
