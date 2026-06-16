from __future__ import annotations

import asyncio
import gc
import random
from typing import Any


_image_lock = asyncio.Lock()
_image_ckpt_path: str | None = None
_image_pipe_mode: str | None = None
_image_controlnet_model_ids: tuple[str, ...] | None = None
_image_pipe: Any | None = None


async def generate_images_batch(
    ckpt_path: str,
    image_mode: str,
    positive_prompt_list: list[str],
    negative_prompt_list: list[str],
    init_image_list: list[Any],
    mask_image_list: list[Any],
    controlnet_image_list: list[list[Any]],
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
    controlnet_model_ids: list[str],
    controlnet_conditioning_scales: list[float],
    control_guidance_starts: list[float],
    control_guidance_ends: list[float],
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
            controlnet_image_list,
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
            controlnet_model_ids,
            controlnet_conditioning_scales,
            control_guidance_starts,
            control_guidance_ends,
        )


def _reset_image_runtime_for_tests() -> None:
    global _image_ckpt_path, _image_pipe_mode, _image_controlnet_model_ids, _image_pipe

    _image_ckpt_path = None
    _image_pipe_mode = None
    _image_controlnet_model_ids = None
    _image_pipe = None


def _generate_images_batch_locked(
    ckpt_path: str,
    image_mode: str,
    positive_prompt_list: list[str],
    negative_prompt_list: list[str],
    init_image_list: list[Any],
    mask_image_list: list[Any],
    controlnet_image_list: list[list[Any]],
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
    controlnet_model_ids: list[str],
    controlnet_conditioning_scales: list[float],
    control_guidance_starts: list[float],
    control_guidance_ends: list[float],
) -> tuple[list[Any], list[int]]:
    normalized_image_mode = image_mode.strip().lower()
    torch = _load_image_torch()
    pipe = _get_image_pipe_locked(ckpt_path, normalized_image_mode, controlnet_model_ids, torch)
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
        controlnet_image_chunk = controlnet_image_list[i:i + chunk_size]
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
            if not controlnet_model_ids:
                raise ValueError("controlnet_inpaint requires at least one ControlNet model")
            if len(controlnet_model_ids) > 1 and chunk_size > 1:
                raise ValueError("multiple ControlNets support only a single image per generation chunk")
            if any(len(controlnet_images) != len(controlnet_model_ids) for controlnet_images in controlnet_image_chunk):
                raise ValueError("control image count must match ControlNet model count")
            call_kwargs["image"] = init_image_chunk
            call_kwargs["mask_image"] = mask_image_chunk
            call_kwargs["control_image"] = (
                [controlnet_images[0] for controlnet_images in controlnet_image_chunk]
                if len(controlnet_model_ids) == 1
                else controlnet_image_chunk[0]
            )
            call_kwargs["height"] = height
            call_kwargs["width"] = width
            call_kwargs["strength"] = strength
            call_kwargs["controlnet_conditioning_scale"] = (
                controlnet_conditioning_scales[0]
                if len(controlnet_model_ids) == 1
                else controlnet_conditioning_scales
            )
            call_kwargs["control_guidance_start"] = (
                control_guidance_starts[0]
                if len(controlnet_model_ids) == 1
                else control_guidance_starts
            )
            call_kwargs["control_guidance_end"] = (
                control_guidance_ends[0]
                if len(controlnet_model_ids) == 1
                else control_guidance_ends
            )
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
    controlnet_model_ids: list[str],
    torch: Any,
) -> Any:
    global _image_ckpt_path, _image_pipe_mode, _image_controlnet_model_ids, _image_pipe

    next_controlnet_model_ids = tuple(controlnet_model_ids) if image_mode == "controlnet_inpaint" else None
    if (
        _image_pipe is not None
        and (
            _image_ckpt_path != ckpt_path
            or _image_pipe_mode != image_mode
            or _image_controlnet_model_ids != next_controlnet_model_ids
        )
    ):
        _image_pipe = None
        _image_ckpt_path = None
        _image_pipe_mode = None
        _image_controlnet_model_ids = None
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

            if not controlnet_model_ids:
                raise ValueError("controlnet_inpaint requires at least one ControlNet model")
            controlnets = [
                ControlNetModel.from_pretrained(
                    model_id,
                    torch_dtype=torch.float16,
                )
                for model_id in controlnet_model_ids
            ]
            controlnet = controlnets[0] if len(controlnets) == 1 else controlnets
            pipeline_cls = StableDiffusionXLControlNetInpaintPipeline
        else:
            raise ValueError(f"unsupported image generation mode: {image_mode}")

        print(f"Loading Stable Diffusion {image_mode} checkpoint: {ckpt_path}", flush=True)
        if image_mode == "controlnet_inpaint":
            print(f"Loading ControlNet model(s): {', '.join(controlnet_model_ids)}", flush=True)
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
        _image_controlnet_model_ids = next_controlnet_model_ids
    return _image_pipe


def _load_image_torch() -> Any:
    import torch

    return torch


def _clear_cuda_cache(torch: Any) -> None:
    torch.cuda.empty_cache()
    gc.collect()
