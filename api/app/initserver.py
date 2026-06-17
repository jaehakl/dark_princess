from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from db import Base, engine

from settings import settings


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
