from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import SceneCondition
from models import GetListRequestBase, GetListResponseBase, SceneConditionBase, UpsertResponseBase
from user_auth.routes import get_db
from user_auth.utils.auth_wrapper import require_roles
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items

router = APIRouter(prefix="/scene_condition", tags=["scene_condition"])


SCENE_CONDITION_CRUD_SPEC = CrudSpec(model=SceneCondition, schema=SceneConditionBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_scene_condition_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin"])),
):
    del user
    return await get_list_response(db, request, SCENE_CONDITION_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_scene_condition_list(
    items: List[SceneConditionBase],
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin"])),
):
    del user
    return await upsert_items(db, items, SCENE_CONDITION_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_scene_condition_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin"])),
):
    del user
    await delete_items(db, SCENE_CONDITION_CRUD_SPEC, ids)
    return None
