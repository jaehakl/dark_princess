from __future__ import annotations

import asyncio
import json
import math
import random
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, SceneOption, SelectionModel, Status
from models import GenerateSceneRequestBase
from service.selection_model import normalize_status_columns, predict_target_scene_embedding
from settings import API_ROOT, settings
from utils.local_storage import build_object_key, delete_object, object_key_from_public_url, public_file_url, upload_fileobj
from utils.model_runtime import encode_scene_text, generate_images_batch
from utils.vector import VECTOR_DIMENSION, validate_embedding


GEN_IMAGE_NEGATIVE_PROMPT = "blurry, low quality, bad anatomy, disfigured, deformed, bad hands, missing fingers, extra fingers, worst quality, jpeg artifacts, signature, watermark, text, bad eyes, grotesque, sketchy, logo, rough, incomplete, disgusting, distorted, deformed face, poorly drawn, bad quality"
GEN_IMAGE_STEPS = 30
GEN_IMAGE_CFG = 10.0
GEN_IMAGE_HEIGHT = 1216
GEN_IMAGE_WIDTH = 832
GEN_IMAGE_MAX_CHUNK_SIZE = 1
GEN_IMAGE_OUTPUT_FORMAT = "JPEG"
GEN_IMAGE_OUTPUT_EXTENSION = ".jpg"
GEN_IMAGE_OUTPUT_QUALITY = 85
GEN_IMAGE_SEED_MIN = 0
GEN_IMAGE_SEED_MAX = 1_000_000


async def generate_scene(
    db: AsyncSession,
    request: GenerateSceneRequestBase,
) -> Scene:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scene prompt is required")

    scene = None
    old_image_url = None
    if request.scene_id is not None:
        scene = await db.get(Scene, request.scene_id)
        if scene is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")
        old_image_url = scene.image_url

    embedding = await make_scene_embedding(prompt, request.scripts)
    image_url, image_key = await generate_scene_image(prompt)

    try:
        if scene is None:
            scene = Scene()
            db.add(scene)

        scene.prompt = prompt
        scene.scripts = request.scripts
        scene.status_change = request.status_change
        scene.embedding = embedding
        scene.image_url = image_url
        await db.commit()
        await db.refresh(scene)
    except Exception:
        await db.rollback()
        delete_object(image_key)
        raise

    await cleanup_old_scene_image(db, old_image_url, image_url)
    return scene


async def make_scene_embedding(prompt: str, scripts: dict[str, Any] | list[Any]) -> list[float]:
    embedding_input = build_scene_embedding_input(prompt, scripts)
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


def build_scene_embedding_input(prompt: str, scripts: dict[str, Any] | list[Any]) -> str:
    scripts_json = json.dumps(scripts, ensure_ascii=False, sort_keys=True)
    return f"passage: {prompt}\n{scripts_json}"


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
        [prompt],
        [GEN_IMAGE_NEGATIVE_PROMPT],
        [seed],
        GEN_IMAGE_STEPS,
        GEN_IMAGE_CFG,
        GEN_IMAGE_HEIGHT,
        GEN_IMAGE_WIDTH,
        GEN_IMAGE_MAX_CHUNK_SIZE,
        GEN_IMAGE_SEED_MIN,
        GEN_IMAGE_SEED_MAX,
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


async def make_target_scene_embedding(
    scene_embedding: list[float],
    option_embedding: list[float],
    context_embedding: list[float],
    normalized_status: list[float],
    model_file_url: str,
) -> list[float]:
    return await predict_target_scene_embedding(
        model_file_url,
        scene_embedding,
        option_embedding,
        context_embedding,
        normalized_status,
    )


def update_context_embedding(
    context_embedding: list[float],
    scene_embedding: list[float],
) -> list[float]:
    return [
        context_value * 0.9 + scene_value
        for context_value, scene_value in zip(context_embedding, scene_embedding)
    ]


def cosine_distance(left: Iterable[float], right: Iterable[float]) -> float | None:
    left_values = list(left)
    right_values = list(right)
    left_norm = math.sqrt(sum(value * value for value in left_values))
    right_norm = math.sqrt(sum(value * value for value in right_values))
    if left_norm == 0 or right_norm == 0:
        return None

    dot_product = sum(left_value * right_value for left_value, right_value in zip(left_values, right_values))
    return 1 - dot_product / (left_norm * right_norm)


async def get_next_scene(
    db: AsyncSession,
    scene_id: int,
    status_id: int,
    scene_option_id: int,
) -> Scene:
    scene = await db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")

    scene_option = await db.get(SceneOption, scene_option_id)
    if scene_option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene_option not found")
    if scene_option.scene_id != scene_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scene_option does not belong to scene",
        )

    current_status = await db.get(Status, status_id)
    if current_status is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="status not found")
    if current_status.selection_model_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status.selection_model_id is required",
        )

    selection_model = await db.get(SelectionModel, current_status.selection_model_id)
    if selection_model is None or not selection_model.file_url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="selection model is required",
        )

    scene_embedding = validate_embedding(scene.embedding, "scene.embedding")
    option_embedding = validate_embedding(scene_option.embedding, "scene_option.embedding")
    context_embedding = (
        validate_embedding(current_status.context_embedding, "status.context_embedding")
        if current_status.context_embedding is not None
        else [0.0] * len(scene_embedding)
    )
    normalized_status = normalize_status_columns(current_status)
    target_embedding = await make_target_scene_embedding(
        scene_embedding,
        option_embedding,
        context_embedding,
        normalized_status,
        selection_model.file_url,
    )

    candidate_stmt = select(Scene).where(Scene.id != scene_id)
    candidates = (await db.execute(candidate_stmt)).scalars().all()
    nearest_scene = None
    nearest_distance = None
    for candidate in candidates:
        try:
            candidate_embedding = validate_embedding(candidate.embedding, "candidate.embedding")
        except HTTPException:
            continue

        distance = cosine_distance(target_embedding, candidate_embedding)
        if distance is None:
            continue
        if nearest_distance is None or distance < nearest_distance:
            nearest_scene = candidate
            nearest_distance = distance

    if nearest_scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="next scene not found")

    current_status.context_embedding = update_context_embedding(context_embedding, scene_embedding)
    await db.commit()
    await db.refresh(nearest_scene)

    return nearest_scene
