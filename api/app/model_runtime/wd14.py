from __future__ import annotations

import asyncio
import csv
from typing import Any


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


def _reset_wd14_runtime_for_tests() -> None:
    global _wd14_model_name, _wd14_model, _wd14_transform, _wd14_device
    global _wd14_tag_names, _wd14_rating_indexes, _wd14_general_indexes, _wd14_character_indexes

    _wd14_model_name = None
    _wd14_model = None
    _wd14_transform = None
    _wd14_device = None
    _wd14_tag_names = []
    _wd14_rating_indexes = []
    _wd14_general_indexes = []
    _wd14_character_indexes = []


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


def _load_image_torch() -> Any:
    import torch

    return torch
