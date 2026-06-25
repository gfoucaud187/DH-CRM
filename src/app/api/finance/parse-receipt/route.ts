import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = file.type || 'image/jpeg'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: `Extract expense details from this receipt. Return ONLY a JSON object with these fields (null if not found):
{
  "date": "YYYY-MM-DD",
  "vendor": "vendor name",
  "description": "brief description of purchase",
  "amount": number (total amount in SGD, excluding GST if shown separately),
  "gst": number (GST amount if shown, else null),
  "category": one of: office|travel|meals|utilities|professional|marketing|rent|bank_charges|freight|other
}
Return only the JSON, no other text.`,
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
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse receipt' }, { status: 422 })

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
