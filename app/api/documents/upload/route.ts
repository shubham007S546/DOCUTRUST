import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID, createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { documents, documentChunks } from '@/lib/db/schema'

export const runtime = 'nodejs'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function tenantUuid(userId: string) {
  const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in before uploading a policy.' }, { status: 401 })
  }
  const tenantId = tenantUuid(session.user.id)

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A document file is required' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported document type' }, { status: 415 })
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Document must be between 1 byte and 25 MB' }, { status: 413 })
  }

  const resolvedTenantId = tenantId
  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    let text = ''
  if (file.type === 'application/pdf') {
    const { extractText } = await import('unpdf')
    const extracted = await extractText(new Uint8Array(bytes), { mergePages: true })
    text = extracted.text
  } else if (file.type.startsWith('text/') || file.type === 'application/json') {
    text = bytes.toString('utf8')
  } else {
    return NextResponse.json({ error: 'This deployment supports PDF, text, Markdown, CSV, and JSON uploads. DOCX requires a document worker.' }, { status: 415 })
  }
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length < 40) return NextResponse.json({ error: 'No readable text was extracted from this file.' }, { status: 422 })
  const chunks = normalized.match(/.{1,1400}(?:\s|$)/g)?.map((content, index) => ({ id: randomUUID(), tenantId: resolvedTenantId, versionLabel: 'v1', chunkIndex: index, content: content.trim() })).filter((chunk) => chunk.content.length > 20) ?? []
  const documentId = randomUUID()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  await db.insert(documents).values({ id: documentId, tenantId: resolvedTenantId, title: file.name, sourceType: 'upload', mimeType: file.type, status: 'indexed', sha256 })
  if (chunks.length) await db.insert(documentChunks).values(chunks.map((chunk) => ({ ...chunk, documentId })))
    return NextResponse.json({ id: documentId, title: file.name, status: 'indexed', chunks: chunks.length, source: 'native-nextjs' }, { status: 201 })
  } catch (error) {
    console.error('[v0] document upload failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Document indexing failed' }, { status: 500 })
  }
}
