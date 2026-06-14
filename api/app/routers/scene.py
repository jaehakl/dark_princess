from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from db import Scene, get_db
from models import (
    GenerateScenePromptRequestBase,
    GenerateScenePromptResponseBase,
    GenerateSceneRequestBase,
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
    generate_scene,
    get_similar_scenes,
    recommend_prompt,
    update_scene_context,
)
from utils.crud_helpers import CrudSpec, delete_items, get_list_response, upsert_items
from utils.local_storage import is_allowed_content_type
from settings import settings

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


@router.get("/image-settings/defaults", response_model=ImageGenerationSettingsBase)
async def api_get_image_settings_defaults():
    return get_default_image_generation_settings()


@router.post("/generate", response_model=SceneBase)
async def api_generate_scene(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    seed_image = None
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        payload = form.get("payload")
        if not isinstance(payload, str) or not payload.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payload is required")
        try:
            generate_request = GenerateSceneRequestBase.model_validate_json(payload)
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc

        upload = form.get("seed_image")
        if isinstance(upload, UploadFile):
            if not is_allowed_content_type(upload.content_type):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="seed_image content type is not allowed",
                )
            seed_image = await upload.read()
            max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
            if not seed_image:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="seed_image is empty")
            if len(seed_image) > max_size_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"seed_image exceeds {settings.MAX_UPLOAD_SIZE_MB} MB",
                )
    else:
        try:
            payload = await request.json()
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid JSON body") from exc
        try:
            generate_request = GenerateSceneRequestBase.model_validate(payload)
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc

    scene = await generate_scene(db, generate_request, seed_image=seed_image)
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
