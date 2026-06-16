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
    GEN_IMAGE_STEPS,
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
from model_runtime import encode_scene_text, generate_images_batch
from utils.vector import VECTOR_DIMENSION, validate_embedding


async def generate_scene_from_form(db: AsyncSession, form: FormData) -> Scene:
    generate_request, image, mask, scribble_image, pose_image = await parse_generate_scene_form(form)
    return await generate_scene(
        db,
        generate_request,
        seed_image=image,
        mask_image=mask,
        scribble_image=scribble_image,
        pose_image=pose_image,
        image_mode="controlnet_inpaint",
        image_label="image",
    )


async def parse_generate_scene_form(
    form: FormData,
) -> tuple[GenerateSceneRequestBase, bytes | None, bytes | None, bytes | None, bytes | None]:
    generate_request = parse_generate_scene_payload(form)
    if not generate_request.generate_image:
        return generate_request, None, None, None, None

    image = await read_image_upload(form, "image", required=True)
    mask = await read_image_upload(form, "mask", required=True)
    scribble_image = await read_image_upload(form, "scribble_image", required=True)
    pose_image = await read_image_upload(form, "pose_image")
    return generate_request, image, mask, scribble_image, pose_image


async def generate_scene_t2i_from_form(db: AsyncSession, form: FormData) -> Scene:
    generate_request = parse_generate_scene_payload(form)
    return await generate_scene(db, generate_request, image_mode="t2i", force_generate_image=True)


async def generate_scene_i2i_from_form(db: AsyncSession, form: FormData) -> Scene:
    generate_request = parse_generate_scene_payload(form)
    image = await read_image_upload(form, "image", required=True)
    return await generate_scene(
        db,
        generate_request,
        seed_image=image,
        image_mode="i2i",
        image_label="image",
        force_generate_image=True,
    )


async def generate_scene_inpaint_from_form(db: AsyncSession, form: FormData) -> Scene:
    generate_request = parse_generate_scene_payload(form)
    image = await read_image_upload(form, "image", required=True)
    mask = await read_image_upload(form, "mask", required=True)
    return await generate_scene(
        db,
        generate_request,
        seed_image=image,
        mask_image=mask,
        image_mode="inpaint",
        image_label="image",
        force_generate_image=True,
    )


def parse_generate_scene_payload(form: FormData) -> GenerateSceneRequestBase:
    payload = form.get("payload")
    if not isinstance(payload, str) or not payload.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payload is required")
    try:
        return GenerateSceneRequestBase.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc


async def read_image_upload(form: FormData, field_name: str, required: bool = False) -> bytes | None:
    upload = form.get(field_name)
    if not isinstance(upload, UploadFile):
        if required:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} is required")
        return None
    if not is_allowed_content_type(upload.content_type):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} content type is not allowed",
        )

    image = await upload.read()
    max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if not image:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} is empty")
    if len(image) > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} exceeds {settings.MAX_UPLOAD_SIZE_MB} MB",
        )
    return image


async def generate_scene(
    db: AsyncSession,
    request: GenerateSceneRequestBase,
    seed_image: bytes | None = None,
    mask_image: bytes | None = None,
    scribble_image: bytes | None = None,
    pose_image: bytes | None = None,
    image_mode: str = "i2i",
    image_label: str = "seed image",
    force_generate_image: bool = False,
) -> Scene:
    should_generate_image = force_generate_image or request.generate_image
    if should_generate_image and image_mode != "t2i" and seed_image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="seed image is required")
    if should_generate_image and image_mode in {"inpaint", "controlnet_inpaint"} and mask_image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mask image is required")
    if should_generate_image and image_mode == "controlnet_inpaint" and scribble_image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scribble image is required")

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
    if should_generate_image:
        image_url, image_key = await generate_scene_image(
            visual_prompt,
            seed_image,
            request.image_settings,
            image_mode=image_mode,
            mask_image=mask_image,
            scribble_image=scribble_image,
            pose_image=pose_image,
            image_label=image_label,
        )

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
    seed_image: bytes | None,
    image_settings: ImageGenerationSettingsBase | None = None,
    *,
    image_mode: str = "i2i",
    mask_image: bytes | None = None,
    scribble_image: bytes | None = None,
    pose_image: bytes | None = None,
    image_label: str = "seed image",
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
    target_size = (
        resolved_settings.width or GEN_IMAGE_WIDTH,
        resolved_settings.height or GEN_IMAGE_HEIGHT,
    )
    init_image = None
    init_mask = None
    controlnet_images: list[Image.Image] = []
    controlnet_model_ids: list[str] = []
    scribble_scales: list[float] = []
    scribble_guidance_starts: list[float] = []
    scribble_guidance_ends: list[float] = []
    pose_scales: list[float] = []
    pose_guidance_starts: list[float] = []
    pose_guidance_ends: list[float] = []
    if image_mode in {"i2i", "inpaint", "controlnet_inpaint"}:
        if seed_image is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{image_label} is required")
        init_image = decode_generation_image(
            seed_image,
            image_label,
            "RGB",
            target_size,
            Image.Resampling.LANCZOS,
        )
    elif image_mode != "t2i":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported scene image generation mode")

    if image_mode in {"inpaint", "controlnet_inpaint"}:
        if mask_image is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mask image is required")
        init_mask = decode_generation_image(
            mask_image,
            "mask",
            "L",
            target_size,
            Image.Resampling.NEAREST,
        )
    if image_mode == "controlnet_inpaint":
        if scribble_image is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scribble image is required")
        init_scribble = decode_generation_image(
            scribble_image,
            "scribble image",
            "RGB",
            target_size,
            Image.Resampling.LANCZOS,
        )
        if not is_solid_rgb_image(init_scribble, 255, 255, 255):
            controlnet_images.append(init_scribble)
            controlnet_model_ids.append(settings.CONTROLNET_SCRIBBLE_MODEL_ID)
            scribble_scales.append(resolved_settings.scribble_scale)
            scribble_guidance_starts.append(resolved_settings.scribble_guidance_start)
            scribble_guidance_ends.append(resolved_settings.scribble_guidance_end)
        if pose_image is not None:
            init_pose = decode_generation_image(
                pose_image,
                "pose image",
                "RGB",
                target_size,
                Image.Resampling.LANCZOS,
            )
            controlnet_images.append(init_pose)
            controlnet_model_ids.append(settings.CONTROLNET_OPENPOSE_MODEL_ID)
            pose_scales.append(resolved_settings.pose_scale)
            pose_guidance_starts.append(resolved_settings.pose_guidance_start)
            pose_guidance_ends.append(resolved_settings.pose_guidance_end)
        if not controlnet_images:
            controlnet_images.append(init_scribble)
            controlnet_model_ids.append(settings.CONTROLNET_SCRIBBLE_MODEL_ID)
            scribble_scales.append(0.0)
            scribble_guidance_starts.append(resolved_settings.scribble_guidance_start)
            scribble_guidance_ends.append(resolved_settings.scribble_guidance_end)

    positive_prompt_parts = [
        (resolved_settings.positive_base or "").strip().strip(","),
        visual_prompt.strip().strip(","),
    ]
    seed = random.randint(GEN_IMAGE_SEED_MIN, GEN_IMAGE_SEED_MAX)
    controlnet_conditioning_scales = scribble_scales + pose_scales
    control_guidance_starts = scribble_guidance_starts + pose_guidance_starts
    control_guidance_ends = scribble_guidance_ends + pose_guidance_ends
    images, _seeds = await generate_images_batch(
        str(model_path),
        image_mode,
        [", ".join(part for part in positive_prompt_parts if part)],
        [resolved_settings.negative_prompt or ""],
        [init_image] if init_image is not None else [],
        [init_mask] if init_mask is not None else [],
        [controlnet_images] if controlnet_images else [],
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
        controlnet_model_ids,
        controlnet_conditioning_scales,
        control_guidance_starts,
        control_guidance_ends,
    )
    image = images[0] if images else None
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="image generation returned no image",
        )

    image_key = build_object_key(kind="image", filename=f"scene{GEN_IMAGE_OUTPUT_EXTENSION}")
    image_bytes = BytesIO()
    output_format = GEN_IMAGE_OUTPUT_FORMAT.upper()
    save_kwargs = {"format": GEN_IMAGE_OUTPUT_FORMAT}
    if output_format == "JPEG":
        save_kwargs["quality"] = GEN_IMAGE_OUTPUT_QUALITY
    if output_format == "JPEG" and getattr(image, "mode", "RGB") != "RGB":
        image = image.convert("RGB")
    await asyncio.to_thread(
        image.save,
        image_bytes,
        **save_kwargs,
    )
    image_bytes.seek(0)
    upload_fileobj(image_bytes, image_key, _image_content_type(GEN_IMAGE_OUTPUT_FORMAT))
    return public_file_url(image_key), image_key


def decode_generation_image(
    image_bytes: bytes,
    field_label: str,
    image_mode: str,
    target_size: tuple[int, int],
    resample: Image.Resampling,
) -> Image.Image:
    try:
        with Image.open(BytesIO(image_bytes)) as opened_image:
            image = opened_image.convert(image_mode)
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_label} is not a supported image") from exc
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_label} could not be read") from exc

    if image.size != target_size:
        image = image.resize(target_size, resample)
    return image


def is_solid_rgb_image(image: Image.Image, red: int, green: int, blue: int) -> bool:
    if image.mode != "RGB":
        image = image.convert("RGB")
    return image.getextrema() == ((red, red), (green, green), (blue, blue))


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
