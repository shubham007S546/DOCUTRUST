from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal

AgentKind = Literal["policy", "privacy", "security", "legal", "conflict", "verification", "report", "synthesis"]
ActionKind = Literal["retrieve_more_evidence", "ask_specialist", "verify_claims", "resolve_conflict", "finish", "request_human_review"]

@dataclass(frozen=True)
class Evidence:
    document_id: str
    version: str
    section: str
    quote: str
    start: int
    end: int
    score: float
    retrieval_method: str = "lexical"

@dataclass(frozen=True)
class PlanTask:
    task: str
    agent: AgentKind
    priority: int

@dataclass
class AgentPlan:
    goal: str
    subtasks: list[PlanTask]
    selected_tools: list[str]
    execution_order: list[str]
    success_criteria: list[str]
    max_iterations: int = 3
    current_step: int = 0
    status: Literal["planned", "executing", "completed", "needs_review"] = "planned"

@dataclass
class ReflectionResult:
    answer_complete: bool
    evidence_sufficient: bool
    unsupported_claims: list[str]
    conflicts: list[str]
    next_action: ActionKind
    confidence: float
    rationale: str

@dataclass
class ToolCall:
    name: str
    arguments: dict
    result_summary: str
    iteration: int

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
    goal: str = ""
    plan: AgentPlan | None = None
    agents: list[AgentResult] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    tool_calls: list[ToolCall] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    reflections: list[ReflectionResult] = field(default_factory=list)
    completed_tasks: list[str] = field(default_factory=list)
    pending_tasks: list[str] = field(default_factory=list)
    requires_review: bool = False
    final_answer: str | None = None
    overall_confidence: float = 0.0
    evidence_state: dict = field(default_factory=dict)

    def snapshot(self) -> dict:
        return asdict(self)

    def emit(self, event_type: str, **payload: object) -> None:
        self.events.append({"type": event_type, **payload})

    def add_tool_call(self, name: str, arguments: dict, result_summary: str, iteration: int) -> None:
        self.tool_calls.append(ToolCall(name, arguments, result_summary, iteration))
        self.emit("tool_completed", tool=name, arguments=arguments, result_summary=result_summary, iteration=iteration)

    def add_reflection(self, reflection: ReflectionResult) -> None:
        self.reflections.append(reflection)
        self.emit("reflection", **asdict(reflection))


def plan_to_dict(plan: AgentPlan | None) -> dict | None:
    return asdict(plan) if plan else None

def result_to_dict(result: AgentResult) -> dict:
    return asdict(result)

def reflection_to_dict(result: ReflectionResult | None) -> dict | None:
    return asdict(result) if result else None

MAX_ITERATIONS = 3
MAX_TOOL_CALLS = 8
MAX_TOKEN_BUDGET = 12000
SAFE_TOOLS = {"search_documents", "retrieve_document_sections", "inspect_document_metadata", "verify_claim_against_evidence", "detect_conflicts", "calculate_confidence", "request_human_review", "generate_report"}
