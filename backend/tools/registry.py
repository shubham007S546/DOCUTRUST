from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from backend.agents.contracts import Evidence

@dataclass(frozen=True)
class ToolResult:
    status: str
    data: dict[str, Any]
    error: str | None = None


def detect_conflicts(evidence: list[Evidence]) -> ToolResult:
    conflicts: list[dict[str, Any]] = []
    for index, left in enumerate(evidence):
        for right in evidence[index + 1:]:
            if left.document_id == right.document_id and left.section == right.section:
                continue
            left_numbers = re.findall(r'\b\d+(?:\.\d+)?\s*(?:weeks?|days?|months?|years?|%)?\b', left.quote.lower())
            right_numbers = re.findall(r'\b\d+(?:\.\d+)?\s*(?:weeks?|days?|months?|years?|%)?\b', right.quote.lower())
            shared_terms = set(re.findall(r'[a-z]{5,}', left.quote.lower())) & set(re.findall(r'[a-z]{5,}', right.quote.lower()))
            if left_numbers and right_numbers and left_numbers != right_numbers and len(shared_terms) >= 2:
                conflicts.append({'left': left.__dict__, 'right': right.__dict__, 'resolution': 'Review document version and effective date.'})
    return ToolResult('completed', {'conflicts': conflicts, 'count': len(conflicts)})


def verify_claim(claim: str, evidence: list[Evidence]) -> ToolResult:
    words = set(re.findall(r'[a-z]{5,}', claim.lower()))
    supporting = [item.document_id for item in evidence if len(words & set(re.findall(r'[a-z]{5,}', item.quote.lower()))) >= max(1, min(3, len(words) // 4))]
    return ToolResult('completed', {'supporting_evidence': supporting, 'coverage': min(1.0, len(supporting) / 2)})
