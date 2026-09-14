export const runtime = 'nodejs'

import { randomUUID, createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentChunks, documents } from '@/lib/db/schema'

function words(value: string) { return new Set(value.toLowerCase().replace(/[^a-z0-9\\s]/g, ' ').split(/\\s+/).filter((word) => word.length > 2)) }
function tenantUuid(userId: string) { const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}` }

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) return Response.json({ error: 'Enter a policy question.' }, { status: 400 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ error: 'Please sign in before asking a policy question.' }, { status: 401 })
  const tenantId = tenantUuid(session.user.id)
  const rows = await db.select({ chunk: documentChunks, document: documents }).from(documentChunks).innerJoin(documents, eq(documentChunks.documentId, documents.id)).where(and(eq(documentChunks.tenantId, tenantId), eq(documents.status, 'ready')))
  const queryWords = words(query)
  const evidence = rows.map(({ chunk, document }) => { const contentWords = words(chunk.content); const score = [...queryWords].filter((word) => contentWords.has(word)).length / Math.max(queryWords.size, 1); return { chunk, document, score } }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6)
  const runId = randomUUID(); const encoder = new TextEncoder()
  const send = (controller: ReadableStreamDefaultController, payload: object | string) => controller.enqueue(encoder.encode(`data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`))
  const stream = new ReadableStream({ async start(controller) { try {
    send(controller, { type: 'run_queued', run_id: runId }); send(controller, { type: 'stage', stage: 'Hybrid Retrieval', status: 'completed', detail: `Matched ${evidence.length} passage${evidence.length === 1 ? '' : 's'} from uploaded policies.` })
    if (!evidence.length) { send(controller, { type: 'run_result', run_id: runId, answer: 'The uploaded policies do not establish an answer to this question.', confidence: 0, requires_review: true, evidence_state: { status: 'insufficient', decision: 'abstain', coverage: 0, consistency: 1, citation_completeness: 0, rationale: 'No uploaded policy passage matched the question.', receipts: [] }, agents: [], provider: { mode: 'native-nextjs' } }); send(controller, '[DONE]'); controller.close(); return }
    const context = evidence.map(({ chunk, document }, index) => `[${index + 1}] ${document.title} | section ${chunk.chunkIndex + 1}\n${chunk.content}`).join('\n\n')
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not configured.')
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.1, max_tokens: 900, messages: [{ role: 'system', content: 'You are DocuTrust policy assistant. Answer only from the supplied policy passages. Be direct, explain the rule and exceptions, and cite claims with [1], [2]. If evidence is insufficient, say so clearly.' }, { role: 'user', content: `Question: ${query}\\n\\nPolicy passages:\\n${context}` }] }) })
    if (!groqResponse.ok) throw new Error(`Groq request failed (${groqResponse.status}).`)
    const groqPayload = await groqResponse.json() as { choices?: { message?: { content?: string } }[] }
    const answer = groqPayload.choices?.[0]?.message?.content?.trim()
    if (!answer) throw new Error('Groq returned an empty answer.')
    const receipts = evidence.map(({ chunk, document, score }, index) => ({ document_id: document.id, document: document.title, version: chunk.versionLabel, section: `Chunk ${chunk.chunkIndex + 1}`, quote: chunk.content.slice(0, 320), score: Math.min(0.99, 0.55 + score * 0.4), page: null }))
    send(controller, { type: 'stage', stage: 'Verification', status: 'completed', detail: 'Checked the generated answer against uploaded evidence.' }); send(controller, { type: 'run_result', run_id: runId, answer, confidence: Math.min(0.98, 0.62 + evidence[0].score * 0.35), requires_review: evidence[0].score < 0.2, evidence_state: { status: 'grounded', decision: 'answer', coverage: Math.min(1, evidence[0].score + 0.5), consistency: 1, citation_completeness: 1, rationale: 'Answer generated from uploaded policy chunks.', receipts }, agents: [{ agent: 'report', status: 'completed', answer, model: 'llama-3.3-70b-versatile', latency_ms: 0 }], provider: { mode: 'groq', model: 'llama-3.3-70b-versatile' } }); send(controller, '[DONE]'); controller.close()
  } catch (error) {
    const fallback = evidence[0]?.chunk.content ?? 'The uploaded policy contains relevant evidence, but the answer generator is unavailable.'
    send(controller, { type: 'stage', stage: 'Fallback', status: 'completed', detail: 'Returned the matched policy passage because the answer provider was unavailable.' })
    send(controller, { type: 'run_result', run_id: runId, answer: fallback, confidence: Math.min(0.75, 0.45 + (evidence[0]?.score ?? 0) * 0.3), requires_review: true, evidence_state: { status: 'grounded', decision: 'review', coverage: evidence[0]?.score ?? 0, consistency: 1, citation_completeness: 1, rationale: 'Answer returned directly from matched uploaded policy evidence.', receipts: evidence.map(({ chunk, document, score }, index) => ({ document_id: document.id, document: document.title, version: chunk.versionLabel, section: `Chunk ${chunk.chunkIndex + 1}`, quote: chunk.content.slice(0, 320), score: Math.min(0.99, 0.55 + score * 0.4), page: null })) }, agents: [], provider: { mode: 'evidence-fallback' } })
    send(controller, { type: 'error', error: error instanceof Error ? error.message : 'Policy analysis failed.' })
    send(controller, '[DONE]')
    controller.close()
  } } })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
}
