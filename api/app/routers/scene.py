from typing import List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import (
    GetListRequestBase,
    GetListResponseBase,
    SceneBase,
    UpdateSceneFirstCutRequestBase,
    UpsertResponseBase,
)
from service.scene import (
    delete_scenes,
    get_scene_list,
    update_scene_first_cut,
    upsert_scenes,
)

router = APIRouter(prefix="/scene", tags=["scene"])


@router.post("/list", response_model=GetListResponseBase)
async def api_get_scene_list(
    request: GetListRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await get_scene_list(db, request)


@router.post("/upsert", response_model=List[UpsertResponseBase])
async def api_upsert_scene_list(
    items: List[SceneBase],
    db: AsyncSession = Depends(get_db),
):
    return await upsert_scenes(db, items)


@router.post("/update-first-cut", response_model=SceneBase)
async def api_update_scene_first_cut(
    request: UpdateSceneFirstCutRequestBase,
    db: AsyncSession = Depends(get_db),
):
    return await update_scene_first_cut(db, request)


@router.delete("/", status_code=200)
async def api_delete_scene_list(
    ids: List[int] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    await delete_scenes(db, ids)
    return None
