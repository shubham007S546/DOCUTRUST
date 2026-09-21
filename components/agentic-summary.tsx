'use client'

import { Check, Circle, LoaderCircle } from 'lucide-react'

type Plan = { subtasks?: { task: string; agent: string; priority: number }[]; max_iterations?: number }
type Reflection = { next_action: string; rationale: string; confidence: number }

export function AgenticSummary({ plan, reflection, running }: { plan: Plan | null; reflection: Reflection | null; running: boolean }) {
  if (!plan && !running) return null
  return <section className="mb-5 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-card p-5 dark:border-violet-900/60 dark:from-violet-950/30">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-700 dark:text-violet-300">Agentic analysis</p><h2 className="mt-2 text-lg font-semibold">Goal → plan → act → reflect</h2><p className="mt-1 text-sm text-muted-foreground">The supervisor selects only the specialists and tools required for this question.</p></div><span className="rounded-full bg-violet-700 px-3 py-1 text-xs font-semibold text-white">{running ? 'Running' : `Iteration limit ${plan?.max_iterations ?? 3}`}</span></div>
    {plan?.subtasks?.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{plan.subtasks.map((task) => <div key={`${task.priority}-${task.agent}`} className="flex items-center gap-3 rounded-lg border bg-card/70 p-3"><span className="flex size-6 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">{running && task.priority === 1 ? <LoaderCircle className="size-3.5 animate-spin" /> : task.priority < 3 ? <Check className="size-3.5" /> : <Circle className="size-2.5" />}</span><span className="min-w-0"><strong className="block text-xs capitalize">{task.agent} agent</strong><span className="block truncate text-[11px] text-muted-foreground">{task.task}</span></span></div>)}</div> : null}
    {reflection && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-card/70 p-3 text-xs dark:border-violet-900"><span><strong className="capitalize">Next action:</strong> {reflection.next_action.replaceAll('_', ' ')}</span><span className="text-muted-foreground">Reflection confidence {(reflection.confidence * 100).toFixed(0)}%</span><span className="w-full text-muted-foreground">{reflection.rationale}</span></div>}
  </section>
}
