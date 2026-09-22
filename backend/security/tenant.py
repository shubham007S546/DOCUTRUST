from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from uuid import UUID
from fastapi import Header, HTTPException
from backend.config import settings
import base64
import hashlib
import hmac
import json
import time

_INTERNAL_ASSERTION_TTL = 60


def _verify_assertion(value: str) -> dict[str, str]:
    try:
        encoded, signature = value.split('.', 1)
        expected = hmac.new((settings.better_auth_secret or '').encode(), encoded.encode(), hashlib.sha256).digest()
        if not settings.better_auth_secret or not hmac.compare_digest(base64.urlsafe_b64decode(signature + '==='), expected):
            raise ValueError
        payload = json.loads(base64.urlsafe_b64decode(encoded + '===').decode())
        if abs(int(time.time()) - int(payload['iat'])) > _INTERNAL_ASSERTION_TTL:
            raise ValueError
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=401, detail='Invalid internal request assertion') from error

@dataclass(frozen=True)
class RequestContext:
    tenant_id: str
    user_id: str | None
    mode: str
    role: str

def tenant_for_user(user_id: str) -> str:
    hex_value = sha256(f'docutrust-tenant:{user_id}'.encode()).hexdigest()[:32]
    return f'{hex_value[:8]}-{hex_value[8:12]}-4{hex_value[13:16]}-a{hex_value[17:20]}-{hex_value[20:]}'

def request_context(x_internal_assertion: str | None = Header(default=None), x_tenant_id: str | None = Header(default=None), x_user_id: str | None = Header(default=None), x_docutrust_mode: str = Header(default='public_demo'), x_role: str = Header(default='viewer')) -> RequestContext:
    mode = x_docutrust_mode if x_docutrust_mode in {'private', 'public_demo'} else 'public_demo'
    if mode == 'private':
        if not x_internal_assertion:
            raise HTTPException(status_code=401, detail='Private mode requires a BFF assertion')
        assertion = _verify_assertion(x_internal_assertion)
        x_user_id, x_tenant_id, x_role = assertion['sub'], assertion['tenant'], assertion.get('role', 'viewer')
        if tenant_for_user(x_user_id) != x_tenant_id:
            raise HTTPException(status_code=403, detail='Tenant identity does not match authenticated user')
    tenant_id = x_tenant_id or '00000000-0000-0000-0000-000000000001'
    try:
        UUID(tenant_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail='Invalid tenant identity') from error
    return RequestContext(tenant_id=tenant_id, user_id=x_user_id, mode=mode, role=x_role)

def require_role(context: RequestContext, *roles: str) -> None:
    if context.mode != 'private' or context.role not in roles:
        raise HTTPException(status_code=403, detail='Insufficient role')
