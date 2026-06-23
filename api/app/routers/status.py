from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Status, get_db
from models import GetListRequestBase, GetListResponseBase, StatusBase, UpsertResponseBase
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items

router = APIRouter(prefix="/status", tags=["status"])


STATUS_CRUD_SPEC = CrudSpec(model=Status, schema=StatusBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_status_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, STATUS_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_status_list(
    items: List[StatusBase],
    db: AsyncSession = Depends(get_db),
):
    return await upsert_items(db, items, STATUS_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_status_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, STATUS_CRUD_SPEC, ids)
    return None
