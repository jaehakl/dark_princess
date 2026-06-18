from __future__ import annotations

import asyncio
import random
from io import BytesIO
from typing import Any

from fastapi import HTTPException, status
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.datastructures import FormData, UploadFile

from db import Image as StoredImage, Scene, Status
from models import (
    GenerateSceneRequestBase,
    ImageGenerationSettingsBase,
    UpdateSceneContextRequestBase,
    UpsertResponseBase,
    SceneBase,
)
from settings import settings
from service.selection_model import cosine_distance
from service.image_util_constants import (
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
)
from service.image_util import (
    resolve_image_generation_model_path,
    resolve_image_generation_settings,
)
from utils.local_storage import (
    build_object_key,
    delete_object,
    is_allowed_content_type,
    object_key_from_public_url,
    upload_fileobj,
)
from model_runtime import encode_scene_text, generate_images_batch
from utils.vector import VECTOR_DIMENSION, validate_embedding

SCENE_EMBEDDING_PROMPT_FIELDS = ("prompt_situation", "prompt_hero")


def scene_image_load_option():
    return selectinload(Scene.image).load_only(
        StoredImage.id,
        StoredImage.image_object_key,
        StoredImage.scribble_object_key,
        StoredImage.pose_object_key,
        StoredImage.positive_prompt,
        StoredImage.negative_prompt,
        StoredImage.seed_image_id,
        StoredImage.model_parameters,
    )


async def generate_scene_from_form(db: AsyncSession, form: FormData) -> Scene:
    generate_request, image, mask, scribble_image, pose_image = await parse_generate_scene_form(form)
    return await generate_scene(
        db,
        generate_request,
        seed_image=image,
        mask_image=mask,
        scribble_image=scribble_image,
        pose_image=pose_image,
    )


async def parse_generate_scene_form(
    form: FormData,
) -> tuple[GenerateSceneRequestBase, bytes | None, bytes | None, bytes | None, bytes | None]:
    generate_request = parse_generate_scene_payload(form)
    if not generate_request.generate_image:
        return generate_request, None, None, None, None

    image = await read_image_upload(form, "image")
    mask = await read_image_upload(form, "mask")
    scribble_image = await read_image_upload(form, "scribble_image")
    pose_image = await read_image_upload(form, "pose_image")
    return generate_request, image, mask, scribble_image, pose_image


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
) -> Scene:
    should_generate_image = request.generate_image
    scene: Scene | None = None
    image_key = None
    scribble_key = None
    pose_key = None
    if request.scene_id is not None:
        scene = (
            await db.execute(
                select(Scene)
                .options(scene_image_load_option())
                .where(Scene.id == request.scene_id)
            )
        ).scalar_one_or_none()
        if scene is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")

    parent_image_id = None
    if should_generate_image and request.parent_image_id is not None:
        parent_image_id = await validate_image_id(db, request.parent_image_id)

    script = normalize_scene_script(request.script)
    column_values = {field: getattr(request, field) for field in SCENE_PROMPT_FIELDS}
    visual_prompt = build_scene_visual_prompt(column_values)
    if not visual_prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scene prompt component is required")
    embedding_visual_prompt = build_scene_embedding_visual_prompt(column_values)
    embedding = await make_scene_embedding(embedding_visual_prompt, script)
    image_result: dict[str, Any] | None = None
    if should_generate_image:
        try:
            image_result = await generate_scene_image(
                column_values,
                request.prompt_instant_positive,
                request.prompt_negative,
                request.prompt_instant_negative,
                seed_image,
                request.image_settings,
                mask_image=mask_image,
                scribble_image=scribble_image,
                pose_image=pose_image,
            )
            image_key = image_result["image_object_key"]
            if image_result["has_active_scribble"] and scribble_image is not None:
                scribble_key = upload_scene_control_image(
                    scribble_image,
                    "scene-controlnet-scribble.png",
                )
            if pose_image is not None:
                pose_key = upload_scene_control_image(
                    pose_image,
                    "scene-controlnet-openpose.png",
                )
        except Exception:
            if image_key is not None:
                delete_object(image_key)
            if scribble_key is not None:
                delete_object(scribble_key)
            if pose_key is not None:
                delete_object(pose_key)
            raise

    try:
        if scene is None:
            scene = Scene()
            db.add(scene)

        scene.script = script
        scene.status_change = request.status_change
        scene.embedding = embedding
        for field in SCENE_PROMPT_FIELDS:
            setattr(scene, field, column_values[field])
        scene.prompt_negative = request.prompt_negative
        if image_result is not None:
            stored_image = StoredImage(
                image_object_key=image_key,
                scribble_object_key=scribble_key,
                pose_object_key=pose_key,
                positive_prompt=image_result["positive_prompt"],
                positive_prompt_embedding=image_result["positive_prompt_embedding"],
                negative_prompt=image_result["negative_prompt"],
                seed_image_id=parent_image_id,
                model_parameters=image_result["model_parameters"],
            )
            db.add(stored_image)
            scene.image = stored_image
        await db.commit()
        await db.refresh(scene)
        if scene.image_id is not None:
            await db.refresh(scene, attribute_names=["image"])
    except Exception:
        await db.rollback()
        if image_key is not None:
            delete_object(image_key)
        if scribble_key is not None:
            delete_object(scribble_key)
        if pose_key is not None:
            delete_object(pose_key)
        raise

    return scene


async def upsert_scenes(db: AsyncSession, items: list[SceneBase]) -> list[UpsertResponseBase]:
    if not items:
        return []

    item_ids = [item.id for item in items if item.id is not None]
    existing_scenes = {}
    if item_ids:
        result = await db.execute(
            select(Scene)
            .options(scene_image_load_option())
            .where(Scene.id.in_(item_ids))
        )
        existing_scenes = {scene.id: scene for scene in result.scalars().all()}

    pending_results: list[Scene] = []
    try:
        for item in items:
            scene = existing_scenes.get(item.id) if item.id is not None else None
            if scene is None:
                scene = Scene()
                db.add(scene)

            stored_image = await resolve_scene_image_for_upsert(db, item)
            script = normalize_scene_script(item.script)
            column_values = {field: getattr(item, field) for field in SCENE_PROMPT_FIELDS}
            visual_prompt = build_scene_visual_prompt(column_values)
            if not visual_prompt:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scene prompt component is required")
            embedding_visual_prompt = build_scene_embedding_visual_prompt(column_values)

            scene.image = stored_image
            scene.script = script
            scene.status_change = item.status_change
            scene.embedding = await make_scene_embedding(embedding_visual_prompt, script)
            for field in SCENE_PROMPT_FIELDS:
                setattr(scene, field, column_values[field])
            scene.prompt_negative = item.prompt_negative

            pending_results.append(scene)

        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return [UpsertResponseBase(id=scene.id) for scene in pending_results]


async def validate_image_id(db: AsyncSession, image_id: int) -> int:
    stored_image = await db.get(StoredImage, image_id)
    if stored_image is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image_id not found")
    return stored_image.id


async def resolve_scene_image_for_upsert(db: AsyncSession, item: SceneBase) -> StoredImage | None:
    if item.image_id is not None:
        stored_image = await db.get(StoredImage, item.image_id)
        if stored_image is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image_id not found")
        return stored_image

    image_key = normalize_scene_upload_reference("image_url", item.image_url)
    scribble_key = normalize_scene_upload_reference("scribble_url", item.scribble_url)
    pose_key = normalize_scene_upload_reference("pose_url", item.pose_url)
    if image_key is None and scribble_key is None and pose_key is None:
        return None

    stored_image = StoredImage(
        image_object_key=image_key,
        scribble_object_key=scribble_key,
        pose_object_key=pose_key,
        model_parameters={"source": "scene_upsert_upload_reference"},
    )
    db.add(stored_image)
    return stored_image


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

    scenes = (await db.execute(select(Scene).options(scene_image_load_option()))).scalars().all()
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


def normalize_scene_upload_reference(field_name: str, value: str | None) -> str | None:
    if value in (None, ""):
        return None

    object_key = object_key_from_public_url(value)
    if object_key is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a local upload object key",
        )
    return object_key


def build_scene_visual_prompt(column_values: dict[str, str | None]) -> str:
    return ", ".join(
        (column_values[field] or "").strip()
        for field in SCENE_PROMPT_FIELDS
        if (column_values[field] or "").strip()
    )


def build_scene_embedding_visual_prompt(column_values: dict[str, str | None]) -> str:
    return ", ".join(
        (column_values[field] or "").strip()
        for field in SCENE_EMBEDDING_PROMPT_FIELDS
        if (column_values[field] or "").strip()
    )


def build_generation_prompt(parts: list[str | None]) -> str:
    return ", ".join(
        part.strip().strip(",")
        for part in parts
        if isinstance(part, str) and part.strip().strip(",")
    )


def build_scene_embedding_input(visual_prompt: str, script: str) -> str:
    return f"passage: {visual_prompt}\n{script}"


async def make_positive_prompt_embedding(positive_prompt: str) -> list[float] | None:
    if not positive_prompt.strip():
        return None

    model_name = settings.SCENE_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene embedding model name is required",
        )

    embedding = await encode_scene_text(model_name, f"passage: {positive_prompt}")
    if len(embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"scene embedding model must return {VECTOR_DIMENSION} dimensions",
        )
    return embedding


def upload_scene_control_image(image_bytes: bytes, filename: str) -> str:
    object_key = build_object_key(kind="image", filename=filename)
    image_file = BytesIO(image_bytes)
    upload_fileobj(image_file, object_key, "image/png")
    return object_key


async def generate_scene_image(
    column_values: dict[str, str | None],
    prompt_instant_positive: str | None,
    prompt_negative: str | None,
    prompt_instant_negative: str | None,
    seed_image: bytes | None,
    image_settings: ImageGenerationSettingsBase | None = None,
    *,
    mask_image: bytes | None = None,
    scribble_image: bytes | None = None,
    pose_image: bytes | None = None,
) -> dict[str, Any]:
    resolved_settings = resolve_image_generation_settings(image_settings)
    model_path = resolve_image_generation_model_path(resolved_settings)
    target_size = (
        resolved_settings.width or GEN_IMAGE_WIDTH,
        resolved_settings.height or GEN_IMAGE_HEIGHT,
    )
    init_image = None
    init_mask = None
    controlnet_images: list[Image.Image] = []
    controlnet_model_ids: list[str] = []
    has_active_scribble = False
    scribble_scales: list[float] = []
    scribble_guidance_starts: list[float] = []
    scribble_guidance_ends: list[float] = []
    pose_scales: list[float] = []
    pose_guidance_starts: list[float] = []
    pose_guidance_ends: list[float] = []
    if seed_image is not None:
        init_image = decode_generation_image(
            seed_image,
            "seed image",
            "RGB",
            target_size,
            Image.Resampling.LANCZOS,
        )

    if mask_image is not None:
        if init_image is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="mask image requires seed image")
        init_mask = decode_generation_image(
            mask_image,
            "mask",
            "L",
            target_size,
            Image.Resampling.NEAREST,
        )

    if scribble_image is not None:
        init_scribble = decode_generation_image(
            scribble_image,
            "scribble image",
            "RGB",
            target_size,
            Image.Resampling.LANCZOS,
        )
        if not is_solid_rgb_image(init_scribble, 255, 255, 255):
            has_active_scribble = True
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

    positive_prompt_parts = [
        column_values["prompt_situation"],
        prompt_instant_positive,
        column_values["prompt_hero"],
        column_values["prompt_camera"],
        column_values["prompt_detail"],
        resolved_settings.prompt_default_positive,
    ]
    negative_prompt_parts = [
        prompt_instant_negative,
        prompt_negative,
        resolved_settings.prompt_default_negative,
    ]
    positive_prompt = build_generation_prompt(positive_prompt_parts)
    negative_prompt = build_generation_prompt(negative_prompt_parts)
    positive_prompt_embedding = await make_positive_prompt_embedding(positive_prompt)
    seed = random.randint(GEN_IMAGE_SEED_MIN, GEN_IMAGE_SEED_MAX)
    if controlnet_images:
        if init_image is None:
            runtime_image_mode = "controlnet_t2i"
        elif init_mask is None:
            runtime_image_mode = "controlnet_i2i"
        else:
            runtime_image_mode = "controlnet_inpaint"
    elif init_image is None:
        runtime_image_mode = "t2i"
    elif init_mask is None:
        runtime_image_mode = "i2i"
    else:
        runtime_image_mode = "inpaint"
    controlnet_conditioning_scales = scribble_scales + pose_scales
    control_guidance_starts = scribble_guidance_starts + pose_guidance_starts
    control_guidance_ends = scribble_guidance_ends + pose_guidance_ends
    step_count = resolved_settings.steps or GEN_IMAGE_STEPS
    cfg = resolved_settings.cfg or GEN_IMAGE_CFG
    height = resolved_settings.height or GEN_IMAGE_HEIGHT
    width = resolved_settings.width or GEN_IMAGE_WIDTH
    strength = resolved_settings.strength or GEN_IMAGE_STRENGTH
    sampler = resolved_settings.sampler or ""
    scheduler = resolved_settings.scheduler or ""
    images, seeds = await generate_images_batch(
        str(model_path),
        runtime_image_mode,
        [positive_prompt],
        [negative_prompt],
        [init_image] if init_image is not None else [],
        [init_mask] if init_mask is not None else [],
        [controlnet_images] if controlnet_images else [],
        [seed],
        step_count,
        cfg,
        height,
        width,
        strength,
        GEN_IMAGE_MAX_CHUNK_SIZE,
        GEN_IMAGE_SEED_MIN,
        GEN_IMAGE_SEED_MAX,
        sampler,
        scheduler,
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
    actual_seed = seeds[0] if seeds else seed
    return {
        "image_object_key": image_key,
        "positive_prompt": positive_prompt,
        "positive_prompt_embedding": positive_prompt_embedding,
        "negative_prompt": negative_prompt,
        "has_active_scribble": has_active_scribble,
        "model_parameters": {
            "model_filename": model_path.name,
            "runtime_image_mode": runtime_image_mode,
            "seed": actual_seed,
            "steps": step_count,
            "cfg": cfg,
            "height": height,
            "width": width,
            "strength": strength,
            "sampler": sampler,
            "scheduler": scheduler,
            "clip_skip": resolved_settings.clip_skip,
            "has_seed_image": seed_image is not None,
            "has_mask_image": mask_image is not None,
            "has_scribble_image": has_active_scribble,
            "has_pose_image": pose_image is not None,
            "controlnet_model_ids": controlnet_model_ids,
            "controlnet_conditioning_scales": controlnet_conditioning_scales,
            "control_guidance_starts": control_guidance_starts,
            "control_guidance_ends": control_guidance_ends,
            "output_format": GEN_IMAGE_OUTPUT_FORMAT,
            "output_quality": GEN_IMAGE_OUTPUT_QUALITY if output_format == "JPEG" else None,
        },
    }


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
