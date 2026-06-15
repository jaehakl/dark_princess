from typing import Dict, List

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import (
    GenerateScenePromptRequestBase,
    GenerateScenePromptResponseBase,
    ImageGenerationSettingsBase,
    RecommendPromptItemBase,
)
from service.image_util import (
    generate_prompt,
    get_default_image_generation_settings,
    recommend_prompt,
    recommend_prompt_columns,
    translate_comma_texts,
)

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
