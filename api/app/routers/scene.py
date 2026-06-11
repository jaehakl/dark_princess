from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, get_db
from models import (
    GenerateSceneRequestBase,
    GetListRequestBase,
    GetListResponseBase,
    SceneBase,
    StatusBase,
    UpdateSceneContextRequestBase,
    UpsertResponseBase,
)
from service.scene import generate_scene, update_scene_context
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items

router = APIRouter(prefix="/scene", tags=["scene"])


SCENE_CRUD_SPEC = CrudSpec(model=Scene, schema=SceneBase)


@router.post("/list", response_model=GetListResponseBase)
async def api_get_scene_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_list_response(db, request, SCENE_CRUD_SPEC)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_scene_list(
    items: List[SceneBase],
    db: AsyncSession = Depends(get_db),
):
    return await upsert_items(db, items, SCENE_CRUD_SPEC, cleanup_fields=("image_url",))


@router.post("/generate", response_model=SceneBase)
async def api_generate_scene(
    request: GenerateSceneRequestBase,
    db: AsyncSession = Depends(get_db),
):
    scene = await generate_scene(db, request)
    return SceneBase(
        id=scene.id,
        prompt=scene.prompt,
        image_url=scene.image_url,
        scripts=scene.scripts,
        status_change=scene.status_change,
    )


@router.post("/update-context", response_model=StatusBase)
async def api_update_scene_context(
    request: UpdateSceneContextRequestBase,
    db: AsyncSession = Depends(get_db),
):
    updated_status = await update_scene_context(db, request)
    return StatusBase(
        id=updated_status.id,
        selection_model_id=updated_status.selection_model_id,
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
async def api_delete_scene_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, SCENE_CRUD_SPEC, ids, cleanup_fields=("image_url",))
    return None
