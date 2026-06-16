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
_image_pipe_mode: str | None = None
_image_controlnet_model_id: str | None = None
_image_pipe: Any | None = None

_selection_lock = asyncio.Lock()
_selection_model_file_url: str | None = None
_selection_model: Any | None = None


async def encode_scene_text(model_name: str, text: str) -> list[float]:
    async with _embedding_lock:
        return await asyncio.to_thread(_encode_scene_text_locked, model_name, text)


async def generate_images_batch(
    ckpt_path: str,
    image_mode: str,
    positive_prompt_list: list[str],
    negative_prompt_list: list[str],
    init_image_list: list[Any],
    mask_image_list: list[Any],
    control_image_list: list[Any],
    seed_list: list[int | None],
    step: int,
    cfg: float,
    height: int,
    width: int,
    strength: float,
    max_chunk_size: int,
    seed_min: int,
    seed_max: int,
    sampler: str,
    scheduler: str,
    clip_skip: int | None,
    controlnet_model_id: str,
    controlnet_conditioning_scale: float,
    control_guidance_start: float,
    control_guidance_end: float,
) -> tuple[list[Any], list[int]]:
    async with _image_lock:
        return await asyncio.to_thread(
            _generate_images_batch_locked,
            ckpt_path,
            image_mode,
            positive_prompt_list,
            negative_prompt_list,
            init_image_list,
            mask_image_list,
            control_image_list,
            seed_list,
            step,
            cfg,
            height,
            width,
            strength,
            max_chunk_size,
            seed_min,
            seed_max,
            sampler,
            scheduler,
            clip_skip,
            controlnet_model_id,
            controlnet_conditioning_scale,
            control_guidance_start,
            control_guidance_end,
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
    global _image_ckpt_path, _image_pipe_mode, _image_controlnet_model_id, _image_pipe
    global _selection_model_file_url, _selection_model

    _embedding_model_name = None
    _embedding_model = None
    _image_ckpt_path = None
    _image_pipe_mode = None
    _image_controlnet_model_id = None
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

        _embedding_model = SentenceTransformer(model_name, device="cpu")
        if hasattr(_embedding_model, "to"):
            _embedding_model = _embedding_model.to("cpu")
        _embedding_model_name = model_name
    return _embedding_model


def _generate_images_batch_locked(
    ckpt_path: str,
    image_mode: str,
    positive_prompt_list: list[str],
    negative_prompt_list: list[str],
    init_image_list: list[Any],
    mask_image_list: list[Any],
    control_image_list: list[Any],
    seed_list: list[int | None],
    step: int,
    cfg: float,
    height: int,
    width: int,
    strength: float,
    max_chunk_size: int,
    seed_min: int,
    seed_max: int,
    sampler: str,
    scheduler: str,
    clip_skip: int | None,
    controlnet_model_id: str,
    controlnet_conditioning_scale: float,
    control_guidance_start: float,
    control_guidance_end: float,
) -> tuple[list[Any], list[int]]:
    normalized_image_mode = image_mode.strip().lower()
    torch = _load_image_torch()
    pipe = _get_image_pipe_locked(ckpt_path, normalized_image_mode, controlnet_model_id, torch)
    sampler_key = sampler.strip().lower()
    scheduler_key = scheduler.strip().lower()
    if sampler_key:
        if sampler_key == "euler":
            from diffusers import EulerDiscreteScheduler

            pipe.scheduler = EulerDiscreteScheduler.from_config(
                pipe.scheduler.config,
                use_karras_sigmas=scheduler_key == "karras",
            )
        elif sampler_key == "euler_a":
            from diffusers import EulerAncestralDiscreteScheduler

            pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
        elif sampler_key == "dpmpp_2m":
            from diffusers import DPMSolverMultistepScheduler

            pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                pipe.scheduler.config,
                algorithm_type="dpmsolver++",
                solver_order=2,
                use_karras_sigmas=scheduler_key == "karras",
            )
        elif sampler_key == "unipc":
            from diffusers import UniPCMultistepScheduler

            pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config)
        else:
            raise ValueError(f"unsupported image sampler: {sampler}")

    images: list[Any] = []
    seeds: list[int] = []
    i = 0
    while i < len(positive_prompt_list):
        chunk_size = min(max_chunk_size, len(positive_prompt_list) - i)
        positive_prompt_chunk = positive_prompt_list[i:i + chunk_size]
        negative_prompt_chunk = negative_prompt_list[i:i + chunk_size]
        init_image_chunk = init_image_list[i:i + chunk_size]
        mask_image_chunk = mask_image_list[i:i + chunk_size]
        control_image_chunk = control_image_list[i:i + chunk_size]
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
        call_kwargs = {
            "prompt": positive_prompt_chunk,
            "negative_prompt": negative_prompt_chunk,
            "num_inference_steps": step,
            "guidance_scale": cfg,
            "generator": generators_chunk,
        }
        if normalized_image_mode == "t2i":
            call_kwargs["height"] = height
            call_kwargs["width"] = width
        elif normalized_image_mode == "i2i":
            call_kwargs["image"] = init_image_chunk
            call_kwargs["strength"] = strength
        elif normalized_image_mode == "inpaint":
            call_kwargs["image"] = init_image_chunk
            call_kwargs["mask_image"] = mask_image_chunk
            call_kwargs["height"] = height
            call_kwargs["width"] = width
            call_kwargs["strength"] = strength
        elif normalized_image_mode == "controlnet_inpaint":
            call_kwargs["image"] = init_image_chunk
            call_kwargs["mask_image"] = mask_image_chunk
            call_kwargs["control_image"] = control_image_chunk
            call_kwargs["height"] = height
            call_kwargs["width"] = width
            call_kwargs["strength"] = strength
            call_kwargs["controlnet_conditioning_scale"] = controlnet_conditioning_scale
            call_kwargs["control_guidance_start"] = control_guidance_start
            call_kwargs["control_guidance_end"] = control_guidance_end
        else:
            raise ValueError(f"unsupported image generation mode: {image_mode}")
        if clip_skip is not None:
            call_kwargs["clip_skip"] = clip_skip
        images.extend(pipe(**call_kwargs).images)
        seeds.extend(seed_chunk)
        i += chunk_size

    return images, seeds


def _get_image_pipe_locked(
    ckpt_path: str,
    image_mode: str,
    controlnet_model_id: str,
    torch: Any,
) -> Any:
    global _image_ckpt_path, _image_pipe_mode, _image_controlnet_model_id, _image_pipe

    next_controlnet_model_id = controlnet_model_id if image_mode == "controlnet_inpaint" else None
    if (
        _image_pipe is not None
        and (
            _image_ckpt_path != ckpt_path
            or _image_pipe_mode != image_mode
            or _image_controlnet_model_id != next_controlnet_model_id
        )
    ):
        _image_pipe = None
        _image_ckpt_path = None
        _image_pipe_mode = None
        _image_controlnet_model_id = None
        _clear_cuda_cache(torch)

    if _image_pipe is None:
        if image_mode == "t2i":
            from diffusers import StableDiffusionXLPipeline

            pipeline_cls = StableDiffusionXLPipeline
        elif image_mode == "i2i":
            from diffusers import StableDiffusionXLImg2ImgPipeline

            pipeline_cls = StableDiffusionXLImg2ImgPipeline
        elif image_mode == "inpaint":
            from diffusers import StableDiffusionXLInpaintPipeline

            pipeline_cls = StableDiffusionXLInpaintPipeline
        elif image_mode == "controlnet_inpaint":
            from diffusers import ControlNetModel, StableDiffusionXLControlNetInpaintPipeline

            controlnet = ControlNetModel.from_pretrained(
                controlnet_model_id,
                torch_dtype=torch.float16,
            )
            pipeline_cls = StableDiffusionXLControlNetInpaintPipeline
        else:
            raise ValueError(f"unsupported image generation mode: {image_mode}")

        print(f"Loading Stable Diffusion {image_mode} checkpoint: {ckpt_path}", flush=True)
        if image_mode == "controlnet_inpaint":
            print(f"Loading ControlNet scribble model: {controlnet_model_id}", flush=True)
            pipe = pipeline_cls.from_single_file(
                ckpt_path,
                controlnet=controlnet,
                torch_dtype=torch.float16,
                use_safetensors=True,
            )
        else:
            pipe = pipeline_cls.from_single_file(
                ckpt_path,
                torch_dtype=torch.float16,
                use_safetensors=True,
            )
        pipe.to("cuda")

        pipe.enable_attention_slicing()
        pipe.enable_vae_slicing()
        _image_pipe = pipe
        _image_ckpt_path = ckpt_path
        _image_pipe_mode = image_mode
        _image_controlnet_model_id = next_controlnet_model_id
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
        return model(torch.tensor([input_values], dtype=torch.float32, device="cpu")).squeeze(0).tolist()


def _get_selection_model_locked(
    model_file_url: str,
    load_model_artifact: Callable[[str], dict[str, Any]],
    build_model: Callable[[dict[str, Any]], Any],
) -> Any:
    global _selection_model_file_url, _selection_model

    if _selection_model is None or _selection_model_file_url != model_file_url:
        artifact = load_model_artifact(model_file_url)
        model = build_model(artifact["parameters"])
        model = model.to("cpu")
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
