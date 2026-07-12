import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LANG_NAMES: Record<string, string> = {
  fr: 'French',
  en: 'English',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  nl: 'Dutch',
  pt: 'Portuguese',
}

// POST /api/cms/translate
// Body: { namespace, from_lang, to_lang, label_ids?: string[], dry_run?: boolean }
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { namespace, from_lang = 'fr', to_lang, label_ids, dry_run = false } = body

  if (!to_lang) {
    return NextResponse.json({ error: 'to_lang is required' }, { status: 400 })
  }
  if (from_lang === to_lang) {
    return NextResponse.json({ error: 'from_lang and to_lang must differ' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch labels for the namespace (optionally filtered by label_ids)
  let labelsQuery = supabase
    .from('cms_labels')
    .select('id, namespace, key')
    .order('key')

  if (namespace) labelsQuery = labelsQuery.eq('namespace', namespace)
  if (label_ids?.length) labelsQuery = labelsQuery.in('id', label_ids)

  const { data: labels, error: labelsError } = await labelsQuery
  if (labelsError) return NextResponse.json({ error: labelsError.message }, { status: 500 })
  if (!labels?.length) return NextResponse.json({ translated: [], skipped: 0 })

  const labelIds = labels.map((l: any) => l.id)

  // Fetch source translations
  const { data: srcTranslations } = await supabase
    .from('cms_translations')
    .select('label_id, value')
    .in('label_id', labelIds)
    .eq('lang_code', from_lang)

  const srcMap: Record<string, string> = {}
  for (const t of srcTranslations ?? []) {
    srcMap[t.label_id] = t.value
  }

  // Only translate labels that have a source value
  const toTranslate = labels.filter((l: any) => srcMap[l.id])
  if (!toTranslate.length) {
    return NextResponse.json({ translated: [], skipped: labels.length })
  }

  // Build payload for Anthropic
  const sourceJson: Record<string, string> = {}
  for (const label of toTranslate) {
    const fullKey = `${label.namespace}.${label.key}`
    sourceJson[fullKey] = srcMap[label.id]
  }

  // Load glossary
  let glossaryText = ''
  try {
    const glossaryPath = join(process.cwd(), 'cms-glossary.json')
    const glossary: Record<string, string> = JSON.parse(readFileSync(glossaryPath, 'utf-8'))
    const terms = Object.entries(glossary)
      .map(([k, v]) => `"${k}" → keep as "${v}"`)
      .join('\n')
    glossaryText = `\nTerminology glossary (do NOT translate these):\n${terms}\n`
  } catch {}

  const fromName = LANG_NAMES[from_lang] ?? from_lang
  const toName = LANG_NAMES[to_lang] ?? to_lang

  const prompt = `You are a professional translator for a premium cigar company CRM called Stellar by DH Signature.
Translate the following JSON from ${fromName} to ${toName}.
Each value is a UI label. Keep translations concise and professional.${glossaryText}
Return ONLY valid JSON with the same keys and translated values. No explanation, no markdown.

${JSON.stringify(sourceJson, null, 2)}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  let translatedJson: Record<string, string> = {}
  const rawContent = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    // Strip markdown code blocks if present
    const jsonStr = rawContent.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    translatedJson = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: 'Failed to parse translation response', raw: rawContent }, { status: 500 })
  }

  if (dry_run) {
    return NextResponse.json({ dry_run: true, preview: translatedJson })
  }

  // Build label lookup by fullKey
  const labelByKey: Record<string, string> = {}
  for (const label of toTranslate) {
    labelByKey[`${label.namespace}.${label.key}`] = label.id
  }

  const upserts = Object.entries(translatedJson)
    .filter(([key]) => labelByKey[key])
    .map(([key, value]) => ({
      label_id: labelByKey[key],
      lang_code: to_lang,
      value: String(value),
      is_auto_translated: true,
      updated_at: new Date().toISOString(),
    }))

  if (upserts.length) {
    const { error: upsertError } = await supabase
      .from('cms_translations')
      .upsert(upserts, { onConflict: 'label_id,lang_code' })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    translated: upserts.length,
    skipped: labels.length - toTranslate.length,
  })
}
