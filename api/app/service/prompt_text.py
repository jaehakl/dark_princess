from __future__ import annotations

import re


PROMPT_WEIGHT_PATTERN = re.compile(r"\(([^()]*\S[^()]*?):\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\)")


def strip_prompt_weight_syntax(prompt: str) -> str:
    normalized_prompt = prompt
    while True:
        next_prompt = PROMPT_WEIGHT_PATTERN.sub(lambda match: match.group(1).strip(), normalized_prompt)
        if next_prompt == normalized_prompt:
            return normalized_prompt
        normalized_prompt = next_prompt
