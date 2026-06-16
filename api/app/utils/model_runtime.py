from __future__ import annotations

import asyncio
import csv
import gc
import random
from typing import Any, Callable


_embedding_lock = asyncio.Lock()
_embedding_model_name: str | None = None
_embedding_model: Any | None = None

_image_lock = asyncio.Lock()
_image_ckpt_path: str | None = None
_image_pipe_mode: str | None = None
_image_controlnet_model_ids: tuple[str, ...] | None = None
_image_pipe: Any | None = None

_selection_lock = asyncio.Lock()
_selection_model_file_url: str | None = None
_selection_model: Any | None = None

_wd14_lock = asyncio.Lock()
_wd14_model_name: str | None = None
_wd14_model: Any | None = None
_wd14_transform: Any | None = None
_wd14_device: str | None = None
_wd14_tag_names: list[str] = []
_wd14_rating_indexes: list[int] = []
_wd14_general_indexes: list[int] = []
_wd14_character_indexes: list[int] = []
_WD14_KAOMOJIS = {
    "0_0",
    "(o)_(o)",
    "+_+",
    "+_-",
    "._.",
    "_",
    "<|>_<|>",
    "=_=",
    ">_<",
    "3_3",
    "6_9",
    ">_o",
    "@_@",
    "^_^",
    "o_o",
    "u_u",
    "x_x",
    "|_|",
    "||_||",
}


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


async def predict_wd14_tags(
    model_name: str,
    image: Any,
    *,
    general_threshold: float,
    character_threshold: float,
) -> dict[str, dict[str, float]]:
    async with _wd14_lock:
        return await asyncio.to_thread(
            _predict_wd14_tags_locked,
            model_name,
            image,
            general_threshold,
            character_threshold,
        )


def reset_model_runtime_for_tests() -> None:
    global _embedding_model_name, _embedding_model
    global _image_ckpt_path, _image_pipe_mode, _image_controlnet_model_ids, _image_pipe
    global _selection_model_file_url, _selection_model
    global _wd14_model_name, _wd14_model, _wd14_transform, _wd14_device
    global _wd14_tag_names, _wd14_rating_indexes, _wd14_general_indexes, _wd14_character_indexes

    _embedding_model_name = None
    _embedding_model = None
    _image_ckpt_path = None
    _image_pipe_mode = None
    _image_controlnet_model_ids = None
    _image_pipe = None
    _selection_model_file_url = None
    _selection_model = None
    _wd14_model_name = None
    _wd14_model = None
    _wd14_transform = None
    _wd14_device = None
    _wd14_tag_names = []
    _wd14_rating_indexes = []
    _wd14_general_indexes = []
    _wd14_character_indexes = []


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


def _predict_wd14_tags_locked(
    model_name: str,
    image: Any,
    general_threshold: float,
    character_threshold: float,
) -> dict[str, dict[str, float]]:
    torch = _load_image_torch()
    model, transform, device = _get_wd14_model_locked(model_name, torch)
    image = _prepare_wd14_image(image)
    inputs = transform(image).unsqueeze(0)
    inputs = inputs[:, [2, 1, 0]]
    inputs = inputs.to(device)

    with torch.inference_mode():
        outputs = torch.sigmoid(model(inputs)).squeeze(0).detach().cpu().tolist()

    rating_tags = _wd14_score_map(outputs, _wd14_rating_indexes, 0.0)
    general_tags = _wd14_score_map(outputs, _wd14_general_indexes, general_threshold)
    character_tags = _wd14_score_map(outputs, _wd14_character_indexes, character_threshold)
    return {
        "rating_tags": rating_tags,
        "general_tags": general_tags,
        "character_tags": character_tags,
    }


def _get_wd14_model_locked(model_name: str, torch: Any) -> tuple[Any, Any, str]:
    global _wd14_model_name, _wd14_model, _wd14_transform, _wd14_device
    global _wd14_tag_names, _wd14_rating_indexes, _wd14_general_indexes, _wd14_character_indexes

    if _wd14_model is None or _wd14_model_name != model_name:
        from huggingface_hub import hf_hub_download
        import timm
        from timm.data import create_transform, resolve_data_config

        print(f"Loading WD14 tagger model: {model_name}", flush=True)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = timm.create_model(f"hf_hub:{model_name}", pretrained=True)
        model.eval()
        model.to(device)
        labels_path = hf_hub_download(repo_id=model_name, filename="selected_tags.csv")
        tag_names, rating_indexes, general_indexes, character_indexes = _load_wd14_labels(labels_path)

        _wd14_model = model
        _wd14_transform = create_transform(**resolve_data_config(model.pretrained_cfg, model=model))
        _wd14_device = device
        _wd14_model_name = model_name
        _wd14_tag_names = tag_names
        _wd14_rating_indexes = rating_indexes
        _wd14_general_indexes = general_indexes
        _wd14_character_indexes = character_indexes
    return _wd14_model, _wd14_transform, _wd14_device or "cpu"


def _load_wd14_labels(labels_path: str) -> tuple[list[str], list[int], list[int], list[int]]:
    tag_names: list[str] = []
    rating_indexes: list[int] = []
    general_indexes: list[int] = []
    character_indexes: list[int] = []
    with open(labels_path, newline="", encoding="utf-8") as labels_file:
        for index, row in enumerate(csv.DictReader(labels_file)):
            name = row.get("name") or ""
            category = int(row.get("category") or -1)
            tag_names.append(name if name in _WD14_KAOMOJIS else name.replace("_", " "))
            if category == 9:
                rating_indexes.append(index)
            elif category == 0:
                general_indexes.append(index)
            elif category == 4:
                character_indexes.append(index)
    return tag_names, rating_indexes, general_indexes, character_indexes


def _prepare_wd14_image(image: Any) -> Any:
    from PIL import Image

    if image.mode not in {"RGB", "RGBA"}:
        image = image.convert("RGBA") if "transparency" in image.info else image.convert("RGB")
    if image.mode == "RGBA":
        canvas = Image.new("RGBA", image.size, (255, 255, 255, 255))
        canvas.alpha_composite(image)
        image = canvas.convert("RGB")

    width, height = image.size
    square_size = max(width, height)
    padded_image = Image.new("RGB", (square_size, square_size), (255, 255, 255))
    padded_image.paste(image, ((square_size - width) // 2, (square_size - height) // 2))
    return padded_image


def _wd14_score_map(scores: list[float], indexes: list[int], threshold: float) -> dict[str, float]:
    selected = {
        _wd14_tag_names[index]: float(scores[index])
        for index in indexes
        if float(scores[index]) > threshold
    }
    return dict(sorted(selected.items(), key=lambda item: item[1], reverse=True))


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
