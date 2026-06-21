from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from db import SelectionModel, Status, get_db
from models import (
    AdjustSelectionModelRequestBase,
    GenerateSelectionModelRequestBase,
    GetListRequestBase,
    GetListResponseBase,
    NextCutRequestBase,
    CutBase,
    SelectionModelBase,
    UpsertResponseBase,
)
from service.selection_model import adjust_selection_model, generate_selection_model, get_next_cut
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items
from utils.local_storage import public_file_url_from_reference

router = APIRouter(prefix="/selection_model", tags=["selection_model"])


SELECTION_MODEL_CRUD_SPEC = CrudSpec(
    model=SelectionModel,
    schema=SelectionModelBase,
    public_url_fields=("file_url",),
)


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
    return selection_model_to_base(selection_model)


@router.post("/adjust", response_model=SelectionModelBase)
async def api_adjust_selection_model(
    request: AdjustSelectionModelRequestBase,
    db: AsyncSession = Depends(get_db),
):
    selection_model = await adjust_selection_model(db, request)
    return selection_model_to_base(selection_model)


@router.post("/next", response_model=CutBase)
async def api_get_next_cut(
    request: NextCutRequestBase,
    db: AsyncSession = Depends(get_db),
):
    next_cut = await get_next_cut(
        db,
        cut_id=request.cut_id,
        status_id=request.status_id,
        option_text=request.option_text,
    )
    return cut_to_base(next_cut)


def selection_model_to_base(selection_model: SelectionModel) -> SelectionModelBase:
    return SelectionModelBase(
        id=selection_model.id,
        name=selection_model.name,
        file_url=public_file_url_from_reference(selection_model.file_url),
    )


def cut_to_base(cut) -> CutBase:
    return CutBase(
        id=cut.id,
        image_id=cut.image_id,
        scene_id=cut.scene_id,
        prev_cut_id=cut.prev_cut_id,
        image_url=public_file_url_from_reference(cut.image_url),
        scribble_url=public_file_url_from_reference(cut.scribble_url),
        pose_url=public_file_url_from_reference(cut.pose_url),
        script=cut.script,
        status_change=cut.status_change,
        prompt_situation=cut.prompt_situation,
        prompt_hero=cut.prompt_hero,
        prompt_camera=cut.prompt_camera,
        prompt_detail=cut.prompt_detail,
        prompt_negative=cut.prompt_negative,
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
