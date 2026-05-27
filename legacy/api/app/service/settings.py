from io import StringIO
from pathlib import Path

from dotenv import dotenv_values, set_key

import settings as app_settings


def get_stable_diffusion_model_path_config() -> dict[str, object]:
    env_values = _read_env_values()
    value = env_values.get("STABLE_DIFFUSION_MODEL_PATH") or ""
    directory, files = _get_model_directory_files(value)

    return {
        "value": value,
        "directory": directory,
        "files": files,
    }


def update_stable_diffusion_model_path_config(value: str) -> dict[str, str]:
    if not value.strip():
        raise ValueError("stable diffusion model path is required")

    env_path = app_settings.ENV_PATH
    env_path.parent.mkdir(parents=True, exist_ok=True)
    if not env_path.exists():
        env_path.write_text("", encoding="utf-8")

    set_key(
        str(env_path),
        "STABLE_DIFFUSION_MODEL_PATH",
        value,
        quote_mode="never",
        encoding="utf-8",
    )
    app_settings.reload_settings()
    return {"value": value}


def _read_env_values() -> dict[str, str | None]:
    env_path = app_settings.ENV_PATH
    if not env_path.exists():
        return {}

    env_text = env_path.read_text(encoding="utf-8")
    return dict(dotenv_values(stream=StringIO(env_text)))


def _get_model_directory_files(value: str) -> tuple[str, list[str]]:
    if not value:
        return "", []

    model_path = Path(value).expanduser()
    if not model_path.is_absolute():
        model_path = app_settings.API_ROOT / model_path

    directory_path = model_path.parent
    if not directory_path.is_dir():
        return "", []

    try:
        files = sorted(
            item.name for item in directory_path.iterdir() if item.is_file()
        )
    except OSError:
        return "", []

    return str(directory_path.resolve()), files
