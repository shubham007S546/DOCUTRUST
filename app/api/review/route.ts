import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { queryRuns, reviews } from '@/lib/db/schema'

export const runtime = 'nodejs'

function tenantUuid(userId: string) {
  const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ reviews: [] }, { status: 401 })
  const tenantId = tenantUuid(session.user.id)
  const rows = await db.select({ run: queryRuns, review: reviews }).from(queryRuns).leftJoin(reviews, and(eq(reviews.queryRunId, queryRuns.id), eq(reviews.tenantId, tenantId))).where(and(eq(queryRuns.tenantId, tenantId), eq(queryRuns.status, 'needs_review'))).orderBy(desc(queryRuns.createdAt))
  return Response.json({ reviews: rows.map(({ run, review }) => ({ id: run.id, title: run.question, question: run.question, answer: run.answer, confidence: Number(run.confidence ?? 0), created: run.createdAt, status: review?.decision === 'approved' ? 'Approved' : review?.decision === 'rejected' ? 'Rejected' : 'Open' })) })
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ error: 'Please sign in.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (!body.run_id || !['approved', 'rejected'].includes(body.decision)) return Response.json({ error: 'A run_id and valid decision are required.' }, { status: 400 })
  const tenantId = tenantUuid(session.user.id)
  const run = await db.select({ id: queryRuns.id }).from(queryRuns).where(and(eq(queryRuns.id, body.run_id), eq(queryRuns.tenantId, tenantId))).limit(1)
  if (!run.length) return Response.json({ error: 'Review item not found.' }, { status: 404 })
  const existing = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.queryRunId, body.run_id), eq(reviews.tenantId, tenantId))).limit(1)
  if (existing.length) {
    await db.update(reviews).set({ reviewerId: session.user.id, decision: body.decision, notes: typeof body.note === 'string' ? body.note : null, createdAt: new Date() }).where(and(eq(reviews.id, existing[0].id), eq(reviews.tenantId, tenantId)))
  } else {
    await db.insert(reviews).values({ id: randomUUID(), tenantId, queryRunId: body.run_id, reviewerId: session.user.id, decision: body.decision, notes: typeof body.note === 'string' ? body.note : null })
  }
  return Response.json({ ok: true })
}
