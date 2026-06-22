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

from db import Image as StoredImage, Cut, Scene, Status
from models import (
    GenerateCutRequestBase,
    ImageGenerationSettingsBase,
    UpdateCutContextRequestBase,
    UpdateCutFavoriteRequestBase,
    UpdateCutImageRequestBase,
    UpdateCutLinksRequestBase,
    UpsertResponseBase,
    CutBase,
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
    CUT_PROMPT_FIELDS,
)
from service.image_util import (
    resolve_image_generation_model_path,
    resolve_image_generation_settings,
)
from service.prompt_text import strip_prompt_weight_syntax
from utils.local_storage import (
    build_object_key,
    delete_object,
    is_allowed_content_type,
    object_key_from_public_url,
    upload_fileobj,
)
from model_runtime import encode_cut_text, generate_images_batch
from utils.vector import VECTOR_DIMENSION, validate_embedding

CUT_EMBEDDING_PROMPT_FIELDS = ("prompt_situation", "prompt_hero")


def cut_image_load_option():
    return selectinload(Cut.image).load_only(
        StoredImage.id,
        StoredImage.image_object_key,
        StoredImage.scribble_object_key,
        StoredImage.pose_object_key,
        StoredImage.positive_prompt,
        StoredImage.negative_prompt,
        StoredImage.seed_image_id,
        StoredImage.model_parameters,
    )


async def generate_cut_from_form(db: AsyncSession, form: FormData) -> Cut:
    generate_request, image, mask, scribble_image, pose_image = await parse_generate_cut_form(form)
    return await generate_cut(
        db,
        generate_request,
        seed_image=image,
        mask_image=mask,
        scribble_image=scribble_image,
        pose_image=pose_image,
    )


async def parse_generate_cut_form(
    form: FormData,
) -> tuple[GenerateCutRequestBase, bytes | None, bytes | None, bytes | None, bytes | None]:
    generate_request = parse_generate_cut_payload(form)
    if not generate_request.generate_image:
        return generate_request, None, None, None, None

    image = await read_image_upload(form, "image")
    mask = await read_image_upload(form, "mask")
    scribble_image = await read_image_upload(form, "scribble_image")
    pose_image = await read_image_upload(form, "pose_image")
    return generate_request, image, mask, scribble_image, pose_image


def parse_generate_cut_payload(form: FormData) -> GenerateCutRequestBase:
    payload = form.get("payload")
    if not isinstance(payload, str) or not payload.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payload is required")
    try:
        return GenerateCutRequestBase.model_validate_json(payload)
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


async def generate_cut(
    db: AsyncSession,
    request: GenerateCutRequestBase,
    seed_image: bytes | None = None,
    mask_image: bytes | None = None,
    scribble_image: bytes | None = None,
    pose_image: bytes | None = None,
) -> Cut:
    should_generate_image = request.generate_image
    cut: Cut | None = None
    image_key = None
    scribble_key = None
    pose_key = None
    if request.cut_id is not None:
        cut = (
            await db.execute(
                select(Cut)
                .options(cut_image_load_option())
                .where(Cut.id == request.cut_id)
            )
        ).scalar_one_or_none()
        if cut is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="cut not found")

    parent_image_id = None
    if should_generate_image and request.parent_image_id is not None:
        parent_image_id = await validate_image_id(db, request.parent_image_id)
    should_update_cut_image = (not should_generate_image) and "image_id" in request.model_fields_set
    cut_image_id = None
    if should_update_cut_image and request.image_id is not None:
        cut_image_id = await validate_image_id(db, request.image_id)
    should_update_cut_scene = "scene_id" in request.model_fields_set
    scene_id = None
    if should_update_cut_scene and request.scene_id is not None:
        scene_id = await validate_scene_id(db, request.scene_id)
    should_update_prev_cut = "prev_cut_id" in request.model_fields_set
    prev_cut_id = None
    if should_update_prev_cut and request.prev_cut_id is not None:
        prev_cut_id = await validate_cut_reference_id(db, request.prev_cut_id, "prev_cut_id")

    script = normalize_cut_script(request.script)
    column_values = {field: getattr(request, field) for field in CUT_PROMPT_FIELDS}
    visual_prompt = build_cut_visual_prompt(column_values)
    if not visual_prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cut prompt component is required")
    embedding_visual_prompt = build_cut_embedding_visual_prompt(column_values)
    embedding = await make_cut_embedding(embedding_visual_prompt, script)
    image_result: dict[str, Any] | None = None
    if should_generate_image:
        try:
            image_result = await generate_cut_image(
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
                scribble_key = upload_cut_control_image(
                    scribble_image,
                    "cut-controlnet-scribble.png",
                )
            if pose_image is not None:
                pose_key = upload_cut_control_image(
                    pose_image,
                    "cut-controlnet-openpose.png",
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
        if cut is None:
            cut = Cut()
            db.add(cut)

        cut.script = script
        cut.status_change = request.status_change
        if request.favorited is not None:
            cut.favorited = request.favorited
        cut.embedding = embedding
        for field in CUT_PROMPT_FIELDS:
            setattr(cut, field, column_values[field])
        cut.prompt_negative = request.prompt_negative
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
            cut.image = stored_image
        elif should_update_cut_image:
            cut.image_id = cut_image_id
            if cut_image_id is None:
                cut.image = None
        if should_update_cut_scene:
            cut.scene_id = scene_id
        if should_update_prev_cut:
            cut.prev_cut_id = prev_cut_id
        await db.commit()
        await db.refresh(cut)
        if cut.image_id is not None:
            await db.refresh(cut, attribute_names=["image"])
        else:
            cut.image = None
    except Exception:
        await db.rollback()
        if image_key is not None:
            delete_object(image_key)
        if scribble_key is not None:
            delete_object(scribble_key)
        if pose_key is not None:
            delete_object(pose_key)
        raise

    return cut


async def upsert_cuts(db: AsyncSession, items: list[CutBase]) -> list[UpsertResponseBase]:
    if not items:
        return []

    item_ids = [item.id for item in items if item.id is not None]
    existing_cuts = {}
    if item_ids:
        result = await db.execute(
            select(Cut)
            .options(cut_image_load_option())
            .where(Cut.id.in_(item_ids))
        )
        existing_cuts = {cut.id: cut for cut in result.scalars().all()}

    pending_results: list[Cut] = []
    try:
        for item in items:
            cut = existing_cuts.get(item.id) if item.id is not None else None
            is_new_cut = cut is None
            if cut is None:
                cut = Cut()
                db.add(cut)

            stored_image = await resolve_cut_image_for_upsert(db, item)
            scene_id = None
            if "scene_id" in item.model_fields_set and item.scene_id is not None:
                scene_id = await validate_scene_id(db, item.scene_id)
            prev_cut_id = None
            if "prev_cut_id" in item.model_fields_set and item.prev_cut_id is not None:
                prev_cut_id = await validate_cut_reference_id(db, item.prev_cut_id, "prev_cut_id")
            script = normalize_cut_script(item.script)
            column_values = {field: getattr(item, field) for field in CUT_PROMPT_FIELDS}
            visual_prompt = build_cut_visual_prompt(column_values)
            if not visual_prompt:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cut prompt component is required")
            embedding_visual_prompt = build_cut_embedding_visual_prompt(column_values)

            cut.image = stored_image
            if "scene_id" in item.model_fields_set:
                cut.scene_id = scene_id
            if "prev_cut_id" in item.model_fields_set:
                cut.prev_cut_id = prev_cut_id
            cut.script = script
            cut.status_change = item.status_change
            if is_new_cut or "favorited" in item.model_fields_set:
                cut.favorited = item.favorited
            cut.embedding = await make_cut_embedding(embedding_visual_prompt, script)
            for field in CUT_PROMPT_FIELDS:
                setattr(cut, field, column_values[field])
            cut.prompt_negative = item.prompt_negative

            pending_results.append(cut)

        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return [UpsertResponseBase(id=cut.id) for cut in pending_results]


async def update_cut_image(db: AsyncSession, request: UpdateCutImageRequestBase) -> Cut:
    cut = (
        await db.execute(
            select(Cut)
            .options(cut_image_load_option())
            .where(Cut.id == request.cut_id)
        )
    ).scalar_one_or_none()
    if cut is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="cut not found")

    image_id = None
    if request.image_id is not None:
        image_id = await validate_image_id(db, request.image_id)

    try:
        cut.image_id = image_id
        if image_id is None:
            cut.image = None
        await db.commit()
        await db.refresh(cut)
        if cut.image_id is not None:
            await db.refresh(cut, attribute_names=["image"])
        else:
            cut.image = None
    except Exception:
        await db.rollback()
        raise

    return cut


async def update_cut_favorite(db: AsyncSession, request: UpdateCutFavoriteRequestBase) -> Cut:
    cut = (
        await db.execute(
            select(Cut)
            .options(cut_image_load_option())
            .where(Cut.id == request.cut_id)
        )
    ).scalar_one_or_none()
    if cut is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="cut not found")

    try:
        cut.favorited = request.favorited
        await db.commit()
        await db.refresh(cut)
        if cut.image_id is not None:
            await db.refresh(cut, attribute_names=["image"])
        else:
            cut.image = None
    except Exception:
        await db.rollback()
        raise

    return cut


async def update_cut_links(db: AsyncSession, request: UpdateCutLinksRequestBase) -> Cut:
    cut = (
        await db.execute(
            select(Cut)
            .options(cut_image_load_option())
            .where(Cut.id == request.cut_id)
        )
    ).scalar_one_or_none()
    if cut is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="cut not found")

    next_scene_id = cut.scene_id
    if "scene_id" in request.model_fields_set:
        next_scene_id = None if request.scene_id is None else await validate_scene_id(db, request.scene_id)

    next_prev_cut_id = cut.prev_cut_id
    if "prev_cut_id" in request.model_fields_set:
        next_prev_cut_id = None
        if request.prev_cut_id is not None:
            next_prev_cut_id = await validate_prev_cut_id(
                db,
                cut_id=cut.id,
                prev_cut_id=request.prev_cut_id,
                scene_id=next_scene_id,
            )
    elif next_prev_cut_id is not None:
        next_prev_cut_id = await validate_prev_cut_id(
            db,
            cut_id=cut.id,
            prev_cut_id=next_prev_cut_id,
            scene_id=next_scene_id,
        )

    try:
        if "scene_id" in request.model_fields_set:
            cut.scene_id = next_scene_id
        if "prev_cut_id" in request.model_fields_set:
            cut.prev_cut_id = next_prev_cut_id
        await db.commit()
        await db.refresh(cut)
        if cut.image_id is not None:
            await db.refresh(cut, attribute_names=["image"])
        else:
            cut.image = None
    except Exception:
        await db.rollback()
        raise

    return cut


async def validate_image_id(db: AsyncSession, image_id: int) -> int:
    stored_image = await db.get(StoredImage, image_id)
    if stored_image is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image_id not found")
    return stored_image.id


async def validate_scene_id(db: AsyncSession, scene_id: int) -> int:
    scene = await db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="scene_id not found")
    return scene.id


async def validate_cut_reference_id(db: AsyncSession, cut_id: int, field_name: str) -> int:
    cut = await db.get(Cut, cut_id)
    if cut is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field_name} not found")
    return cut.id


async def validate_prev_cut_id(
    db: AsyncSession,
    *,
    cut_id: int,
    prev_cut_id: int,
    scene_id: int | None,
) -> int:
    if prev_cut_id == cut_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="prev_cut_id cannot be the same as cut_id",
        )
    prev_cut = await db.get(Cut, prev_cut_id)
    if prev_cut is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="prev_cut_id not found")
    if prev_cut.scene_id != scene_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="prev_cut_id must belong to the same scene",
        )

    await require_acyclic_prev_cut(db, cut_id=cut_id, prev_cut_id=prev_cut_id)
    return prev_cut.id


async def require_acyclic_prev_cut(db: AsyncSession, *, cut_id: int, prev_cut_id: int) -> None:
    current_id: int | None = prev_cut_id
    seen_ids: set[int] = set()
    while current_id is not None:
        if current_id == cut_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="prev_cut_id would create a cycle",
            )
        if current_id in seen_ids:
            return
        seen_ids.add(current_id)
        current_id = (
            await db.execute(select(Cut.prev_cut_id).where(Cut.id == current_id))
        ).scalar_one_or_none()


async def resolve_cut_image_for_upsert(db: AsyncSession, item: CutBase) -> StoredImage | None:
    if item.image_id is not None:
        stored_image = await db.get(StoredImage, item.image_id)
        if stored_image is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image_id not found")
        return stored_image

    image_key = normalize_cut_upload_reference("image_url", item.image_url)
    scribble_key = normalize_cut_upload_reference("scribble_url", item.scribble_url)
    pose_key = normalize_cut_upload_reference("pose_url", item.pose_url)
    if image_key is None and scribble_key is None and pose_key is None:
        return None

    stored_image = StoredImage(
        image_object_key=image_key,
        scribble_object_key=scribble_key,
        pose_object_key=pose_key,
        model_parameters={"source": "cut_upsert_upload_reference"},
    )
    db.add(stored_image)
    return stored_image


async def make_cut_embedding(visual_prompt: str, script: str) -> list[float]:
    embedding_input = build_cut_embedding_input(strip_prompt_weight_syntax(visual_prompt), script)
    model_name = settings.CUT_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="cut embedding model name is required",
        )

    embedding = await encode_cut_text(model_name, embedding_input)
    if len(embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"cut embedding model must return {VECTOR_DIMENSION} dimensions",
        )
    return embedding


async def get_similar_cuts(db: AsyncSession, text: str) -> list[Cut]:
    query_text = text.strip()
    if not query_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")

    model_name = settings.CUT_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="cut embedding model name is required",
        )

    text_embedding = await encode_cut_text(model_name, f"query: {query_text}")
    if len(text_embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"cut embedding model must return {VECTOR_DIMENSION} dimensions",
        )

    cuts = (await db.execute(select(Cut).options(cut_image_load_option()))).scalars().all()
    cut_distances = []
    for cut in cuts:
        try:
            cut_embedding = validate_embedding(cut.embedding, "cut.embedding")
        except HTTPException:
            continue

        distance = cosine_distance(text_embedding, cut_embedding)
        if distance is None:
            continue
        cut_distances.append((cut, distance))

    return [
        cut
        for cut, _distance in sorted(
            cut_distances,
            key=lambda item: (item[1], item[0].id or 0),
        )
    ]


def normalize_cut_script(script: str) -> str:
    return script.replace("\r\n", "\n").replace("\r", "\n")


def normalize_cut_upload_reference(field_name: str, value: str | None) -> str | None:
    if value in (None, ""):
        return None

    object_key = object_key_from_public_url(value)
    if object_key is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be a local upload object key",
        )
    return object_key


def build_cut_visual_prompt(column_values: dict[str, str | None]) -> str:
    return ", ".join(
        (column_values[field] or "").strip()
        for field in CUT_PROMPT_FIELDS
        if (column_values[field] or "").strip()
    )


def build_cut_embedding_visual_prompt(column_values: dict[str, str | None]) -> str:
    return ", ".join(
        (column_values[field] or "").strip()
        for field in CUT_EMBEDDING_PROMPT_FIELDS
        if (column_values[field] or "").strip()
    )


def build_generation_prompt(parts: list[str | None]) -> str:
    return ", ".join(
        part.strip().strip(",")
        for part in parts
        if isinstance(part, str) and part.strip().strip(",")
    )


def build_cut_embedding_input(visual_prompt: str, script: str) -> str:
    return f"passage: {visual_prompt}\n{script}"


async def make_positive_prompt_embedding(positive_prompt: str) -> list[float] | None:
    if not positive_prompt.strip():
        return None

    model_name = settings.CUT_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="cut embedding model name is required",
        )

    embedding_prompt = strip_prompt_weight_syntax(positive_prompt)
    embedding = await encode_cut_text(model_name, f"passage: {embedding_prompt}")
    if len(embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"cut embedding model must return {VECTOR_DIMENSION} dimensions",
        )
    return embedding


def upload_cut_control_image(image_bytes: bytes, filename: str) -> str:
    object_key = build_object_key(kind="image", filename=filename)
    image_file = BytesIO(image_bytes)
    upload_fileobj(image_file, object_key, "image/png")
    return object_key


async def generate_cut_image(
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
        column_values["prompt_detail"],
        column_values["prompt_camera"],
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

    image_key = build_object_key(kind="image", filename=f"cut{GEN_IMAGE_OUTPUT_EXTENSION}")
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
    cut_embedding: list[float],
) -> list[float]:
    return [
        context_value * 0.9 + cut_value
        for context_value, cut_value in zip(context_embedding, cut_embedding)
    ]


async def update_cut_context(
    db: AsyncSession,
    request: UpdateCutContextRequestBase,
) -> Status:
    current_status = await db.get(Status, request.status_id)
    if current_status is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="status not found")

    cut = await db.get(Cut, request.cut_id)
    if cut is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="cut not found")

    cut_embedding = validate_embedding(cut.embedding, "cut.embedding")
    context_embedding = (
        validate_embedding(current_status.context_embedding, "status.context_embedding")
        if current_status.context_embedding is not None
        else [0.0] * len(cut_embedding)
    )

    current_status.context_embedding = update_context_embedding(
        context_embedding,
        cut_embedding,
    )
    await db.commit()
    await db.refresh(current_status)

    return current_status
