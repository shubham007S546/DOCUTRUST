# DocuTrust

DocuTrust is an evidence-grounded, agentic multi-agent RAG system for document verification and compliance analysis.

## Architecture

```text
User goal
  -> Supervisor planner
  -> validated AgentPlan
  -> allowlisted tools + selected specialists
  -> observe evidence and findings
  -> reflection
      -> retrieve more / resolve conflict / human review
      -> or verify and synthesize
  -> final answer with evidence receipts
```

Unlike a fixed pipeline, the supervisor routes by intent. Privacy questions select privacy analysis; access-control questions select security analysis; version/conflict questions select conflict analysis plus verification. Every run has bounded iterations and tool calls.

## Implemented agentic capabilities

- Structured `AgentPlan`, `RunState`, `ReflectionResult`, and `ToolCall` contracts.
- Dynamic routing for policy, privacy, security, legal, conflict, verification, and report work.
- Allowlisted tool names only; no shell, URL, or arbitrary code execution.
- PLAN → ACT → OBSERVE → REFLECT → REPLAN/ACT → VERIFY → FINISH loop.
- Tenant-scoped evidence remains the only approved source for claims.
- Heuristic confidence uses relevance, coverage, agreement, and conflict penalties; it is not statistically calibrated.
- Human review is requested for insufficient evidence, low confidence, failed agents, or unresolved conflicts.
- SSE events expose planning, tool calls, agents, reflection, and completion.
- Frontend displays the selected plan and reflection state.

## API

The FastAPI backend exposes `POST /api/query` and `POST /api/query/stream`. Responses include `run_id`, `goal`, `plan`, `actions`, `tools`, `evidence`, `reflection`, `agents`, `confidence`, `requires_review`, and `events`.

## Security and limitations

Documents are untrusted input and are supplied as evidence, never instructions. Authentication, tenant scoping, role checks, upload validation, bounded execution, and allowlisted tools are preserved. Retrieval is currently tenant-scoped lexical/hybrid retrieval; no vector database or external web search is claimed. Persistent run storage depends on the configured repository. Prompt-injection adversarial coverage and production rate limiting remain deployment requirements.

## Run

Frontend: `pnpm dev`  
Backend: `uvicorn backend.main:app --reload --port 8000`  
Backend tests: `python -m pytest backend/tests -q`

## Why this qualifies

It is more than a chatbot because answers are grounded in uploaded evidence. It is more than a fixed multi-agent workflow because a supervisor creates a validated plan, routes only relevant specialists, selects safe tools, evaluates observations, reflects on sufficiency, and can act again or request human review. It is therefore an agentic multi-agent RAG system, within the limitations stated above.
