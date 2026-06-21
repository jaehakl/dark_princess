from __future__ import annotations

import asyncio
import gc
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

LLM_MODEL_PATH = ""
LLM_REPO_ID = "LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF"
LLM_MODEL_FILENAME = "EXAONE-4.0-1.2B-Q4_K_M.gguf"
LLM_CONTEXT_SIZE = 8192
LLM_N_GPU_LAYERS = 0
LLM_N_THREADS = 0
LLM_MAX_TOKENS = 180
LLM_TEMPERATURE = 0.2
LLM_TOP_P = 0.9
LLM_MAX_SOURCE_TEXT_LENGTH = 4000
LLM_MIN_MAX_TOKENS = 16
LLM_MAX_MAX_TOKENS = 1024
LLM_MIN_TEMPERATURE = 0.0
LLM_MAX_TEMPERATURE = 2.0

KOREAN_TO_ENGLISH_TRANSLATION_SYSTEM_MESSAGE = (
    "You translate Korean user text into natural English. "
    "Return only valid JSON with one string field named translation. "
    "The translation must be English only. "
    "Do not include markdown, explanations, source text, field labels, or metadata."
)
CUT_COMPONENT_ANALYSIS_SYSTEM_MESSAGE = (
    "You analyze cut text into structured visual-narrative components. "
    "Return only one valid JSON object with exactly the string fields requested by the user. "
    "Each value must be a concise text summary, not an array. "
    "Use an empty string only when the component cannot be inferred. "
    "Use the language that best matches the source text. "
    "Do not include markdown, code fences, explanations, extra fields, or metadata."
)
VISUAL_KEYWORD_SYSTEM_MESSAGE = (
    "이미지 생성에 유용한 핵심 시각 키워드를 추출한다. "
    "시각적으로 그럴듯한 인물, 장소, 행동, 상황, 소품, 분위기 등을 조금 상상해 보완한다. "
    "반드시 JSON 객체만 반환하고, 각 값은 문자열 배열로 작성한다. "
    "마크다운, 설명, 문장, 메타데이터는 넣지 않는다."
)
VISUAL_KEYWORD_TRANSLATION_SYSTEM_MESSAGE = (
    "You translate visual keyword JSON values into natural English image prompt tags. "
    "Return only one valid JSON object. "
    "Preserve a JSON object shape, but field names do not matter. "
    "Translate only keyword values, not explanations. "
    "Every value must be an array of strings. "
    "Each English keyword must be one to five words. "
    "Do not repeat duplicate words or duplicate keywords. "
    "Do not include Korean, markdown, code fences, labels, metadata, or full sentences."
)

HANGUL_RE = re.compile("[\uac00-\ud7a3]")
TRANSLATION_WRAPPER_POLLUTION_RE = re.compile(
    r"(```|^json\b|^translation\s*:|[{}\[\]]|\"translation\"\s*:)",
    re.IGNORECASE,
)
VISUAL_KEYWORD_WRAPPER_POLLUTION_RE = re.compile(
    r"(```|^json\b|[{}\[\]]|[:：]|\"?[A-Za-z0-9_-]+\"?\s*:)",
    re.IGNORECASE,
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


async def translate_korean_to_english(
    text: str,
    max_tokens: int | None = None,
    temperature: float | None = None,
    max_attempts: int = 3,
) -> str:
    korean_text = text.strip()
    if not korean_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")
    if len(korean_text) > LLM_MAX_SOURCE_TEXT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"text must be {LLM_MAX_SOURCE_TEXT_LENGTH} characters or fewer",
        )

    attempts = max(1, max_attempts)
    last_failure = "translation LLM returned invalid translation"
    for _ in range(attempts):
        raw_output = await generate_prompt_with_llm(
            [
                {"role": "system", "content": KOREAN_TO_ENGLISH_TRANSLATION_SYSTEM_MESSAGE},
                {
                    "role": "user",
                    "content": f"Korean text:\n{korean_text}\n\nReturn JSON now.",
                },
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        try:
            payload = _parse_llm_json_object(
                raw_output,
                empty_detail="translation LLM returned empty output",
                invalid_detail="translation LLM returned invalid JSON",
            )
        except HTTPException as exc:
            if exc.status_code != status.HTTP_502_BAD_GATEWAY:
                raise
            last_failure = str(exc.detail)
            continue

        translation = payload.get("translation")
        if not isinstance(translation, str) or not translation.strip():
            last_failure = "translation LLM returned empty translation"
            continue

        translation = translation.replace("\r\n", "\n").replace("\r", "\n").strip()
        if translation.startswith("```"):
            lines = translation.splitlines()
            if lines:
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            translation = "\n".join(lines).strip()
        translation = " ".join(translation.strip().strip("\"'`").splitlines()).strip()
        if not translation:
            last_failure = "translation LLM returned empty translation"
            continue
        if HANGUL_RE.search(translation):
            last_failure = "translation LLM returned Korean text"
            continue
        if TRANSLATION_WRAPPER_POLLUTION_RE.search(translation):
            last_failure = "translation LLM returned wrapper text"
            continue
        return translation

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"translation failed after {attempts} attempts: {last_failure}",
    )


async def analyze_cut_components(
    text: str,
    fields: tuple[str, ...] | list[str],
    max_tokens: int | None = None,
    temperature: float | None = None,
    max_attempts: int = 3,
) -> dict[str, str]:
    cut_text = text.strip()
    if not cut_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")
    if len(cut_text) > LLM_MAX_SOURCE_TEXT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"text must be {LLM_MAX_SOURCE_TEXT_LENGTH} characters or fewer",
        )

    component_fields = _normalize_cut_component_fields(fields)
    field_list_text = ", ".join(component_fields)
    attempts = max(1, max_attempts)
    last_failure = "cut component LLM returned invalid components"
    for _ in range(attempts):
        raw_output = await generate_prompt_with_llm(
            [
                {"role": "system", "content": CUT_COMPONENT_ANALYSIS_SYSTEM_MESSAGE},
                {
                    "role": "user",
                    "content": (
                        f"Analyze the following cut text into these fields: {field_list_text}.\n"
                        "Return JSON only, using exactly those keys and string values.\n\n"
                        f"Cut text:\n{cut_text}\n\n"
                        "Return JSON now."
                    ),
                },
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        try:
            payload = _parse_llm_json_object(
                raw_output,
                empty_detail="cut component LLM returned empty output",
                invalid_detail="cut component LLM returned invalid JSON",
            )
        except HTTPException as exc:
            if exc.status_code != status.HTTP_502_BAD_GATEWAY:
                raise
            last_failure = str(exc.detail)
            continue

        if set(payload) != set(component_fields):
            last_failure = "cut component LLM returned invalid component keys"
            continue

        result: dict[str, str] = {}
        for field in component_fields:
            value = payload[field]
            if not isinstance(value, str):
                last_failure = f"cut component LLM returned non-string {field}"
                result = {}
                break

            cleaned = value.replace("\r\n", "\n").replace("\r", "\n").strip()
            if cleaned.startswith("```"):
                lines = cleaned.splitlines()
                if lines:
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                cleaned = "\n".join(lines).strip()
            result[field] = " ".join(cleaned.strip().strip("\"'`").split()).strip()

        if not result:
            continue
        if not any(result.values()):
            last_failure = "cut component LLM returned empty components"
            continue
        return result

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"cut component analysis failed after {attempts} attempts: {last_failure}",
    )


def _normalize_cut_component_fields(fields: tuple[str, ...] | list[str]) -> tuple[str, ...]:
    normalized_fields: list[str] = []
    seen_fields: set[str] = set()
    for field in fields:
        if not isinstance(field, str):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fields must contain only strings")

        normalized_field = field.strip()
        if not normalized_field:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fields must not be empty")
        if normalized_field in seen_fields:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fields must not contain duplicates")
        seen_fields.add(normalized_field)
        normalized_fields.append(normalized_field)

    if not normalized_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fields are required")
    return tuple(normalized_fields)


async def extract_visual_keywords(
    text: str,
    max_tokens: int | None = None,
    temperature: float | None = None,
    max_attempts: int = 3,
) -> dict[str, list[str]]:
    cut_text = text.strip()
    if not cut_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")
    if len(cut_text) > LLM_MAX_SOURCE_TEXT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"text must be {LLM_MAX_SOURCE_TEXT_LENGTH} characters or fewer",
        )

    attempts = max(1, max_attempts)
    last_failure = "visual keyword LLM returned invalid keywords"
    for attempt in range(1, attempts + 1):
        raw_output = await generate_prompt_with_llm(
            [
                {"role": "system", "content": VISUAL_KEYWORD_SYSTEM_MESSAGE},
                {
                    "role": "user",
                    "content": (
                        "다음 한국어 컷 묘사에서 이미지 생성에 useful한 핵심 단어들을 뽑아줘.\n"
                        "출력은 JSON 객체 하나만 사용하고, 값은 배열로 작성해.\n"
                        "키 이름은 자유롭지만 예시는 아래 형태를 참고해.\n\n"
                        f"컷 묘사:\n{cut_text}\n\n"
                        "JSON 예시:\n"
                        '{ "인물": [], "장소": [], "행동": [], "상황": [], "소품": [], "분위기": [] }'
                    ),
                },
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        try:
            payload = _parse_llm_json_object(
                raw_output,
                empty_detail="visual keyword LLM returned empty output",
                invalid_detail="visual keyword LLM returned invalid JSON",
            )
        except HTTPException as exc:
            if exc.status_code != status.HTTP_502_BAD_GATEWAY:
                raise
            last_failure = str(exc.detail)
            continue

        result, last_failure = _normalize_visual_keyword_payload(
            payload,
            allow_hangul=True,
            failure_prefix="visual keyword LLM",
        )
        if result is not None:
            return result

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"visual keyword extraction failed after {attempts} attempts: {last_failure}",
    )


async def translate_visual_keywords_to_english(
    keywords: dict[str, list[str]],
    max_tokens: int | None = None,
    temperature: float | None = None,
    max_attempts: int = 3,
) -> dict[str, list[str]]:
    keyword_json = json.dumps(keywords, ensure_ascii=False)
    attempts = max(1, max_attempts)
    last_failure = "visual keyword translation LLM returned invalid keywords"
    for attempt in range(1, attempts + 1):
        raw_output = await generate_prompt_with_llm(
            [
                {"role": "system", "content": VISUAL_KEYWORD_TRANSLATION_SYSTEM_MESSAGE},
                {
                    "role": "user",
                    "content": (
                        "Translate the values in this visual keyword JSON into English image prompt tags.\n"
                        "Return JSON only. Keep values as arrays. Field names can be preserved or changed.\n\n"
                        f"Keyword JSON:\n{keyword_json}"
                    ),
                },
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        try:
            payload = _parse_llm_json_object(
                raw_output,
                empty_detail="visual keyword translation LLM returned empty output",
                invalid_detail="visual keyword translation LLM returned invalid JSON",
            )
        except HTTPException as exc:
            if exc.status_code != status.HTTP_502_BAD_GATEWAY:
                raise
            last_failure = str(exc.detail)
            continue

        result, last_failure = _normalize_visual_keyword_payload(
            payload,
            allow_hangul=False,
            failure_prefix="visual keyword translation LLM",
        )
        if result is not None:
            return result

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"visual keyword translation failed after {attempts} attempts: {last_failure}",
    )


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
    resolved_max_tokens = LLM_MAX_TOKENS if max_tokens is None else max_tokens
    if not LLM_MIN_MAX_TOKENS <= resolved_max_tokens <= LLM_MAX_MAX_TOKENS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "max_tokens must be between "
                f"{LLM_MIN_MAX_TOKENS} and {LLM_MAX_MAX_TOKENS}"
            ),
        )

    resolved_temperature = LLM_TEMPERATURE if temperature is None else temperature
    if not LLM_MIN_TEMPERATURE <= resolved_temperature <= LLM_MAX_TEMPERATURE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "temperature must be between "
                f"{LLM_MIN_TEMPERATURE} and {LLM_MAX_TEMPERATURE}"
            ),
        )

    model_path_value = LLM_MODEL_PATH.strip()
    if model_path_value:
        model_path = Path(model_path_value).expanduser()
        try:
            model_path_value = str(model_path.resolve(strict=True))
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"prompt LLM model file not found: {model_path}",
            ) from exc

    repo_id = LLM_REPO_ID.strip()
    model_filename = LLM_MODEL_FILENAME.strip()
    if not model_path_value and (not repo_id or not model_filename):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="prompt LLM repo id and model filename are required",
        )

    return PromptLlmConfig(
        model_path=model_path_value,
        repo_id=repo_id,
        model_filename=model_filename,
        context_size=LLM_CONTEXT_SIZE,
        n_gpu_layers=LLM_N_GPU_LAYERS,
        n_threads=LLM_N_THREADS,
        max_tokens=resolved_max_tokens,
        temperature=resolved_temperature,
        top_p=LLM_TOP_P,
    )


def reset_llm_runtime_for_tests() -> None:
    global _prompt_llm_model_key, _prompt_llm

    _prompt_llm_model_key = None
    _prompt_llm = None


def _parse_llm_json_object(
    raw_output: str,
    empty_detail: str,
    invalid_detail: str,
) -> dict[str, Any]:
    raw_output = raw_output.strip()
    if not raw_output:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=empty_detail)

    try:
        payload = json.loads(raw_output)
    except json.JSONDecodeError as exc:
        json_start = raw_output.find("{")
        json_end = raw_output.rfind("}")
        if json_start < 0 or json_end <= json_start:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=invalid_detail,
            ) from exc
        try:
            payload = json.loads(raw_output[json_start:json_end + 1])
        except json.JSONDecodeError as nested_exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=invalid_detail,
            ) from nested_exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=invalid_detail)
    return payload


def _normalize_visual_keyword_payload(
    payload: dict[str, Any],
    *,
    allow_hangul: bool,
    failure_prefix: str,
) -> tuple[dict[str, list[str]] | None, str]:
    result: dict[str, list[str]] = {}
    seen_keyword_keys: set[str] = set()
    for raw_field, keywords in payload.items():
        field = str(raw_field)
        if isinstance(keywords, str):
            keywords = [keywords] if keywords.strip() else []
        if not isinstance(keywords, list):
            return None, f"{failure_prefix} returned invalid {field}"

        cleaned_keywords: list[str] = []
        for keyword in keywords:
            if not isinstance(keyword, str):
                return None, f"{failure_prefix} returned non-string {field} keyword"

            cleaned = " ".join(keyword.strip().strip("\"'`").split()).strip()
            if not cleaned:
                return None, f"{failure_prefix} returned empty {field} keyword"
            deduped_words: list[str] = []
            seen_word_keys: set[str] = set()
            for word in cleaned.split():
                word_key = word.casefold()
                if word_key in seen_word_keys:
                    continue
                seen_word_keys.add(word_key)
                deduped_words.append(word)
            cleaned = " ".join(deduped_words).strip()
            if not allow_hangul and HANGUL_RE.search(cleaned):
                return None, f"{failure_prefix} returned Korean {field} keyword"
            if VISUAL_KEYWORD_WRAPPER_POLLUTION_RE.search(cleaned):
                return None, f"{failure_prefix} returned wrapper text in {field}"
            if len(cleaned.split()) > 5:
                return None, f"{failure_prefix} returned phrase in {field}"
            keyword_key = cleaned.casefold()
            if keyword_key in seen_keyword_keys:
                continue
            seen_keyword_keys.add(keyword_key)
            cleaned_keywords.append(cleaned)

        result.setdefault(field, []).extend(cleaned_keywords)

    if not any(result.values()):
        return None, f"{failure_prefix} returned no keywords"
    return result, ""


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
            _prompt_llm = Llama(
                model_path=config.model_path,
                n_ctx=config.context_size,
                n_gpu_layers=config.n_gpu_layers,
                **({"n_threads": config.n_threads} if config.n_threads > 0 else {}),
                verbose=False,
            )
        else:
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
