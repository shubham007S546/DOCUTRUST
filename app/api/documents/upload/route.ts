import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID, createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenants, documents, documentChunks } from '@/lib/db/schema'
import mammoth from 'mammoth'

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
  'image/png',
  'image/jpeg',
  'image/webp',
])

function cleanPolicyText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[[^\]]*†[^\]]*\]/g, '')
    .replace(/\|\s*/g, '')
    .replace(/\*{1,3}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

function chunkPolicyText(text: string) {
  const blocks = text.split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line.length > 20)
  const sentences = blocks.flatMap((block) => block.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [block]).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 20)
  const chunks: string[] = []
  let current: string[] = []
  let length = 0
  for (const sentence of sentences) {
    if (current.length && length + sentence.length + 1 > 1100) {
      chunks.push(current.join(' '))
      current = current.slice(-2)
      length = current.join(' ').length
    }
    current.push(sentence)
    length += sentence.length + 1
  }
  if (current.length) chunks.push(current.join(' '))
  return chunks
}

function tenantUuid(userId: string) {
  const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ documents: [] }, { status: 401 })
  const tenantId = tenantUuid(session.user.id)
  const rows = await db.select().from(documents).where(eq(documents.tenantId, tenantId))
  return NextResponse.json({ documents: rows })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in before uploading a policy.' }, { status: 401 })
  }
  const tenantId = tenantUuid(session.user.id)
  await db.insert(tenants).values({ id: tenantId, slug: `user-${session.user.id}`, mode: 'private' }).onConflictDoNothing({ target: tenants.id })

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
  } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const extracted = await mammoth.extractRawText({ buffer: bytes })
    text = extracted.value
  } else if (file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Image upload is recognized, but OCR is not enabled yet. Upload a searchable PDF or DOCX, or add an OCR provider before indexing images.' }, { status: 415 })
  } else {
    return NextResponse.json({ error: 'Unsupported file extraction type.' }, { status: 415 })
  }
  const normalized = cleanPolicyText(text)
  if (normalized.length < 40) return NextResponse.json({ error: 'No readable text was extracted from this file.' }, { status: 422 })
  const chunks = chunkPolicyText(normalized).map((content, index) => ({ id: randomUUID(), tenantId: resolvedTenantId, versionLabel: 'v1', chunkIndex: index, content })).filter((chunk) => chunk.content.length > 20)
  const documentId = randomUUID()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  await db.insert(documents).values({ id: documentId, tenantId: resolvedTenantId, title: file.name, sourceType: 'upload', mimeType: file.type, status: 'ready', sha256 })
  if (chunks.length) await db.insert(documentChunks).values(chunks.map((chunk) => ({ ...chunk, documentId })))
    return NextResponse.json({ id: documentId, title: file.name, status: 'ready', chunks: chunks.length, source: 'native-nextjs' }, { status: 201 })
  } catch (error) {
    console.error('[v0] document upload failed', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Document indexing failed' }, { status: 500 })
  }
}
