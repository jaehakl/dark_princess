from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from utils.crud_helpers import CrudSpec, delete_items, normalize_int_ids


def field_ids(items: Sequence[Any], field_name: str) -> list[int]:
    return normalize_int_ids((getattr(item, field_name, None) for item in items), sort=True)


async def require_existing_ids(
    db: AsyncSession,
    model: type[Any],
    ids: Iterable[Any],
    field_name: str,
    base_clause: Any | None = None,
) -> None:
    normalized_ids = normalize_int_ids(ids, sort=True)
    if not normalized_ids:
        return

    stmt = select(model.id).where(model.id.in_(normalized_ids))
    if base_clause is not None:
        stmt = stmt.where(base_clause)

    found_ids = set((await db.execute(stmt)).scalars().all())
    missing_ids = [item_id for item_id in normalized_ids if item_id not in found_ids]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"{field_name} not found: {missing_ids}")


async def delete_owned_items(
    db: AsyncSession,
    spec: CrudSpec[Any, Any],
    ids: Iterable[Any],
    base_clause: Any | None = None,
) -> None:
    normalized_ids = normalize_int_ids(ids, sort=True)
    if not normalized_ids:
        return

    await require_existing_ids(db, spec.model, normalized_ids, "id", base_clause)
    await delete_items(db, spec, normalized_ids)
