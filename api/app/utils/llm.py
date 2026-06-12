from __future__ import annotations

import asyncio
import gc
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from settings import API_ROOT, settings

PROMPT_LLM_REPO_ID = "LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF"
PROMPT_LLM_MODEL_FILENAME = "EXAONE-4.0-1.2B-Q4_K_M.gguf"
PROMPT_LLM_TOP_P = 0.9
PROMPT_LLM_MAX_SOURCE_TEXT_LENGTH = 4000
PROMPT_LLM_MIN_MAX_TOKENS = 16
PROMPT_LLM_MAX_MAX_TOKENS = 1024
PROMPT_LLM_MIN_TEMPERATURE = 0.0
PROMPT_LLM_MAX_TEMPERATURE = 2.0

STABLE_DIFFUSION_PROMPT_SYSTEM_MESSAGE = (
    "You convert scene descriptions into Stable Diffusion positive prompts. "
    "Return only valid JSON with one string field named prompt. "
    "The prompt must be English comma-separated visual tags or short phrases. "
    "Do not include markdown, explanations, negative prompt terms, score tags, or rating tags."
)

_prompt_llm_lock = asyncio.Lock()
_prompt_llm_model_key: tuple[str, str, str, int, int, int] | None = None
_prompt_llm: Any | None = None


@dataclass(frozen=True)
class PromptLlmConfig:
    model_path: str
    repo_id: str
    model_filename: str
    context_size: int
    n_gpu_layers: int
    n_threads: int
    max_tokens: int
    temperature: float
    top_p: float


async def generate_stable_diffusion_prompt(
    text: str,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> str:
    scene_text = text.strip()
    if not scene_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")
    if len(scene_text) > PROMPT_LLM_MAX_SOURCE_TEXT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"text must be {PROMPT_LLM_MAX_SOURCE_TEXT_LENGTH} characters or fewer",
        )

    raw_output = (
        await generate_prompt_with_llm(
            [
                {"role": "system", "content": STABLE_DIFFUSION_PROMPT_SYSTEM_MESSAGE},
                {
                    "role": "user",
                    "content": f"Scene description:\n{scene_text}\n\nReturn JSON now.",
                },
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
    ).strip()
    if not raw_output:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="prompt LLM returned empty output",
        )

    try:
        payload = json.loads(raw_output)
    except json.JSONDecodeError as exc:
        json_start = raw_output.find("{")
        json_end = raw_output.rfind("}")
        if json_start < 0 or json_end <= json_start:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="prompt LLM returned invalid JSON",
            ) from exc
        try:
            payload = json.loads(raw_output[json_start:json_end + 1])
        except json.JSONDecodeError as nested_exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="prompt LLM returned invalid JSON",
            ) from nested_exc

    prompt = payload.get("prompt") if isinstance(payload, dict) else None
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="prompt LLM returned empty prompt",
        )
    prompt = " ".join(prompt.strip().strip("\"'`").splitlines())
    for prefix in ("prompt:", "positive prompt:", "stable diffusion prompt:"):
        if prompt.lower().startswith(prefix):
            prompt = prompt[len(prefix):].strip()
    return prompt


async def generate_prompt_with_llm(
    messages: list[dict[str, str]],
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> str:
    config = build_prompt_llm_config(max_tokens=max_tokens, temperature=temperature)
    async with _prompt_llm_lock:
        return await asyncio.to_thread(_generate_prompt_with_llm_locked, config, messages)


def build_prompt_llm_config(
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> PromptLlmConfig:
    resolved_max_tokens = (
        settings.stable_diffusion_prompt_llm_max_tokens
        if max_tokens is None
        else max_tokens
    )
    if not PROMPT_LLM_MIN_MAX_TOKENS <= resolved_max_tokens <= PROMPT_LLM_MAX_MAX_TOKENS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "max_tokens must be between "
                f"{PROMPT_LLM_MIN_MAX_TOKENS} and {PROMPT_LLM_MAX_MAX_TOKENS}"
            ),
        )

    resolved_temperature = (
        settings.stable_diffusion_prompt_llm_temperature
        if temperature is None
        else temperature
    )
    if not PROMPT_LLM_MIN_TEMPERATURE <= resolved_temperature <= PROMPT_LLM_MAX_TEMPERATURE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "temperature must be between "
                f"{PROMPT_LLM_MIN_TEMPERATURE} and {PROMPT_LLM_MAX_TEMPERATURE}"
            ),
        )

    model_path_value = settings.stable_diffusion_prompt_llm_model_path.strip()
    if model_path_value:
        model_path = Path(model_path_value).expanduser()
        if not model_path.is_absolute():
            model_path = API_ROOT / model_path
        try:
            model_path_value = str(model_path.resolve(strict=True))
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"prompt LLM model file not found: {model_path}",
            ) from exc

    repo_id = PROMPT_LLM_REPO_ID.strip()
    model_filename = PROMPT_LLM_MODEL_FILENAME.strip()
    if not model_path_value and (not repo_id or not model_filename):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="prompt LLM repo id and model filename are required",
        )

    return PromptLlmConfig(
        model_path=model_path_value,
        repo_id=repo_id,
        model_filename=model_filename,
        context_size=settings.stable_diffusion_prompt_llm_n_ctx,
        n_gpu_layers=settings.stable_diffusion_prompt_llm_n_gpu_layers,
        n_threads=settings.stable_diffusion_prompt_llm_n_threads,
        max_tokens=resolved_max_tokens,
        temperature=resolved_temperature,
        top_p=PROMPT_LLM_TOP_P,
    )


def reset_llm_runtime_for_tests() -> None:
    global _prompt_llm_model_key, _prompt_llm

    _prompt_llm_model_key = None
    _prompt_llm = None


def _generate_prompt_with_llm_locked(
    config: PromptLlmConfig,
    messages: list[dict[str, str]],
) -> str:
    llm = _get_prompt_llm_locked(config)
    response = llm.create_chat_completion(
        messages=messages,
        max_tokens=config.max_tokens,
        temperature=config.temperature,
        top_p=config.top_p,
        response_format={"type": "json_object"},
    )
    if not isinstance(response, dict):
        return ""

    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""

    message = first_choice.get("message")
    if not isinstance(message, dict):
        return ""

    content = message.get("content")
    return content if isinstance(content, str) else ""


def _get_prompt_llm_locked(config: PromptLlmConfig) -> Any:
    global _prompt_llm_model_key, _prompt_llm

    model_key = (
        config.model_path,
        config.repo_id,
        config.model_filename,
        config.context_size,
        config.n_gpu_layers,
        config.n_threads,
    )
    if _prompt_llm is not None and _prompt_llm_model_key != model_key:
        _prompt_llm = None
        _prompt_llm_model_key = None
        gc.collect()

    if _prompt_llm is None:
        try:
            from llama_cpp import Llama
        except (ModuleNotFoundError, OSError, RuntimeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "llama-cpp-python is not available or failed to load its native libraries. "
                    "Install a wheel that matches this machine, then restart the API server."
                ),
            ) from exc

        if config.model_path:
            print(f"Loading prompt LLM GGUF: {config.model_path}", flush=True)
            _prompt_llm = Llama(
                model_path=config.model_path,
                n_ctx=config.context_size,
                n_gpu_layers=config.n_gpu_layers,
                **({"n_threads": config.n_threads} if config.n_threads > 0 else {}),
                verbose=False,
            )
        else:
            print(
                f"Loading prompt LLM from Hugging Face: {config.repo_id}/{config.model_filename}",
                flush=True,
            )
            _prompt_llm = Llama.from_pretrained(
                repo_id=config.repo_id,
                filename=config.model_filename,
                n_ctx=config.context_size,
                n_gpu_layers=config.n_gpu_layers,
                **({"n_threads": config.n_threads} if config.n_threads > 0 else {}),
                verbose=False,
            )
        _prompt_llm_model_key = model_key
    return _prompt_llm
