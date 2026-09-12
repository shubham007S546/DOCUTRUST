from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Protocol

from backend.config import settings


class Store(Protocol):
    async def append(self, tenant_id: str, collection: str, value: dict[str, Any]) -> dict[str, Any]: ...
    async def list(self, tenant_id: str, collection: str) -> list[dict[str, Any]]: ...
    async def ingest_document(self, tenant_id: str, title: str, mime_type: str, document: Any) -> dict[str, Any]: ...


class MemoryStore:
    """Explicitly non-production adapter used only when STORAGE_MODE=memory."""
    def __init__(self) -> None:
        self._data: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
        self._lock = asyncio.Lock()

    async def append(self, tenant_id: str, collection: str, value: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            item = deepcopy(value)
            self._data[tenant_id][collection].append(item)
            return deepcopy(item)

    async def list(self, tenant_id: str, collection: str) -> list[dict[str, Any]]:
        async with self._lock:
            return deepcopy(self._data[tenant_id][collection])


class PostgresStore:
    """Durable tenant-scoped repository using the connected Neon Postgres URL."""
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn
        self.pool: Any | None = None

    async def connect(self) -> None:
        if self.pool is None:
            import asyncpg
            self.pool = await asyncpg.create_pool(self.dsn, min_size=1, max_size=8, command_timeout=10)

    async def append(self, tenant_id: str, collection: str, value: dict[str, Any]) -> dict[str, Any]:
        await self.connect()
        if collection == "runs":
            await self.pool.execute("""INSERT INTO docutrust_query_runs (id, tenant_id, actor_id, question, status, answer, confidence, evidence, trace, model_id, prompt_version, completed_at) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, answer=EXCLUDED.answer, confidence=EXCLUDED.confidence, evidence=EXCLUDED.evidence, trace=EXCLUDED.trace, completed_at=EXCLUDED.completed_at""", value["id"], tenant_id, value.get("actor_id"), value.get("query", ""), "needs_review" if value.get("requires_review") else "completed", value.get("answer"), value.get("confidence"), json.dumps(value.get("evidence", [])), json.dumps(value.get("events", [])), value.get("model_id"), value.get("prompt_version"), datetime.now(timezone.utc))
        elif collection == "reviews":
            await self.pool.execute("""INSERT INTO docutrust_reviews (id, tenant_id, query_run_id, reviewer_id, decision, notes) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)""", str(uuid.uuid4()), tenant_id, value["run_id"], value["reviewer_id"], value["decision"], value.get("note", ""))
        else:
            raise ValueError(f"Unsupported durable collection: {collection}")
        return value

    async def ingest_document(self, tenant_id: str, title: str, mime_type: str, document: Any) -> dict[str, Any]:
        await self.connect()
        document_id = str(uuid.uuid4())
        await self.pool.execute("INSERT INTO docutrust_documents (id, tenant_id, title, source_type, mime_type, status, sha256) VALUES ($1::uuid, $2::uuid, $3, 'upload', $4, 'indexed', $5)", document_id, tenant_id, title, mime_type, document.sha256)
        for chunk in document.chunks:
            await self.pool.execute("INSERT INTO docutrust_document_chunks (id, tenant_id, document_id, version_label, chunk_index, content) VALUES ($1::uuid, $2::uuid, $3::uuid, 'v1', $4, $5)", str(uuid.uuid4()), tenant_id, document_id, chunk.index, chunk.content)
        return {"id": document_id, "title": title, "mime_type": mime_type, "status": "indexed", "chunks": len(document.chunks), "sha256": document.sha256}

    async def list(self, tenant_id: str, collection: str) -> list[dict[str, Any]]:
        await self.connect()
        if collection == "runs":
            rows = await self.pool.fetch("SELECT id::text, question, status, answer, confidence, evidence, trace, created_at FROM docutrust_query_runs WHERE tenant_id=$1::uuid ORDER BY created_at DESC LIMIT 100", tenant_id)
        elif collection == "reviews":
            rows = await self.pool.fetch("SELECT id::text, query_run_id::text, reviewer_id, decision, notes, created_at FROM docutrust_reviews WHERE tenant_id=$1::uuid ORDER BY created_at DESC LIMIT 100", tenant_id)
        elif collection == "documents":
            rows = await self.pool.fetch("SELECT id::text, title, source_type, mime_type, status, sha256, created_at, updated_at FROM docutrust_documents WHERE tenant_id=$1::uuid ORDER BY updated_at DESC LIMIT 100", tenant_id)
        else:
            raise ValueError(f"Unsupported durable collection: {collection}")
        return [dict(row) for row in rows]


def create_store() -> Store:
    if settings.storage_mode == "memory":
        return MemoryStore()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required when STORAGE_MODE is postgres")
    return PostgresStore(settings.database_url)


store = create_store()
