from __future__ import annotations

import time
from typing import Any

import httpx

from backend.config import settings
from backend.providers.llm_gateway import GatewayError, Generation, VercelAIGateway


class ProviderFallback:
    def __init__(self) -> None:
        self.gateway = VercelAIGateway()

    async def generate(self, *, system: str, user: str, model: str | None = None) -> Generation:
        failures: list[str] = []
        providers = [
            ("ai_gateway", self.gateway.generate),
            ("groq", self._groq),
            ("gemini", self._gemini),
        ]
        for name, provider in providers:
            try:
                result = await provider(system=system, user=user, model=model)
                return result
            except (GatewayError, httpx.HTTPError, ValueError) as error:
                failures.append(name)
        raise GatewayError(f"All configured AI providers failed: {', '.join(failures) or 'none configured'}")

    async def _groq(self, *, system: str, user: str, model: str | None = None) -> Generation:
        if not settings.groq_api_key:
            raise GatewayError("Groq is not configured")
        return await self._openai_compatible("https://api.groq.com/openai/v1", settings.groq_api_key, model or settings.groq_model, system, user, "groq")

    async def _gemini(self, *, system: str, user: str, model: str | None = None) -> Generation:
        if not settings.gemini_api_key:
            raise GatewayError("Gemini is not configured")
        started = time.perf_counter()
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model or settings.gemini_model}:generateContent"
        payload = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": user}]}], "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1800}}
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            response = await client.post(endpoint, params={"key": settings.gemini_api_key}, json=payload)
        if response.status_code >= 400:
            raise GatewayError("Gemini request failed")
        data = response.json()
        text = "".join(part.get("text", "") for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []))
        if not text:
            raise GatewayError("Gemini returned no content")
        return Generation(text, model or settings.gemini_model, None, {}, int((time.perf_counter() - started) * 1000))

    async def _openai_compatible(self, base_url: str, api_key: str, model: str, system: str, user: str, provider: str) -> Generation:
        started = time.perf_counter()
        payload: dict[str, Any] = {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "temperature": 0.1, "max_tokens": 1800}
        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            response = await client.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=payload)
        if response.status_code >= 400:
            raise GatewayError(f"{provider} request failed")
        data = response.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content")
        if not text:
            raise GatewayError(f"{provider} returned no content")
        return Generation(str(text), str(data.get("model", model)), response.headers.get("x-request-id"), {}, int((time.perf_counter() - started) * 1000))

    def public_status(self) -> dict[str, Any]:
        return {"provider": "fallback_chain", "order": ["ai_gateway", "groq", "gemini"], "configured": {"ai_gateway": bool(settings.ai_gateway_api_key), "groq": bool(settings.groq_api_key), "gemini": bool(settings.gemini_api_key)}, "research_configured": bool(settings.tavily_api_key)}


provider_chain = ProviderFallback()

def provider_status() -> dict[str, Any]:
    return provider_chain.public_status()
