from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Status, StatusTag, Tag
from models import GetListRequestBase, GetListResponseBase, StatusTagBase, UpsertResponseBase
from routers.game_utils import delete_owned_items, field_ids, require_existing_ids
from user_auth.routes import get_db
from user_auth.utils.auth_wrapper import require_roles
from utils.crud_helpers import CrudSpec, get_list_response, upsert_items

router = APIRouter(prefix="/status_tag", tags=["status_tag"])


STATUS_TAG_CRUD_SPEC = CrudSpec(model=StatusTag, schema=StatusTagBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_status_tag_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await get_list_response(db, request, STATUS_TAG_CRUD_SPEC, StatusTag.status.has(Status.user_id == str(user.id)))


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_status_tag_list(
    items: List[StatusTagBase],
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    user_id = str(user.id)
    await require_existing_ids(db, StatusTag, field_ids(items, "id"), "id", StatusTag.status.has(Status.user_id == user_id))
    await require_existing_ids(db, Status, field_ids(items, "status_id"), "status_id", Status.user_id == user_id)
    await require_existing_ids(db, Tag, field_ids(items, "tag_id"), "tag_id")
    return await upsert_items(db, items, STATUS_TAG_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_status_tag_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    await delete_owned_items(db, STATUS_TAG_CRUD_SPEC, ids, StatusTag.status.has(Status.user_id == str(user.id)))
    return None
