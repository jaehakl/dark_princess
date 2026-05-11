from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Status
from models import GetListRequestBase, GetListResponseBase, StatusBase, UpsertResponseBase
from routers.game_utils import delete_owned_items, field_ids, require_existing_ids
from user_auth.routes import get_db
from user_auth.utils.auth_wrapper import require_roles
from utils.crud_helpers import CrudSpec, get_list_response, upsert_items

router = APIRouter(prefix="/status", tags=["status"])


STATUS_CRUD_SPEC = CrudSpec(model=Status, schema=StatusBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_status_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await get_list_response(db, request, STATUS_CRUD_SPEC, Status.user_id == str(user.id))


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_status_list(
    items: List[StatusBase],
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    user_id = str(user.id)
    await require_existing_ids(db, Status, field_ids(items, "id"), "id", Status.user_id == user_id)
    sanitized_items = [item.model_copy(update={"user_id": user_id}) for item in items]
    return await upsert_items(db, sanitized_items, STATUS_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_status_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    await delete_owned_items(db, STATUS_CRUD_SPEC, ids, Status.user_id == str(user.id))
    return None
