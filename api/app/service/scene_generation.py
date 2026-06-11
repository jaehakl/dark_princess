from __future__ import annotations

import asyncio
import json
import random
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene
from models import GenerateSceneRequestBase
from service.image_generation import (
    GEN_IMAGE_CFG,
    GEN_IMAGE_HEIGHT,
    GEN_IMAGE_MAX_CHUNK_SIZE,
    GEN_IMAGE_NEGATIVE_PROMPT,
    GEN_IMAGE_OUTPUT_EXTENSION,
    GEN_IMAGE_OUTPUT_FORMAT,
    GEN_IMAGE_OUTPUT_QUALITY,
    GEN_IMAGE_SEED_MAX,
    GEN_IMAGE_SEED_MIN,
    GEN_IMAGE_STEPS,
    GEN_IMAGE_WIDTH,
    _generation_lock,
    _image_content_type,
    generate_images_batch,
)
from service.vector_utils import VECTOR_DIMENSION
from settings import API_ROOT, settings
from utils.local_storage import build_object_key, delete_object, object_key_from_public_url, public_file_url, upload_fileobj


_embedding_models: dict[str, Any] = {}


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

    embedding = await asyncio.to_thread(_encode_scene_embedding, model_name, embedding_input)
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
    async with _generation_lock:
        images, _seeds = await asyncio.to_thread(
            generate_images_batch,
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

def _encode_scene_embedding(model_name: str, text: str) -> list[float]:
    model = _get_embedding_model(model_name)
    raw_embedding = model.encode(text)
    if hasattr(raw_embedding, "tolist"):
        raw_embedding = raw_embedding.tolist()
    return [float(value) for value in raw_embedding]


def _get_embedding_model(model_name: str) -> Any:
    if model_name not in _embedding_models:
        from sentence_transformers import SentenceTransformer

        _embedding_models[model_name] = SentenceTransformer(model_name)
    return _embedding_models[model_name]
