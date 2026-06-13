from __future__ import annotations

import asyncio
import random
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, Status
from models import GenerateSceneRequestBase, RecommendPromptItemBase, UpdateSceneContextRequestBase
from settings import API_ROOT, settings
from service.selection_model import cosine_distance
from utils.llm import (
    extract_visual_keywords,
    generate_scene_script as generate_script_from_llm,
    translate_visual_keywords_to_english,
)
from utils.local_storage import build_object_key, delete_object, object_key_from_public_url, public_file_url, upload_fileobj
from utils.model_runtime import encode_scene_text, generate_images_batch
from utils.vector import VECTOR_DIMENSION, validate_embedding

GEN_IMAGE_POSITIVE_BASE = "score_7_up, source_anime, cinematic composition,"
GEN_IMAGE_NEGATIVE_PROMPT = "score_5, score_4, score_3, solo, portrait, character focus, lowres, blurry, low quality, bad anatomy, disfigured, deformed, bad hands, missing fingers, extra fingers, worst quality, jpeg artifacts, signature, watermark, text, bad eyes, grotesque, sketchy, logo, rough, incomplete, disgusting, distorted, deformed face, poorly drawn, bad quality"

#GEN_IMAGE_POSITIVE_BASE = "masterpiece, best quality"
#GEN_IMAGE_NEGATIVE_PROMPT = "blurry, low quality, bad anatomy, disfigured, deformed, bad hands, missing fingers, extra fingers, worst quality, jpeg artifacts, signature, watermark, text, bad eyes, grotesque, sketchy, logo, rough, incomplete, disgusting, distorted, deformed face, poorly drawn, bad quality"

GEN_IMAGE_STEPS = 30
GEN_IMAGE_CFG = 7
GEN_IMAGE_SAMPLER = "dpmpp_2m" #"euler_a"
GEN_IMAGE_SCHEDULER = "karras"
GEN_IMAGE_CLIP_SKIP: int | None = None
GEN_IMAGE_HEIGHT = 1216
GEN_IMAGE_WIDTH = 832
GEN_IMAGE_MAX_CHUNK_SIZE = 1
GEN_IMAGE_OUTPUT_FORMAT = "JPEG"
GEN_IMAGE_OUTPUT_EXTENSION = ".jpg"
GEN_IMAGE_OUTPUT_QUALITY = 85
GEN_IMAGE_SEED_MIN = 0
GEN_IMAGE_SEED_MAX = 1_000_000
RECOMMEND_PROMPT_DISTANCE_EPSILON = 1e-6


async def generate_scene(
    db: AsyncSession,
    request: GenerateSceneRequestBase,
) -> Scene:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scene prompt is required")
    if request.scene_id is None and not request.generate_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="new scene requires image generation",
        )

    scene = None
    old_image_url = None
    image_url = None
    image_key = None
    if request.scene_id is not None:
        scene = await db.get(Scene, request.scene_id)
        if scene is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")
        old_image_url = scene.image_url

    script = normalize_scene_script(request.script)
    embedding = await make_scene_embedding(prompt, script)
    if request.generate_image:
        image_url, image_key = await generate_scene_image(prompt)

    try:
        if scene is None:
            scene = Scene()
            db.add(scene)

        scene.prompt = prompt
        scene.script = script
        scene.status_change = request.status_change
        scene.embedding = embedding
        if image_url is not None:
            scene.image_url = image_url
        await db.commit()
        await db.refresh(scene)
    except Exception:
        await db.rollback()
        if image_key is not None:
            delete_object(image_key)
        raise

    if image_url is not None:
        await cleanup_old_scene_image(db, old_image_url, image_url)
    return scene


async def make_scene_embedding(prompt: str, script: str) -> list[float]:
    embedding_input = build_scene_embedding_input(prompt, script)
    model_name = settings.SCENE_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene embedding model name is required",
        )

    embedding = await encode_scene_text(model_name, embedding_input)
    if len(embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"scene embedding model must return {VECTOR_DIMENSION} dimensions",
        )
    return embedding


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
        for raw_word in scene.prompt.split(","):
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


async def generate_prompt_by_struct(
    text: str,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> str:
    print("[generate_prompt_by_struct] start", flush=True)
    print(
        f"[generate_prompt_by_struct] options max_tokens={max_tokens!r} temperature={temperature!r}",
        flush=True,
    )
    print(f"[generate_prompt_by_struct] source_text={text!r}", flush=True)
    try:
        korean_keywords = await extract_visual_keywords(
            text,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except HTTPException as exc:
        print(
            f"[generate_prompt_by_struct] extract_keywords failed status={exc.status_code} detail={exc.detail!r}",
            flush=True,
        )
        raise
    print(f"[generate_prompt_by_struct] korean_keywords={korean_keywords!r}", flush=True)

    try:
        english_keywords = await translate_visual_keywords_to_english(
            korean_keywords,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except HTTPException as exc:
        print(
            f"[generate_prompt_by_struct] translate_keywords failed status={exc.status_code} detail={exc.detail!r}",
            flush=True,
        )
        raise
    print(f"[generate_prompt_by_struct] english_keywords={english_keywords!r}", flush=True)

    prompt_keywords = [
        keyword.strip()
        for keyword_list in english_keywords.values()
        for keyword in keyword_list
        if isinstance(keyword, str) and keyword.strip()
    ]
    prompt = ", ".join(prompt_keywords)
    print(f"[generate_prompt_by_struct] prompt_keywords={prompt_keywords!r}", flush=True)
    print(f"[generate_prompt_by_struct] prompt={prompt!r}", flush=True)
    return prompt


async def generate_scene_script(
    history: str,
    direction: str,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> str:
    return await generate_script_from_llm(
        history,
        direction,
        max_tokens=max_tokens,
        temperature=temperature,
    )


def normalize_scene_script(script: str) -> str:
    return script.replace("\r\n", "\n").replace("\r", "\n")


def build_scene_embedding_input(prompt: str, script: str) -> str:
    return f"passage: {prompt}\n{script}"


async def generate_scene_image(prompt: str) -> tuple[str, str]:
    model_path_value = settings.stable_diffusion_model_path.strip()
    if not model_path_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stable diffusion model path is required",
        )

    model_path = Path(model_path_value).expanduser()
    if not model_path.is_absolute():
        model_path = API_ROOT / model_path
    try:
        model_path = model_path.resolve(strict=True)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"stable diffusion model file not found: {model_path}",
        ) from exc

    seed = random.randint(GEN_IMAGE_SEED_MIN, GEN_IMAGE_SEED_MAX)
    images, _seeds = await generate_images_batch(
        str(model_path),
        [GEN_IMAGE_POSITIVE_BASE+prompt],
        [GEN_IMAGE_NEGATIVE_PROMPT],
        [seed],
        GEN_IMAGE_STEPS,
        GEN_IMAGE_CFG,
        GEN_IMAGE_HEIGHT,
        GEN_IMAGE_WIDTH,
        GEN_IMAGE_MAX_CHUNK_SIZE,
        GEN_IMAGE_SEED_MIN,
        GEN_IMAGE_SEED_MAX,
        GEN_IMAGE_SAMPLER,
        GEN_IMAGE_SCHEDULER,
        GEN_IMAGE_CLIP_SKIP,
    )
    image = images[0] if images else None
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="image generation returned no image",
        )

    image_key = build_object_key(kind="image", filename=f"scene{GEN_IMAGE_OUTPUT_EXTENSION}")
    image_bytes = BytesIO()
    if GEN_IMAGE_OUTPUT_FORMAT.upper() == "JPEG" and getattr(image, "mode", "RGB") != "RGB":
        image = image.convert("RGB")
    await asyncio.to_thread(
        image.save,
        image_bytes,
        format=GEN_IMAGE_OUTPUT_FORMAT,
        quality=GEN_IMAGE_OUTPUT_QUALITY,
    )
    image_bytes.seek(0)
    upload_fileobj(image_bytes, image_key, _image_content_type(GEN_IMAGE_OUTPUT_FORMAT))
    return public_file_url(image_key), image_key


def _image_content_type(output_format: str) -> str:
    normalized_format = output_format.lower()
    if normalized_format == "png":
        return "image/png"
    if normalized_format == "webp":
        return "image/webp"
    return "image/jpeg"


async def cleanup_old_scene_image(
    db: AsyncSession,
    old_image_url: str | None,
    new_image_url: str,
) -> None:
    if not old_image_url or old_image_url == new_image_url:
        return

    old_image_key = object_key_from_public_url(old_image_url)
    if old_image_key is None:
        return

    reference_count = (
        await db.execute(select(func.count()).select_from(Scene).where(Scene.image_url == old_image_url))
    ).scalar_one()
    if reference_count == 0:
        delete_object(old_image_key)


def update_context_embedding(
    context_embedding: list[float],
    scene_embedding: list[float],
) -> list[float]:
    return [
        context_value * 0.9 + scene_value
        for context_value, scene_value in zip(context_embedding, scene_embedding)
    ]


async def update_scene_context(
    db: AsyncSession,
    request: UpdateSceneContextRequestBase,
) -> Status:
    current_status = await db.get(Status, request.status_id)
    if current_status is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="status not found")

    scene = await db.get(Scene, request.scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")

    scene_embedding = validate_embedding(scene.embedding, "scene.embedding")
    context_embedding = (
        validate_embedding(current_status.context_embedding, "status.context_embedding")
        if current_status.context_embedding is not None
        else [0.0] * len(scene_embedding)
    )

    current_status.context_embedding = update_context_embedding(
        context_embedding,
        scene_embedding,
    )
    await db.commit()
    await db.refresh(current_status)

    return current_status
