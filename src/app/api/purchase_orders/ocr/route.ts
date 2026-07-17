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
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            ...fileBlocks,
            {
              type: 'text',
              text: `This is a supplier invoice or packing list for cigar boxes. Extract every line item.
Return ONLY a JSON array (no other text), one object per line item, with these fields:
[
  {
    "sku_guess": "the supplier's product code/reference for this line, exactly as written, or null",
    "description": "product name/description as written on the document",
    "quantity": number (quantity of boxes/units on this line — the count, not a weight or price),
    "unit_price": number (unit cost for this line if shown, else null),
    "line_total_guess": number (this line's total price as written, if shown, else null)
  }
]
Numbers on these documents are sometimes written with a comma as the decimal separator (e.g. "5,520"
meaning 5.52, not five thousand five hundred twenty) instead of a decimal point. Use context to tell
which convention a given document uses — cross-check unit_price against line_total_guess and quantity
(unit_price * quantity should roughly equal line_total_guess), and against any grand total shown for
the whole order. Cigar box unit costs are typically a few dollars to a few hundred dollars, never in
the thousands. If a field isn't present on the document, use null. Do not invent values. Return only
the JSON array.`,
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
