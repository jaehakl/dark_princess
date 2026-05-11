from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, SceneHistory, Status, TargetStatus
from models import GetListRequestBase, GetListResponseBase, SceneHistoryBase, UpsertResponseBase
from routers.game_utils import delete_owned_items, field_ids, require_existing_ids
from user_auth.routes import get_db
from user_auth.utils.auth_wrapper import require_roles
from utils.crud_helpers import CrudSpec, get_list_response, upsert_items

router = APIRouter(prefix="/scene_history", tags=["scene_history"])


SCENE_HISTORY_CRUD_SPEC = CrudSpec(model=SceneHistory, schema=SceneHistoryBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_scene_history_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await get_list_response(db, request, SCENE_HISTORY_CRUD_SPEC, SceneHistory.status.has(Status.user_id == str(user.id)))


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_scene_history_list(
    items: List[SceneHistoryBase],
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    user_id = str(user.id)
    await require_existing_ids(db, SceneHistory, field_ids(items, "id"), "id", SceneHistory.status.has(Status.user_id == user_id))
    await require_existing_ids(db, Status, field_ids(items, "status_id"), "status_id", Status.user_id == user_id)
    await require_existing_ids(db, Scene, field_ids(items, "scene_id"), "scene_id")
    await require_existing_ids(
        db,
        TargetStatus,
        field_ids(items, "target_status_id"),
        "target_status_id",
        TargetStatus.status.has(Status.user_id == user_id),
    )
    return await upsert_items(db, items, SCENE_HISTORY_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_scene_history_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    await delete_owned_items(db, SCENE_HISTORY_CRUD_SPEC, ids, SceneHistory.status.has(Status.user_id == str(user.id)))
    return None
