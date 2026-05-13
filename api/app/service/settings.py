from io import StringIO

from dotenv import dotenv_values, set_key

import settings as app_settings

def get_stable_diffusion_model_path_config() -> dict[str, str]:
    env_values = _read_env_values()
    return {
        "value": env_values.get("STABLE_DIFFUSION_MODEL_PATH") or "",
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
    return get_stable_diffusion_model_path_config()


def _read_env_values() -> dict[str, str | None]:
    env_path = app_settings.ENV_PATH
    if not env_path.exists():
        return {}

    env_text = env_path.read_text(encoding="utf-8")
    return dict(dotenv_values(stream=StringIO(env_text)))
