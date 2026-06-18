from contextlib import asynccontextmanager
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from db import Base, engine

from settings import settings
from utils.local_storage import object_key_from_public_url


def server():
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await start()
        yield
        shutdown()

    app = FastAPI(lifespan=lifespan)

    origins = [
        "http://localhost",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        settings.app_base_url,
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=origins,
        allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    upload_dir = Path(settings.LOCAL_UPLOAD_DIR).expanduser().resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    uploads_app = CORSMiddleware(
        StaticFiles(directory=upload_dir),
        allow_credentials=False,
        allow_origins=origins,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
    )
    app.mount("/uploads", uploads_app, name="uploads")

    async def start():
        app.state.progress = 0
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await ensure_scene_image_schema(conn)
            await ensure_scene_prompt_columns(conn)
            await migrate_upload_references_to_object_keys(conn)
            await migrate_legacy_scene_images(conn)
            await drop_legacy_scene_columns(conn)
            await drop_scene_options_table(conn)
        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app


async def ensure_scene_image_schema(conn):
    await ensure_image_columns(conn)
    columns = (await conn.execute(text("PRAGMA table_info(scenes)"))).all()
    existing_column_names = {row[1] for row in columns}
    if "image_id" not in existing_column_names:
        await conn.execute(text("ALTER TABLE scenes ADD COLUMN image_id INTEGER REFERENCES images(id)"))


async def ensure_image_columns(conn):
    columns = (await conn.execute(text("PRAGMA table_info(images)"))).all()
    existing_column_names = {row[1] for row in columns}
    column_specs = {
        "image_object_key": "TEXT",
        "scribble_object_key": "TEXT",
        "pose_object_key": "TEXT",
        "positive_prompt": "TEXT",
        "positive_prompt_embedding": "JSON",
        "negative_prompt": "TEXT",
        "seed_image_id": "INTEGER REFERENCES images(id)",
        "model_parameters": "JSON",
    }
    for column_name, column_type in column_specs.items():
        if column_name not in existing_column_names:
            await conn.execute(text(f"ALTER TABLE images ADD COLUMN {column_name} {column_type}"))


async def ensure_scene_prompt_columns(conn):
    columns = (await conn.execute(text("PRAGMA table_info(scenes)"))).all()
    existing_column_names = {row[1] for row in columns}
    for column_name in (
        "prompt_situation",
        "prompt_hero",
        "prompt_camera",
        "prompt_detail",
        "prompt_negative",
    ):
        if column_name not in existing_column_names:
            await conn.execute(text(f"ALTER TABLE scenes ADD COLUMN {column_name} TEXT"))
            existing_column_names.add(column_name)

    await migrate_legacy_scene_prompt_columns(conn, existing_column_names)


async def migrate_legacy_scene_prompt_columns(conn, existing_column_names: set[str]):
    legacy_columns = ("background", "subject", "object", "action", "detail")
    if not set(legacy_columns).issubset(existing_column_names):
        return

    rows = (
        await conn.execute(
            text(
                "SELECT id, background, subject, object, action, detail, "
                "prompt_situation, prompt_hero, prompt_detail FROM scenes"
            )
        )
    ).all()
    for row in rows:
        row_data = row._mapping
        updates = {}
        if _is_blank(row_data["prompt_situation"]) and not _is_blank(row_data["background"]):
            updates["prompt_situation"] = row_data["background"].strip()
        if _is_blank(row_data["prompt_hero"]) and not _is_blank(row_data["subject"]):
            updates["prompt_hero"] = row_data["subject"].strip()
        if _is_blank(row_data["prompt_detail"]):
            detail_parts = [
                value.strip()
                for value in (row_data["object"], row_data["action"], row_data["detail"])
                if isinstance(value, str) and value.strip()
            ]
            if detail_parts:
                updates["prompt_detail"] = ", ".join(detail_parts)
        if not updates:
            continue

        set_clause = ", ".join(f"{column_name} = :{column_name}" for column_name in updates)
        await conn.execute(
            text(f"UPDATE scenes SET {set_clause} WHERE id = :id"),
            {**updates, "id": row_data["id"]},
        )


def _is_blank(value):
    return not isinstance(value, str) or not value.strip()


async def migrate_upload_references_to_object_keys(conn):
    upload_columns = {
        "scenes": ("image_url", "scribble_url", "pose_url"),
        "images": ("image_object_key", "scribble_object_key", "pose_object_key"),
        "selection_models": ("file_url",),
    }
    for table_name, column_names in upload_columns.items():
        columns = (await conn.execute(text(f"PRAGMA table_info({table_name})"))).all()
        existing_column_names = {row[1] for row in columns}
        for column_name in column_names:
            if column_name not in existing_column_names:
                continue

            rows = (
                await conn.execute(
                    text(
                        f"SELECT id, {column_name} FROM {table_name} "
                        f"WHERE {column_name} IS NOT NULL AND {column_name} != ''"
                    )
                )
            ).all()
            for row in rows:
                object_key = object_key_from_public_url(row[1])
                if object_key is None or object_key == row[1]:
                    continue
                await conn.execute(
                    text(f"UPDATE {table_name} SET {column_name} = :object_key WHERE id = :id"),
                    {"object_key": object_key, "id": row[0]},
                )


async def migrate_legacy_scene_images(conn):
    columns = (await conn.execute(text("PRAGMA table_info(scenes)"))).all()
    existing_column_names = {row[1] for row in columns}
    if "image_id" not in existing_column_names:
        return

    legacy_columns = [column for column in ("image_url", "scribble_url", "pose_url") if column in existing_column_names]
    if not legacy_columns:
        return

    select_parts = [
        "id",
        "image_id",
        *(column if column in legacy_columns else f"NULL AS {column}" for column in ("image_url", "scribble_url", "pose_url")),
    ]
    where_parts = [f"{column} IS NOT NULL AND {column} != ''" for column in legacy_columns]
    rows = (
        await conn.execute(
            text(
                f"SELECT {', '.join(select_parts)} FROM scenes "
                f"WHERE image_id IS NULL AND ({' OR '.join(where_parts)})"
            )
        )
    ).all()

    for row in rows:
        row_data = row._mapping
        image_key = object_key_from_public_url(row_data["image_url"])
        scribble_key = object_key_from_public_url(row_data["scribble_url"])
        pose_key = object_key_from_public_url(row_data["pose_url"])
        if image_key is None and scribble_key is None and pose_key is None:
            continue

        result = await conn.execute(
            text(
                "INSERT INTO images "
                "(image_object_key, scribble_object_key, pose_object_key, model_parameters) "
                "VALUES (:image_object_key, :scribble_object_key, :pose_object_key, :model_parameters)"
            ),
            {
                "image_object_key": image_key,
                "scribble_object_key": scribble_key,
                "pose_object_key": pose_key,
                "model_parameters": json.dumps(
                    {
                        "source": "legacy_scene_upload_migration",
                        "scene_id": row_data["id"],
                    }
                ),
            },
        )
        image_id = result.lastrowid
        await conn.execute(
            text("UPDATE scenes SET image_id = :image_id WHERE id = :scene_id"),
            {"image_id": image_id, "scene_id": row_data["id"]},
        )


async def drop_legacy_scene_columns(conn):
    columns = (await conn.execute(text("PRAGMA table_info(scenes)"))).all()
    existing_column_names = {row[1] for row in columns}
    legacy_columns = (
        "image_url",
        "scribble_url",
        "pose_url",
        "prompt_situation_embedding",
        "prompt_hero_embedding",
        "prompt_camera_embedding",
        "prompt_detail_embedding",
        "background",
        "subject",
        "object",
        "action",
        "detail",
        "background_embedding",
        "subject_embedding",
        "object_embedding",
        "action_embedding",
        "detail_embedding",
    )
    for column_name in legacy_columns:
        if column_name in existing_column_names:
            await conn.execute(text(f"ALTER TABLE scenes DROP COLUMN {column_name}"))


async def drop_scene_options_table(conn):
    await conn.execute(text("DROP TABLE IF EXISTS scene_options"))
