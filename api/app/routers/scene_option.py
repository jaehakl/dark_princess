from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, SceneOption, get_db
from models import (
    GenerateSceneOptionRequestBase,
    GetListRequestBase,
    GetListResponseBase,
    SceneOptionBase,
    UpsertResponseBase,
)
from service.scene_option import generate_scene_option
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items
from utils.router_helpers import field_ids, require_existing_ids

router = APIRouter(prefix="/scene_option", tags=["scene_option"])


SCENE_OPTION_CRUD_SPEC = CrudSpec(model=SceneOption, schema=SceneOptionBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_scene_option_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, SCENE_OPTION_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_scene_option_list(
    items: List[SceneOptionBase],
    db: AsyncSession = Depends(get_db),
):
    await require_existing_ids(db, Scene, field_ids(items, "scene_id"), "scene_id")
    return await upsert_items(db, items, SCENE_OPTION_CRUD_SPEC)


@router.post("/generate", response_model=SceneOptionBase)
async def api_generate_scene_option(
    request: GenerateSceneOptionRequestBase,
    db: AsyncSession = Depends(get_db),
):
    scene_option = await generate_scene_option(db, request)
    return SceneOptionBase(
        id=scene_option.id,
        scene_id=scene_option.scene_id,
        option_text=scene_option.option_text,
    )


@router.delete("/", status_code=200)
async def api_delete_scene_option_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, SCENE_OPTION_CRUD_SPEC, ids)
    return None
