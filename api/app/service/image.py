from collections import Counter
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Image, Scene
from models import GetListRequestBase, GetListResponseBase, ImageListItemBase
from utils.crud_helpers import normalize_int_ids
from utils.local_storage import public_file_url_from_reference


IMAGE_LIST_SORT_FIELDS = {"id", "scene_count", "family_root_image_id"}


async def get_image_lineage_ids(db: AsyncSession, image_id: int) -> list[int]:
    image = await db.get(Image, image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image_id not found")

    ancestor_ids = set()
    visited_ancestor_ids = set()
    current_image = image
    while current_image is not None and current_image.id not in visited_ancestor_ids:
        visited_ancestor_ids.add(current_image.id)
        ancestor_ids.add(current_image.id)
        if current_image.seed_image_id is None:
            break
        current_image = await db.get(Image, current_image.seed_image_id)

    lineage_ids = set(ancestor_ids)
    frontier_ids = set(ancestor_ids)
    while frontier_ids:
        child_ids = (
            await db.execute(
                select(Image.id).where(Image.seed_image_id.in_(frontier_ids))
            )
        ).scalars().all()
        next_frontier_ids = {child_id for child_id in child_ids if child_id not in lineage_ids}
        lineage_ids.update(next_frontier_ids)
        frontier_ids = next_frontier_ids

    return sorted(lineage_ids)


async def get_image_list_response(
    db: AsyncSession,
    request: GetListRequestBase,
) -> GetListResponseBase:
    image_rows = await get_image_rows_with_scene_counts(db, request)
    parent_ids = await get_image_parent_ids(db)
    family_root_ids = build_family_root_ids(parent_ids)
    family_counts = Counter(family_root_ids.values())
    sorted_rows = sort_image_rows(image_rows, request.sort, family_root_ids)

    total = len(sorted_rows)
    offset = request.offset or 0
    limit = request.limit
    page_rows = sorted_rows[offset:] if limit is None else sorted_rows[offset:offset + limit]
    page_ids = [row["id"] for row in page_rows]
    images_by_id = await get_images_by_id(db, page_ids)

    items: list[ImageListItemBase] = []
    for row in page_rows:
        image = images_by_id.get(row["id"])
        if image is None:
            continue

        family_root_image_id = family_root_ids.get(image.id, image.id)
        items.append(
            ImageListItemBase(
                id=image.id,
                image_object_key=public_file_url_from_reference(image.image_object_key),
                scribble_object_key=public_file_url_from_reference(image.scribble_object_key),
                pose_object_key=public_file_url_from_reference(image.pose_object_key),
                positive_prompt=image.positive_prompt,
                negative_prompt=image.negative_prompt,
                seed_image_id=image.seed_image_id,
                model_parameters=image.model_parameters,
                scene_count=row["scene_count"],
                family_root_image_id=family_root_image_id,
                family_image_count=family_counts.get(family_root_image_id, 1),
            )
        )

    return GetListResponseBase(total=total, items=items)


async def get_image_rows_with_scene_counts(
    db: AsyncSession,
    request: GetListRequestBase,
) -> list[dict[str, int]]:
    scene_count = func.count(Scene.id).label("scene_count")
    stmt = (
        select(Image.id, Image.seed_image_id, scene_count)
        .outerjoin(Scene, Scene.image_id == Image.id)
        .group_by(Image.id)
    )

    where_clause = build_image_list_where_clause(request)
    if where_clause is not None:
        stmt = stmt.where(where_clause)

    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": row.id,
            "seed_image_id": row.seed_image_id,
            "scene_count": row.scene_count,
        }
        for row in rows
    ]


async def get_image_parent_ids(db: AsyncSession) -> dict[int, int | None]:
    rows = (await db.execute(select(Image.id, Image.seed_image_id))).all()
    return {row.id: row.seed_image_id for row in rows}


async def get_images_by_id(
    db: AsyncSession,
    image_ids: list[int],
) -> dict[int, Image]:
    if not image_ids:
        return {}

    images = (await db.execute(select(Image).where(Image.id.in_(image_ids)))).scalars().all()
    return {image.id: image for image in images}


def build_image_list_where_clause(request: GetListRequestBase) -> Any | None:
    clauses: list[Any] = []
    selected_clause = None
    selected_ids = normalize_int_ids(request.selected_ids, sort=True)
    if selected_ids:
        selected_clause = Image.id.in_(selected_ids)

    prompt_terms: list[str] = []
    if isinstance(request.search_text, str) and request.search_text.strip():
        prompt_terms.append(request.search_text.strip())
    for term in (request.text_filter or {}).get("positive_prompt") or []:
        if isinstance(term, str) and term.strip():
            prompt_terms.append(term.strip())

    if prompt_terms:
        clauses.append(
            and_(*(Image.positive_prompt.ilike(f"%{term}%") for term in prompt_terms))
        )

    scoped_clause = and_(*clauses) if clauses else None
    if selected_clause is not None and scoped_clause is not None:
        return or_(selected_clause, scoped_clause)
    if selected_clause is not None:
        return selected_clause
    return scoped_clause


def build_family_root_ids(parent_ids: dict[int, int | None]) -> dict[int, int]:
    roots: dict[int, int] = {}

    for image_id in parent_ids:
        current_id = image_id
        visited_ids: set[int] = set()
        while True:
            parent_id = parent_ids.get(current_id)
            if parent_id is None or parent_id not in parent_ids or parent_id in visited_ids:
                roots[image_id] = current_id
                break
            visited_ids.add(current_id)
            current_id = parent_id

    return roots


def sort_image_rows(
    rows: list[dict[str, int]],
    sort: list[str] | None,
    family_root_ids: dict[int, int],
) -> list[dict[str, int]]:
    field_name = sort[0] if sort else "id"
    direction = (sort[1] if sort and len(sort) > 1 else "desc").lower()
    if field_name not in IMAGE_LIST_SORT_FIELDS:
        field_name = "id"

    reverse = direction != "asc"
    if field_name == "scene_count":
        return sorted(rows, key=lambda row: (row["scene_count"], row["id"]), reverse=reverse)
    if field_name == "family_root_image_id":
        return sorted(
            rows,
            key=lambda row: (family_root_ids.get(row["id"], row["id"]), row["id"]),
            reverse=reverse,
        )
    return sorted(rows, key=lambda row: row["id"], reverse=reverse)
