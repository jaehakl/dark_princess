from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import SceneDecision, SceneHistory, SceneOption, Status
from models import GetListRequestBase, GetListResponseBase, SceneDecisionBase, UpsertResponseBase
from routers.game_utils import delete_owned_items, field_ids, require_existing_ids
from user_auth.routes import get_db
from user_auth.utils.auth_wrapper import require_roles
from utils.crud_helpers import CrudSpec, get_list_response, upsert_items

router = APIRouter(prefix="/scene_decision", tags=["scene_decision"])


SCENE_DECISION_CRUD_SPEC = CrudSpec(model=SceneDecision, schema=SceneDecisionBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_scene_decision_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await get_list_response(
        db,
        request,
        SCENE_DECISION_CRUD_SPEC,
        SceneDecision.scene_history.has(SceneHistory.status.has(Status.user_id == str(user.id))),
    )


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_scene_decision_list(
    items: List[SceneDecisionBase],
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    user_id = str(user.id)
    await require_existing_ids(
        db,
        SceneDecision,
        field_ids(items, "id"),
        "id",
        SceneDecision.scene_history.has(SceneHistory.status.has(Status.user_id == user_id)),
    )
    await require_existing_ids(
        db,
        SceneHistory,
        field_ids(items, "scene_history_id"),
        "scene_history_id",
        SceneHistory.status.has(Status.user_id == user_id),
    )
    await require_existing_ids(db, SceneOption, field_ids(items, "option_id"), "option_id")
    return await upsert_items(db, items, SCENE_DECISION_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_scene_decision_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    await delete_owned_items(
        db,
        SCENE_DECISION_CRUD_SPEC,
        ids,
        SceneDecision.scene_history.has(SceneHistory.status.has(Status.user_id == str(user.id))),
    )
    return None
