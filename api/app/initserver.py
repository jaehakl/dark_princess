from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from db import Base, engine

from settings import settings
from utils.local_storage import delete_object, object_key_from_public_url


async def run_startup_migrations(conn):
    cut_columns = (await conn.execute(text("PRAGMA table_info(cuts)"))).mappings().all()
    if "favorited" not in {column["name"] for column in cut_columns}:
        await conn.execute(text("ALTER TABLE cuts ADD COLUMN favorited BOOLEAN NOT NULL DEFAULT 0"))

    table_names = {
        row["name"]
        for row in (
            await conn.execute(text("SELECT name FROM sqlite_master WHERE type = 'table'"))
        ).mappings().all()
    }
    if "selection_models" not in table_names:
        return

    selection_model_object_keys = {
        object_key
        for row in (await conn.execute(text("SELECT file_url FROM selection_models"))).mappings().all()
        for object_key in [object_key_from_public_url(row["file_url"])]
        if object_key is not None
    }

    status_columns = (await conn.execute(text("PRAGMA table_info(statuses)"))).mappings().all()
    if "selection_model_id" in {column["name"] for column in status_columns}:
        await conn.execute(text("DROP TABLE IF EXISTS statuses_without_selection_model"))
        await conn.execute(
            text(
                """
                CREATE TABLE statuses_without_selection_model (
                    id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    turn INTEGER NOT NULL,
                    cash INTEGER NOT NULL,
                    strength INTEGER NOT NULL,
                    agility INTEGER NOT NULL,
                    intelligence INTEGER NOT NULL,
                    sense INTEGER NOT NULL,
                    attractiveness INTEGER NOT NULL,
                    toughness INTEGER NOT NULL,
                    stress INTEGER NOT NULL,
                    context_embedding JSON,
                    CONSTRAINT pk_statuses PRIMARY KEY (id)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                INSERT INTO statuses_without_selection_model (
                    id,
                    name,
                    turn,
                    cash,
                    strength,
                    agility,
                    intelligence,
                    sense,
                    attractiveness,
                    toughness,
                    stress,
                    context_embedding
                )
                SELECT
                    id,
                    name,
                    turn,
                    cash,
                    strength,
                    agility,
                    intelligence,
                    sense,
                    attractiveness,
                    toughness,
                    stress,
                    context_embedding
                FROM statuses
                """
            )
        )
        await conn.execute(text("DROP TABLE statuses"))
        await conn.execute(text("ALTER TABLE statuses_without_selection_model RENAME TO statuses"))
    await conn.execute(text("DROP TABLE selection_models"))

    for object_key in selection_model_object_keys:
        delete_object(object_key)


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
            await run_startup_migrations(conn)
        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app

