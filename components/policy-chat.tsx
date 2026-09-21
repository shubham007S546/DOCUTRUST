'use client'

import { FormEvent, useEffect, useState } from 'react'
import { ArrowUp, Bot, FileText, LoaderCircle, User } from 'lucide-react'

type Citation = { document_id: string; section: string; quote: string; version: string; score: number }
export type Message = { role: 'user' | 'assistant'; content: string; citations?: Citation[]; confidence?: number }

function cleanAnswer(value: string) {
  return value.replace(/<br\s*\/?>/gi, '\n').replace(/\[[^\]]*†[^\]]*\]/g, '').replace(/【[^】]*】/g, '').replace(/\[(?:\d+(?:\s*,\s*)?)+\]/g, '').replace(/\*{1,3}/g, '').replace(/\|\s*/g, '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim()
}

function cleanCitation(value: string) {
  return cleanAnswer(value).replace(/�+/g, '').replace(/ÃƒÂ|Ã‚/g, '').trim()
}

export function PolicyChat({ initialQuery, initialMessages = [], onRun }: { initialQuery: string; initialMessages?: Message[]; onRun: (query: string) => Promise<{ answer: string; confidence: number; citations: Citation[] }> }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  useEffect(() => { setMessages(initialMessages) }, [initialMessages])
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!value.trim() || loading) return
    const question = value.trim()
    setMessages((items) => [...items, { role: 'user', content: question }])
    setValue(''); setLoading(true)
    try {
      const result = await onRun(question)
      setMessages((items) => [...items, { role: 'assistant', content: result.answer, confidence: result.confidence, citations: result.citations }])
    } catch (error) {
      setMessages((items) => [...items, { role: 'assistant', content: error instanceof Error ? error.message : 'The analysis could not be completed.' }])
    } finally { setLoading(false) }
  }

  return <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex items-center gap-3 border-b px-5 py-4"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></span><div><h2 className="font-semibold">Policy assistant</h2><p className="text-sm text-muted-foreground">Ask follow-up questions about your uploaded policies.</p></div></div>
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">{messages.length === 0 && <div className="m-auto max-w-md text-center"><Bot className="mx-auto mb-3 size-10 text-primary" /><h3 className="text-lg font-semibold">What would you like to understand?</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Ask about retention, access, exceptions, responsibilities, or the evidence behind a policy answer.</p></div>}{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{message.role === 'assistant' && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Evidence-backed answer</p>}<p className="whitespace-pre-wrap">{cleanAnswer(message.content)}</p>{message.confidence !== undefined && <p className="mt-3 text-xs text-muted-foreground">Confidence: {Math.round(message.confidence * 100)}%</p>}{message.citations?.length ? <details className="mt-4 border-t pt-3"><summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">View supporting sources ({message.citations.length})</summary><div className="mt-3 space-y-2">{message.citations.map((citation, citationIndex) => <div key={`${citation.document_id}-${citationIndex}`} className="rounded-lg border bg-background p-3 text-xs"><div className="flex items-center gap-2 font-semibold"><FileText className="size-3.5 text-primary" />Source {citationIndex + 1} · {cleanCitation(citation.section)}</div><p className="mt-1 text-muted-foreground">“{cleanCitation(citation.quote)}”</p></div>)}</div></details> : null}</div></div>)}</div>
    <form onSubmit={submit} className="border-t p-4"><div className="flex items-end gap-3 rounded-2xl border bg-background p-2"><textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="Ask a question about your policies…" rows={2} className="min-h-12 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none" aria-label="Policy question" /><button type="submit" disabled={loading || !value.trim()} className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50" aria-label="Send question">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</button></div><p className="mt-2 px-2 text-xs text-muted-foreground">Answers are limited to indexed policy evidence. Press Enter to send, Shift+Enter for a new line.</p></form>
  </section>
}
