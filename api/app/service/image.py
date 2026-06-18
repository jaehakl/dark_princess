from collections import Counter
import asyncio
from io import BytesIO
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Image, Scene
from models import (
    GenerateImageRequestBase,
    GetListRequestBase,
    GetListResponseBase,
    ImageBase,
    ImageListItemBase,
)
from settings import settings
from model_runtime import encode_scene_text, generate_images_batch, get_available_cuda_device_ids
from service.image_util import resolve_image_generation_model_path, resolve_image_generation_settings
from service.image_util_constants import (
    GEN_IMAGE_CFG,
    GEN_IMAGE_HEIGHT,
    GEN_IMAGE_MAX_CHUNK_SIZE,
    GEN_IMAGE_OUTPUT_EXTENSION,
    GEN_IMAGE_OUTPUT_FORMAT,
    GEN_IMAGE_OUTPUT_QUALITY,
    GEN_IMAGE_SEED_MAX,
    GEN_IMAGE_SEED_MIN,
    GEN_IMAGE_STRENGTH,
    GEN_IMAGE_STEPS,
    GEN_IMAGE_WIDTH,
)
from utils.crud_helpers import normalize_int_ids
from utils.local_storage import (
    build_object_key,
    delete_object,
    public_file_url_from_reference,
    upload_fileobj,
)
from utils.vector import VECTOR_DIMENSION


IMAGE_LIST_SORT_FIELDS = {"id", "scene_count", "family_root_image_id"}


async def generate_images(db: AsyncSession, requests: list[GenerateImageRequestBase]) -> list[ImageBase]:
    if not requests:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image generation requests are required")

    prepared_requests: list[dict[str, Any]] = []
    for request in requests:
        positive_prompt = request.positive_prompt.strip()
        if not positive_prompt:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="positive_prompt is required")

        negative_prompt = (request.negative_prompt or "").strip()
        resolved_settings = resolve_image_generation_settings(request.model_parameters)
        model_path = resolve_image_generation_model_path(resolved_settings)
        step_count = resolved_settings.steps or GEN_IMAGE_STEPS
        cfg = resolved_settings.cfg or GEN_IMAGE_CFG
        height = resolved_settings.height or GEN_IMAGE_HEIGHT
        width = resolved_settings.width or GEN_IMAGE_WIDTH
        strength = resolved_settings.strength or GEN_IMAGE_STRENGTH
        sampler = resolved_settings.sampler or ""
        scheduler = resolved_settings.scheduler or ""
        prepared_requests.append(
            {
                "positive_prompt": positive_prompt,
                "negative_prompt": negative_prompt,
                "model_path": model_path,
                "step_count": step_count,
                "cfg": cfg,
                "height": height,
                "width": width,
                "strength": strength,
                "sampler": sampler,
                "scheduler": scheduler,
                "clip_skip": resolved_settings.clip_skip,
            }
        )

    gpu_ids = get_available_cuda_device_ids()
    if not gpu_ids:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CUDA GPU is not available",
        )
    for index, prepared_request in enumerate(prepared_requests):
        prepared_request["gpu_id"] = gpu_ids[index % len(gpu_ids)]

    generated_results = await asyncio.gather(
        *(generate_image_only_output(prepared_request) for prepared_request in prepared_requests)
    )
    prompt_embeddings = [
        await make_positive_prompt_embedding(prepared_request["positive_prompt"])
        for prepared_request in prepared_requests
    ]

    image_keys: list[str] = []
    stored_images: list[Image] = []
    try:
        for prepared_request, generated_result, prompt_embedding in zip(
            prepared_requests,
            generated_results,
            prompt_embeddings,
        ):
            image_key = await upload_generated_image(generated_result["image"], "image")
            image_keys.append(image_key)
            model_path = prepared_request["model_path"]
            stored_image = Image(
                image_object_key=image_key,
                positive_prompt=prepared_request["positive_prompt"],
                positive_prompt_embedding=prompt_embedding,
                negative_prompt=prepared_request["negative_prompt"],
                model_parameters={
                    "model_filename": model_path.name,
                    "runtime_image_mode": "t2i",
                    "gpu_id": prepared_request["gpu_id"],
                    "seed": generated_result["seed"],
                    "steps": prepared_request["step_count"],
                    "cfg": prepared_request["cfg"],
                    "height": prepared_request["height"],
                    "width": prepared_request["width"],
                    "strength": prepared_request["strength"],
                    "sampler": prepared_request["sampler"],
                    "scheduler": prepared_request["scheduler"],
                    "clip_skip": prepared_request["clip_skip"],
                    "output_format": GEN_IMAGE_OUTPUT_FORMAT,
                    "output_quality": GEN_IMAGE_OUTPUT_QUALITY if GEN_IMAGE_OUTPUT_FORMAT.upper() == "JPEG" else None,
                },
            )
            stored_images.append(stored_image)
            db.add(stored_image)

        await db.commit()
        for stored_image in stored_images:
            await db.refresh(stored_image)
    except Exception:
        await db.rollback()
        for image_key in image_keys:
            delete_object(image_key)
        raise

    return [
        ImageBase(
            id=stored_image.id,
            image_object_key=public_file_url_from_reference(stored_image.image_object_key),
            scribble_object_key=None,
            pose_object_key=None,
            positive_prompt=stored_image.positive_prompt,
            negative_prompt=stored_image.negative_prompt,
            seed_image_id=None,
            model_parameters=stored_image.model_parameters,
        )
        for stored_image in stored_images
    ]


async def generate_image_only_output(prepared_request: dict[str, Any]) -> dict[str, Any]:
    images, seeds = await generate_images_batch(
        str(prepared_request["model_path"]),
        "t2i",
        [prepared_request["positive_prompt"]],
        [prepared_request["negative_prompt"]],
        [],
        [],
        [],
        [None],
        prepared_request["step_count"],
        prepared_request["cfg"],
        prepared_request["height"],
        prepared_request["width"],
        prepared_request["strength"],
        GEN_IMAGE_MAX_CHUNK_SIZE,
        GEN_IMAGE_SEED_MIN,
        GEN_IMAGE_SEED_MAX,
        prepared_request["sampler"],
        prepared_request["scheduler"],
        prepared_request["clip_skip"],
        [],
        [],
        [],
        [],
        device_id=prepared_request["gpu_id"],
    )
    image = images[0] if images else None
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="image generation returned no image",
        )
    return {
        "image": image,
        "seed": seeds[0] if seeds else None,
    }


async def make_positive_prompt_embedding(positive_prompt: str) -> list[float] | None:
    if not positive_prompt.strip():
        return None

    model_name = settings.SCENE_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene embedding model name is required",
        )

    embedding = await encode_scene_text(model_name, f"passage: {positive_prompt}")
    if len(embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"scene embedding model must return {VECTOR_DIMENSION} dimensions",
        )
    return embedding


async def upload_generated_image(image: Any, filename_prefix: str) -> str:
    image_key = build_object_key(kind="image", filename=f"{filename_prefix}{GEN_IMAGE_OUTPUT_EXTENSION}")
    image_bytes = BytesIO()
    output_format = GEN_IMAGE_OUTPUT_FORMAT.upper()
    save_kwargs = {"format": GEN_IMAGE_OUTPUT_FORMAT}
    if output_format == "JPEG":
        save_kwargs["quality"] = GEN_IMAGE_OUTPUT_QUALITY
    if output_format == "JPEG" and getattr(image, "mode", "RGB") != "RGB":
        image = image.convert("RGB")
    await asyncio.to_thread(image.save, image_bytes, **save_kwargs)
    image_bytes.seek(0)
    upload_fileobj(image_bytes, image_key, image_content_type(GEN_IMAGE_OUTPUT_FORMAT))
    return image_key


def image_content_type(output_format: str) -> str:
    normalized_format = output_format.lower()
    if normalized_format == "png":
        return "image/png"
    if normalized_format == "webp":
        return "image/webp"
    return "image/jpeg"


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
