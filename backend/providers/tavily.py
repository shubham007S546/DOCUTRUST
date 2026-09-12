from __future__ import annotations

from typing import Any

import httpx

from backend.config import settings
from backend.providers.llm_gateway import GatewayError


async def search(query: str, *, max_results: int = 5) -> list[dict[str, Any]]:
    if not settings.tavily_api_key:
        raise GatewayError("Tavily is not configured")
    if not settings.research_enabled:
        raise GatewayError("External research is disabled")
    async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
        response = await client.post("https://api.tavily.com/search", json={"api_key": settings.tavily_api_key, "query": query, "max_results": max_results, "include_answer": False})
    if response.status_code >= 400:
        raise GatewayError("External research request failed")
    results = response.json().get("results", [])
    return [{"title": item.get("title", ""), "url": item.get("url", ""), "content": item.get("content", "")} for item in results]
