from typing import Dict, List

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, get_db
from models import (
    GenerateScenePromptRequestBase,
    GenerateScenePromptResponseBase,
    GetListRequestBase,
    GetListResponseBase,
    ImageGenerationSettingsBase,
    RecommendPromptItemBase,
    SceneBase,
    StatusBase,
    UpdateSceneContextRequestBase,
    UpsertResponseBase,
)
from service.scene import (
    get_default_image_generation_settings,
    generate_prompt,
    generate_scene_from_form,
    get_similar_scenes,
    recommend_prompt,
    recommend_prompt_columns,
    update_scene_context,
    upsert_scenes,
)
from utils.crud_helpers import CrudSpec, delete_items, get_list_response

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
    return await upsert_scenes(db, items)


@router.get("/image-settings/defaults", response_model=ImageGenerationSettingsBase)
async def api_get_image_settings_defaults():
    return get_default_image_generation_settings()


@router.post("/generate", response_model=SceneBase)
async def api_generate_scene(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    scene = await generate_scene_from_form(db, await request.form())
    return SceneBase(
        id=scene.id,
        prompt=scene.prompt,
        image_url=scene.image_url,
        script=scene.script,
        status_change=scene.status_change,
        background=scene.background,
        subject=scene.subject,
        object=scene.object,
        action=scene.action,
        detail=scene.detail,
    )


@router.post("/recommend-prompt", response_model=List[RecommendPromptItemBase])
async def api_recommend_prompt(
    text: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    return await recommend_prompt(db, text)


@router.post("/recommend-prompt-columns", response_model=Dict[str, List[str]])
async def api_recommend_prompt_columns(
    text: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    return await recommend_prompt_columns(db, text)


@router.post("/similar", response_model=List[SceneBase])
async def api_get_similar_scenes(
    text: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    scenes = await get_similar_scenes(db, text)
    return [
        SceneBase(
            id=scene.id,
            prompt=scene.prompt,
            image_url=scene.image_url,
            script=scene.script,
            status_change=scene.status_change,
            background=scene.background,
            subject=scene.subject,
            object=scene.object,
            action=scene.action,
            detail=scene.detail,
        )
        for scene in scenes
    ]


@router.post("/generate-prompt", response_model=GenerateScenePromptResponseBase)
async def api_generate_prompt(
    request: GenerateScenePromptRequestBase,
):
    return GenerateScenePromptResponseBase(
        prompt=await generate_prompt(
            request.text,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        ),
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
