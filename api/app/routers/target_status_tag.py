from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Status, Tag, TargetStatus, TargetStatusTag
from models import GetListRequestBase, GetListResponseBase, TargetStatusTagBase, UpsertResponseBase
from routers.game_utils import delete_owned_items, field_ids, require_existing_ids
from user_auth.routes import get_db
from user_auth.utils.auth_wrapper import require_roles
from utils.crud_helpers import CrudSpec, get_list_response, upsert_items

router = APIRouter(prefix="/target_status_tag", tags=["target_status_tag"])


TARGET_STATUS_TAG_CRUD_SPEC = CrudSpec(model=TargetStatusTag, schema=TargetStatusTagBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_target_status_tag_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await get_list_response(
        db,
        request,
        TARGET_STATUS_TAG_CRUD_SPEC,
        TargetStatusTag.target_status.has(TargetStatus.status.has(Status.user_id == str(user.id))),
    )


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_target_status_tag_list(
    items: List[TargetStatusTagBase],
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    user_id = str(user.id)
    await require_existing_ids(
        db,
        TargetStatusTag,
        field_ids(items, "id"),
        "id",
        TargetStatusTag.target_status.has(TargetStatus.status.has(Status.user_id == user_id)),
    )
    await require_existing_ids(
        db,
        TargetStatus,
        field_ids(items, "target_status_id"),
        "target_status_id",
        TargetStatus.status.has(Status.user_id == user_id),
    )
    await require_existing_ids(db, Tag, field_ids(items, "tag_id"), "tag_id")
    return await upsert_items(db, items, TARGET_STATUS_TAG_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_target_status_tag_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    await delete_owned_items(
        db,
        TARGET_STATUS_TAG_CRUD_SPEC,
        ids,
        TargetStatusTag.target_status.has(TargetStatus.status.has(Status.user_id == str(user.id))),
    )
    return None
