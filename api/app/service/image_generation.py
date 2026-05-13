import asyncio
import gc
import random
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from settings import API_ROOT, settings
from utils.crud_helpers import cleanup_orphaned_object_keys
from utils.local_storage import build_object_key, public_file_url, upload_fileobj

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

_generation_lock = asyncio.Semaphore(1)


async def generate_prompt_image_for_entity(
    db: AsyncSession,
    entity: Any,
    entity_name: str,
) -> dict[str, int | str]:
    prompt = (getattr(entity, "prompt", None) or "").strip()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{entity_name} prompt is required")

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
        )

    image = images[0] if images else None
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="image generation returned no image",
        )

    entity_id = getattr(entity, "id")
    image_key = build_object_key(
        kind="image",
        filename=f"{entity_name}-{entity_id}{GEN_IMAGE_OUTPUT_EXTENSION}",
    )
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

    old_image_key = getattr(entity, "image", None)
    entity.image = image_key
    await db.commit()
    await cleanup_orphaned_object_keys(db, [old_image_key])

    return {
        "id": entity_id,
        "image": public_file_url(image_key),
        "seed": seed,
    }


def generate_images_batch(
    ckpt_path: str,
    positive_prompt_list: list[str],
    negative_prompt_list: list[str],
    seed_list: list[int | None],
    step: int,
    cfg: float,
    height: int,
    width: int,
    max_chunk_size: int = 4,
) -> tuple[list[Any], list[int]]:
    torch, pipeline_class = _load_generation_dependencies()

    if not hasattr(generate_images_batch, "pipe"):
        generate_images_batch.pipe = pipeline_class.from_single_file(
            ckpt_path,
            torch_dtype=torch.float16,
            use_safetensors=True,
        )
        generate_images_batch.pipe.to("cuda")
        generate_images_batch.pipe.enable_attention_slicing()
        generate_images_batch.pipe.enable_vae_slicing()

    images: list[Any] = []
    seeds: list[int] = []
    i = 0
    while i < len(positive_prompt_list):
        chunk_size = min(max_chunk_size, len(positive_prompt_list) - i)
        positive_prompt_chunk = positive_prompt_list[i:i + chunk_size]
        negative_prompt_chunk = negative_prompt_list[i:i + chunk_size]
        seed_chunk = [
            random.randint(GEN_IMAGE_SEED_MIN, GEN_IMAGE_SEED_MAX)
            if seed_list[i + j] is None
            else seed_list[i + j]
            for j in range(chunk_size)
        ]
        generators_chunk = [
            torch.Generator(device="cuda").manual_seed(seed_int)
            for seed_int in seed_chunk
        ]
        torch.cuda.empty_cache()
        gc.collect()
        images.extend(
            generate_images_batch.pipe(
                prompt=positive_prompt_chunk,
                negative_prompt=negative_prompt_chunk,
                num_inference_steps=step,
                guidance_scale=cfg,
                height=height,
                width=width,
                generator=generators_chunk,
            ).images
        )
        seeds.extend(seed_chunk)
        i += chunk_size

    return images, seeds


def _load_generation_dependencies():
    import torch
    from diffusers import StableDiffusionXLPipeline

    return torch, StableDiffusionXLPipeline


def _image_content_type(output_format: str) -> str:
    normalized_format = output_format.lower()
    if normalized_format == "png":
        return "image/png"
    if normalized_format == "webp":
        return "image/webp"
    return "image/jpeg"
