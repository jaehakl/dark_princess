from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import Base, engine
import user_auth.db  # noqa: F401

from settings import settings
from user_auth.routes import router as auth_router


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
        allow_credentials=True,
        allow_origins=origins,
        #allow_origin_regex="https://.*\.onigiri\.kr",
        allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    async def start():
        app.state.progress = 0
        async with engine.begin() as conn:
            try:
                await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS citext;")
                await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
                await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector;")
            except Exception:
                pass
            await conn.run_sync(Base.metadata.create_all)
        app.include_router(auth_router)

        print("service is started.")

    def shutdown():
        print("service is stopped.")

    return app
