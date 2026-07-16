import { NextRequest, NextResponse } from 'next/server'
import { buildFileContentBlocks } from '@/lib/ocr-content'
import { callAnthropic } from '@/lib/anthropic'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const fileBlocks = await buildFileContentBlocks(file)

    const response = await callAnthropic(apiKey, {
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            ...fileBlocks,
            {
              type: 'text',
              text: `This is an existing Sales Order or Invoice document for cigar boxes, being re-entered into a
new system. Extract its header info and every line item. Return ONLY a JSON object (no other text) shaped exactly like:
{
  "customer_name_guess": "the client/distributor name as written on the document, or null",
  "order_number_guess": "the document's own reference number as written, or null",
  "order_date_guess": "YYYY-MM-DD if a date is shown, else null",
  "warehouse_guess": "T1, Central, Aged, Sample, or Private if mentioned/inferable, else null",
  "incoterms_guess": "e.g. EXW, FOB, CIF, DAP, DDP if shown, else null",
  "lines": [
    {
      "sku_guess": "the product code/reference for this line, exactly as written, or null",
      "description": "product name/description as written on the document",
      "quantity_packs": number (quantity of boxes on this line — the count, not a weight or price),
      "unit_price": number (unit price for this line if shown, else null),
      "line_total_guess": number (this line's total price as written, if shown, else null)
    }
  ]
}
Numbers on these documents are sometimes written with a comma as the decimal separator (e.g. "5,520"
meaning 5.52, not five thousand five hundred twenty) instead of a decimal point. Use context to tell
which convention a given document uses — cross-check unit_price against line_total_guess and
quantity_packs (unit_price * quantity_packs should roughly equal line_total_guess), and against any
grand total shown for the whole order. Cigar box unit prices are typically a few dollars to a few
hundred dollars, never in the thousands. If a field isn't present on the document, use null. Do not
invent values. Return only the JSON object.`,
            },
          ],
        }],
      })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: 'Anthropic API error: ' + err }, { status: 502 })
    }

    const data = await response.json()
    const text = data.content?.find((b: any) => b.type === 'text')?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse this document' }, { status: 422 })

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
