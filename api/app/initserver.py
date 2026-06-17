from contextlib import asynccontextmanager
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
            await ensure_scene_control_image_columns(conn)
            await migrate_upload_references_to_object_keys(conn)
        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app


async def ensure_scene_control_image_columns(conn):
    columns = (await conn.execute(text("PRAGMA table_info(scenes)"))).all()
    existing_column_names = {row[1] for row in columns}
    for column_name in ("scribble_url", "pose_url"):
        if column_name not in existing_column_names:
            await conn.execute(text(f"ALTER TABLE scenes ADD COLUMN {column_name} TEXT"))


async def migrate_upload_references_to_object_keys(conn):
    upload_columns = {
        "scenes": ("image_url", "scribble_url", "pose_url"),
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
