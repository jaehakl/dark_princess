from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from typing import Any, TypeVar

from fastapi import HTTPException, Request, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from settings import settings
from utils.aws_s3 import build_object_key, is_allowed_content_type, upload_fileobj
from utils.crud_helpers import CrudSpec, cleanup_orphaned_object_keys, upsert_items


SchemaT = TypeVar("SchemaT", bound=BaseModel)


async def preserve_existing_upload_fields(
    db: AsyncSession,
    items: Sequence[SchemaT],
    spec: CrudSpec[Any, SchemaT],
    field_names: Sequence[str],
) -> list[SchemaT]:
    if not items:
        return []

    existing_ids = sorted(
        {
            item.id
            for item in items
            if isinstance(getattr(item, "id", None), int)
        }
    )
    existing_entities_by_id: dict[int, Any] = {}
    if existing_ids:
        rows = (
            await db.execute(select(spec.model).where(spec.model.id.in_(existing_ids)))
        ).scalars().all()
        existing_entities_by_id = {row.id: row for row in rows}

    sanitized_items: list[SchemaT] = []
    for item in items:
        item_data = item.model_dump()
        existing_entity = existing_entities_by_id.get(item.id) if isinstance(item.id, int) else None
        for field_name in field_names:
            item_data[field_name] = getattr(existing_entity, field_name, None)
        sanitized_items.append(spec.schema.model_validate(item_data))

    return sanitized_items


async def upsert_form_item(
    request: Request,
    db: AsyncSession,
    spec: CrudSpec[Any, SchemaT],
    file_fields: Mapping[str, str],
):
    form = await request.form()
    payload = form.get("payload")
    if not isinstance(payload, str) or not payload.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payload is required")

    try:
        item = spec.schema.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc

    existing_entity = None
    if isinstance(getattr(item, "id", None), int):
        existing_entity = await db.get(spec.model, item.id)

    [sanitized_item] = await preserve_existing_upload_fields(db, [item], spec, list(file_fields))
    item_data = sanitized_item.model_dump()
    replaced_object_keys: list[str] = []

    for field_name, kind in file_fields.items():
        upload = form.get(field_name)
        if upload is None:
            continue
        if not isinstance(upload, UploadFile):
            continue
        if not upload.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} filename is required",
            )
        if kind == "image" and not is_allowed_content_type(upload.content_type):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} content type is not allowed",
            )

        upload.file.seek(0, os.SEEK_END)
        size = upload.file.tell()
        upload.file.seek(0)
        max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if size <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{upload.filename or 'upload'} is empty",
            )
        if size > max_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{upload.filename or 'upload'} exceeds {settings.MAX_UPLOAD_SIZE_MB} MB",
            )
        key = build_object_key(kind=kind, filename=upload.filename)
        upload_fileobj(
            upload.file,
            key,
            upload.content_type or "application/octet-stream",
        )
        old_key = getattr(existing_entity, field_name, None) if existing_entity is not None else None
        if old_key and old_key != key:
            replaced_object_keys.append(old_key)
        item_data[field_name] = key

    validated_item = spec.schema.model_validate(item_data)
    result = await upsert_items(db, [validated_item], spec)
    await cleanup_orphaned_object_keys(db, replaced_object_keys)
    return result[0]
