#!/usr/bin/env tsx
/**
 * CLI batch translator for CMS labels.
 *
 * Usage:
 *   npx tsx scripts/cms-translate.ts --namespace=common --to=en
 *   npx tsx scripts/cms-translate.ts --namespace=nav --from=fr --to=es --dry-run
 *   npx tsx scripts/cms-translate.ts --to=de  (translate all namespaces)
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load .env.local for local development
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dotenv = require('dotenv')
  dotenv.config({ path: '.env.local' })
} catch {}

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

const LANG_NAMES: Record<string, string> = {
  fr: 'French', en: 'English', es: 'Spanish',
  de: 'German', it: 'Italian', nl: 'Dutch', pt: 'Portuguese',
}

// Parse CLI args
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=')
      return [k, v ?? 'true']
    })
)

const namespace = args.namespace ?? null
const fromLang  = args.from ?? 'fr'
const toLang    = args.to
const dryRun    = args['dry-run'] === 'true'

if (!toLang) {
  console.error('Usage: npx tsx scripts/cms-translate.ts --to=<lang> [--namespace=X] [--from=fr] [--dry-run]')
  process.exit(1)
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

async function translateNamespace(ns: string): Promise<void> {
  console.log(`\n[${ns}] Translating ${fromLang} → ${toLang}...`)

  const { data: labels, error } = await supabase
    .from('cms_labels')
    .select('id, namespace, key')
    .eq('namespace', ns)
    .order('key')

  if (error || !labels?.length) { console.log('  → No labels found'); return }

  const { data: srcT } = await supabase
    .from('cms_translations')
    .select('label_id, value')
    .in('label_id', labels.map((l: any) => l.id))
    .eq('lang_code', fromLang)

  const srcMap: Record<string, string> = {}
  for (const t of (srcT ?? [])) srcMap[(t as any).label_id] = (t as any).value

  const toTranslate = labels.filter((l: any) => srcMap[l.id])
  console.log(`  ${toTranslate.length}/${labels.length} labels have source (${fromLang})`)
  if (!toTranslate.length) return

  const sourceJson: Record<string, string> = {}
  for (const l of toTranslate) sourceJson[`${(l as any).namespace}.${(l as any).key}`] = srcMap[(l as any).id]

  const prompt = `You are a professional translator for a premium cigar company CRM called Stellar by DH Signature.
Translate the following JSON from ${LANG_NAMES[fromLang] ?? fromLang} to ${LANG_NAMES[toLang] ?? toLang}.
Each value is a UI label. Keep translations concise and professional.${glossaryText}
Return ONLY valid JSON with the same keys and translated values. No explanation, no markdown.

${JSON.stringify(sourceJson, null, 2)}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawContent = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonStr = rawContent.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
  let translated: Record<string, string>
  try {
    translated = JSON.parse(jsonStr)
  } catch {
    console.error('  ✗ Failed to parse response:', rawContent.slice(0, 200))
    return
  }

  if (dryRun) {
    console.log('  [dry-run] Would insert:')
    Object.entries(translated).forEach(([k, v]) => console.log(`    ${k}: ${v}`))
    return
  }

  const labelByKey: Record<string, string> = {}
  for (const l of toTranslate) labelByKey[`${(l as any).namespace}.${(l as any).key}`] = (l as any).id

  const upserts = Object.entries(translated)
    .filter(([key]) => labelByKey[key])
    .map(([key, value]) => ({
      label_id: labelByKey[key],
      lang_code: toLang,
      value: String(value),
      is_auto_translated: true,
      updated_at: new Date().toISOString(),
    }))

  const { error: upsertErr } = await supabase
    .from('cms_translations')
    .upsert(upserts, { onConflict: 'label_id,lang_code' })

  if (upsertErr) {
    console.error('  ✗ Upsert error:', upsertErr.message)
  } else {
    console.log(`  ✓ ${upserts.length} translations saved`)
  }
}

async function main(): Promise<void> {
  // Fetch all namespaces if not specified
  const { data: allLabels } = await supabase.from('cms_labels').select('namespace')
  const allNamespaces = Array.from(new Set((allLabels ?? []).map((l: any) => l.namespace))).sort() as string[]
  const namespaces = namespace ? [namespace] : allNamespaces

  console.log(`CMS Translate: ${fromLang} → ${toLang}${dryRun ? ' (dry-run)' : ''}`)
  console.log(`Namespaces: ${namespaces.join(', ')}`)

  for (const ns of namespaces) {
    await translateNamespace(ns)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
