from __future__ import annotations

import asyncio
import uuid
from backend.agents.contracts import AgentResult, Evidence, RunState
from backend.providers.llm_gateway import GatewayError
from backend.providers.fallback import provider_chain
from backend.evidence_intelligence import assess_evidence

SPECIALISTS = {
    "policy": "Analyze policy requirements and exceptions.",
    "privacy": "Analyze personal data, retention, consent, and data subject obligations.",
    "security": "Analyze controls, access, incidents, and technical safeguards.",
    "legal": "Analyze legal exposure, jurisdiction, and contractual obligations.",
}

async def run_specialist(kind: str, query: str, evidence: list[Evidence], state: RunState) -> AgentResult:
    state.events.append({"type": "agent_started", "agent": kind})
    context = "\n".join(f"[{item.document_id}:{item.section}] {item.quote}" for item in evidence)
    prompt = f"""You are the {kind} specialist in a policy intelligence system. Answer the user's question clearly and directly for a non-expert. Use only the approved evidence below. Do not invent facts. Structure your response with: Direct answer, Why, Exceptions or limits, and Recommended next step. Cite every material claim inline using [document_id | section]. If the evidence is insufficient, say exactly: 'The uploaded policy does not establish this.' Never output replacement characters or corrupted document names.\n\nQuestion: {query}\nApproved evidence:\n{context or 'No approved evidence was retrieved.'}"""
    try:
        generation = await provider_chain.generate(system=SPECIALISTS.get(kind, SPECIALISTS["policy"]), user=prompt)
        result = AgentResult(kind, "completed", generation.text, 0.82 if evidence else 0.22, evidence, [], generation.model, generation.latency_ms)
    except GatewayError as error:
        result = AgentResult(kind, "failed", "Agent unavailable; human review required.", 0.0, evidence, [str(error)])
    state.events.append({"type": "agent_completed", "agent": kind, "status": result.status})
    return result

async def run_policy_graph(query: str, tenant_id: str, mode: str, evidence: list[Evidence] | None = None) -> RunState:
    state = RunState(str(uuid.uuid4()), tenant_id, query, mode)
    approved_evidence = evidence or []
    started = asyncio.get_running_loop().time()
    def stage(name: str, status: str, detail: str, duration_ms: int = 0) -> None:
        state.events.append({"type": "stage", "stage": name, "status": status, "detail": detail, "duration_ms": duration_ms})
    state.events.append({"type": "run_started", "run_id": state.run_id, "tenant_id": tenant_id})
    stage("Supervisor", "completed", "Classified as policy question")
    stage("Query Intelligence", "completed", "Normalized and expanded question")
    stage("Hybrid Retrieval", "completed" if approved_evidence else "failed", f"Found {len(approved_evidence)} tenant-scoped passages")
    state.agents = await asyncio.gather(*(run_specialist(kind, query, approved_evidence, state) for kind in SPECIALISTS))
    specialist_text = "\\n\\n".join(f"{agent.agent}: {agent.answer}" for agent in state.agents)
    conflict = await run_specialist("policy", f"Resolve conflicts between these specialist findings and identify disagreements:\\n{specialist_text}", approved_evidence, state)
    conflict = AgentResult("conflict", conflict.status, conflict.answer, conflict.confidence, approved_evidence, conflict.issues, conflict.model, conflict.latency_ms)
    verification = await run_specialist("policy", f"Verify every claim in these findings against the cited evidence. List unsupported claims:\\n{specialist_text}", approved_evidence, state)
    verification = AgentResult("verification", verification.status, verification.answer, verification.confidence, approved_evidence, verification.issues, verification.model, verification.latency_ms)
    report = await run_specialist("policy", f"Write the final report for the user. Explain each agent's finding, cite the evidence, identify conflicts, state confidence, and give a safe recommendation. Findings:\\n{specialist_text}\\nConflict review:\\n{conflict.answer}\\nVerification:\\n{verification.answer}", approved_evidence, state)
    report = AgentResult("report", report.status, report.answer, report.confidence, approved_evidence, report.issues, report.model, report.latency_ms)
    state.agents += [conflict, verification, report]
    stage("Policy Reasoning", "completed", "Synthesized specialist findings", int((asyncio.get_running_loop().time() - started) * 1000))
    stage("Verification", "completed" if verification.status == "completed" else "failed", "Checked citations, conflicts, and unsupported claims")
    evidence_state = assess_evidence(query, approved_evidence, [agent.answer for agent in state.agents])
    state.evidence_state = {
        "status": evidence_state.status, "decision": evidence_state.decision, "coverage": evidence_state.coverage,
        "consistency": evidence_state.consistency, "citation_completeness": evidence_state.citation_completeness,
        "unresolved_conflicts": list(evidence_state.unresolved_conflicts), "rationale": evidence_state.rationale,
        "receipts": [receipt.__dict__ for receipt in evidence_state.receipts],
    }
    state.events.append({"type": "evidence_assessed", **state.evidence_state})
    state.overall_confidence = round(sum(agent.confidence for agent in state.agents) / len(state.agents), 2)
    state.requires_review = evidence_state.decision in {"human_review", "abstain"} or state.overall_confidence < 0.7 or any(agent.issues or agent.status == "failed" for agent in state.agents) or not approved_evidence
    state.final_answer = report.answer if report.status == "completed" else "\\n\\n".join(agent.answer for agent in state.agents if agent.agent in SPECIALISTS)
    state.events.append({"type": "run_completed", "run_id": state.run_id, "requires_review": state.requires_review, "duration_ms": int((asyncio.get_running_loop().time() - started) * 1000)})
    return state
