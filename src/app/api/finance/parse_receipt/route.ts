import { NextRequest, NextResponse } from 'next/server'
import { callAnthropicForJson } from '@/lib/anthropic'

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

    const result = await callAnthropicForJson(apiKey, {
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
              text: `Extract expense details from this receipt image. Return ONLY a JSON object with these fields (null if not found):
{
  "date": "YYYY-MM-DD",
  "vendor": "vendor name",
  "description": "brief description of purchase",
  "currency": "3-letter ISO currency code (SGD, USD, EUR, GBP, JPY, CNY, HKD, AUD, etc.) — detect from receipt, default to SGD",
  "amount": number (total amount in the receipt's original currency, excluding GST if shown separately),
  "gst": number (GST/tax amount if shown, else null),
  "category": one of: office|travel|meals|utilities|professional|marketing|rent|bank_charges|freight|other
}
Return only the JSON, no other text.`,
            },
          ],
        }],
      }, /\{[\s\S]*\}/)

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result.parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
