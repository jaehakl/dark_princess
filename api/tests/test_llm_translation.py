from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_ROOT))

from utils import llm


class KoreanToEnglishTranslationTests(unittest.IsolatedAsyncioTestCase):
    async def test_translate_korean_to_english_rejects_empty_input(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            await llm.translate_korean_to_english("  ")

        self.assertEqual(raised.exception.status_code, 400)

    async def test_translate_korean_to_english_rejects_long_input(self) -> None:
        text = "가" * (llm.LLM_MAX_SOURCE_TEXT_LENGTH + 1)

        with self.assertRaises(HTTPException) as raised:
            await llm.translate_korean_to_english(text)

        self.assertEqual(raised.exception.status_code, 400)

    async def test_translate_korean_to_english_returns_cleaned_translation(self) -> None:
        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value='{"translation": " `The princess opened the black door.`\\n"}'),
        ):
            result = await llm.translate_korean_to_english("공주는 검은 문을 열었다.")

        self.assertEqual(result, "The princess opened the black door.")

    async def test_translate_korean_to_english_parses_noisy_json_output(self) -> None:
        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(
                return_value='```json\n{"translation": "She took a deep breath."}\n```',
            ),
        ):
            result = await llm.translate_korean_to_english("그녀는 깊게 숨을 들이켰다.")

        self.assertEqual(result, "She took a deep breath.")

    async def test_translate_korean_to_english_retries_when_translation_contains_hangul(self) -> None:
        mock_generate = AsyncMock(
            side_effect=[
                '{"translation": "The princess opened 문."}',
                '{"translation": "The princess opened the door."}',
            ],
        )

        with patch.object(llm, "generate_prompt_with_llm", new=mock_generate):
            result = await llm.translate_korean_to_english("공주는 문을 열었다.")

        self.assertEqual(result, "The princess opened the door.")
        self.assertEqual(mock_generate.await_count, 2)

    async def test_translate_korean_to_english_repeated_bad_outputs_return_502(self) -> None:
        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value='{"translation": "```json {translation: bad} ```"}'),
        ):
            with self.assertRaises(HTTPException) as raised:
                await llm.translate_korean_to_english("공주는 문을 열었다.")

        self.assertEqual(raised.exception.status_code, 502)
        self.assertIn("translation failed after 3 attempts", raised.exception.detail)

    async def test_translate_korean_to_english_rejects_non_string_or_empty_translation(self) -> None:
        for raw_output in ('{"translation": 123}', '{"translation": ""}'):
            with self.subTest(raw_output=raw_output):
                with patch.object(
                    llm,
                    "generate_prompt_with_llm",
                    new=AsyncMock(return_value=raw_output),
                ):
                    with self.assertRaises(HTTPException) as raised:
                        await llm.translate_korean_to_english("공주는 문을 열었다.")

                self.assertEqual(raised.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
