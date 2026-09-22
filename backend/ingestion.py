from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from backend.config import settings

ALLOWED_MIME_TYPES = {"application/pdf", "text/plain", "text/markdown"}

@dataclass(frozen=True)
class IngestedChunk:
    index: int
    content: str
    char_start: int
    char_end: int
    page_start: int | None = None
    page_end: int | None = None

@dataclass(frozen=True)
class IngestedDocument:
    sha256: str
    mime_type: str
    chunks: list[IngestedChunk]

class IngestionError(ValueError):
    pass

def validate_upload(filename: str, mime_type: str, content: bytes) -> None:
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise IngestionError(f"Upload exceeds {settings.max_upload_mb} MB limit")
    if mime_type not in ALLOWED_MIME_TYPES:
        raise IngestionError("Unsupported document type")
    if not filename.strip() or filename.startswith("."):
        raise IngestionError("A safe filename is required")

def chunk_text(content: str, target_chars: int = 1400, overlap: int = 160) -> list[IngestedChunk]:
    normalized = re.sub(r"\r\n?", "\n", content).strip()
    if not normalized:
        raise IngestionError("Document contains no extractable text")
    chunks: list[IngestedChunk] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + target_chars)
        if end < len(normalized):
            boundary = normalized.rfind("\n", start, end)
            if boundary > start + target_chars // 2:
                end = boundary
        chunks.append(IngestedChunk(len(chunks), normalized[start:end].strip(), start, end))
        if end == len(normalized):
            break
        start = max(end - overlap, start + 1)
    return chunks

def prepare_text_document(filename: str, mime_type: str, content: bytes) -> IngestedDocument:
    validate_upload(filename, mime_type, content)
    if mime_type == "application/pdf":
        try:
            from io import BytesIO
            from pypdf import PdfReader
            reader = PdfReader(BytesIO(content))
            text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as error:
            raise IngestionError("This PDF could not be read. It may be scanned and require OCR.") from error
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        raise IngestionError("DOCX ingestion requires the document extraction worker.")
    else:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as error:
            raise IngestionError("This document could not be decoded safely") from error
    return IngestedDocument(hashlib.sha256(content).hexdigest(), mime_type, chunk_text(text))
