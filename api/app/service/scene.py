from __future__ import annotations

import asyncio
import random
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import FormData, UploadFile

from db import Scene, Status
from models import (
    GenerateSceneRequestBase,
    ImageGenerationSettingsBase,
    UpdateSceneContextRequestBase,
    UpsertResponseBase,
    SceneBase,
)
from settings import API_ROOT, settings
from service.selection_model import cosine_distance
from service.image_util import (
    GEN_IMAGE_CFG,
    GEN_IMAGE_HEIGHT,
    GEN_IMAGE_MAX_CHUNK_SIZE,
    GEN_IMAGE_OUTPUT_EXTENSION,
    GEN_IMAGE_OUTPUT_FORMAT,
    GEN_IMAGE_OUTPUT_QUALITY,
    GEN_IMAGE_SEED_MAX,
    GEN_IMAGE_SEED_MIN,
    GEN_IMAGE_STRENGTH,
    GEN_IMAGE_WIDTH,
    SCENE_PROMPT_FIELDS,
    resolve_image_generation_settings,
)
from utils.crud_helpers import cleanup_orphaned_object_keys
from utils.local_storage import (
    build_object_key,
    delete_object,
    is_allowed_content_type,
    object_key_from_public_url,
    public_file_url,
    upload_fileobj,
)
from utils.model_runtime import encode_scene_text, generate_images_batch
from utils.vector import VECTOR_DIMENSION, validate_embedding


async def generate_scene_from_form(db: AsyncSession, form: FormData) -> Scene:
    generate_request, seed_image = await parse_generate_scene_form(form)
    return await generate_scene(db, generate_request, seed_image=seed_image)


async def parse_generate_scene_form(form: FormData) -> tuple[GenerateSceneRequestBase, bytes | None]:
    payload = form.get("payload")
    if not isinstance(payload, str) or not payload.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payload is required")
    try:
        generate_request = GenerateSceneRequestBase.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc

    upload = form.get("seed_image")
    if not isinstance(upload, UploadFile):
        return generate_request, None
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
    return generate_request, seed_image


async def generate_scene(
    db: AsyncSession,
    request: GenerateSceneRequestBase,
    seed_image: bytes | None = None,
) -> Scene:
    if request.generate_image and seed_image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="seed image is required")

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
    column_values = {field: getattr(request, field) for field in SCENE_PROMPT_FIELDS}
    visual_prompt = build_scene_visual_prompt(column_values)
    if not visual_prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scene prompt component is required")
    embedding = await make_scene_embedding(visual_prompt, script)
    column_embeddings = await make_scene_column_embeddings(column_values)
    if request.generate_image:
        image_url, image_key = await generate_scene_image(visual_prompt, seed_image, request.image_settings)

    try:
        if scene is None:
            scene = Scene()
            db.add(scene)

        scene.script = script
        scene.status_change = request.status_change
        scene.embedding = embedding
        for field in SCENE_PROMPT_FIELDS:
            setattr(scene, field, column_values[field])
            setattr(scene, f"{field}_embedding", column_embeddings[field])
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


async def upsert_scenes(db: AsyncSession, items: list[SceneBase]) -> list[UpsertResponseBase]:
    if not items:
        return []

    item_ids = [item.id for item in items if item.id is not None]
    existing_scenes = {}
    if item_ids:
        result = await db.execute(select(Scene).where(Scene.id.in_(item_ids)))
        existing_scenes = {scene.id: scene for scene in result.scalars().all()}

    pending_results: list[Scene] = []
    orphan_candidates: list[str | None] = []
    try:
        for item in items:
            scene = existing_scenes.get(item.id) if item.id is not None else None
            if scene is None:
                scene = Scene()
                db.add(scene)

            old_image_url = scene.image_url
            script = normalize_scene_script(item.script)
            column_values = {field: getattr(item, field) for field in SCENE_PROMPT_FIELDS}
            visual_prompt = build_scene_visual_prompt(column_values)
            if not visual_prompt:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scene prompt component is required")
            column_embeddings = await make_scene_column_embeddings(column_values)

            scene.image_url = item.image_url
            scene.script = script
            scene.status_change = item.status_change
            scene.embedding = await make_scene_embedding(visual_prompt, script)
            for field in SCENE_PROMPT_FIELDS:
                setattr(scene, field, column_values[field])
                setattr(scene, f"{field}_embedding", column_embeddings[field])

            if old_image_url != item.image_url:
                orphan_candidates.append(old_image_url)
            pending_results.append(scene)

        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await cleanup_orphaned_object_keys(db, orphan_candidates)
    return [UpsertResponseBase(id=scene.id) for scene in pending_results]


async def make_scene_embedding(visual_prompt: str, script: str) -> list[float]:
    embedding_input = build_scene_embedding_input(visual_prompt, script)
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


async def make_scene_column_embeddings(
    column_values: dict[str, str | None],
) -> dict[str, list[float] | None]:
    column_embeddings: dict[str, list[float] | None] = {field: None for field in SCENE_PROMPT_FIELDS}
    if not any((column_values[field] or "").strip() for field in SCENE_PROMPT_FIELDS):
        return column_embeddings

    model_name = settings.SCENE_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene embedding model name is required",
        )

    for field in SCENE_PROMPT_FIELDS:
        column_text = (column_values[field] or "").strip()
        if not column_text:
            continue

        embedding = await encode_scene_text(model_name, f"passage: {column_text}")
        if len(embedding) != VECTOR_DIMENSION:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"scene embedding model must return {VECTOR_DIMENSION} dimensions",
            )
        column_embeddings[field] = embedding

    return column_embeddings


async def get_similar_scenes(db: AsyncSession, text: str) -> list[Scene]:
    query_text = text.strip()
    if not query_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")

    model_name = settings.SCENE_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene embedding model name is required",
        )

    text_embedding = await encode_scene_text(model_name, f"query: {query_text}")
    if len(text_embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"scene embedding model must return {VECTOR_DIMENSION} dimensions",
        )

    scenes = (await db.execute(select(Scene))).scalars().all()
    scene_distances = []
    for scene in scenes:
        try:
            scene_embedding = validate_embedding(scene.embedding, "scene.embedding")
        except HTTPException:
            continue

        distance = cosine_distance(text_embedding, scene_embedding)
        if distance is None:
            continue
        scene_distances.append((scene, distance))

    return [
        scene
        for scene, _distance in sorted(
            scene_distances,
            key=lambda item: (item[1], item[0].id or 0),
        )
    ]


def normalize_scene_script(script: str) -> str:
    return script.replace("\r\n", "\n").replace("\r", "\n")


def build_scene_visual_prompt(column_values: dict[str, str | None]) -> str:
    return ", ".join(
        (column_values[field] or "").strip()
        for field in SCENE_PROMPT_FIELDS
        if (column_values[field] or "").strip()
    )


def build_scene_embedding_input(visual_prompt: str, script: str) -> str:
    return f"passage: {visual_prompt}\n{script}"


async def generate_scene_image(
    visual_prompt: str,
    seed_image: bytes,
    image_settings: ImageGenerationSettingsBase | None = None,
) -> tuple[str, str]:
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

    resolved_settings = resolve_image_generation_settings(image_settings)
    try:
        with Image.open(BytesIO(seed_image)) as opened_seed_image:
            init_image = opened_seed_image.convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="seed image is not a supported image") from exc
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="seed image could not be read") from exc

    target_size = (
        resolved_settings.width or GEN_IMAGE_WIDTH,
        resolved_settings.height or GEN_IMAGE_HEIGHT,
    )
    if init_image.size != target_size:
        init_image = init_image.resize(target_size, Image.Resampling.LANCZOS)

    positive_prompt_parts = [
        (resolved_settings.positive_base or "").strip().strip(","),
        visual_prompt.strip().strip(","),
    ]
    seed = random.randint(GEN_IMAGE_SEED_MIN, GEN_IMAGE_SEED_MAX)
    images, _seeds = await generate_images_batch(
        str(model_path),
        [", ".join(part for part in positive_prompt_parts if part)],
        [resolved_settings.negative_prompt or ""],
        [init_image],
        [seed],
        resolved_settings.steps or GEN_IMAGE_STEPS,
        resolved_settings.cfg or GEN_IMAGE_CFG,
        resolved_settings.height or GEN_IMAGE_HEIGHT,
        resolved_settings.width or GEN_IMAGE_WIDTH,
        resolved_settings.strength or GEN_IMAGE_STRENGTH,
        GEN_IMAGE_MAX_CHUNK_SIZE,
        GEN_IMAGE_SEED_MIN,
        GEN_IMAGE_SEED_MAX,
        resolved_settings.sampler or "",
        resolved_settings.scheduler or "",
        resolved_settings.clip_skip,
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
