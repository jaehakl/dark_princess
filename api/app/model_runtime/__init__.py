from __future__ import annotations

from .embedding import _reset_embedding_runtime_for_tests, encode_cut_text
from .image import _reset_image_runtime_for_tests, generate_images_batch, get_available_cuda_device_ids
from .llm import (
    PromptLlmConfig,
    ask_llm,
    build_prompt_llm_config,
    generate_prompt_with_llm,
    reset_llm_runtime_for_tests,
)
from .wd14 import _reset_wd14_runtime_for_tests, predict_wd14_tags

__all__ = [
    "PromptLlmConfig",
    "ask_llm",
    "build_prompt_llm_config",
    "encode_cut_text",
    "generate_images_batch",
    "generate_prompt_with_llm",
    "get_available_cuda_device_ids",
    "predict_wd14_tags",
    "reset_llm_runtime_for_tests",
    "reset_model_runtime_for_tests",
]


def reset_model_runtime_for_tests() -> None:
    _reset_embedding_runtime_for_tests()
    _reset_image_runtime_for_tests()
    _reset_wd14_runtime_for_tests()
