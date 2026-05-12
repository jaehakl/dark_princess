from __future__ import annotations

import mimetypes
import posixpath
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO
from urllib.parse import quote

from settings import settings

ALLOWED_CT = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_PREFIXES = {"images", "files"}


def is_allowed_content_type(ct: str | None) -> bool:
    return (ct or "") in ALLOWED_CT


def build_object_key(kind: str, filename: str | None) -> str:
    ext = Path(filename or "").suffix.lower()
    if not ext:
        fallback_mime = "image/jpeg" if kind == "image" else "application/octet-stream"
        ext = mimetypes.guess_extension(fallback_mime) or ""

    prefix = "images" if kind == "image" else "files"
    return f"{prefix}/{uuid.uuid4()}{ext}"


def normalize_object_key(key: str) -> str:
    normalized = posixpath.normpath(key.replace("\\", "/")).lstrip("/")
    parts = normalized.split("/")
    if (
        normalized in {"", "."}
        or len(parts) != 2
        or parts[0] not in ALLOWED_PREFIXES
        or not parts[1]
        or parts[1] in {".", ".."}
    ):
        raise ValueError("invalid upload object key")
    return normalized


def get_upload_root() -> Path:
    return Path(settings.LOCAL_UPLOAD_DIR).expanduser().resolve()


def get_object_path(key: str) -> Path:
    normalized = normalize_object_key(key)
    root = get_upload_root()
    path = (root / normalized).resolve()
    if root != path and root not in path.parents:
        raise ValueError("invalid upload object path")
    return path


def upload_fileobj(fp: BinaryIO, key: str, content_type: str) -> None:
    del content_type
    path = get_object_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as out:
        shutil.copyfileobj(fp, out)


def public_file_url(key: str) -> str:
    normalized = normalize_object_key(key)
    quoted_key = "/".join(quote(part) for part in normalized.split("/"))
    return f"{settings.API_BASE_URL.rstrip('/')}/uploads/{quoted_key}"


def delete_object(key: str) -> None:
    try:
        path = get_object_path(key)
    except ValueError:
        return
    try:
        path.unlink()
    except FileNotFoundError:
        return
