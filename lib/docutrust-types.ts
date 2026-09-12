export type WorkspaceView = 'overview' | 'report' | 'library' | 'review' | 'evaluations' | 'settings'
export type DocumentStatus = 'Active' | 'Review' | 'Processing'
export type ReviewStatus = 'Open' | 'Approved' | 'Rejected'

export interface PolicyDocument { id: string; name: string; version: string; type: string; status: DocumentStatus; updated: string; pages: number; owner: string; effectiveDate: string; chunks: number }
export interface Evidence { id: string; document: string; section: string; page: number; excerpt: string; source: 'Internal' | 'External'; score: number }
export interface AgentEvent { name: string; detail: string; time: string; status: 'done' | 'active' | 'pending' | 'retry' }
export interface ReviewItem { id: string; title: string; kind: 'Low confidence' | 'Policy conflict'; confidence: number; owner: string; created: string; status: ReviewStatus }
export interface Evaluation { name: string; cases: number; accuracy: number; grounding: number; citations: number; status: 'Passed' | 'Running' | 'Needs review' }
export interface QueryResponse { answer: string; confidence: number; evidence: Evidence[]; events: AgentEvent[]; verification: string[]; needsReview: boolean }
export interface WorkflowState { query: string; route: string; evidence: Evidence[]; retries: number; conflicts: string[]; verified: boolean; confidence: { retrieval: number; reasoning: number; citation: number } }
