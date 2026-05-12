from typing import List

from fastapi import APIRouter, Body, Depends, Request as FastAPIRequest
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene
from models import GetListRequestBase, GetListResponseBase, SceneBase, UpsertResponseBase
from db import get_db
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items
from utils.upsert_form import preserve_existing_upload_fields, upsert_form_item

router = APIRouter(prefix="/scene", tags=["scene"])


SCENE_CRUD_SPEC = CrudSpec(model=Scene, schema=SceneBase, public_url_fields=("image", "audio"))


@router.post("/list", response_model=GetListResponseBase)
async def api_get_scene_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, SCENE_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_scene_list(
    items: List[SceneBase],
    db: AsyncSession = Depends(get_db),
):
    sanitized_items = await preserve_existing_upload_fields(db, items, SCENE_CRUD_SPEC, ("image", "audio"))
    return await upsert_items(db, sanitized_items, SCENE_CRUD_SPEC)


@router.post("/upsert-form", response_model=UpsertResponseBase)
async def api_upsert_scene_form(
    request: FastAPIRequest,
    db: AsyncSession = Depends(get_db),
):
    return await upsert_form_item(request, db, SCENE_CRUD_SPEC, {"image": "image", "audio": "file"})


@router.delete("/", status_code=200)
async def api_delete_scene_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, SCENE_CRUD_SPEC, ids, ("image", "audio"))
    return None
