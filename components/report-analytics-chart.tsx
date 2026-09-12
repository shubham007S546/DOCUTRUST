'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

type Report = { agent: string; status: string; answer: string; model?: string; latency_ms?: number }
type EvidenceState = { coverage: number; consistency: number; citation_completeness: number } | null

export function ReportAnalyticsChart({ reports, evidenceState }: { reports: Report[]; evidenceState: EvidenceState }) {
  const agentData = reports.map((report) => ({
    agent: report.agent.replace(/_/g, ' '),
    completion: report.status === 'completed' ? 100 : 35,
    latency: Math.max(1, Math.round((report.latency_ms ?? 0) / 100)),
  }))
  const evidenceData = evidenceState ? [
    { metric: 'Coverage', score: Math.round(evidenceState.coverage * 100) },
    { metric: 'Consistency', score: Math.round(evidenceState.consistency * 100) },
    { metric: 'Citations', score: Math.round(evidenceState.citation_completeness * 100) },
  ] : []
  const config = { completion: { label: 'Completed', color: 'var(--chart-1)' }, score: { label: 'Score', color: 'var(--chart-2)' } }
  return <div className="grid gap-4 xl:grid-cols-2">
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4"><h3 className="font-semibold">Agent execution health</h3><p className="mt-1 text-sm text-muted-foreground">Completion status for every specialist in this run.</p></div>
      {agentData.length ? <ChartContainer config={config} className="h-64 w-full"><BarChart accessibilityLayer data={agentData} margin={{ left: -14, right: 10 }}><CartesianGrid vertical={false} /><XAxis dataKey="agent" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => value.slice(0, 12)} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="completion" fill="var(--color-completion)" radius={4} /></BarChart></ChartContainer> : <p className="text-sm text-muted-foreground">Run an analysis to generate execution metrics.</p>}
    </section>
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-4"><h3 className="font-semibold">Evidence quality</h3><p className="mt-1 text-sm text-muted-foreground">How strongly the final answer is supported by indexed policy text.</p></div>
      {evidenceData.length ? <ChartContainer config={config} className="h-64 w-full"><BarChart accessibilityLayer data={evidenceData} margin={{ left: -14, right: 10 }}><CartesianGrid vertical={false} /><XAxis dataKey="metric" tickLine={false} axisLine={false} tickMargin={8} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="score" fill="var(--color-score)" radius={4} /></BarChart></ChartContainer> : <p className="text-sm text-muted-foreground">Evidence metrics appear after verification.</p>}
    </section>
  </div>
}
