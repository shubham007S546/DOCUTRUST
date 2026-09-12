from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any

import httpx

from backend.config import settings


class GatewayError(RuntimeError):
    pass


@dataclass(frozen=True)
class Generation:
    text: str
    model: str
    request_id: str | None
    usage: dict[str, int]
    latency_ms: int


class VercelAIGateway:
    def __init__(self) -> None:
        self.base_url = settings.ai_gateway_base_url.rstrip("/")
        self.model = settings.ai_model
        self.max_retries = 2

    async def generate(self, *, system: str, user: str, model: str | None = None) -> Generation:
        if not settings.ai_gateway_api_key:
            raise GatewayError("AI Gateway is not configured")
        started = time.perf_counter()
        payload = {"model": model or self.model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "temperature": 0.1, "max_tokens": 1800}
        headers = {"Authorization": f"Bearer {settings.ai_gateway_api_key}", "Content-Type": "application/json"}
        timeout = httpx.Timeout(settings.ai_timeout_seconds, connect=min(10.0, settings.ai_timeout_seconds))
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = None
            for attempt in range(self.max_retries + 1):
                try:
                    response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
                    if response.status_code < 500 or attempt == self.max_retries:
                        break
                except httpx.HTTPError as error:
                    if attempt == self.max_retries:
                        raise GatewayError("AI Gateway request failed") from error
                await asyncio.sleep(0.25 * (2 ** attempt))
        if response is None or response.status_code >= 400:
            raise GatewayError(f"Gateway returned {response.status_code if response else 'no response'}")
        data: dict[str, Any] = response.json()
        choices = data.get("choices") or []
        if not choices or not choices[0].get("message", {}).get("content"):
            raise GatewayError("Gateway returned no content")
        usage = data.get("usage") or {}
        return Generation(str(choices[0]["message"]["content"]), str(data.get("model", payload["model"])), response.headers.get("x-request-id"), {k: int(v) for k, v in usage.items() if isinstance(v, int)}, int((time.perf_counter() - started) * 1000))

    def public_status(self) -> dict[str, Any]:
        return {"provider": "vercel_ai_gateway", "configured": bool(settings.ai_gateway_api_key), "model": self.model, "mode": "live" if settings.ai_gateway_api_key else "readiness_required"}


gateway = VercelAIGateway()


def redact_payload(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if k.lower() in {"authorization", "api_key", "token", "secret"} else redact_payload(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_payload(v) for v in value]
    return value


def as_json(value: Any) -> str:
    return json.dumps(redact_payload(value), separators=(",", ":"))
