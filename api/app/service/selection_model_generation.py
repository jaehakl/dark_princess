from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import SelectionModel, Status
from models import GenerateSelectionModelRequestBase
from service.vector_utils import VECTOR_DIMENSION, validate_embedding
from utils.local_storage import build_object_key, delete_object, get_object_path, object_key_from_public_url, public_file_url, upload_fileobj


MODEL_FORMAT_VERSION = 1
STATUS_NUMERIC_FIELDS = (
    "turn",
    "cash",
    "strength",
    "agility",
    "intelligence",
    "sense",
    "attractiveness",
    "toughness",
    "stress",
)
STATUS_NORMALIZATION = {
    "turn": {"min": 0.0, "max": 1000.0},
    "cash": {"min": 0.0, "max": 100.0},
    "strength": {"min": 0.0, "max": 100.0},
    "agility": {"min": 0.0, "max": 100.0},
    "intelligence": {"min": 0.0, "max": 100.0},
    "sense": {"min": 0.0, "max": 100.0},
    "attractiveness": {"min": 0.0, "max": 100.0},
    "toughness": {"min": 0.0, "max": 100.0},
    "stress": {"min": 0.0, "max": 100.0},
}
MODEL_INPUT_DIMENSION = VECTOR_DIMENSION * 3 + len(STATUS_NUMERIC_FIELDS)
DEFAULT_MODEL_PARAMETERS = {
    "hidden_dims": [2048, 1024],
    "activation": "relu",
    "dropout": 0.0,
    "seed": None,
}
SUPPORTED_ACTIVATIONS = {"relu", "gelu", "tanh", "silu"}


async def generate_selection_model(
    db: AsyncSession,
    request: GenerateSelectionModelRequestBase,
) -> SelectionModel:
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="selection model name is required")

    selection_model = None
    old_file_url = None
    if request.model_id is not None:
        selection_model = await db.get(SelectionModel, request.model_id)
        if selection_model is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="selection model not found")
        old_file_url = selection_model.file_url

    parameters = normalize_model_parameters(request.parameters)
    artifact = create_model_artifact(parameters)
    file_url, object_key = save_model_artifact(artifact)

    try:
        if selection_model is None:
            selection_model = SelectionModel()
            db.add(selection_model)
        selection_model.name = name
        selection_model.file_url = file_url
        await db.commit()
        await db.refresh(selection_model)
    except Exception:
        await db.rollback()
        delete_object(object_key)
        raise

    await cleanup_old_model_file(db, old_file_url, file_url)
    return selection_model


def normalize_model_parameters(parameters: dict[str, Any]) -> dict[str, Any]:
    values = {**DEFAULT_MODEL_PARAMETERS, **(parameters or {})}

    hidden_dims = values["hidden_dims"]
    if not isinstance(hidden_dims, list) or not hidden_dims:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hidden_dims must be a non-empty list")
    try:
        normalized_hidden_dims = [int(value) for value in hidden_dims]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hidden_dims must contain integers") from exc
    if any(value <= 0 for value in normalized_hidden_dims):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="hidden_dims must contain positive integers")

    activation = str(values["activation"]).lower()
    if activation not in SUPPORTED_ACTIVATIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="activation is not supported")

    try:
        dropout = float(values["dropout"])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="dropout must be numeric") from exc
    if dropout < 0 or dropout >= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="dropout must be greater than or equal to 0 and less than 1")

    seed = values["seed"]
    if seed is not None:
        try:
            seed = int(seed)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="seed must be an integer") from exc

    return {
        "hidden_dims": normalized_hidden_dims,
        "activation": activation,
        "dropout": dropout,
        "seed": seed,
    }


def create_model_artifact(parameters: dict[str, Any]) -> dict[str, Any]:
    torch, _nn = load_torch()
    seed = parameters.get("seed")
    if seed is not None:
        torch.manual_seed(seed)

    model = build_model(parameters)
    return {
        "format_version": MODEL_FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "architecture": {
            "type": "selection_dnn",
            "input_dim": MODEL_INPUT_DIMENSION,
            "output_dim": VECTOR_DIMENSION,
            "status_fields": list(STATUS_NUMERIC_FIELDS),
            "status_normalization": STATUS_NORMALIZATION,
        },
        "parameters": parameters,
        "state_dict": model.state_dict(),
    }


def save_model_artifact(artifact: dict[str, Any]) -> tuple[str, str]:
    torch, _nn = load_torch()
    object_key = build_object_key(kind="file", filename="selection-model.pt")
    model_bytes = BytesIO()
    torch.save(artifact, model_bytes)
    model_bytes.seek(0)
    upload_fileobj(model_bytes, object_key, "application/octet-stream")
    return public_file_url(object_key), object_key


def predict_target_scene_embedding(
    model_file_url: str,
    scene_embedding: list[float],
    option_embedding: list[float],
    context_embedding: list[float],
    normalized_status: list[float],
) -> list[float]:
    artifact = load_model_artifact(model_file_url)
    model = build_model(artifact["parameters"])
    model.load_state_dict(artifact["state_dict"])
    model.eval()

    torch, _nn = load_torch()
    input_values = scene_embedding + option_embedding + context_embedding + normalized_status
    if len(input_values) != MODEL_INPUT_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"selection model input must be {MODEL_INPUT_DIMENSION} dimensions",
        )
    with torch.no_grad():
        output = model(torch.tensor([input_values], dtype=torch.float32)).squeeze(0).tolist()
    return validate_embedding(output, "selection_model.output")


def load_model_artifact(model_file_url: str) -> dict[str, Any]:
    torch, _nn = load_torch()
    object_key = object_key_from_public_url(model_file_url)
    if object_key is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="selection model file_url is invalid")

    model_path = get_object_path(object_key)
    if not model_path.is_file():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="selection model file not found")

    try:
        artifact = torch.load(model_path, map_location="cpu", weights_only=False)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="selection model file is invalid") from exc

    validate_model_artifact(artifact)
    return artifact


def validate_model_artifact(artifact: object) -> None:
    if not isinstance(artifact, dict):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="selection model artifact is invalid")
    if artifact.get("format_version") != MODEL_FORMAT_VERSION:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="selection model format is unsupported")

    architecture = artifact.get("architecture")
    parameters = artifact.get("parameters")
    state_dict = artifact.get("state_dict")
    if not isinstance(architecture, dict) or not isinstance(parameters, dict) or state_dict is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="selection model artifact is incomplete")
    if architecture.get("input_dim") != MODEL_INPUT_DIMENSION or architecture.get("output_dim") != VECTOR_DIMENSION:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="selection model dimensions are invalid")
    normalize_model_parameters(parameters)


def normalize_status_columns(status_row: Status) -> list[float]:
    return [
        normalize_status_value(float(getattr(status_row, field_name)), STATUS_NORMALIZATION[field_name])
        for field_name in STATUS_NUMERIC_FIELDS
    ]


def normalize_status_value(value: float, config: dict[str, float]) -> float:
    min_value = config["min"]
    max_value = config["max"]
    if max_value <= min_value:
        return 0.0
    normalized = (value - min_value) / (max_value - min_value)
    return min(1.0, max(0.0, normalized))


def build_model(parameters: dict[str, Any]) -> Any:
    _torch, nn = load_torch()
    dimensions = [MODEL_INPUT_DIMENSION, *parameters["hidden_dims"], VECTOR_DIMENSION]
    layers: list[Any] = []
    for index in range(len(dimensions) - 1):
        layers.append(nn.Linear(dimensions[index], dimensions[index + 1]))
        if index == len(dimensions) - 2:
            continue
        layers.append(build_activation(parameters["activation"], nn))
        if parameters["dropout"] > 0:
            layers.append(nn.Dropout(parameters["dropout"]))
    return nn.Sequential(*layers)


def build_activation(activation: str, nn: Any) -> Any:
    if activation == "gelu":
        return nn.GELU()
    if activation == "tanh":
        return nn.Tanh()
    if activation == "silu":
        return nn.SiLU()
    return nn.ReLU()


async def cleanup_old_model_file(
    db: AsyncSession,
    old_file_url: str | None,
    new_file_url: str,
) -> None:
    if not old_file_url or old_file_url == new_file_url:
        return

    object_key = object_key_from_public_url(old_file_url)
    if object_key is None:
        return

    reference_count = (
        await db.execute(select(func.count()).select_from(SelectionModel).where(SelectionModel.file_url == old_file_url))
    ).scalar_one()
    if reference_count == 0:
        delete_object(object_key)

def load_torch() -> tuple[Any, Any]:
    import torch
    from torch import nn

    return torch, nn
