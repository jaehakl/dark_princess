from __future__ import annotations

import asyncio
from typing import Any, Callable


_selection_lock = asyncio.Lock()
_selection_model_file_url: str | None = None
_selection_model: Any | None = None


async def predict_target_cut_embedding(
    model_file_url: str,
    input_values: list[float],
    *,
    load_model_artifact: Callable[[str], dict[str, Any]],
    build_model: Callable[[dict[str, Any]], Any],
    load_torch: Callable[[], tuple[Any, Any]],
) -> list[float]:
    async with _selection_lock:
        return await asyncio.to_thread(
            _predict_target_cut_embedding_locked,
            model_file_url,
            input_values,
            load_model_artifact,
            build_model,
            load_torch,
        )


async def update_selection_model(update_model: Callable[[], Any]) -> Any:
    async with _selection_lock:
        return await asyncio.to_thread(update_model)


def _reset_selection_runtime_for_tests() -> None:
    global _selection_model_file_url, _selection_model

    _selection_model_file_url = None
    _selection_model = None


def _predict_target_cut_embedding_locked(
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
