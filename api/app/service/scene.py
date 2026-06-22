from __future__ import annotations

import math

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import Cut, Scene, Status
from model_runtime import encode_cut_text
from models import (
    CutBase,
    GetListRequestBase,
    GetListResponseBase,
    RecommendSceneRequestBase,
    SceneBase,
    SceneRecommendationBase,
    UpdateSceneFirstCutRequestBase,
    UpsertResponseBase,
)
from service.selection_model import (
    STATUS_NORMALIZATION,
    STATUS_NUMERIC_FIELDS,
    cosine_distance,
    normalize_status_value,
)
from settings import settings
from utils.crud_helpers import CrudSpec, delete_items, get_list_response
from utils.local_storage import public_file_url_from_reference
from utils.router_helpers import field_ids, require_existing_ids
from utils.vector import VECTOR_DIMENSION, validate_embedding


SCENE_READ_ONLY_FIELDS = {"first_cut_image_url", "cut_count"}
SCENE_TEXT_WEIGHT = 0.8
SCENE_STATUS_WEIGHT = 0.2

SCENE_LOAD_OPTIONS = (
    selectinload(Scene.cuts),
    selectinload(Scene.first_cut).selectinload(Cut.image),
)

SCENE_CRUD_SPEC = CrudSpec(
    model=Scene,
    schema=SceneBase,
    public_url_fields=("first_cut_image_url",),
    load_options=SCENE_LOAD_OPTIONS,
)


async def get_scene_list(
    db: AsyncSession,
    request: GetListRequestBase,
) -> GetListResponseBase:
    return await get_list_response(db, request, SCENE_CRUD_SPEC)


async def upsert_scenes(
    db: AsyncSession,
    items: list[SceneBase],
) -> list[UpsertResponseBase]:
    await require_existing_ids(
        db,
        Cut,
        field_ids(items, "first_cut_id"),
        "first_cut_id",
        status_code=422,
    )

    item_ids = [item.id for item in items if item.id is not None]
    existing_scenes = {}
    if item_ids:
        result = await db.execute(select(Scene).where(Scene.id.in_(item_ids)))
        existing_scenes = {scene.id: scene for scene in result.scalars().all()}

    pending_results: list[Scene] = []
    try:
        for item in items:
            scene = existing_scenes.get(item.id) if item.id is not None else None
            if scene is None:
                scene = Scene()
                db.add(scene)

            for field_name, value in item.model_dump(exclude={"id", *SCENE_READ_ONLY_FIELDS}).items():
                setattr(scene, field_name, value)

            scene.context_embedding = await make_scene_context_embedding(scene.context)
            pending_results.append(scene)

        await db.flush()
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return [UpsertResponseBase(id=scene.id) for scene in pending_results]


async def make_scene_context_embedding(context: str) -> list[float]:
    model_name = settings.CUT_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene context embedding model name is required",
        )

    embedding = await encode_cut_text(model_name, f"passage: {context}")
    if len(embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"scene context embedding model must return {VECTOR_DIMENSION} dimensions",
        )
    return embedding


async def recommend_scene(
    db: AsyncSession,
    request: RecommendSceneRequestBase,
) -> SceneRecommendationBase:
    current_status = await db.get(Status, request.status_id)
    if current_status is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="status not found")

    query_text = await build_scene_recommendation_query(db, request)
    query_embedding = await make_scene_query_embedding(query_text) if query_text else None
    current_status_values = normalize_status_columns(current_status)

    candidates = (
        await db.execute(
            select(Scene)
            .options(*SCENE_LOAD_OPTIONS)
            .where(Scene.first_cut_id.is_not(None))
            .order_by(Scene.id.asc())
        )
    ).scalars().all()

    weighted_candidates: list[tuple[Scene, float]] = []
    for candidate in candidates:
        if request.current_scene_id is not None and candidate.id == request.current_scene_id:
            continue
        if candidate.first_cut is None or candidate.context_embedding is None:
            continue

        try:
            candidate_embedding = validate_embedding(candidate.context_embedding, "scene.context_embedding")
        except HTTPException:
            continue

        status_distance = calculate_status_distance(
            current_status_values,
            normalize_status_columns(candidate),
        )
        if query_embedding is None:
            score = status_distance
        else:
            text_distance = cosine_distance(query_embedding, candidate_embedding)
            if text_distance is None:
                continue
            score = SCENE_TEXT_WEIGHT * (text_distance / 2) + SCENE_STATUS_WEIGHT * status_distance
        weighted_candidates.append((candidate, score))

    if not weighted_candidates:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recommended scene not found")

    scene = min(weighted_candidates, key=lambda item: (item[1], item[0].id or 0))[0]
    return SceneRecommendationBase(
        scene=scene_to_base(scene),
        first_cut=cut_to_base(scene.first_cut),
    )


async def build_scene_recommendation_query(
    db: AsyncSession,
    request: RecommendSceneRequestBase,
) -> str:
    parts: list[str] = []
    if request.current_scene_id is not None:
        current_scene = (
            await db.execute(
                select(Scene)
                .options(selectinload(Scene.cuts))
                .where(Scene.id == request.current_scene_id)
            )
        ).scalar_one_or_none()
        if current_scene is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="current scene not found")

        parts.append(current_scene.context.strip())
        if request.current_cut_id is not None:
            parts.extend(get_script_chain_to_cut(current_scene, request.current_cut_id))

    option_text = request.option_text.strip()
    if option_text:
        parts.append(option_text)

    return "\n\n".join(part for part in parts if part)


def get_script_chain_to_cut(scene: Scene, current_cut_id: int) -> list[str]:
    cut_by_id = {cut.id: cut for cut in scene.cuts if cut.id is not None}
    current_cut = cut_by_id.get(current_cut_id)
    if current_cut is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="current_cut_id must belong to the current scene",
        )

    chain: list[Cut] = []
    seen_ids: set[int] = set()
    next_cut_id: int | None = current_cut_id
    while next_cut_id is not None and next_cut_id not in seen_ids:
        cut = cut_by_id.get(next_cut_id)
        if cut is None:
            break
        chain.append(cut)
        seen_ids.add(next_cut_id)
        next_cut_id = cut.prev_cut_id

    return [cut.script.strip() for cut in reversed(chain) if cut.script.strip()]


async def make_scene_query_embedding(query_text: str) -> list[float]:
    model_name = settings.CUT_EMBEDDING_MODEL_NAME.strip()
    if not model_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="scene query embedding model name is required",
        )

    embedding = await encode_cut_text(model_name, f"query: {query_text}")
    if len(embedding) != VECTOR_DIMENSION:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"scene query embedding model must return {VECTOR_DIMENSION} dimensions",
        )
    return embedding


def normalize_status_columns(status_row: Status | Scene) -> list[float]:
    return [
        normalize_status_value(float(getattr(status_row, field_name)), STATUS_NORMALIZATION[field_name])
        for field_name in STATUS_NUMERIC_FIELDS
    ]


def calculate_status_distance(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 1.0
    squared_distance = sum((left_value - right_value) ** 2 for left_value, right_value in zip(left, right))
    return math.sqrt(squared_distance / len(left))


async def update_scene_first_cut(
    db: AsyncSession,
    request: UpdateSceneFirstCutRequestBase,
) -> SceneBase:
    scene = await db.get(Scene, request.scene_id)
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")

    first_cut_id = None
    if request.cut_id is not None:
        cut = await db.get(Cut, request.cut_id)
        if cut is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="cut_id not found")
        if cut.scene_id != scene.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="cut_id must belong to the scene",
            )
        first_cut_id = cut.id

    try:
        scene.first_cut_id = first_cut_id
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    loaded_scene = await load_scene(db, scene.id)
    return scene_to_base(loaded_scene)


async def delete_scenes(db: AsyncSession, ids: list[int]) -> None:
    await delete_items(db, SCENE_CRUD_SPEC, ids)


async def load_scene(db: AsyncSession, scene_id: int) -> Scene:
    scene = (
        await db.execute(
            select(Scene)
            .options(*SCENE_LOAD_OPTIONS)
            .where(Scene.id == scene_id)
        )
    ).scalar_one_or_none()
    if scene is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scene not found")
    return scene


def scene_to_base(scene: Scene) -> SceneBase:
    return SceneBase(
        id=scene.id,
        title=scene.title,
        context=scene.context,
        turn=scene.turn,
        cash=scene.cash,
        strength=scene.strength,
        agility=scene.agility,
        intelligence=scene.intelligence,
        sense=scene.sense,
        attractiveness=scene.attractiveness,
        toughness=scene.toughness,
        stress=scene.stress,
        first_cut_id=scene.first_cut_id,
        first_cut_image_url=public_file_url_from_reference(scene.first_cut_image_url),
        cut_count=scene.cut_count,
    )


def cut_to_base(cut: Cut) -> CutBase:
    return CutBase(
        id=cut.id,
        image_id=cut.image_id,
        scene_id=cut.scene_id,
        prev_cut_id=cut.prev_cut_id,
        image_url=public_file_url_from_reference(cut.image_url),
        scribble_url=public_file_url_from_reference(cut.scribble_url),
        pose_url=public_file_url_from_reference(cut.pose_url),
        favorited=cut.favorited,
        script=cut.script,
        status_change=cut.status_change,
        prompt_situation=cut.prompt_situation,
        prompt_hero=cut.prompt_hero,
        prompt_detail=cut.prompt_detail,
        prompt_camera=cut.prompt_camera,
        prompt_negative=cut.prompt_negative,
    )
