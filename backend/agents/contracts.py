from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

AgentKind = Literal["policy", "privacy", "security", "legal", "conflict", "verification", "report", "synthesis"]

@dataclass(frozen=True)
class Evidence:
    document_id: str
    version: str
    section: str
    quote: str
    start: int
    end: int
    score: float

@dataclass
class AgentResult:
    agent: AgentKind
    status: Literal["completed", "failed", "skipped"]
    answer: str
    confidence: float
    evidence: list[Evidence] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
    model: str | None = None
    latency_ms: int = 0

@dataclass
class RunState:
    run_id: str
    tenant_id: str
    query: str
    mode: Literal["private", "public_demo"]
    agents: list[AgentResult] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    requires_review: bool = False
    final_answer: str | None = None
    overall_confidence: float = 0.0
    evidence_state: dict = field(default_factory=dict)
