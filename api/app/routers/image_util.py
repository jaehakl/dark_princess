from typing import List

from fastapi import APIRouter, Body, Depends, File, Form, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import (
    GenerateScenePromptRequestBase,
    GenerateScenePromptResponseBase,
    ImageGenerationSettingsBase,
    ImagePromptExtractionResponseBase,
    RecommendPromptItemBase,
)
from service.image_util import (
    WD14_DEFAULT_CHARACTER_THRESHOLD,
    WD14_DEFAULT_GENERAL_THRESHOLD,
    extract_prompt_from_image,
    generate_prompt,
    get_default_image_generation_settings,
    postprocess_image,
    read_image_upload,
    recommend_prompt,
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
    image_bytes = await read_image_upload(image)
    return await extract_prompt_from_image(
        image_bytes,
        general_threshold=general_threshold,
        character_threshold=character_threshold,
    )


@router.post("/postprocess")
async def api_postprocess_image(
    image: UploadFile | None = File(default=None),
    operation: str = Form(...),
    parameters: str = Form(default="{}"),
):
    image_bytes = await read_image_upload(image)
    output_bytes, media_type = postprocess_image(image_bytes, operation, parameters)
    return Response(content=output_bytes, media_type=media_type)
