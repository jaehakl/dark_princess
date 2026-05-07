# auth/jwt.py
import time, uuid, jwt
from typing import Any, Dict
from settings import settings
from user_auth.db import User

def _now() -> int:
    return int(time.time())

def make_token(sub: str, ttl_sec: int, extra: Dict[str, Any] | None = None) -> str:
    now = _now()
    payload = {
        "sub": sub,
        "iat": now,
        "nbf": now - 5,            # 소폭 스큐 허용
        "exp": now + ttl_sec,
        "jti": str(uuid.uuid4()),
        **(extra or {}),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)

def make_access(user: User) -> str:
    user_id = user.id
    roles = [user_role.role.name for user_role in user.user_roles]
    extra = {"roles": roles or [],
                "email": user.email,
                "display_name": user.display_name,
                "picture_url": user.picture_url,
            }
    return make_token(str(user_id), settings.ACCESS_TTL_SEC, extra=extra)

def make_refresh(user_id: str) -> str:
    return make_token(user_id, settings.REFRESH_TTL_SEC, {"typ": "refresh"})

def verify_token(token: str) -> Dict[str, Any]:
    # 클럭 스큐 대비 leeway 부여
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALG],
        options={"require": ["exp", "iat", "nbf", "sub"]},
        leeway=30,
    )