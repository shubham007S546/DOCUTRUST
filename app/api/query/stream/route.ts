import { createHash, createHmac } from 'node:crypto'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'

function tenantUuid(userId: string) {
  const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ error: 'Please sign in before asking a policy question.' }, { status: 401 })

  const backendUrl = process.env.BACKEND_API_URL ?? 'http://localhost:8000'
  const body = await request.text()
  const payload = Buffer.from(JSON.stringify({ sub: session.user.id, tenant: tenantUuid(session.user.id), role: 'reviewer', iat: Math.floor(Date.now() / 1000), jti: crypto.randomUUID() })).toString('base64url')
  const assertion = `${payload}.${createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? '').update(payload).digest('base64url')}`
  const response = await fetch(`${backendUrl}/api/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Docutrust-Mode': 'private',
      'X-Internal-Assertion': assertion,
    },
    body,
    cache: 'no-store',
  }).catch(() => null)

  if (!response) {
    const input = JSON.parse(body) as { query?: string }
    const question = input.query?.trim() || 'your question'
    const fallback = [
      `data: ${JSON.stringify({ type: 'stage', stage: 'fallback', status: 'completed', detail: 'Answered safely by the workspace fallback.' })}`,
      `data: ${JSON.stringify({ type: 'run_result', run_id: crypto.randomUUID(), status: 'completed', answer: `The policy assistant could not reach the analysis worker. Please upload or re-index a policy before asking about ${question}.`, confidence: 0, requires_review: false, evidence_state: { status: 'insufficient', decision: 'abstain', coverage: 0, consistency: 0, citation_completeness: 0, rationale: 'The analysis worker is unavailable, so no unsupported answer was generated.', receipts: [] }, agents: [], plan: null, reflection: { next_action: 'start analysis worker', rationale: 'No worker response was available.', confidence: 0 } })}`,
      'data: [DONE]',
      '',
    ].join('\\n\\n')
    return new Response(fallback, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' } })
  }
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
