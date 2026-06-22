from fastapi import APIRouter, File, Form, Response, UploadFile
from models import (
    GenerateImageRequestBase,
    ImageGenerationSettingsBase,
    ImagePromptExtractionResponseBase,
)
from service.image import generate_image_blob
from service.image_util import (
    WD14_DEFAULT_CHARACTER_THRESHOLD,
    WD14_DEFAULT_GENERAL_THRESHOLD,
    extract_prompt_from_image,
    get_default_image_generation_settings,
    postprocess_image,
    read_image_upload,
)

router = APIRouter(prefix="/image-util", tags=["image-util"])


@router.get("/image-settings/defaults", response_model=ImageGenerationSettingsBase)
async def api_get_image_settings_defaults():
    return get_default_image_generation_settings()


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


@router.post("/generate-image")
async def api_generate_image_blob(
    request: GenerateImageRequestBase,
):
    image_bytes, media_type, seed = await generate_image_blob(request)
    headers = {}
    if seed is not None:
        headers["X-Image-Seed"] = str(seed)
    return Response(content=image_bytes, media_type=media_type, headers=headers)
