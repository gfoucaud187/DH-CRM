import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Proxies a Storage file download through our own origin. The browser can't fetch() the
// Supabase storage host directly (blocked by CORS on this self-hosted setup) — only a full-page
// navigation to a signed URL works there. Server-to-server calls aren't subject to CORS at all,
// so fetching here and streaming the bytes back sidesteps the problem entirely.
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'Missing path' }, { status: 400 })

  const supabase = createClient()
  const { data, error } = await supabase.storage.from('documents').download(path)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'File not found' }, { status: 404 })
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Content-Length': String(buffer.length),
    },
  })
}
