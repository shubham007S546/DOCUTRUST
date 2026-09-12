from typing import Literal
from pydantic import BaseModel, Field

class QueryRequest(BaseModel):
    query: str = Field(min_length=3, max_length=2000)
    evidence_mode: Literal['internal', 'hybrid'] = 'internal'

class Evidence(BaseModel):
    id: str; document: str; section: str; page: int; excerpt: str; source: str; score: float

class QueryResponse(BaseModel):
    answer: str; confidence: float; evidence: list[Evidence]; events: list[dict]; verification: list[str]; needs_review: bool

class ReviewItem(BaseModel):
    id: str; title: str; kind: str; confidence: float; status: str = 'Open'

class EvaluationRequest(BaseModel):
    dataset: str = Field(min_length=1, max_length=120)

class Document(BaseModel):
    id: str; name: str; version: str; type: str; status: str; pages: int; chunks: int
