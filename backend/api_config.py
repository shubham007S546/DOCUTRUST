from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.config import settings


@dataclass(frozen=True)
class RequiredApi:
    key: str
    purpose: str
    required_for: str
    configured: bool
    value_hint: str


def required_apis() -> list[RequiredApi]:
    return [
        RequiredApi(
            key="DATABASE_URL",
            purpose="Tenant data, documents, query runs, reviews, and audit persistence",
            required_for="Private production workspaces",
            configured=bool(settings.database_url),
            value_hint="Neon Postgres connection string",
        ),
        RequiredApi(
            key="BLOB_READ_WRITE_TOKEN",
            purpose="Private document and source-file storage",
            required_for="Document upload and retrieval",
            configured=bool(settings.blob_read_write_token),
            value_hint="Vercel Blob private-store token",
        ),
        RequiredApi(
            key="VERCEL_AI_GATEWAY_KEY",
            purpose="Answer generation, specialist agents, conflict review, and verification",
            required_for="Live agent responses",
            configured=bool(settings.ai_gateway_api_key),
            value_hint="VERCEL_AI_GATEWAY_KEY project variable",
        ),
        RequiredApi(
            key="BETTER_AUTH_SECRET",
            purpose="Secure private-workspace sessions",
            required_for="Authenticated production access",
            configured=bool(settings.better_auth_secret),
            value_hint="Random secret, at least 32 characters",
        ),
    ]


def api_status() -> dict[str, Any]:
    items = required_apis()
    return {
        "status": "ready" if all(item.configured for item in items) else "needs_configuration",
        "apis": [item.__dict__ for item in items],
        "optional_next_integrations": [
            {"key": "EMBEDDING_API", "purpose": "Semantic/vector retrieval for large document libraries"},
            {"key": "OCR_API", "purpose": "Scanned PDF and image document extraction"},
            {"key": "MALWARE_SCANNER_API", "purpose": "Quarantine and scan uploaded files"},
            {"key": "CONNECTOR_API", "purpose": "SharePoint, Google Drive, Slack, or S3 ingestion"},
        ],
    }


__all__ = ["api_status", "required_apis"]
