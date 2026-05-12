import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

API_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_URL = f"sqlite+aiosqlite:///{(API_ROOT / 'local.sqlite3').as_posix()}"
DEFAULT_LOCAL_UPLOAD_DIR = str(API_ROOT / "uploads")


def get_local_path_env(name: str, default_path: Path) -> str:
    raw_path = os.getenv(name)
    if not raw_path:
        return str(default_path)

    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = API_ROOT / path
    return str(path)


class Settings(BaseModel):
    db_url: str = os.getenv("DB_URL") or DEFAULT_DB_URL

    app_base_url: str = os.getenv("APP_BASE_URL", "http://localhost:5173")
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000")
    app_timezone: str = os.getenv("APP_TIMEZONE", "Asia/Seoul")

    LOCAL_UPLOAD_DIR: str = get_local_path_env("LOCAL_UPLOAD_DIR", Path(DEFAULT_LOCAL_UPLOAD_DIR))
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "20"))

settings = Settings()
