from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Status, Target, TargetStatus
from models import GetListRequestBase, GetListResponseBase, TargetStatusBase, UpsertResponseBase
from routers.game_utils import delete_owned_items, field_ids, require_existing_ids
from user_auth.routes import get_db
from user_auth.utils.auth_wrapper import require_roles
from utils.crud_helpers import CrudSpec, get_list_response, upsert_items

router = APIRouter(prefix="/target_status", tags=["target_status"])


TARGET_STATUS_CRUD_SPEC = CrudSpec(model=TargetStatus, schema=TargetStatusBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_target_status_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await get_list_response(db, request, TARGET_STATUS_CRUD_SPEC, TargetStatus.status.has(Status.user_id == str(user.id)))


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_target_status_list(
    items: List[TargetStatusBase],
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    user_id = str(user.id)
    await require_existing_ids(db, TargetStatus, field_ids(items, "id"), "id", TargetStatus.status.has(Status.user_id == user_id))
    await require_existing_ids(db, Status, field_ids(items, "status_id"), "status_id", Status.user_id == user_id)
    await require_existing_ids(db, Target, field_ids(items, "target_id"), "target_id")
    return await upsert_items(db, items, TARGET_STATUS_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_target_status_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    await delete_owned_items(db, TARGET_STATUS_CRUD_SPEC, ids, TargetStatus.status.has(Status.user_id == str(user.id)))
    return None
