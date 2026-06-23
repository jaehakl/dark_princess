from typing import List

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from db import Cut, get_db
from models import (
    GetListRequestBase,
    GetListResponseBase,
    CutBase,
    StatusBase,
    UpdateCutContextRequestBase,
    UpdateCutFavoriteRequestBase,
    UpdateCutImageRequestBase,
    UpdateCutLinksRequestBase,
    UpsertResponseBase,
)
from service.cut import (
    generate_cut_from_form,
    get_similar_cuts,
    cut_image_load_option,
    update_cut_context,
    update_cut_favorite,
    update_cut_image,
    update_cut_links,
    upsert_cuts,
)
from utils.crud_helpers import CrudSpec, delete_items, get_list_response
from utils.local_storage import public_file_url_from_reference

router = APIRouter(prefix="/cut", tags=["cut"])


CUT_CRUD_SPEC = CrudSpec(
    model=Cut,
    schema=CutBase,
    public_url_fields=("image_url", "scribble_url", "pose_url"),
    load_options=(cut_image_load_option(),),
)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_cut_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, CUT_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_cut_list(
    items: List[CutBase],
    db: AsyncSession = Depends(get_db),
):
    return await upsert_cuts(db, items)


@router.post("/generate", response_model=CutBase)
async def api_generate_cut(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    cut = await generate_cut_from_form(db, await request.form())
    return cut_to_base(cut)


@router.post("/update-image", response_model=CutBase)
async def api_update_cut_image(
    request: UpdateCutImageRequestBase,
    db: AsyncSession = Depends(get_db),
):
    cut = await update_cut_image(db, request)
    return cut_to_base(cut)


@router.post("/update-favorite", response_model=CutBase)
async def api_update_cut_favorite(
    request: UpdateCutFavoriteRequestBase,
    db: AsyncSession = Depends(get_db),
):
    cut = await update_cut_favorite(db, request)
    return cut_to_base(cut)


@router.post("/update-links", response_model=CutBase)
async def api_update_cut_links(
    request: UpdateCutLinksRequestBase,
    db: AsyncSession = Depends(get_db),
):
    cut = await update_cut_links(db, request)
    return cut_to_base(cut)


def cut_to_base(cut: Cut) -> CutBase:
    return CutBase(
        id=cut.id,
        image_id=cut.image_id,
        scene_id=cut.scene_id,
        prev_cut_id=cut.prev_cut_id,
        image_url=public_file_url_from_reference(cut.image_url),
        scribble_url=public_file_url_from_reference(cut.scribble_url),
        pose_url=public_file_url_from_reference(cut.pose_url),
        favorited=cut.favorited,
        script=cut.script,
        status_change=cut.status_change,
        prompt_situation=cut.prompt_situation,
        prompt_hero=cut.prompt_hero,
        prompt_detail=cut.prompt_detail,
        prompt_camera=cut.prompt_camera,
        prompt_negative=cut.prompt_negative,
    )


@router.post("/similar", response_model=List[CutBase])
async def api_get_similar_cuts(
    text: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    cuts = await get_similar_cuts(db, text)
    return [cut_to_base(cut) for cut in cuts]


@router.post("/update-context", response_model=StatusBase)
async def api_update_cut_context(
    request: UpdateCutContextRequestBase,
    db: AsyncSession = Depends(get_db),
):
    updated_status = await update_cut_context(db, request)
    return StatusBase(
        id=updated_status.id,
        name=updated_status.name,
        turn=updated_status.turn,
        cash=updated_status.cash,
        strength=updated_status.strength,
        agility=updated_status.agility,
        intelligence=updated_status.intelligence,
        sense=updated_status.sense,
        attractiveness=updated_status.attractiveness,
        toughness=updated_status.toughness,
        stress=updated_status.stress,
    )


@router.delete("/", status_code=200)
async def api_delete_cut_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, CUT_CRUD_SPEC, ids)
    return None
