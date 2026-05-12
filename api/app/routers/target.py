from typing import List

from fastapi import APIRouter, Body, Depends, Request as FastAPIRequest
from sqlalchemy.ext.asyncio import AsyncSession

from db import Target
from models import GetListRequestBase, GetListResponseBase, TargetBase, UpsertResponseBase
from db import get_db
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items
from utils.upsert_form import preserve_existing_upload_fields, upsert_form_item

router = APIRouter(prefix="/target", tags=["target"])


TARGET_CRUD_SPEC = CrudSpec(model=Target, schema=TargetBase, public_url_fields=("image",))


@router.post("/list", response_model=GetListResponseBase)
async def api_get_target_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, TARGET_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_target_list(
    items: List[TargetBase],
    db: AsyncSession = Depends(get_db),
):
    sanitized_items = await preserve_existing_upload_fields(db, items, TARGET_CRUD_SPEC, ("image",))
    return await upsert_items(db, sanitized_items, TARGET_CRUD_SPEC)


@router.post("/upsert-form", response_model=UpsertResponseBase)
async def api_upsert_target_form(
    request: FastAPIRequest,
    db: AsyncSession = Depends(get_db),
):
    return await upsert_form_item(request, db, TARGET_CRUD_SPEC, {"image": "image"})


@router.delete("/", status_code=200)
async def api_delete_target_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, TARGET_CRUD_SPEC, ids, ("image",))
    return None
