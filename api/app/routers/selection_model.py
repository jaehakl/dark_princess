from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from db import SelectionModel, Status, get_db
from models import (
    GenerateSelectionModelRequestBase,
    GetListRequestBase,
    GetListResponseBase,
    SelectionModelBase,
    UpsertResponseBase,
)
from service.selection_model_generation import generate_selection_model
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items

router = APIRouter(prefix="/selection_model", tags=["selection_model"])


SELECTION_MODEL_CRUD_SPEC = CrudSpec(model=SelectionModel, schema=SelectionModelBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_selection_model_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, SELECTION_MODEL_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_selection_model_list(
    items: List[SelectionModelBase],
    db: AsyncSession = Depends(get_db),
):
    return await upsert_items(db, items, SELECTION_MODEL_CRUD_SPEC, cleanup_fields=("file_url",))


@router.post("/generate", response_model=SelectionModelBase)
async def api_generate_selection_model(
    request: GenerateSelectionModelRequestBase,
    db: AsyncSession = Depends(get_db),
):
    selection_model = await generate_selection_model(db, request)
    return SelectionModelBase(
        id=selection_model.id,
        name=selection_model.name,
        file_url=selection_model.file_url,
    )


@router.delete("/", status_code=200)
async def api_delete_selection_model_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    if ids:
        await db.execute(
            update(Status)
            .where(Status.selection_model_id.in_(ids))
            .values(selection_model_id=None)
        )
    await delete_items(db, SELECTION_MODEL_CRUD_SPEC, ids, cleanup_fields=("file_url",))
    return None
