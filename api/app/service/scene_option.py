from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from db import Scene, SceneOption
from models import GenerateSceneOptionRequestBase
from settings import settings
from model_runtime import encode_scene_text
from utils.vector import VECTOR_DIMENSION


async def generate_scene_option(
    db: AsyncSession,
    request: GenerateSceneOptionRequestBase,
) -> SceneOption:
    option_text = request.option_text.strip()
    if not option_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="option_text is required")

    scene = await db.get(Scene, request.scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")

    scene_option = None
    if request.option_id is not None:
        scene_option = await db.get(SceneOption, request.option_id)
        if scene_option is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene_option not found")
        if scene_option.scene_id != request.scene_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="scene_option does not belong to scene",
            )

    embedding = await make_scene_option_embedding(option_text)

    try:
        if scene_option is None:
            scene_option = SceneOption(scene_id=request.scene_id)
            db.add(scene_option)

        scene_option.option_text = option_text
        scene_option.embedding = embedding
        await db.commit()
        await db.refresh(scene_option)
    except Exception:
        await db.rollback()
        raise

    return scene_option


async def make_scene_option_embedding(option_text: str) -> list[float]:
    model_name = settings.SCENE_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene embedding model name is required",
        )

    embedding = await encode_scene_text(model_name, f"passage: {option_text}")
    if len(embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"scene option embedding model must return {VECTOR_DIMENSION} dimensions",
        )
    return embedding
