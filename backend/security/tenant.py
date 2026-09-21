from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from uuid import UUID
from fastapi import Header, HTTPException

@dataclass(frozen=True)
class RequestContext:
    tenant_id: str
    user_id: str | None
    mode: str
    role: str

def tenant_for_user(user_id: str) -> str:
    hex_value = sha256(f'docutrust-tenant:{user_id}'.encode()).hexdigest()[:32]
    return f'{hex_value[:8]}-{hex_value[8:12]}-4{hex_value[13:16]}-a{hex_value[17:20]}-{hex_value[20:]}'

def request_context(x_tenant_id: str | None = Header(default=None), x_user_id: str | None = Header(default=None), x_docutrust_mode: str = Header(default='public_demo'), x_role: str = Header(default='viewer')) -> RequestContext:
    mode = x_docutrust_mode if x_docutrust_mode in {'private', 'public_demo'} else 'public_demo'
    if mode == 'private':
        if not x_tenant_id or not x_user_id:
            raise HTTPException(status_code=401, detail='Private mode requires verified user identity')
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
