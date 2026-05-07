import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet

from settings import settings


def _get_token_cipher() -> Fernet:
    secret = settings.google_token_encryption_key or settings.JWT_SECRET
    if not secret:
        raise RuntimeError("GOOGLE_TOKEN_ENCRYPTION_KEY or JWT_SECRET is required")

    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_google_token(token: Optional[str]) -> Optional[bytes]:
    if not token:
        return None
    return _get_token_cipher().encrypt(token.encode("utf-8"))


def decrypt_google_token(token: Optional[bytes]) -> Optional[str]:
    if not token:
        return None
    return _get_token_cipher().decrypt(token).decode("utf-8")
