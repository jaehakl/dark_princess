from __future__ import annotations

import math
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, SceneOption, SelectionModel, Status
from service.selection_model_generation import normalize_status_columns, predict_target_scene_embedding
from service.vector_utils import validate_embedding


def make_target_scene_embedding(
    scene_embedding: list[float],
    option_embedding: list[float],
    context_embedding: list[float],
    normalized_status: list[float],
    model_file_url: str,
) -> list[float]:
    return predict_target_scene_embedding(
        model_file_url,
        scene_embedding,
        option_embedding,
        context_embedding,
        normalized_status,
    )


def update_context_embedding(
    context_embedding: list[float],
    scene_embedding: list[float],
) -> list[float]:
    return [
        context_value * 0.9 + scene_value
        for context_value, scene_value in zip(context_embedding, scene_embedding)
    ]


def cosine_distance(left: Iterable[float], right: Iterable[float]) -> float | None:
    left_values = list(left)
    right_values = list(right)
    left_norm = math.sqrt(sum(value * value for value in left_values))
    right_norm = math.sqrt(sum(value * value for value in right_values))
    if left_norm == 0 or right_norm == 0:
        return None

    dot_product = sum(left_value * right_value for left_value, right_value in zip(left_values, right_values))
    return 1 - dot_product / (left_norm * right_norm)


async def get_next_scene(
    db: AsyncSession,
    scene_id: int,
    status_id: int,
    scene_option_id: int,
) -> Scene:
    scene = await db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")

    scene_option = await db.get(SceneOption, scene_option_id)
    if scene_option is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene_option not found")
    if scene_option.scene_id != scene_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scene_option does not belong to scene",
        )

    current_status = await db.get(Status, status_id)
    if current_status is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="status not found")
    if current_status.selection_model_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status.selection_model_id is required",
        )

    selection_model = await db.get(SelectionModel, current_status.selection_model_id)
    if selection_model is None or not selection_model.file_url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="selection model is required",
        )

    scene_embedding = validate_embedding(scene.embedding, "scene.embedding")
    option_embedding = validate_embedding(scene_option.embedding, "scene_option.embedding")
    context_embedding = validate_embedding(current_status.context_embedding, "status.context_embedding")
    normalized_status = normalize_status_columns(current_status)
    target_embedding = make_target_scene_embedding(
        scene_embedding,
        option_embedding,
        context_embedding,
        normalized_status,
        selection_model.file_url,
    )

    candidate_stmt = select(Scene).where(Scene.id != scene_id)
    candidates = (await db.execute(candidate_stmt)).scalars().all()
    nearest_scene = None
    nearest_distance = None
    for candidate in candidates:
        try:
            candidate_embedding = validate_embedding(candidate.embedding, "candidate.embedding")
        except HTTPException:
            continue

        distance = cosine_distance(target_embedding, candidate_embedding)
        if distance is None:
            continue
        if nearest_distance is None or distance < nearest_distance:
            nearest_scene = candidate
            nearest_distance = distance

    if nearest_scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="next scene not found")

    current_status.context_embedding = update_context_embedding(context_embedding, scene_embedding)
    await db.commit()
    await db.refresh(nearest_scene)

    return nearest_scene
