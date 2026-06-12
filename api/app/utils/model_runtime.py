from __future__ import annotations

import asyncio
import gc
import random
from typing import Any, Callable


_embedding_lock = asyncio.Lock()
_embedding_model_name: str | None = None
_embedding_model: Any | None = None

_image_lock = asyncio.Lock()
_image_ckpt_path: str | None = None
_image_pipe: Any | None = None

_selection_lock = asyncio.Lock()
_selection_model_file_url: str | None = None
_selection_model: Any | None = None


async def encode_scene_text(model_name: str, text: str) -> list[float]:
    async with _embedding_lock:
        return await asyncio.to_thread(_encode_scene_text_locked, model_name, text)


async def generate_images_batch(
    ckpt_path: str,
    positive_prompt_list: list[str],
    negative_prompt_list: list[str],
    seed_list: list[int | None],
    step: int,
    cfg: float,
    height: int,
    width: int,
    max_chunk_size: int,
    seed_min: int,
    seed_max: int,
) -> tuple[list[Any], list[int]]:
    async with _image_lock:
        return await asyncio.to_thread(
            _generate_images_batch_locked,
            ckpt_path,
            positive_prompt_list,
            negative_prompt_list,
            seed_list,
            step,
            cfg,
            height,
            width,
            max_chunk_size,
            seed_min,
            seed_max,
        )


async def predict_target_scene_embedding(
    model_file_url: str,
    input_values: list[float],
    *,
    load_model_artifact: Callable[[str], dict[str, Any]],
    build_model: Callable[[dict[str, Any]], Any],
    load_torch: Callable[[], tuple[Any, Any]],
) -> list[float]:
    async with _selection_lock:
        return await asyncio.to_thread(
            _predict_target_scene_embedding_locked,
            model_file_url,
            input_values,
            load_model_artifact,
            build_model,
            load_torch,
        )


async def update_selection_model(update_model: Callable[[], Any]) -> Any:
    async with _selection_lock:
        return await asyncio.to_thread(update_model)


def reset_model_runtime_for_tests() -> None:
    global _embedding_model_name, _embedding_model
    global _image_ckpt_path, _image_pipe
    global _selection_model_file_url, _selection_model

    _embedding_model_name = None
    _embedding_model = None
    _image_ckpt_path = None
    _image_pipe = None
    _selection_model_file_url = None
    _selection_model = None


def _encode_scene_text_locked(model_name: str, text: str) -> list[float]:
    model = _get_embedding_model_locked(model_name)
    raw_embedding = model.encode(text)
    if hasattr(raw_embedding, "tolist"):
        raw_embedding = raw_embedding.tolist()
    return [float(value) for value in raw_embedding]


def _get_embedding_model_locked(model_name: str) -> Any:
    global _embedding_model_name, _embedding_model

    if _embedding_model is None or _embedding_model_name != model_name:
        from sentence_transformers import SentenceTransformer

        _embedding_model = SentenceTransformer(model_name)
        _embedding_model_name = model_name
    return _embedding_model


def _generate_images_batch_locked(
    ckpt_path: str,
    positive_prompt_list: list[str],
    negative_prompt_list: list[str],
    seed_list: list[int | None],
    step: int,
    cfg: float,
    height: int,
    width: int,
    max_chunk_size: int,
    seed_min: int,
    seed_max: int,
) -> tuple[list[Any], list[int]]:
    torch = _load_image_torch()
    pipe = _get_image_pipe_locked(ckpt_path, torch)

    images: list[Any] = []
    seeds: list[int] = []
    i = 0
    while i < len(positive_prompt_list):
        chunk_size = min(max_chunk_size, len(positive_prompt_list) - i)
        positive_prompt_chunk = positive_prompt_list[i:i + chunk_size]
        negative_prompt_chunk = negative_prompt_list[i:i + chunk_size]
        seed_chunk = [
            random.randint(seed_min, seed_max)
            if seed_list[i + j] is None
            else seed_list[i + j]
            for j in range(chunk_size)
        ]
        generators_chunk = [
            torch.Generator(device="cuda").manual_seed(seed_int)
            for seed_int in seed_chunk
        ]
        _clear_cuda_cache(torch)
        images.extend(
            pipe(
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


def _get_image_pipe_locked(ckpt_path: str, torch: Any) -> Any:
    global _image_ckpt_path, _image_pipe

    if _image_pipe is not None and _image_ckpt_path != ckpt_path:
        _image_pipe = None
        _image_ckpt_path = None
        _clear_cuda_cache(torch)

    if _image_pipe is None:
        from diffusers import StableDiffusionPipeline, LCMScheduler

        pipe = StableDiffusionPipeline.from_single_file(
            ckpt_path,
            torch_dtype=torch.float16,
            use_safetensors=True,
            safety_checker=None,
        )
        pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
        pipe.to("cuda")

        '''
        from diffusers import StableDiffusionXLPipeline

        print(f"Loading Stable Diffusion checkpoint: {ckpt_path}", flush=True)
        pipe = StableDiffusionXLPipeline.from_single_file(
            ckpt_path,
            torch_dtype=torch.float16,
            use_safetensors=True,
        )
        pipe.to("cuda")
        '''

        pipe.enable_attention_slicing()
        pipe.enable_vae_slicing()
        _image_pipe = pipe
        _image_ckpt_path = ckpt_path
    return _image_pipe


def _predict_target_scene_embedding_locked(
    model_file_url: str,
    input_values: list[float],
    load_model_artifact: Callable[[str], dict[str, Any]],
    build_model: Callable[[dict[str, Any]], Any],
    load_torch: Callable[[], tuple[Any, Any]],
) -> list[float]:
    model = _get_selection_model_locked(model_file_url, load_model_artifact, build_model)
    torch, _nn = load_torch()
    with torch.no_grad():
        return model(torch.tensor([input_values], dtype=torch.float32)).squeeze(0).tolist()


def _get_selection_model_locked(
    model_file_url: str,
    load_model_artifact: Callable[[str], dict[str, Any]],
    build_model: Callable[[dict[str, Any]], Any],
) -> Any:
    global _selection_model_file_url, _selection_model

    if _selection_model is None or _selection_model_file_url != model_file_url:
        artifact = load_model_artifact(model_file_url)
        model = build_model(artifact["parameters"])
        model.load_state_dict(artifact["state_dict"])
        model.eval()
        _selection_model = model
        _selection_model_file_url = model_file_url
    return _selection_model


def _load_image_torch() -> Any:
    import torch

    return torch


def _clear_cuda_cache(torch: Any) -> None:
    torch.cuda.empty_cache()
    gc.collect()
