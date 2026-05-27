from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import SceneOption
from models import GetListRequestBase, GetListResponseBase, SceneOptionBase, UpsertResponseBase
from db import get_db
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items

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
    return await upsert_items(db, items, SCENE_OPTION_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_scene_option_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, SCENE_OPTION_CRUD_SPEC, ids)
    return None
