import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

API_ROOT = Path(__file__).resolve().parents[1] 
ENV_PATH = API_ROOT / ".env"
DEFAULT_DB_URL = f"sqlite+aiosqlite:///{(API_ROOT / 'local.sqlite3').as_posix()}"
DEFAULT_LOCAL_UPLOAD_DIR = str(API_ROOT / "uploads")
DEFAULT_SCENE_EMBEDDING_MODEL_NAME = "intfloat/multilingual-e5-large"
DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_N_CTX = 4096
DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_N_GPU_LAYERS = -1
DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_N_THREADS = 0
DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_MAX_TOKENS = 180
DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_TEMPERATURE = 0.2

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
    stable_diffusion_prompt_llm_model_path: str
    stable_diffusion_prompt_llm_n_ctx: int
    stable_diffusion_prompt_llm_n_gpu_layers: int
    stable_diffusion_prompt_llm_n_threads: int
    stable_diffusion_prompt_llm_max_tokens: int
    stable_diffusion_prompt_llm_temperature: float
    SCENE_EMBEDDING_MODEL_NAME: str


def build_settings() -> Settings:
    return Settings(
        db_url=os.getenv("DB_URL") or DEFAULT_DB_URL,
        app_base_url=os.getenv("APP_BASE_URL", "http://localhost:5173"),
        API_BASE_URL=os.getenv("API_BASE_URL", "http://localhost:8000"),
        app_timezone=os.getenv("APP_TIMEZONE", "Asia/Seoul"),
        LOCAL_UPLOAD_DIR=get_local_path_env("LOCAL_UPLOAD_DIR", Path(DEFAULT_LOCAL_UPLOAD_DIR)),
        MAX_UPLOAD_SIZE_MB=int(os.getenv("MAX_UPLOAD_SIZE_MB", "20")),
        stable_diffusion_model_path=get_local_path_env("STABLE_DIFFUSION_MODEL_PATH"),
        stable_diffusion_prompt_llm_model_path=get_local_path_env("STABLE_DIFFUSION_PROMPT_LLM_MODEL_PATH"),
        stable_diffusion_prompt_llm_n_ctx=int(
            os.getenv("STABLE_DIFFUSION_PROMPT_LLM_N_CTX", str(DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_N_CTX))
        ),
        stable_diffusion_prompt_llm_n_gpu_layers=int(
            os.getenv(
                "STABLE_DIFFUSION_PROMPT_LLM_N_GPU_LAYERS",
                str(DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_N_GPU_LAYERS),
            )
        ),
        stable_diffusion_prompt_llm_n_threads=int(
            os.getenv(
                "STABLE_DIFFUSION_PROMPT_LLM_N_THREADS",
                str(DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_N_THREADS),
            )
        ),
        stable_diffusion_prompt_llm_max_tokens=int(
            os.getenv(
                "STABLE_DIFFUSION_PROMPT_LLM_MAX_TOKENS",
                str(DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_MAX_TOKENS),
            )
        ),
        stable_diffusion_prompt_llm_temperature=float(
            os.getenv(
                "STABLE_DIFFUSION_PROMPT_LLM_TEMPERATURE",
                str(DEFAULT_STABLE_DIFFUSION_PROMPT_LLM_TEMPERATURE),
            )
        ),
        SCENE_EMBEDDING_MODEL_NAME=os.getenv("SCENE_EMBEDDING_MODEL_NAME", DEFAULT_SCENE_EMBEDDING_MODEL_NAME),
    )


def reload_settings() -> Settings:
    load_dotenv(ENV_PATH, override=True)
    reloaded_settings = build_settings()
    for field_name in Settings.model_fields:
        setattr(settings, field_name, getattr(reloaded_settings, field_name))
    return settings


settings = build_settings()
