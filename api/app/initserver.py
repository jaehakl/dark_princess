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


CUT_SQLITE_BACKFILL_COLUMNS = {
    "scene_id": "ALTER TABLE cuts ADD COLUMN scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL",
    "prev_cut_id": "ALTER TABLE cuts ADD COLUMN prev_cut_id INTEGER REFERENCES cuts(id) ON DELETE SET NULL",
}


async def ensure_sqlite_schema(conn) -> None:
    result = await conn.execute(text("PRAGMA table_info(cuts)"))
    existing_columns = {row._mapping["name"] for row in result}

    for column_name, statement in CUT_SQLITE_BACKFILL_COLUMNS.items():
        if column_name not in existing_columns:
            await conn.execute(text(statement))


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
            await ensure_sqlite_schema(conn)
        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app

