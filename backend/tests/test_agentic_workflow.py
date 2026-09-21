from backend.agents.contracts import Evidence
from backend.graph.workflow import create_plan


def test_privacy_query_routes_only_relevant_specialists():
    plan = create_plan("Does this policy retain personal data?", [])
    agents = [task.agent for task in plan.subtasks]
    assert "privacy" in agents
    assert "security" not in agents


def test_security_query_routes_security():
    plan = create_plan("Does this policy require MFA for access?", [])
    assert "security" in [task.agent for task in plan.subtasks]


def test_conflict_query_routes_conflict_and_verification():
    plan = create_plan("Find conflicting rules between policy versions", [])
    agents = [task.agent for task in plan.subtasks]
    assert "conflict" in agents
    assert "verification" in agents
    assert plan.max_iterations == 3


def test_planner_has_allowlisted_tools_only():
    plan = create_plan("What does the policy require?", [Evidence("doc", "v1", "1", "requirement", 0, 11, .9)])
    assert set(plan.selected_tools) <= {"search_documents", "retrieve_document_sections", "verify_claim_against_evidence", "detect_conflicts", "calculate_confidence", "request_human_review", "generate_report"}
