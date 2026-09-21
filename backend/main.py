from __future__ import annotations

import asyncio
import json
import time
import uuid
from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from backend.config import settings
from backend.agents.contracts import Evidence, plan_to_dict, result_to_dict, reflection_to_dict
from backend.graph.workflow import run_policy_graph
from backend.repositories.store import store
from backend.security.tenant import RequestContext, request_context, require_role
from backend.providers.fallback import provider_status
from backend.ingestion import IngestionError, prepare_text_document
from backend.retrieval import HybridRetriever
from backend.api_config import api_status

class QueryIn(BaseModel):
    query: str = Field(min_length=3, max_length=settings.max_query_chars)

class ReviewIn(BaseModel):
    run_id: str = Field(min_length=1, max_length=128)
    decision: str = Field(pattern="^(approved|rejected|amended)$")
    note: str = Field(default="", max_length=2000)

app = FastAPI(title=settings.app_name, version="3.1.0")

@app.on_event("startup")
async def initialize_storage() -> None:
    if settings.storage_mode == "postgres" and hasattr(store, "connect"):
        await store.connect()
        return

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Tenant-Id", "X-User-Id", "X-Docutrust-Mode", "X-Role"])

@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response

@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "service": "docutrust-api", "version": "3.0.0", "timestamp": int(time.time())}

@app.get("/ready")
def readiness() -> dict[str, object]:
    checks = {
        "api": "ok",
        "ai_provider": "configured" if (settings.ai_gateway_api_key or settings.groq_api_key or settings.gemini_api_key) else "not_configured",
        "persistence": "configured" if settings.database_url and settings.storage_mode == "postgres" else "not_configured",
    }
    return {"status": "ready" if all(value in {"ok", "configured"} for value in checks.values()) else "degraded", "checks": checks}

@app.get("/api/config/status")
def config_status() -> dict[str, object]:
    return {**settings.public_status(), "api_requirements": api_status()}

@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...), context: RequestContext = Depends(request_context)) -> dict[str, object]:
    content = await file.read()
    try:
        document = prepare_text_document(file.filename or "upload", file.content_type or "application/octet-stream", content)
        if not hasattr(store, "ingest_document"):
            raise HTTPException(status_code=503, detail="Durable document storage is not configured")
        return await store.ingest_document(context.tenant_id, file.filename or "upload", file.content_type or "application/octet-stream", document)
    except IngestionError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

@app.get("/api/documents")
async def list_documents(context: RequestContext = Depends(request_context)) -> dict[str, object]:
    return {"items": await store.list(context.tenant_id, "documents"), "tenant_id": context.tenant_id, "mode": context.mode}

@app.post("/api/query")
async def query(request: QueryIn, context: RequestContext = Depends(request_context)) -> dict[str, object]:
    evidence = []
    if getattr(store, "pool", None):
        hits = await HybridRetriever(store.pool).search(context.tenant_id, request.query.strip())
        evidence = [Evidence(hit.document_id.encode('utf-8', 'replace').decode('utf-8'), hit.version, hit.section.encode('utf-8', 'replace').decode('utf-8'), hit.quote.encode('utf-8', 'replace').decode('utf-8'), hit.start, hit.end, hit.lexical_score) for hit in hits]
    state = await run_policy_graph(request.query.strip(), context.tenant_id, context.mode, evidence)
    await store.append(context.tenant_id, "runs", {"id": state.run_id, "query": state.query, "confidence": state.overall_confidence, "requires_review": state.requires_review, "events": state.events})
    return {"run_id": state.run_id, "status": "needs_review" if state.requires_review else "completed", "goal": state.goal, "plan": plan_to_dict(state.plan), "actions": [tool.__dict__ for tool in state.tool_calls], "tools": [tool.name for tool in state.tool_calls], "evidence": [evidence.__dict__ for evidence in state.evidence], "reflection": reflection_to_dict(state.reflections[-1] if state.reflections else None), "answer": state.final_answer, "confidence": state.overall_confidence, "requires_review": state.requires_review, "evidence_state": state.evidence_state, "agents": [result_to_dict(agent) for agent in state.agents], "events": state.events, "provider": provider_status()}

@app.post("/api/query/stream")
async def query_stream(request: QueryIn, context: RequestContext = Depends(request_context)) -> StreamingResponse:

    async def events():
        yield f"data: {json.dumps({'type': 'run_queued', 'tenant_id': context.tenant_id})}\n\n"
        await asyncio.sleep(0)
        try:
            evidence = []
            if getattr(store, "pool", None):
                hits = await HybridRetriever(store.pool).search(context.tenant_id, request.query.strip())
                evidence = [Evidence(hit.document_id.encode('utf-8', 'replace').decode('utf-8'), hit.version, hit.section.encode('utf-8', 'replace').decode('utf-8'), hit.quote.encode('utf-8', 'replace').decode('utf-8'), hit.start, hit.end, hit.lexical_score) for hit in hits]
            yield f"data: {json.dumps({'type': 'retrieval_completed', 'evidence_count': len(evidence)})}\n\n"
            state = await run_policy_graph(request.query.strip(), context.tenant_id, context.mode, evidence)
            await store.append(context.tenant_id, "runs", {"id": state.run_id, "query": state.query, "answer": state.final_answer, "confidence": state.overall_confidence, "requires_review": state.requires_review, "events": state.events})
            for event in state.events:
                yield f"data: {json.dumps(event)}\n\n"
            yield f"data: {json.dumps({'type': 'run_result', 'run_id': state.run_id, 'status': 'needs_review' if state.requires_review else 'completed', 'goal': state.goal, 'plan': plan_to_dict(state.plan), 'actions': [tool.__dict__ for tool in state.tool_calls], 'tools': [tool.name for tool in state.tool_calls], 'reflection': reflection_to_dict(state.reflections[-1] if state.reflections else None), 'answer': state.final_answer, 'confidence': state.overall_confidence, 'requires_review': state.requires_review, 'evidence_state': state.evidence_state, 'agents': [result_to_dict(agent) for agent in state.agents], 'provider': provider_status()})}\n\n"
        except Exception as error:
            yield f"data: {json.dumps({'type': 'run_failed', 'message': str(error) or 'The run could not be completed safely.'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.get("/api/runs")
async def runs(context: RequestContext = Depends(request_context)) -> dict[str, object]:
    return {"items": await store.list(context.tenant_id, "runs")}

@app.get("/api/review")
async def review(context: RequestContext = Depends(request_context)) -> dict[str, object]:
    return {"items": await store.list(context.tenant_id, "reviews")}

@app.post("/api/review")
async def add_review(item: ReviewIn, context: RequestContext = Depends(request_context)) -> dict[str, object]:
    require_role(context, "reviewer", "admin")
    return await store.append(context.tenant_id, "reviews", {**item.model_dump(), "reviewer_id": context.user_id})

@app.post("/api/evaluations")
async def run_evaluation(context: RequestContext = Depends(request_context)) -> dict[str, object]:
    require_role(context, "admin")
    return await store.append(context.tenant_id, "evaluations", {"id": f"eval-{int(time.time())}", "status": "queued", "dataset": "golden-policy-v1"})
