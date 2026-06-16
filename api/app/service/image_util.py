from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene
from models import ImageGenerationSettingsBase, RecommendPromptItemBase
from settings import settings
from service.selection_model import cosine_distance
from utils.llm import (
    analyze_scene_components,
    extract_visual_keywords,
    translate_korean_to_english,
    translate_visual_keywords_to_english,
)
from utils.model_runtime import encode_scene_text
from utils.vector import VECTOR_DIMENSION, validate_embedding

#GEN_IMAGE_POSITIVE_BASE = "score_7_up, source_anime, cinematic composition,"
#GEN_IMAGE_NEGATIVE_PROMPT = "score_5, score_4, score_3, solo, portrait, character focus, lowres, blurry, low quality, bad anatomy, disfigured, deformed, bad hands, missing fingers, extra fingers, worst quality, jpeg artifacts, signature, watermark, text, bad eyes, grotesque, sketchy, logo, rough, incomplete, disgusting, distorted, deformed face, poorly drawn, bad quality"

GEN_IMAGE_POSITIVE_BASE = "masterpiece, best quality"
GEN_IMAGE_NEGATIVE_PROMPT = "blurry, low quality, bad anatomy, disfigured, deformed, bad hands, missing fingers, extra fingers, worst quality, jpeg artifacts, signature, watermark, text, bad eyes, grotesque, sketchy, logo, rough, incomplete, disgusting, distorted, deformed face, poorly drawn, bad quality"

GEN_IMAGE_STEPS = 30
GEN_IMAGE_CFG = 5
GEN_IMAGE_STRENGTH = 1.0
GEN_IMAGE_CONTROLNET_CONDITIONING_SCALE = 0.6
GEN_IMAGE_CONTROL_GUIDANCE_START = 0.0
GEN_IMAGE_CONTROL_GUIDANCE_END = 1.0
GEN_IMAGE_SAMPLER = "euler_a" #"dpmpp_2m"
GEN_IMAGE_SCHEDULER = "" #"karras"
GEN_IMAGE_CLIP_SKIP: int | None = None #2
GEN_IMAGE_HEIGHT = 832
GEN_IMAGE_WIDTH = 1216
GEN_IMAGE_MAX_CHUNK_SIZE = 1
GEN_IMAGE_OUTPUT_FORMAT = "JPEG"
GEN_IMAGE_OUTPUT_EXTENSION = ".jpg"
GEN_IMAGE_OUTPUT_QUALITY = 85
GEN_IMAGE_SEED_MIN = 0
GEN_IMAGE_SEED_MAX = 1_000_000
RECOMMEND_PROMPT_DISTANCE_EPSILON = 1e-6
GEN_IMAGE_ALLOWED_SAMPLERS = {"", "euler", "euler_a", "dpmpp_2m", "unipc"}
GEN_IMAGE_ALLOWED_SCHEDULERS = {"", "karras"}
SCENE_PROMPT_FIELDS = ("background", "subject", "object", "action", "detail")


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


async def recommend_prompt_columns(db: AsyncSession, text: str) -> dict[str, list[str]]:
    prompt_text = text.strip()
    if not prompt_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")

    model_name = settings.SCENE_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene embedding model name is required",
        )

    components = await analyze_scene_components(prompt_text, SCENE_PROMPT_FIELDS)
    scenes = (await db.execute(select(Scene))).scalars().all()
    recommendations: dict[str, list[str]] = {field: [] for field in SCENE_PROMPT_FIELDS}

    for field in SCENE_PROMPT_FIELDS:
        component_text = components[field].strip()
        if not component_text:
            continue

        component_embedding = await encode_scene_text(model_name, f"query: {component_text}")
        if len(component_embedding) != VECTOR_DIMENSION:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"scene embedding model must return {VECTOR_DIMENSION} dimensions",
            )

        scene_distances = []
        for scene in scenes:
            try:
                scene_embedding = validate_embedding(
                    getattr(scene, f"{field}_embedding"),
                    f"scene.{field}_embedding",
                )
            except HTTPException:
                continue

            distance = cosine_distance(component_embedding, scene_embedding)
            if distance is None:
                continue
            scene_distances.append((scene, distance))

        seen_tags: set[str] = set()
        for scene, _distance in sorted(
            scene_distances,
            key=lambda item: (item[1], item[0].id or 0),
        ):
            column_text = getattr(scene, field)
            if not isinstance(column_text, str):
                continue

            for raw_tag in column_text.split(","):
                tag = raw_tag.strip()
                if not tag or tag in seen_tags:
                    continue
                seen_tags.add(tag)
                recommendations[field].append(tag)

    return recommendations


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
    return ImageGenerationSettingsBase(
        positive_base=GEN_IMAGE_POSITIVE_BASE,
        negative_prompt=GEN_IMAGE_NEGATIVE_PROMPT,
        steps=GEN_IMAGE_STEPS,
        cfg=GEN_IMAGE_CFG,
        strength=GEN_IMAGE_STRENGTH,
        sampler=GEN_IMAGE_SAMPLER,
        scheduler=GEN_IMAGE_SCHEDULER,
        clip_skip=GEN_IMAGE_CLIP_SKIP,
        height=GEN_IMAGE_HEIGHT,
        width=GEN_IMAGE_WIDTH,
        controlnet_conditioning_scale=GEN_IMAGE_CONTROLNET_CONDITIONING_SCALE,
        control_guidance_start=GEN_IMAGE_CONTROL_GUIDANCE_START,
        control_guidance_end=GEN_IMAGE_CONTROL_GUIDANCE_END,
    )


def resolve_image_generation_settings(
    image_settings: ImageGenerationSettingsBase | None,
) -> ImageGenerationSettingsBase:
    defaults = get_default_image_generation_settings()
    if image_settings is None:
        return _validate_image_generation_settings(defaults)

    resolved = ImageGenerationSettingsBase(
        positive_base=defaults.positive_base if image_settings.positive_base is None else image_settings.positive_base,
        negative_prompt=defaults.negative_prompt if image_settings.negative_prompt is None else image_settings.negative_prompt,
        steps=defaults.steps if image_settings.steps is None else image_settings.steps,
        cfg=defaults.cfg if image_settings.cfg is None else image_settings.cfg,
        strength=defaults.strength if image_settings.strength is None else image_settings.strength,
        sampler=defaults.sampler if image_settings.sampler is None else image_settings.sampler,
        scheduler=defaults.scheduler if image_settings.scheduler is None else image_settings.scheduler,
        clip_skip=defaults.clip_skip if image_settings.clip_skip is None else image_settings.clip_skip,
        height=defaults.height if image_settings.height is None else image_settings.height,
        width=defaults.width if image_settings.width is None else image_settings.width,
        controlnet_conditioning_scale=(
            defaults.controlnet_conditioning_scale
            if image_settings.controlnet_conditioning_scale is None
            else image_settings.controlnet_conditioning_scale
        ),
        control_guidance_start=(
            defaults.control_guidance_start
            if image_settings.control_guidance_start is None
            else image_settings.control_guidance_start
        ),
        control_guidance_end=(
            defaults.control_guidance_end
            if image_settings.control_guidance_end is None
            else image_settings.control_guidance_end
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
    controlnet_conditioning_scale = image_settings.controlnet_conditioning_scale
    control_guidance_start = image_settings.control_guidance_start
    control_guidance_end = image_settings.control_guidance_end
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
    if (
        controlnet_conditioning_scale is None
        or controlnet_conditioning_scale < 0
        or controlnet_conditioning_scale > 2
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="controlnet conditioning scale must be between 0 and 2",
        )
    if control_guidance_start is None or control_guidance_start < 0 or control_guidance_start > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="control guidance start must be between 0 and 1",
        )
    if control_guidance_end is None or control_guidance_end < 0 or control_guidance_end > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="control guidance end must be between 0 and 1",
        )
    if control_guidance_end < control_guidance_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="control guidance end must be greater than or equal to start",
        )

    return ImageGenerationSettingsBase(
        positive_base=(image_settings.positive_base or "").strip(),
        negative_prompt=(image_settings.negative_prompt or "").strip(),
        steps=steps,
        cfg=cfg,
        strength=strength,
        sampler=sampler,
        scheduler=scheduler,
        clip_skip=clip_skip,
        height=height,
        width=width,
        controlnet_conditioning_scale=controlnet_conditioning_scale,
        control_guidance_start=control_guidance_start,
        control_guidance_end=control_guidance_end,
    )
