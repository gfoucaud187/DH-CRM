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
              text: `This is a supplier invoice or packing list for cigar boxes. Extract every line item.
Return ONLY a JSON array (no other text), one object per line item, with these fields:
[
  {
    "sku_guess": "the supplier's product code/reference for this line, exactly as written, or null",
    "description": "product name/description as written on the document",
    "quantity": number (quantity of boxes/units on this line — the count, not a weight or price),
    "unit_price": number (unit cost for this line if shown, else null)
  }
]
If a field isn't present on the document, use null. Do not invent values. Return only the JSON array.`,
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
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse any line items from the document' }, { status: 422 })

    const lines = JSON.parse(jsonMatch[0])
    return NextResponse.json({ lines })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
