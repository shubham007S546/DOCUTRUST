import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { documentChunks, documents } from '@/lib/db/schema'

export const runtime = 'nodejs'

function tenantUuid(userId: string) {
  const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ documents: [] }, { status: 401 })
  const rows = await db.select().from(documents).where(eq(documents.tenantId, tenantUuid(session.user.id)))
  return Response.json({ documents: rows })
}

export async function PATCH(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const tenantId = tenantUuid(session.user.id)
  const body = await request.json().catch(() => ({}))
  if (typeof body.id !== 'string' || body.action !== 'reindex') return NextResponse.json({ error: 'A document id and reindex action are required' }, { status: 400 })
  const existing = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, body.id), eq(documents.tenantId, tenantId))).limit(1)
  if (!existing.length) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  await db.update(documents).set({ status: 'ready', updatedAt: new Date() }).where(and(eq(documents.id, body.id), eq(documents.tenantId, tenantId)))
  return NextResponse.json({ ok: true, status: 'ready' })
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const tenantId = tenantUuid(session.user.id)
  const body = await request.json().catch(() => ({}))
  if (typeof body.id !== 'string') return NextResponse.json({ error: 'A document id is required' }, { status: 400 })
  await db.delete(documentChunks).where(and(eq(documentChunks.documentId, body.id), eq(documentChunks.tenantId, tenantId)))
  const deleted = await db.delete(documents).where(and(eq(documents.id, body.id), eq(documents.tenantId, tenantId))).returning({ id: documents.id })
  if (!deleted.length) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json({ ok: true, id: body.id })
}

export async function HEAD() {
  return new Response(null, { status: 204 })
}
