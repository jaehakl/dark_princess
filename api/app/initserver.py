from contextlib import asynccontextmanager
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from db import Base, engine

from settings import settings


def scene_script_to_text(raw_script: str) -> str:
    try:
        script_items = json.loads(raw_script)
    except json.JSONDecodeError:
        return raw_script
    if not isinstance(script_items, list):
        return raw_script

    lines: list[str] = []
    for item in script_items:
        if isinstance(item, str):
            lines.extend(item.splitlines())
        elif isinstance(item, dict):
            for value in item.values():
                if isinstance(value, str):
                    lines.extend(value.splitlines())
    return "\n".join(line for line in lines if line)


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
        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app
