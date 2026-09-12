from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

@dataclass(frozen=True)
class RetrievalHit:
    document_id: str
    version: str
    section: str
    quote: str
    start: int
    end: int
    lexical_score: float
    vector_score: float | None = None

class Retriever(Protocol):
    async def search(self, tenant_id: str, query: str, limit: int = 8) -> list[RetrievalHit]: ...

class HybridRetriever:
    """Retrieval port: lexical search is available now; vector/reranking can be added behind the same contract."""
    def __init__(self, pool) -> None:
        self.pool = pool

    async def search(self, tenant_id: str, query: str, limit: int = 8) -> list[RetrievalHit]:
        rows = await self.pool.fetch("""SELECT c.document_id::text, c.version_label, d.title, c.content, c.char_start, c.char_end, ts_rank_cd(c.search_vector, websearch_to_tsquery('english', $2)) AS lexical_score FROM docutrust_document_chunks c JOIN docutrust_documents d ON d.id=c.document_id AND d.tenant_id=c.tenant_id WHERE c.tenant_id=$1::uuid AND d.status='ready' AND c.search_vector @@ websearch_to_tsquery('english', $2) ORDER BY lexical_score DESC LIMIT $3""", tenant_id, query, max(1, min(limit, 20)))
        return [RetrievalHit(row["document_id"], row["version_label"], row["title"], row["content"], row["char_start"] or 0, row["char_end"] or 0, float(row["lexical_score"])) for row in rows]
