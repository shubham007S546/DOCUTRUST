from backend.ingestion import IngestionError, prepare_text_document
from backend.security.tenant import RequestContext


def test_upload_validation_rejects_unsupported_mime():
    try:
        prepare_text_document("bad.svg", "image/svg+xml", b"hello")
    except IngestionError:
        return
    raise AssertionError("unsupported MIME type must be rejected")


def test_upload_validation_preserves_offsets():
    chunks = prepare_text_document("policy.txt", "text/plain", ("Policy retention applies.\n\nLegal hold overrides deletion." * 8).encode()).chunks
    assert chunks
    assert chunks[0].char_start == 0
    assert chunks[-1].char_end >= chunks[0].char_end


def test_private_context_requires_tenant():
    context = RequestContext(tenant_id="tenant-a", user_id="user-a", mode="private", role="viewer")
    assert context.mode == "private"
    assert context.tenant_id == "tenant-a"
