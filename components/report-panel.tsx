'use client'

import { Check, LoaderCircle, XCircle } from 'lucide-react'

type AgentReport = { agent: string; status: string; answer: string; model?: string; latency_ms?: number }

export function ReportPanel({ reports }: { reports: AgentReport[] }) {
  return <section className="rounded-xl border bg-card">
    <div className="border-b p-4"><h2 className="font-semibold">Agent report</h2><p className="mt-1 text-xs text-muted-foreground">What each agent contributed to the final answer.</p></div>
    <div className="divide-y">{reports.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Run an analysis to inspect the agent findings and final report.</p> : reports.map((report) => <article key={report.agent} className="p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold">{report.status === 'completed' ? <Check className="text-teal-700" /> : <XCircle className="text-destructive" />}{report.agent}</div><span className="font-mono text-[10px] text-muted-foreground">{report.model ?? 'provider unavailable'}{report.latency_ms ? ` · ${(report.latency_ms / 1000).toFixed(1)}s` : ''}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{report.answer}</p></article>)}</div>
  </section>
}
