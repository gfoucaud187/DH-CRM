import { NextRequest, NextResponse } from 'next/server'
import { callAnthropic } from '@/lib/anthropic'

export async function POST(request: NextRequest) {
  try {
    const { lines } = await request.json()
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ flags: [] })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const response = await callAnthropic(apiKey, {
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are reviewing computed reorder quantities for cigar boxes (not deciding them — a fixed formula already computed "recommended_qty_packs" from average monthly sales, current stock, lead time and growth assumptions). Your job is to flag lines where the recommended quantity looks questionable and briefly say why — e.g. too little sales history to trust the average, a recommended quantity that looks disproportionate versus current stock or sales pace, a product with zero recent sales but stock still being ordered, etc. Do not flag lines that look normal.

Data (one object per SKU):
${JSON.stringify(lines, null, 2)}

Return ONLY a JSON array, no other text, one entry per flagged line (omit lines with no concern):
[{ "sku": "...", "comment": "short reason, one sentence" }]
If nothing looks concerning, return [].`,
        }],
      })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: 'Anthropic API error: ' + err }, { status: 502 })
    }

    const data = await response.json()
    const text = data.content?.find((b: any) => b.type === 'text')?.text ?? ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const flags = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    return NextResponse.json({ flags })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
