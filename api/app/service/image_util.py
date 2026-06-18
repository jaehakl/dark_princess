from io import BytesIO
from math import isfinite
from pathlib import Path

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene
from models import ImageGenerationSettingsBase, ImagePromptExtractionResponseBase, RecommendPromptItemBase
from settings import API_ROOT, settings
from service.image_util_constants import (
    GEN_IMAGE_ALLOWED_SAMPLERS,
    GEN_IMAGE_ALLOWED_SCHEDULERS,
    GEN_IMAGE_CAMERA_SAMPLES,
    GEN_IMAGE_CFG,
    GEN_IMAGE_CLIP_SKIP,
    GEN_IMAGE_HEIGHT,
    GEN_IMAGE_MODEL_FILE_EXTENSIONS,
    GEN_IMAGE_NEGATIVE_PROMPT,
    GEN_IMAGE_POSE_GUIDANCE_END,
    GEN_IMAGE_POSE_GUIDANCE_START,
    GEN_IMAGE_POSE_SCALE,
    GEN_IMAGE_POSITIVE_BASE,
    GEN_IMAGE_SAMPLER,
    GEN_IMAGE_SCHEDULER,
    GEN_IMAGE_SCRIBBLE_GUIDANCE_END,
    GEN_IMAGE_SCRIBBLE_GUIDANCE_START,
    GEN_IMAGE_SCRIBBLE_SCALE,
    GEN_IMAGE_STEPS,
    GEN_IMAGE_STRENGTH,
    GEN_IMAGE_WIDTH,
    RECOMMEND_PROMPT_DISTANCE_EPSILON,
    SCENE_PROMPT_FIELDS,
    WD14_DEFAULT_CHARACTER_THRESHOLD,
    WD14_DEFAULT_GENERAL_THRESHOLD,
    WD14_TAGGER_MODEL_ID,
)
from service.selection_model import cosine_distance
from model_runtime import (
    encode_scene_text,
    extract_visual_keywords,
    get_available_cuda_device_ids,
    predict_wd14_tags,
    translate_korean_to_english,
    translate_visual_keywords_to_english,
)
from utils.vector import VECTOR_DIMENSION, validate_embedding


async def extract_prompt_from_image(
    image_bytes: bytes,
    *,
    general_threshold: float = WD14_DEFAULT_GENERAL_THRESHOLD,
    character_threshold: float = WD14_DEFAULT_CHARACTER_THRESHOLD,
) -> ImagePromptExtractionResponseBase:
    validate_wd14_threshold(general_threshold, "general_threshold")
    validate_wd14_threshold(character_threshold, "character_threshold")

    try:
        with Image.open(BytesIO(image_bytes)) as opened_image:
            image = opened_image.copy()
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image is not a supported image") from exc
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image could not be read") from exc

    tags = await predict_wd14_tags(
        WD14_TAGGER_MODEL_ID,
        image,
        general_threshold=general_threshold,
        character_threshold=character_threshold,
    )
    selected_tags = sorted(
        [*tags["general_tags"].items(), *tags["character_tags"].items()],
        key=lambda item: item[1],
        reverse=True,
    )
    return ImagePromptExtractionResponseBase(
        model=WD14_TAGGER_MODEL_ID,
        prompt=", ".join(tag for tag, _score in selected_tags),
        general_tags=tags["general_tags"],
        character_tags=tags["character_tags"],
        rating_tags=tags["rating_tags"],
        thresholds={
            "general": general_threshold,
            "character": character_threshold,
        },
    )


def validate_wd14_threshold(value: float, name: str) -> None:
    if not isfinite(value) or value < 0 or value > 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{name} must be between 0 and 1")


async def translate_comma_texts(texts: list[str]) -> list[str]:
    if not texts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="texts are required")

    translated_items: list[str] = []
    for text in texts:
        trimmed_text = text.strip()
        if not trimmed_text:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text item is required")

        parts = [part.strip() for part in trimmed_text.split(",") if part.strip()]
        if not parts:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text item must include comma text")

        translated_parts = []
        for part in parts:
            translated_parts.append(await translate_korean_to_english(part))
        translated_items.append(", ".join(translated_parts))

    return translated_items


async def recommend_prompt(db: AsyncSession, text: str) -> list[RecommendPromptItemBase]:
    prompt_text = text.strip()
    if not prompt_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")

    model_name = settings.SCENE_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene embedding model name is required",
        )

    text_embedding = await encode_scene_text(model_name, f"query: {prompt_text}")
    if len(text_embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"scene embedding model must return {VECTOR_DIMENSION} dimensions",
        )

    scenes = (await db.execute(select(Scene))).scalars().all()
    score_sums: dict[str, float] = {}
    frequencies: dict[str, int] = {}
    for scene in scenes:
        try:
            scene_embedding = validate_embedding(scene.embedding, "scene.embedding")
        except HTTPException:
            continue

        distance = cosine_distance(text_embedding, scene_embedding)
        if distance is None:
            continue

        scene_weight = 1 / (distance + RECOMMEND_PROMPT_DISTANCE_EPSILON)
        for field in SCENE_PROMPT_FIELDS:
            column_text = getattr(scene, field)
            if not isinstance(column_text, str):
                continue

            for raw_word in column_text.split(","):
                word = raw_word.strip()
                if not word:
                    continue
                score_sums[word] = score_sums.get(word, 0.0) + scene_weight
                frequencies[word] = frequencies.get(word, 0) + 1

    return [
        RecommendPromptItemBase(word=word, score=score_sums[word] / frequencies[word])
        for word in sorted(
            score_sums,
            key=lambda item: (-(score_sums[item] / frequencies[item]), item),
        )
    ]


async def generate_prompt(
    text: str,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> str:
    print("[generate_prompt] start", flush=True)
    print(
        f"[generate_prompt] options max_tokens={max_tokens!r} temperature={temperature!r}",
        flush=True,
    )
    print(f"[generate_prompt] source_text={text!r}", flush=True)
    try:
        korean_keywords = await extract_visual_keywords(
            text,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except HTTPException as exc:
        print(
            f"[generate_prompt] extract_keywords failed status={exc.status_code} detail={exc.detail!r}",
            flush=True,
        )
        raise
    print(f"[generate_prompt] korean_keywords={korean_keywords!r}", flush=True)

    try:
        english_keywords = await translate_visual_keywords_to_english(
            korean_keywords,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except HTTPException as exc:
        print(
            f"[generate_prompt] translate_keywords failed status={exc.status_code} detail={exc.detail!r}",
            flush=True,
        )
        raise
    print(f"[generate_prompt] english_keywords={english_keywords!r}", flush=True)

    prompt_keywords = [
        keyword.strip()
        for keyword_list in english_keywords.values()
        for keyword in keyword_list
        if isinstance(keyword, str) and keyword.strip()
    ]
    prompt = ", ".join(prompt_keywords)
    print(f"[generate_prompt] prompt_keywords={prompt_keywords!r}", flush=True)
    print(f"[generate_prompt] prompt={prompt!r}", flush=True)
    return prompt


def get_default_image_generation_settings() -> ImageGenerationSettingsBase:
    model_path = _get_configured_stable_diffusion_model_path(required=False)
    model_filename = model_path.name if model_path is not None else ""
    model_filenames = _get_stable_diffusion_model_filenames(model_path)
    return ImageGenerationSettingsBase(
        model_filename=model_filename,
        model_filenames=model_filenames,
        available_gpu_ids=get_available_cuda_device_ids(),
        camera_samples=GEN_IMAGE_CAMERA_SAMPLES,
        prompt_default_positive=GEN_IMAGE_POSITIVE_BASE,
        prompt_default_negative=GEN_IMAGE_NEGATIVE_PROMPT,
        steps=GEN_IMAGE_STEPS,
        cfg=GEN_IMAGE_CFG,
        strength=GEN_IMAGE_STRENGTH,
        sampler=GEN_IMAGE_SAMPLER,
        scheduler=GEN_IMAGE_SCHEDULER,
        clip_skip=GEN_IMAGE_CLIP_SKIP,
        height=GEN_IMAGE_HEIGHT,
        width=GEN_IMAGE_WIDTH,
        scribble_scale=GEN_IMAGE_SCRIBBLE_SCALE,
        scribble_guidance_start=GEN_IMAGE_SCRIBBLE_GUIDANCE_START,
        scribble_guidance_end=GEN_IMAGE_SCRIBBLE_GUIDANCE_END,
        pose_scale=GEN_IMAGE_POSE_SCALE,
        pose_guidance_start=GEN_IMAGE_POSE_GUIDANCE_START,
        pose_guidance_end=GEN_IMAGE_POSE_GUIDANCE_END,
    )


def resolve_image_generation_settings(
    image_settings: ImageGenerationSettingsBase | None,
) -> ImageGenerationSettingsBase:
    defaults = get_default_image_generation_settings()
    if image_settings is None:
        return _validate_image_generation_settings(defaults)

    resolved = ImageGenerationSettingsBase(
        model_filename=defaults.model_filename if image_settings.model_filename is None else image_settings.model_filename,
        model_filenames=defaults.model_filenames,
        available_gpu_ids=defaults.available_gpu_ids,
        prompt_default_positive=(
            defaults.prompt_default_positive
            if image_settings.prompt_default_positive is None
            else image_settings.prompt_default_positive
        ),
        prompt_default_negative=(
            defaults.prompt_default_negative
            if image_settings.prompt_default_negative is None
            else image_settings.prompt_default_negative
        ),
        steps=defaults.steps if image_settings.steps is None else image_settings.steps,
        cfg=defaults.cfg if image_settings.cfg is None else image_settings.cfg,
        strength=defaults.strength if image_settings.strength is None else image_settings.strength,
        sampler=defaults.sampler if image_settings.sampler is None else image_settings.sampler,
        scheduler=defaults.scheduler if image_settings.scheduler is None else image_settings.scheduler,
        clip_skip=defaults.clip_skip if image_settings.clip_skip is None else image_settings.clip_skip,
        height=defaults.height if image_settings.height is None else image_settings.height,
        width=defaults.width if image_settings.width is None else image_settings.width,
        scribble_scale=(
            defaults.scribble_scale
            if image_settings.scribble_scale is None
            else image_settings.scribble_scale
        ),
        scribble_guidance_start=(
            defaults.scribble_guidance_start
            if image_settings.scribble_guidance_start is None
            else image_settings.scribble_guidance_start
        ),
        scribble_guidance_end=(
            defaults.scribble_guidance_end
            if image_settings.scribble_guidance_end is None
            else image_settings.scribble_guidance_end
        ),
        pose_scale=(
            defaults.pose_scale
            if image_settings.pose_scale is None
            else image_settings.pose_scale
        ),
        pose_guidance_start=(
            defaults.pose_guidance_start
            if image_settings.pose_guidance_start is None
            else image_settings.pose_guidance_start
        ),
        pose_guidance_end=(
            defaults.pose_guidance_end
            if image_settings.pose_guidance_end is None
            else image_settings.pose_guidance_end
        ),
    )
    return _validate_image_generation_settings(resolved)


def _validate_image_generation_settings(
    image_settings: ImageGenerationSettingsBase,
) -> ImageGenerationSettingsBase:
    steps = image_settings.steps
    cfg = image_settings.cfg
    strength = image_settings.strength
    height = image_settings.height
    width = image_settings.width
    clip_skip = image_settings.clip_skip
    scribble_scale = image_settings.scribble_scale
    scribble_guidance_start = image_settings.scribble_guidance_start
    scribble_guidance_end = image_settings.scribble_guidance_end
    pose_scale = image_settings.pose_scale
    pose_guidance_start = image_settings.pose_guidance_start
    pose_guidance_end = image_settings.pose_guidance_end
    sampler = (image_settings.sampler or "").strip().lower()
    scheduler = (image_settings.scheduler or "").strip().lower()

    if steps is None or steps < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image steps must be 1 or greater")
    if cfg is None or cfg <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image cfg must be greater than 0")
    if strength is None or strength <= 0 or strength > 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image strength must be greater than 0 and at most 1")
    if height is None or height <= 0 or height % 8 != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image height must be a positive multiple of 8",
        )
    if width is None or width <= 0 or width % 8 != 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image width must be a positive multiple of 8",
        )
    if clip_skip is not None and clip_skip < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image clip_skip must be null or 1 or greater")
    if sampler not in GEN_IMAGE_ALLOWED_SAMPLERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported image sampler")
    if scheduler not in GEN_IMAGE_ALLOWED_SCHEDULERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported image scheduler")
    if scribble_scale is None or scribble_scale < 0 or scribble_scale > 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scribble scale must be between 0 and 2",
        )
    if scribble_guidance_start is None or scribble_guidance_start < 0 or scribble_guidance_start > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scribble guidance start must be between 0 and 1",
        )
    if scribble_guidance_end is None or scribble_guidance_end < 0 or scribble_guidance_end > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scribble guidance end must be between 0 and 1",
        )
    if scribble_guidance_end < scribble_guidance_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scribble guidance end must be greater than or equal to start",
        )
    if pose_scale is None or pose_scale < 0 or pose_scale > 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pose scale must be between 0 and 2",
        )
    if pose_guidance_start is None or pose_guidance_start < 0 or pose_guidance_start > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pose guidance start must be between 0 and 1",
        )
    if pose_guidance_end is None or pose_guidance_end < 0 or pose_guidance_end > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pose guidance end must be between 0 and 1",
        )
    if pose_guidance_end < pose_guidance_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="pose guidance end must be greater than or equal to start",
        )

    return ImageGenerationSettingsBase(
        model_filename=(image_settings.model_filename or "").strip(),
        model_filenames=image_settings.model_filenames or [],
        available_gpu_ids=image_settings.available_gpu_ids or [],
        prompt_default_positive=(image_settings.prompt_default_positive or "").strip(),
        prompt_default_negative=(image_settings.prompt_default_negative or "").strip(),
        steps=steps,
        cfg=cfg,
        strength=strength,
        sampler=sampler,
        scheduler=scheduler,
        clip_skip=clip_skip,
        height=height,
        width=width,
        scribble_scale=scribble_scale,
        scribble_guidance_start=scribble_guidance_start,
        scribble_guidance_end=scribble_guidance_end,
        pose_scale=pose_scale,
        pose_guidance_start=pose_guidance_start,
        pose_guidance_end=pose_guidance_end,
    )


def resolve_image_generation_model_path(image_settings: ImageGenerationSettingsBase) -> Path:
    model_path = _get_configured_stable_diffusion_model_path(required=True)
    assert model_path is not None
    model_filename = (image_settings.model_filename or model_path.name).strip()
    selected_path = Path(model_filename)

    if (
        not model_filename
        or "/" in model_filename
        or "\\" in model_filename
        or selected_path.is_absolute()
        or selected_path.drive
        or selected_path.name != model_filename
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stable diffusion model filename is invalid",
        )

    model_filenames = set(_get_stable_diffusion_model_filenames(model_path))
    if model_filename not in model_filenames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stable diffusion model filename is not available",
        )

    candidate_path = model_path.parent / model_filename
    try:
        resolved_path = candidate_path.resolve(strict=True)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"stable diffusion model file not found: {candidate_path}",
        ) from exc

    try:
        model_directory = model_path.parent.resolve(strict=True)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"stable diffusion model directory not found: {model_path.parent}",
        ) from exc

    if resolved_path.parent != model_directory or not resolved_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stable diffusion model filename is invalid",
        )
    return resolved_path


def _get_configured_stable_diffusion_model_path(*, required: bool) -> Path | None:
    model_path_value = settings.stable_diffusion_model_path.strip()
    if not model_path_value:
        if required:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="stable diffusion model path is required",
            )
        return None

    model_path = Path(model_path_value).expanduser()
    if not model_path.is_absolute():
        model_path = API_ROOT / model_path
    return model_path


def _get_stable_diffusion_model_filenames(model_path: Path | None) -> list[str]:
    if model_path is None:
        return []

    model_filenames: list[str] = []
    try:
        if model_path.parent.is_dir():
            model_filenames = [
                item.name
                for item in model_path.parent.iterdir()
                if item.is_file() and item.suffix.lower() in GEN_IMAGE_MODEL_FILE_EXTENSIONS
            ]
    except OSError:
        model_filenames = []

    default_filename = model_path.name
    if default_filename and default_filename not in model_filenames:
        model_filenames.append(default_filename)
    return sorted(model_filenames, key=str.lower)
