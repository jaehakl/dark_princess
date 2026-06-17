from typing import List

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, get_db
from models import (
    GetListRequestBase,
    GetListResponseBase,
    SceneBase,
    StatusBase,
    UpdateSceneContextRequestBase,
    UpsertResponseBase,
)
from service.scene import (
    generate_scene_from_form,
    get_similar_scenes,
    update_scene_context,
    upsert_scenes,
)
from utils.crud_helpers import CrudSpec, delete_items, get_list_response
from utils.local_storage import public_file_url_from_reference

router = APIRouter(prefix="/scene", tags=["scene"])


SCENE_CRUD_SPEC = CrudSpec(
    model=Scene,
    schema=SceneBase,
    public_url_fields=("image_url", "scribble_url", "pose_url"),
)


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
    return await upsert_scenes(db, items)


@router.post("/generate", response_model=SceneBase)
async def api_generate_scene(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    scene = await generate_scene_from_form(db, await request.form())
    return scene_to_base(scene)


def scene_to_base(scene: Scene) -> SceneBase:
    return SceneBase(
        id=scene.id,
        image_url=public_file_url_from_reference(scene.image_url),
        scribble_url=public_file_url_from_reference(scene.scribble_url),
        pose_url=public_file_url_from_reference(scene.pose_url),
        script=scene.script,
        status_change=scene.status_change,
        background=scene.background,
        subject=scene.subject,
        object=scene.object,
        action=scene.action,
        detail=scene.detail,
    )


@router.post("/similar", response_model=List[SceneBase])
async def api_get_similar_scenes(
    text: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    scenes = await get_similar_scenes(db, text)
    return [scene_to_base(scene) for scene in scenes]


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
    await delete_items(db, SCENE_CRUD_SPEC, ids, cleanup_fields=("image_url", "scribble_url", "pose_url"))
    return None
