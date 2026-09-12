from backend.agents.contracts import Evidence
from backend.evidence_intelligence import assess_evidence


def test_empty_evidence_requires_more_retrieval():
    state = assess_evidence('What is the retention period?', [])
    assert state.status == 'unsupported'
    assert state.decision == 'retrieve_more'
    assert state.coverage == 0


def test_grounded_evidence_has_provenance_receipt():
    state = assess_evidence('What is the retention period?', [Evidence('policy-1', 'v2026', 'Retention', 'Customer data retention period is 24 months.', 0, 44, 0.94)])
    assert state.status == 'grounded'
    assert state.decision == 'answer'
    assert len(state.receipts) == 1
    assert len(state.receipts[0].provenance_hash) == 64


def test_insufficient_specialist_finding_requires_review():
    item = Evidence('policy-1', 'v2026', 'Retention', 'Customer data retention period is 24 months.', 0, 44, 0.94)
    state = assess_evidence('What is the retention period?', [item], ['unsupported', 'insufficient evidence', 'The answer is 24 months.'])
    assert state.status == 'conflicted'
    assert state.decision == 'human_review'
    assert state.unresolved_conflicts
