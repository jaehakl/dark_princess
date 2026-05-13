from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from db import Base, engine

from settings import settings


async def add_target_prompt_column(conn):
    if engine.dialect.name == "postgresql":
        await conn.exec_driver_sql("ALTER TABLE targets ADD COLUMN IF NOT EXISTS prompt TEXT;")
        return

    if engine.dialect.name == "sqlite":
        columns = await conn.exec_driver_sql("PRAGMA table_info(targets);")
        column_names = {row[1] for row in columns}
        if "prompt" not in column_names:
            await conn.exec_driver_sql("ALTER TABLE targets ADD COLUMN prompt TEXT;")


async def add_scene_trigger_block_chance_percent_column(conn):
    if engine.dialect.name == "postgresql":
        await conn.exec_driver_sql(
            "ALTER TABLE scene_trigger_blocks "
            "ADD COLUMN IF NOT EXISTS chance_percent INTEGER NOT NULL DEFAULT 100;"
        )
        return

    if engine.dialect.name == "sqlite":
        columns = await conn.exec_driver_sql("PRAGMA table_info(scene_trigger_blocks);")
        column_names = {row[1] for row in columns}
        if "chance_percent" not in column_names:
            await conn.exec_driver_sql(
                "ALTER TABLE scene_trigger_blocks "
                "ADD COLUMN chance_percent INTEGER NOT NULL DEFAULT 100;"
            )


async def normalize_scene_repeat_policy_values(conn):
    await conn.exec_driver_sql(
        "UPDATE scenes SET repeat_policy = 'once_per_status' "
        "WHERE repeat_policy = 'once_per_turn';"
    )


def server():
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # When service starts.
        await start()
    
        yield
        
        # When service is stopped.
        shutdown()

    app = FastAPI(lifespan=lifespan)

    origins = [
        "http://localhost",
        "http://localhost:5173",
        settings.app_base_url
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=origins,
        #allow_origin_regex="https://.*\.onigiri\.kr",
        allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    upload_dir = Path(settings.LOCAL_UPLOAD_DIR).expanduser().resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    async def start():
        app.state.progress = 0
        async with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                try:
                    await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS citext;")
                    await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
                    await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector;")
                except Exception:
                    pass
            await conn.run_sync(Base.metadata.create_all)
            await add_target_prompt_column(conn)
            await add_scene_trigger_block_chance_percent_column(conn)
            await normalize_scene_repeat_policy_values(conn)

        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app
