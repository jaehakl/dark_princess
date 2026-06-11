from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from db import Base, engine

from settings import settings


async def drop_legacy_scene_name_column(conn):
    if engine.dialect.name != "sqlite":
        return

    columns = await conn.exec_driver_sql("PRAGMA table_info(scenes);")
    if "name" not in {row[1] for row in columns}:
        return

    try:
        await conn.exec_driver_sql("ALTER TABLE scenes DROP COLUMN name;")
        return
    except Exception:
        await conn.exec_driver_sql("DROP TABLE IF EXISTS scenes_migration;")
        await conn.exec_driver_sql(
            """
            CREATE TABLE scenes_migration (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                image_url TEXT,
                embedding JSON,
                scripts JSON NOT NULL DEFAULT '[]',
                status_change JSON NOT NULL DEFAULT '{}'
            );
            """
        )
        await conn.exec_driver_sql(
            """
            INSERT INTO scenes_migration (
                id,
                prompt,
                image_url,
                embedding,
                scripts,
                status_change
            )
            SELECT
                id,
                COALESCE(prompt, description, name, ''),
                COALESCE(image_url, image),
                embedding,
                COALESCE(scripts, '[]'),
                COALESCE(status_change, '{}')
            FROM scenes;
            """
        )
        await conn.exec_driver_sql("DROP TABLE scenes;")
        await conn.exec_driver_sql("ALTER TABLE scenes_migration RENAME TO scenes;")


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
            await drop_legacy_scene_name_column(conn)
        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app
