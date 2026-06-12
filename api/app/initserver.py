from contextlib import asynccontextmanager
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from db import Base, engine

from settings import settings


def normalize_scene_script_text(value):
    if value is None:
        return ""
    return str(value).replace("\r\n", "\n").replace("\r", "\n")


def scene_script_to_text(value):
    if value is None:
        return ""
    if not isinstance(value, str):
        return _scene_script_value_to_text(value)

    normalized_value = normalize_scene_script_text(value)
    if not normalized_value.strip():
        return ""

    try:
        parsed_value = json.loads(normalized_value)
    except (TypeError, json.JSONDecodeError):
        return normalized_value
    return _scene_script_value_to_text(parsed_value)


def _scene_script_value_to_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return normalize_scene_script_text(value)
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(_scene_script_value_to_text(item) for item in value)
    if isinstance(value, dict):
        for key in ("text", "line", "content"):
            if key in value:
                return _scene_script_value_to_text(value[key])
        return "\n".join(_scene_script_value_to_text(value[key]) for key in sorted(value))
    return normalize_scene_script_text(value)


def quote_sqlite_identifier(value):
    return '"' + value.replace('"', '""') + '"'


async def migrate_scene_script_contract(conn):
    if engine.dialect.name != "sqlite":
        return

    await conn.exec_driver_sql("DROP TABLE IF EXISTS scenes_migration;")
    columns_result = await conn.exec_driver_sql("PRAGMA table_info(scenes);")
    scene_columns = {row[1] for row in columns_result}
    expected_scene_columns = {"id", "prompt", "image_url", "embedding", "script", "status_change"}
    if scene_columns == expected_scene_columns:
        return

    if "prompt" not in scene_columns:
        await conn.exec_driver_sql("ALTER TABLE scenes ADD COLUMN prompt TEXT NOT NULL DEFAULT '';")
        scene_columns.add("prompt")
    if "image_url" not in scene_columns:
        await conn.exec_driver_sql("ALTER TABLE scenes ADD COLUMN image_url TEXT;")
        scene_columns.add("image_url")
    if "embedding" not in scene_columns:
        await conn.exec_driver_sql("ALTER TABLE scenes ADD COLUMN embedding JSON;")
        scene_columns.add("embedding")
    if "script" not in scene_columns:
        await conn.exec_driver_sql("ALTER TABLE scenes ADD COLUMN script TEXT NOT NULL DEFAULT '';")
        scene_columns.add("script")
    if "status_change" not in scene_columns:
        await conn.exec_driver_sql("ALTER TABLE scenes ADD COLUMN status_change JSON NOT NULL DEFAULT '{}';")
        scene_columns.add("status_change")

    if "description" in scene_columns:
        await conn.exec_driver_sql("UPDATE scenes SET prompt = COALESCE(NULLIF(prompt, ''), description, '');")
    if "name" in scene_columns:
        await conn.exec_driver_sql("UPDATE scenes SET prompt = COALESCE(NULLIF(prompt, ''), name, '');")
    await conn.exec_driver_sql("UPDATE scenes SET prompt = COALESCE(prompt, '');")
    if "image" in scene_columns:
        await conn.exec_driver_sql("UPDATE scenes SET image_url = COALESCE(image_url, image);")
    await conn.exec_driver_sql("UPDATE scenes SET status_change = COALESCE(status_change, '{}');")

    if "scripts" in scene_columns:
        script_rows_result = await conn.exec_driver_sql("SELECT id, scripts FROM scenes;")
        script_values = [
            (scene_script_to_text(row._mapping["scripts"]), row._mapping["id"])
            for row in script_rows_result
        ]
        if script_values:
            await conn.exec_driver_sql(
                "UPDATE scenes SET script = ? WHERE id = ?;",
                script_values,
            )
    else:
        script_rows_result = await conn.exec_driver_sql("SELECT id, script FROM scenes;")
        script_values = [
            (normalize_scene_script_text(row._mapping["script"]), row._mapping["id"])
            for row in script_rows_result
        ]
        if script_values:
            await conn.exec_driver_sql(
                "UPDATE scenes SET script = ? WHERE id = ?;",
                script_values,
            )

    for column_name in sorted(scene_columns - expected_scene_columns):
        await conn.exec_driver_sql(
            f"ALTER TABLE scenes DROP COLUMN {quote_sqlite_identifier(column_name)};"
        )


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
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    async def start():
        app.state.progress = 0
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await migrate_scene_script_contract(conn)
        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app
