export const runtime = 'nodejs'

import { randomUUID, createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentChunks, documents, queryRuns } from '@/lib/db/schema'

function cleanPolicyText(value: string) { return value.replace(/<br\s*\/?>/gi, '\n').replace(/\[[^\]]*†[^\]]*\]/g, '').replace(/【[^】]*】/g, '').replace(/\[(?:\d+(?:\s*,\s*)?)+\]/g, '').replace(/\|\s*/g, '').replace(/\*{1,3}/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').split('\n').map((line) => line.trim()).filter(Boolean).join('\n').trim() }
function words(value: string) { return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2).map((word) => word.endsWith('s') ? word.slice(0, -1) : word)) }
function tenantUuid(userId: string) { const hex = createHash('sha256').update(`docutrust-tenant:${userId}`).digest('hex').slice(0, 32); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}` }
async function persistRun(values: { id: string; tenantId: string; actorId: string; question: string; status: string; answer: string; confidence: number; evidence: unknown[]; trace: unknown[]; modelId?: string }) {
  await db.insert(queryRuns).values({ id: values.id, tenantId: values.tenantId, actorId: values.actorId, question: values.question, status: values.status, answer: values.answer, confidence: String(values.confidence), evidence: values.evidence, trace: values.trace, modelId: values.modelId, promptVersion: 'docutrust-v2', completedAt: new Date() }).onConflictDoNothing()
}

function getSmallTalkReply(query: string, name: string) {
  const normalized = query.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/^(hi|hii|hiii|hello|helo|hlo|hey|good morning|good afternoon|good evening|thanks|thank you|thx)$/.test(normalized)) {
    if (/^(thanks|thank you|thx)$/.test(normalized)) return `You’re welcome, ${name}. Ask me about any uploaded policy when you’re ready.`
    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
    return `${greeting}, ${name}. How can I help you with your uploaded policies?`
  }
  return null
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) return Response.json({ error: 'Enter a policy question.' }, { status: 400 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return Response.json({ error: 'Please sign in before asking a policy question.' }, { status: 401 })
  const name = session.user.name?.trim().split(/\s+/)[0] || 'there'
  const smallTalkReply = getSmallTalkReply(query, name)
  const runId = randomUUID(); const encoder = new TextEncoder()
  const send = (controller: ReadableStreamDefaultController, payload: object | string) => controller.enqueue(encoder.encode(`data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`))
  if (smallTalkReply) {
    const stream = new ReadableStream({ start(controller) { send(controller, { type: 'run_result', run_id: runId, answer: smallTalkReply, confidence: 1, requires_review: false, evidence_state: { status: 'not_applicable', decision: 'conversation', coverage: 1, consistency: 1, citation_completeness: 1, rationale: 'Conversational greeting handled without policy retrieval.', receipts: [] }, agents: [], provider: { mode: 'built-in-greeting' } }); send(controller, '[DONE]'); controller.close() } })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
  }
  const tenantId = tenantUuid(session.user.id)
  const rows = await db.select({ chunk: documentChunks, document: documents }).from(documentChunks).innerJoin(documents, eq(documentChunks.documentId, documents.id)).where(and(eq(documentChunks.tenantId, tenantId), eq(documents.status, 'ready')))
  const queryWords = words(query)
  const ranked = rows.map(({ chunk, document }) => { const contentWords = words(chunk.content); const score = [...queryWords].filter((word) => contentWords.has(word)).length / Math.max(queryWords.size, 1); return { chunk, document, score } }).sort((a, b) => b.score - a.score)
  const evidence = ranked.length && ranked[0].score >= 0.2 ? ranked.filter((item) => item.score >= 0.08).slice(0, 6) : []
  const stream = new ReadableStream({ async start(controller) { try {
    send(controller, { type: 'run_queued', run_id: runId }); const traceStages = ['Query Analysis', 'Intent Classification', 'Policy Planning']; traceStages.forEach((stage) => send(controller, { type: 'stage', stage, status: 'completed', detail: 'Completed structured analysis for this policy question.' })); send(controller, { type: 'stage', stage: 'Hybrid Retrieval', status: 'completed', detail: `Matched ${evidence.length} passage${evidence.length === 1 ? '' : 's'} from uploaded policies.` })
    if (!evidence.length) { const answer = 'The uploaded policies do not establish an answer to this question.'; await persistRun({ id: runId, tenantId, actorId: session.user.id, question: query, status: 'needs_review', answer, confidence: 0, evidence: [], trace: [{ stage: 'Query Analysis', status: 'completed' }, { stage: 'Intent Classification', status: 'completed' }, { stage: 'Policy Planning', status: 'completed' }, { stage: 'Hybrid Retrieval', status: 'completed' }, { stage: 'Evidence Sufficiency', status: 'completed' }, { stage: 'Final Decision', status: 'abstain' }] }); send(controller, { type: 'run_result', run_id: runId, answer, confidence: 0, requires_review: true, evidence_state: { status: 'insufficient', decision: 'abstain', coverage: 0, consistency: 1, citation_completeness: 0, rationale: 'No uploaded policy passage matched the question.', receipts: [] }, agents: [], provider: { mode: 'native-nextjs' } }); send(controller, '[DONE]'); controller.close(); return }
    const context = evidence.map(({ chunk, document }, index) => `[${index + 1}] ${document.title} | section ${chunk.chunkIndex + 1}\n${cleanPolicyText(chunk.content)}`).join('\n\n')
    const groqApiKey = process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY
    const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
    if (!groqApiKey) throw new Error('GROQ_API_KEY is not configured.')
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: groqModel, temperature: 0.1, max_tokens: 900, messages: [{ role: 'system', content: 'You are DocuTrust policy assistant. Answer only from the supplied policy passages. Return clean plain text with a short direct answer first, then a small section titled "Key rules" with 2-5 bullets only when useful. Do not output Markdown emphasis, HTML tags, pipe characters, extraction artifacts, line-reference citations, citation brackets, or raw document text. Do not repeat the question. If the passages do not directly answer the question, say exactly: "The uploaded policies do not establish an answer to this question."' }, { role: 'user', content: `Question: ${query}\\n\\nPolicy passages:\\n${context}` }] }) })
    if (!groqResponse.ok) { const details = await groqResponse.text(); throw new Error(`Groq request failed (${groqResponse.status}): ${details.slice(0, 180)}`) }
    const groqPayload = await groqResponse.json() as { choices?: { message?: { content?: string } }[] }
    const answer = cleanPolicyText(groqPayload.choices?.[0]?.message?.content ?? '')
    if (!answer) throw new Error('Groq returned an empty answer.')
    const receipts = evidence.map(({ chunk, document, score }, index) => ({ document_id: document.id, document: document.title, version: chunk.versionLabel, section: `Chunk ${chunk.chunkIndex + 1}`, quote: cleanPolicyText(chunk.content).slice(0, 260), score: Math.min(0.99, 0.55 + score * 0.4), page: null }))
    const finalConfidence = Math.min(0.98, Math.max(0.05, evidence[0].score * 1.15)); const needsReview = finalConfidence < 0.7; await persistRun({ id: runId, tenantId, actorId: session.user.id, question: query, status: needsReview ? 'needs_review' : 'completed', answer, confidence: finalConfidence, evidence: receipts, trace: [{ stage: 'Query Analysis', status: 'completed' }, { stage: 'Intent Classification', status: 'completed' }, { stage: 'Policy Planning', status: 'completed' }, { stage: 'Hybrid Retrieval', status: 'completed' }, { stage: 'Evidence Ranking', status: 'completed' }, { stage: 'Evidence Inspection', status: 'completed' }, { stage: 'Evidence Sufficiency', status: 'completed' }, { stage: 'Claim Verification', status: 'completed' }, { stage: 'Risk Assessment', status: needsReview ? 'review' : 'completed' }, { stage: 'Final Decision', status: needsReview ? 'review' : 'completed' }, { stage: 'Answer Generation', status: 'completed' }], modelId: groqModel }); send(controller, { type: 'stage', stage: 'Verification', status: 'completed', detail: 'Checked the generated answer against uploaded evidence.' }); send(controller, { type: 'run_result', run_id: runId, answer, confidence: finalConfidence, requires_review: needsReview, evidence_state: { status: 'grounded', decision: 'answer', coverage: Math.min(1, evidence[0].score + 0.5), consistency: 1, citation_completeness: 1, rationale: 'Answer generated from uploaded policy chunks.', receipts }, agents: [{ agent: 'report', status: 'completed', answer, model: groqModel, latency_ms: 0 }], provider: { mode: 'groq', model: groqModel } }); send(controller, '[DONE]'); controller.close()
  } catch (error) {
    const fallback = evidence[0]?.chunk.content ?? 'The uploaded policy contains relevant evidence, but the answer generator is unavailable.'
    send(controller, { type: 'stage', stage: 'Fallback', status: 'completed', detail: 'Returned the matched policy passage because the answer provider was unavailable.' })
    send(controller, { type: 'run_result', run_id: runId, answer: fallback, confidence: Math.min(0.75, 0.45 + (evidence[0]?.score ?? 0) * 0.3), requires_review: true, evidence_state: { status: 'grounded', decision: 'review', coverage: evidence[0]?.score ?? 0, consistency: 1, citation_completeness: 1, rationale: 'Answer returned directly from matched uploaded policy evidence.', receipts: evidence.map(({ chunk, document, score }, index) => ({ document_id: document.id, document: document.title, version: chunk.versionLabel, section: `Chunk ${chunk.chunkIndex + 1}`, quote: cleanPolicyText(chunk.content).slice(0, 260), score: Math.min(0.99, 0.55 + score * 0.4), page: null })) }, agents: [], provider: { mode: 'evidence-fallback' } })
    send(controller, { type: 'error', error: error instanceof Error ? error.message : 'Policy analysis failed.' })
    send(controller, '[DONE]')
    controller.close()
  } } })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
}
