import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

API_ROOT = Path(__file__).resolve().parents[1] 
ENV_PATH = API_ROOT / ".env"
DEFAULT_DB_URL = f"sqlite+aiosqlite:///{(API_ROOT / 'local.sqlite3').as_posix()}"
DEFAULT_LOCAL_UPLOAD_DIR = str(API_ROOT / "uploads")

load_dotenv(ENV_PATH)


def get_local_path_env(name: str, default_path: Path | None = None) -> str:
    raw_path = os.getenv(name)
    if not raw_path:
        if default_path is None:
            return ""
        return str(default_path)

    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = API_ROOT / path
    return str(path)


class Settings(BaseModel):
    db_url: str

    app_base_url: str
    API_BASE_URL: str
    app_timezone: str

    LOCAL_UPLOAD_DIR: str
    MAX_UPLOAD_SIZE_MB: int

    stable_diffusion_model_path: str


def build_settings() -> Settings:
    return Settings(
        db_url=os.getenv("DB_URL") or DEFAULT_DB_URL,
        app_base_url=os.getenv("APP_BASE_URL", "http://localhost:5173"),
        API_BASE_URL=os.getenv("API_BASE_URL", "http://localhost:8000"),
        app_timezone=os.getenv("APP_TIMEZONE", "Asia/Seoul"),
        LOCAL_UPLOAD_DIR=get_local_path_env("LOCAL_UPLOAD_DIR", Path(DEFAULT_LOCAL_UPLOAD_DIR)),
        MAX_UPLOAD_SIZE_MB=int(os.getenv("MAX_UPLOAD_SIZE_MB", "20")),
        stable_diffusion_model_path=get_local_path_env("STABLE_DIFFUSION_MODEL_PATH"),
    )


def reload_settings() -> Settings:
    load_dotenv(ENV_PATH, override=True)
    reloaded_settings = build_settings()
    for field_name in Settings.model_fields:
        setattr(settings, field_name, getattr(reloaded_settings, field_name))
    return settings


settings = build_settings()
