from __future__ import annotations

from functools import lru_cache
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DocuTrust Agent Runtime"
    app_env: str = "development"
    cors_origins: list[str] = ["http://localhost:3000"]
    database_url: str | None = None
    blob_read_write_token: str | None = None
    better_auth_secret: str | None = None
    storage_mode: str = "postgres"
    embedding_api_url: str | None = None
    embedding_api_key: str | None = None
    ocr_api_url: str | None = None
    ocr_api_key: str | None = None
    malware_scanner_api_url: str | None = None
    malware_scanner_api_key: str | None = None
    connector_api_url: str | None = None
    connector_api_key: str | None = None
    max_upload_mb: int = 25
    ai_gateway_base_url: str = "https://ai-gateway.vercel.sh/v1"
    ai_gateway_api_key: str | None = Field(default=None, validation_alias=AliasChoices("VERCEL_AI_GATEWAY_KEY", "AI_GATEWAY_API_KEY"))
    groq_api_key: str | None = None
    gemini_api_key: str | None = Field(default=None, validation_alias=AliasChoices("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"))
    tavily_api_key: str | None = None
    ai_model: str = "openai/gpt-5.4-mini"
    groq_model: str = "llama-3.3-70b-versatile"
    gemini_model: str = "gemini-2.5-flash"
    ai_timeout_seconds: float = 45.0
    max_query_chars: int = 4000
    public_demo_enabled: bool = False
    research_enabled: bool = False
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def public_status(self) -> dict[str, object]:
        return {"environment": self.app_env, "model_configured": bool(self.ai_gateway_api_key or self.groq_api_key or self.gemini_api_key), "model": self.ai_model, "provider": "fallback_chain", "providers": {"ai_gateway": bool(self.ai_gateway_api_key), "groq": bool(self.groq_api_key), "gemini": bool(self.gemini_api_key), "tavily": bool(self.tavily_api_key)}, "research_enabled": self.research_enabled, "public_demo_enabled": self.public_demo_enabled, "storage": self.storage_mode, "mode": "live" if self.ai_gateway_api_key and self.database_url else "readiness_required"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
