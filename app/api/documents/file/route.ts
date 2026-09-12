import { get } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get('pathname')
  const mode = request.headers.get('x-docutrust-mode') ?? 'private'
  const tenantId = request.headers.get('x-tenant-id')

  if (!pathname) return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
  if (mode !== 'public_demo' && !tenantId) return NextResponse.json({ error: 'Authenticated tenant context is required' }, { status: 401 })
  if (mode === 'private' && !pathname.startsWith(`docutrust/${tenantId}/`)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (mode === 'public_demo' && !pathname.startsWith('docutrust/public-demo/')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await get(pathname, {
    access: 'private',
    ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
  })
  if (!result) return new NextResponse('Not found', { status: 404 })
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' } })

  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': result.blob.contentType,
      ETag: result.blob.etag,
      'Cache-Control': 'private, no-cache',
      'Content-Disposition': `inline; filename="${pathname.split('/').pop() ?? 'document'}"`,
    },
  })
}
