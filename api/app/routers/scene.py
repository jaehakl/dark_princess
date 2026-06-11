from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, get_db
from models import (
    GenerateSceneRequestBase,
    GetListRequestBase,
    GetListResponseBase,
    NextSceneRequestBase,
    SceneBase,
    UpsertResponseBase,
)
from service.next_scene import get_next_scene
from service.scene_generation import generate_scene
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


@router.post("/next", response_model=SceneBase)
async def api_get_next_scene(
    request: NextSceneRequestBase,
    db: AsyncSession = Depends(get_db),
):
    next_scene = await get_next_scene(
        db,
        scene_id=request.scene_id,
        status_id=request.status_id,
        scene_option_id=request.scene_option_id,
    )
    return SceneBase(
        id=next_scene.id,
        prompt=next_scene.prompt,
        image_url=next_scene.image_url,
        scripts=next_scene.scripts,
        status_change=next_scene.status_change,
    )


@router.delete("/", status_code=200)
async def api_delete_scene_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_items(db, SCENE_CRUD_SPEC, ids, cleanup_fields=("image_url",))
    return None
