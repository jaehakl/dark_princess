from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import SceneAppliedResult, SceneHistory, SceneResult, get_db
from models import GetListRequestBase, GetListResponseBase, SceneAppliedResultBase, UpsertResponseBase
from routers.game_utils import delete_owned_items, field_ids, require_existing_ids
from utils.crud_helpers import CrudSpec, get_list_response, upsert_items

router = APIRouter(prefix="/scene_applied_result", tags=["scene_applied_result"])


SCENE_APPLIED_RESULT_CRUD_SPEC = CrudSpec(model=SceneAppliedResult, schema=SceneAppliedResultBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_scene_applied_result_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, SCENE_APPLIED_RESULT_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_scene_applied_result_list(
    items: List[SceneAppliedResultBase],
    db: AsyncSession = Depends(get_db),
):
    await require_existing_ids(db, SceneAppliedResult, field_ids(items, "id"), "id")
    await require_existing_ids(db, SceneHistory, field_ids(items, "scene_history_id"), "scene_history_id")
    await require_existing_ids(db, SceneResult, field_ids(items, "result_id"), "result_id")
    return await upsert_items(db, items, SCENE_APPLIED_RESULT_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_scene_applied_result_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_owned_items(db, SCENE_APPLIED_RESULT_CRUD_SPEC, ids)
    return None
