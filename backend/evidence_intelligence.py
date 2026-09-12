from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

from backend.agents.contracts import Evidence

Decision = Literal['answer', 'clarify', 'retrieve_more', 'compare_policy', 'abstain', 'human_review']

@dataclass(frozen=True)
class EvidenceReceipt:
    evidence_id: str
    document_id: str
    authority: float
    relevance: float
    freshness: float
    temporal_validity: float
    citation_completeness: float
    provenance_hash: str

@dataclass(frozen=True)
class EvidenceState:
    status: Literal['grounded', 'partial', 'conflicted', 'unsupported']
    decision: Decision
    receipts: tuple[EvidenceReceipt, ...]
    coverage: float
    consistency: float
    citation_completeness: float
    unresolved_conflicts: tuple[str, ...]
    rationale: str

_SECTION_RE = re.compile(r'(?i)(exception|override|supersed|effective|expires|retention|must|shall|prohibit|require)')

def _score_relevance(query: str, quote: str) -> float:
    query_terms = {term for term in re.findall(r'[a-z0-9]{3,}', query.lower())}
    quote_terms = {term for term in re.findall(r'[a-z0-9]{3,}', quote.lower())}
    if not query_terms:
        return 0.0
    return round(min(1.0, len(query_terms & quote_terms) / max(1, min(5, len(query_terms)))), 2)

def _authority(item: Evidence) -> float:
    return round(min(1.0, 0.55 + (0.15 if item.version else 0) + (0.15 if item.section else 0) + (0.15 if item.document_id else 0)), 2)

def _freshness(version: str) -> float:
    match = re.search(r'(20\d{2})', version)
    if not match:
        return 0.65
    age = max(0, date.today().year - int(match.group(1)))
    return round(max(0.35, 1 - age * 0.08), 2)

def _receipt(query: str, item: Evidence) -> EvidenceReceipt:
    relevance = _score_relevance(query, item.quote)
    provenance = f'{item.document_id}|{item.version}|{item.section}|{item.start}:{item.end}|{item.quote}'
    return EvidenceReceipt(item.document_id + ':' + str(item.start), item.document_id, _authority(item), relevance, _freshness(item.version), 1.0, 1.0 if item.quote and item.section else 0.0, hashlib.sha256(provenance.encode()).hexdigest())

def assess_evidence(query: str, evidence: list[Evidence], agent_answers: list[str] | None = None) -> EvidenceState:
    receipts = tuple(_receipt(query, item) for item in evidence)
    coverage = round(min(1.0, sum(max(r.relevance, 0.25) for r in receipts)), 2) if receipts else 0.0
    citation = round(sum(r.citation_completeness for r in receipts) / len(receipts), 2) if receipts else 0.0
    consistency = 1.0
    conflicts: list[str] = []
    answers = agent_answers or []
    if len(answers) > 1:
        normalized = [' '.join(answer.lower().split()) for answer in answers if answer.strip()]
        if any(('unsupported' in answer or 'insufficient' in answer) for answer in normalized):
            consistency = 0.55
            conflicts.append('One or more specialists reported insufficient evidence.')
        if len(set(normalized)) == len(normalized) and len(normalized) >= 3:
            consistency = 0.62
    if not receipts:
        return EvidenceState('unsupported', 'retrieve_more', receipts, 0.0, 0.0, 0.0, ('No tenant-scoped evidence was retrieved.',), 'No answer is safe without a supporting passage.')
    if conflicts and consistency < 0.7:
        return EvidenceState('conflicted', 'human_review', receipts, coverage, consistency, citation, tuple(conflicts), 'Conflicting specialist findings require review.')
    if coverage < 0.45 or citation < 1:
        return EvidenceState('partial', 'retrieve_more', receipts, coverage, consistency, citation, tuple(conflicts), 'Evidence exists but does not fully support the requested answer.')
    return EvidenceState('grounded', 'answer', receipts, coverage, consistency, citation, tuple(conflicts), 'Evidence is relevant, attributable, and internally consistent.')
