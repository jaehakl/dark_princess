from typing import Dict, List

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import (
    GenerateScenePromptRequestBase,
    GenerateScenePromptResponseBase,
    ImageGenerationSettingsBase,
    ImagePromptExtractionResponseBase,
    RecommendPromptItemBase,
)
from settings import settings
from service.image_util import (
    WD14_DEFAULT_CHARACTER_THRESHOLD,
    WD14_DEFAULT_GENERAL_THRESHOLD,
    extract_prompt_from_image,
    generate_prompt,
    get_default_image_generation_settings,
    recommend_prompt,
    recommend_prompt_columns,
    translate_comma_texts,
)
from utils.local_storage import is_allowed_content_type

router = APIRouter(prefix="/image-util", tags=["image-util"])


@router.get("/image-settings/defaults", response_model=ImageGenerationSettingsBase)
async def api_get_image_settings_defaults():
    return get_default_image_generation_settings()


@router.post("/translate-comma-texts", response_model=List[str])
async def api_translate_comma_texts(
    texts: List[str] = Body(...),
):
    return await translate_comma_texts(texts)


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


@router.post("/extract-prompt", response_model=ImagePromptExtractionResponseBase)
async def api_extract_prompt(
    image: UploadFile | None = File(default=None),
    general_threshold: float = Form(default=WD14_DEFAULT_GENERAL_THRESHOLD),
    character_threshold: float = Form(default=WD14_DEFAULT_CHARACTER_THRESHOLD),
):
    image_bytes = await read_extract_prompt_image(image)
    return await extract_prompt_from_image(
        image_bytes,
        general_threshold=general_threshold,
        character_threshold=character_threshold,
    )


async def read_extract_prompt_image(upload: UploadFile | None) -> bytes:
    if upload is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image is required")
    if not is_allowed_content_type(upload.content_type):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image content type is not allowed")

    image = await upload.read()
    max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if not image:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image is empty")
    if len(image) > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"image exceeds {settings.MAX_UPLOAD_SIZE_MB} MB",
        )
    return image
