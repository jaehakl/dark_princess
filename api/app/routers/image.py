from typing import List

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from db import Image, get_db
from models import (
    GenerateImageRequestBase,
    GetListRequestBase,
    GetListResponseBase,
    ImageBase,
    ImageDeleteResponseBase,
    UpsertResponseBase,
)
from service.image import (
    forward_deleted_image_seed_links,
    generate_images,
    get_image_delete_targets,
    get_image_lineage_ids,
    get_image_list_response,
)
from utils.crud_helpers import CrudSpec, delete_items, upsert_items
from utils.router_helpers import field_ids, require_existing_ids

router = APIRouter(prefix="/image", tags=["image"])


IMAGE_CRUD_SPEC = CrudSpec(
    model=Image,
    schema=ImageBase,
    public_url_fields=("image_object_key", "scribble_object_key", "pose_object_key"),
)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_image_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_image_list_response(db, request)


@router.post("/generate", response_model=List[ImageBase])
async def api_generate_image(
    request: List[GenerateImageRequestBase],
    db: AsyncSession = Depends(get_db),
):
    return await generate_images(db, request)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_image_list(
    items: List[ImageBase],
    db: AsyncSession = Depends(get_db),
):
    await require_existing_ids(
        db,
        Image,
        field_ids(items, "seed_image_id"),
        "seed_image_id",
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
    )
    return await upsert_items(db, items, IMAGE_CRUD_SPEC)


@router.get("/{image_id}/lineage", response_model=List[int])
async def api_get_image_lineage(
    image_id: int,
    db: AsyncSession = Depends(get_db),
):
    return await get_image_lineage_ids(db, image_id)


@router.delete("/", response_model=ImageDeleteResponseBase, status_code=200)
async def api_delete_image_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    result = await get_image_delete_targets(db, ids)
    if result.deleted_ids:
        await forward_deleted_image_seed_links(db, result.deleted_ids)
        await delete_items(
            db,
            IMAGE_CRUD_SPEC,
            result.deleted_ids,
            cleanup_fields=("image_object_key", "scribble_object_key", "pose_object_key"),
        )
    return result
