import { NextRequest, NextResponse } from 'next/server'
import { buildFileContentBlocks } from '@/lib/ocr-content'
import { callAnthropicForJson } from '@/lib/anthropic'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const fileBlocks = await buildFileContentBlocks(file)

    const result = await callAnthropicForJson(apiKey, {
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            ...fileBlocks,
            {
              type: 'text',
              text: `This is a warehouse physical stocktake / count sheet listing counted box quantities per product. Extract every line item.
Return ONLY a JSON array (no other text):
[
  {
    "sku_guess": "the product code/reference exactly as written, or null",
    "description": "product name as written, or null",
    "counted_quantity": number (the counted quantity of boxes — the physical count, not a price or weight)
  }
]
If a field isn't present, use null. Do not invent values. Return only the JSON array.`,
            },
          ],
        }],
      }, /\[[\s\S]*\]/)

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ lines: result.parsed })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
