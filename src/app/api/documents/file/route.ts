import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Proxies a Storage file download through our own origin. The browser can't fetch() the
// Supabase storage host directly (blocked by CORS on this self-hosted setup) — only a full-page
// navigation to a signed URL works there. Server-to-server calls aren't subject to CORS at all,
// so fetching here and streaming the bytes back sidesteps the problem entirely.
//
// Takes the document_files.id, not the raw file_path — long paths with spaces, parentheses, and
// accented characters (common in these file names) were unreliable as a URL query parameter,
// failing for a large fraction of files. An id is short, ASCII, and fixed-length.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createClient()
  const { data: fileRow, error: fileErr } = await supabase
    .from('document_files')
    .select('file_path')
    .eq('id', id)
    .single()
  if (fileErr || !fileRow) {
    return NextResponse.json({ error: fileErr?.message ?? 'Document not found' }, { status: 404 })
  }

  const { data, error } = await supabase.storage.from('documents').download(fileRow.file_path)
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
