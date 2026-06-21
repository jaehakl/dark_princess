from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import Cut, Scene
from model_runtime import encode_cut_text
from models import (
    GetListRequestBase,
    GetListResponseBase,
    SceneBase,
    UpdateSceneFirstCutRequestBase,
    UpsertResponseBase,
)
from settings import settings
from utils.crud_helpers import CrudSpec, delete_items, get_list_response
from utils.local_storage import public_file_url_from_reference
from utils.router_helpers import field_ids, require_existing_ids
from utils.vector import VECTOR_DIMENSION


SCENE_READ_ONLY_FIELDS = {"first_cut_image_url", "cut_count"}

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
