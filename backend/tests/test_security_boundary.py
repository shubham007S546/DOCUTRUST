import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi import HTTPException

from backend.security import tenant


def test_tenant_isolation_derives_distinct_ids():
    assert tenant.tenant_for_user("user-a") != tenant.tenant_for_user("user-b")


def test_private_context_rejects_unsigned_headers(monkeypatch):
    monkeypatch.setattr(tenant.settings, "better_auth_secret", "secret")
    with pytest.raises(HTTPException) as error:
        tenant.request_context(x_docutrust_mode="private", x_tenant_id=tenant.tenant_for_user("user-a"), x_user_id="user-a")
    assert error.value.status_code == 401


def test_signed_context_uses_assertion_identity(monkeypatch):
    secret = "secret"
    monkeypatch.setattr(tenant.settings, "better_auth_secret", secret)
    user_id = "user-a"
    payload = {"sub": user_id, "tenant": tenant.tenant_for_user(user_id), "role": "reviewer", "iat": int(time.time())}
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    signature = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()
    assertion = f"{encoded}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"
    context = tenant.request_context(x_internal_assertion=assertion, x_docutrust_mode="private", x_user_id="attacker", x_tenant_id=tenant.tenant_for_user("attacker"))
    assert context.user_id == user_id
    assert context.tenant_id == tenant.tenant_for_user(user_id)
