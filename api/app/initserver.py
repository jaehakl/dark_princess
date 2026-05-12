from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from db import Base, engine

from settings import settings


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

        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app
