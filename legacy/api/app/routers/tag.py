from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Tag
from models import GetListRequestBase, GetListResponseBase, TagBase, UpsertResponseBase
from db import get_db
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items

router = APIRouter(prefix="/tag", tags=["tag"])


TAG_CRUD_SPEC = CrudSpec(model=Tag, schema=TagBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_tag_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, TAG_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_tag_list(
    items: List[TagBase],
    db: AsyncSession = Depends(get_db),
):
    return await upsert_items(db, items, TAG_CRUD_SPEC)


@router.delete("/", status_code=200)
async def api_delete_tag_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, TAG_CRUD_SPEC, ids)
    return None
