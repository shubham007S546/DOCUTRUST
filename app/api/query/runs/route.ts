import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { and, desc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { queryRuns } from '@/lib/db/schema'

function tenantUuid(userId: string) {
  const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ error: 'Please sign in.' }, { status: 401 })
  const body = await request.json().catch(() => null) as { id?: string } | null
  if (!body?.id) return Response.json({ error: 'Run id is required.' }, { status: 400 })
  const deleted = await db.delete(queryRuns).where(and(eq(queryRuns.id, body.id), eq(queryRuns.tenantId, tenantUuid(session.user.id)))).returning({ id: queryRuns.id })
  if (!deleted.length) return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  return Response.json({ ok: true, id: deleted[0].id })
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ error: 'Please sign in.' }, { status: 401 })
  const runs = await db.select({ id: queryRuns.id, question: queryRuns.question, answer: queryRuns.answer, confidence: queryRuns.confidence, status: queryRuns.status, evidence: queryRuns.evidence, trace: queryRuns.trace, createdAt: queryRuns.createdAt }).from(queryRuns).where(and(eq(queryRuns.tenantId, tenantUuid(session.user.id)), eq(queryRuns.actorId, session.user.id))).orderBy(desc(queryRuns.createdAt)).limit(50)
  return Response.json({ runs: runs.map((run) => ({ ...run, confidence: run.confidence === null ? 0 : Number(run.confidence), decision: run.status === 'needs_review' ? 'review' : 'answer', evidenceStatus: Array.isArray(run.evidence) && run.evidence.length ? 'grounded' : 'insufficient', created: run.createdAt.toLocaleString() })) })
}
