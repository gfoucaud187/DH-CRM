import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = file.type || 'application/pdf'
    const isPdf = mediaType === 'application/pdf'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: isPdf ? 'document' : 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
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
      "unit_price": number (unit price for this line if shown, else null)
    }
  ]
}
If a field isn't present on the document, use null. Do not invent values. Return only the JSON object.`,
            },
          ],
        }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: 'Anthropic API error: ' + err }, { status: 502 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse this document' }, { status: 422 })

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
