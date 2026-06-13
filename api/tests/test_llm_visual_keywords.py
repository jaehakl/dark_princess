from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_ROOT))

from utils import llm


class VisualKeywordExtractionTests(unittest.IsolatedAsyncioTestCase):
    async def test_extract_visual_keywords_rejects_empty_input(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            await llm.extract_visual_keywords("  ")

        self.assertEqual(raised.exception.status_code, 400)

    async def test_extract_visual_keywords_rejects_long_input(self) -> None:
        text = "가" * (llm.LLM_MAX_SOURCE_TEXT_LENGTH + 1)

        with self.assertRaises(HTTPException) as raised:
            await llm.extract_visual_keywords(text)

        self.assertEqual(raised.exception.status_code, 400)

    async def test_extract_visual_keywords_uses_korean_prompt_and_returns_korean_keywords(self) -> None:
        mock_generate = AsyncMock(
            return_value=(
                '{"주체": [" `공주` "], "장소": ["고대 성"], '
                '"행동": ["문 열기"], "분위기": [" 긴장 "], "소품": ["은 열쇠"]}'
            ),
        )

        with patch.object(llm, "generate_prompt_with_llm", new=mock_generate):
            result = await llm.extract_visual_keywords("공주는 검은 문을 열었다.")

        messages = mock_generate.await_args.args[0]
        self.assertIn("핵심 시각 키워드", messages[0]["content"])
        self.assertIn("다음 한국어 장면 묘사", messages[1]["content"])
        self.assertEqual(
            result,
            {
                "주체": ["공주"],
                "장소": ["고대 성"],
                "행동": ["문 열기"],
                "분위기": ["긴장"],
                "소품": ["은 열쇠"],
            },
        )

    async def test_extract_visual_keywords_parses_noisy_json_output(self) -> None:
        raw_output = (
            "좋아요.\n"
            '{"주체": ["마녀"], "장소": [], "행동": ["속삭임"], '
            '"분위기": ["불길함"], "소품": []}'
            "\n완료."
        )

        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value=raw_output),
        ):
            result = await llm.extract_visual_keywords("마녀가 속삭였다.")

        self.assertEqual(result["주체"], ["마녀"])
        self.assertEqual(result["장소"], [])
        self.assertEqual(result["소품"], [])

    async def test_extract_visual_keywords_keeps_unknown_array_fields(self) -> None:
        raw_output = '{"날씨": ["아침빛"], "정서": ["고요"], "디테일": ["부드러운 빛"]}'

        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value=raw_output),
        ):
            result = await llm.extract_visual_keywords("아침이 밝았다.")

        self.assertEqual(result["날씨"], ["아침빛"])
        self.assertEqual(result["정서"], ["고요"])
        self.assertEqual(result["디테일"], ["부드러운 빛"])

    async def test_extract_visual_keywords_coerces_string_fields_to_arrays(self) -> None:
        raw_output = (
            '{"주체": "마녀", "장소": [], "행동": ["속삭임"], '
            '"분위기": "불길함", "소품": ""}'
        )

        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value=raw_output),
        ):
            result = await llm.extract_visual_keywords("마녀가 속삭였다.")

        self.assertEqual(
            result,
            {
                "주체": ["마녀"],
                "장소": [],
                "행동": ["속삭임"],
                "분위기": ["불길함"],
                "소품": [],
            },
        )

    async def test_extract_visual_keywords_rejects_invalid_or_empty_keyword(self) -> None:
        base_payload = {
            "주체": ["마녀"],
            "장소": [],
            "행동": ["속삭임"],
            "분위기": ["불길함"],
            "소품": [],
        }
        for bad_keyword in (123, ""):
            with self.subTest(bad_keyword=bad_keyword):
                payload = {**base_payload, "소품": [bad_keyword]}
                raw_output = json.dumps(payload, ensure_ascii=False)

                with patch.object(
                    llm,
                    "generate_prompt_with_llm",
                    new=AsyncMock(return_value=raw_output),
                ):
                    with self.assertRaises(HTTPException) as raised:
                        await llm.extract_visual_keywords("마녀가 속삭였다.")

                self.assertEqual(raised.exception.status_code, 502)

    async def test_extract_visual_keywords_retries_keyword_phrase(self) -> None:
        mock_generate = AsyncMock(
            side_effect=[
                '{"주체": ["공주"], "행동": ["아주 무거운 오래된 검은 문 열기"]}',
                '{"주체": ["공주"], "행동": ["문 열기"]}',
            ],
        )

        with patch.object(llm, "generate_prompt_with_llm", new=mock_generate):
            result = await llm.extract_visual_keywords("공주는 무거운 문을 열었다.")

        self.assertEqual(result["행동"], ["문 열기"])
        self.assertEqual(mock_generate.await_count, 2)

    async def test_extract_visual_keywords_allows_five_words_and_removes_duplicates(self) -> None:
        raw_output = (
            '{"주체": ["공주 공주", "공주"], '
            '"행동": ["아주 무거운 검은 문 열기"], '
            '"분위기": ["고요 고요"]}'
        )

        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value=raw_output),
        ):
            result = await llm.extract_visual_keywords("공주는 무거운 문을 열었다.")

        self.assertEqual(result["주체"], ["공주"])
        self.assertEqual(result["행동"], ["아주 무거운 검은 문 열기"])
        self.assertEqual(result["분위기"], ["고요"])

    async def test_extract_visual_keywords_retries_when_all_fields_empty(self) -> None:
        mock_generate = AsyncMock(
            side_effect=[
                '{"주체": "", "장소": "", "행동": "", "분위기": "", "소품": []}',
                '{"주체": ["공주"], "장소": [], "행동": ["기다림"], "분위기": ["고독"], "소품": []}',
            ],
        )

        with patch.object(llm, "generate_prompt_with_llm", new=mock_generate):
            result = await llm.extract_visual_keywords("공주는 기다렸다.")

        self.assertEqual(result["주체"], ["공주"])
        self.assertEqual(result["행동"], ["기다림"])
        self.assertEqual(result["분위기"], ["고독"])
        self.assertEqual(mock_generate.await_count, 2)

    async def test_extract_visual_keywords_repeated_bad_outputs_return_502(self) -> None:
        raw_output = '{"주체": ["```json"], "장소": [], "행동": ["기다림"], "분위기": [], "소품": []}'

        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value=raw_output),
        ):
            with self.assertRaises(HTTPException) as raised:
                await llm.extract_visual_keywords("공주는 기다렸다.")

        self.assertEqual(raised.exception.status_code, 502)
        self.assertIn("visual keyword extraction failed after 3 attempts", raised.exception.detail)


class VisualKeywordTranslationTests(unittest.IsolatedAsyncioTestCase):
    async def test_translate_visual_keywords_to_english_returns_cleaned_arrays(self) -> None:
        raw_output = (
            '{"subject": [" `princess` "], "location": ["ancient castle"], '
            '"action": ["opens door"], "mood": [" tense "], "props": ["silver key"]}'
        )

        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value=raw_output),
        ):
            result = await llm.translate_visual_keywords_to_english({"주체": ["공주"]})

        self.assertEqual(
            result,
            {
                "subject": ["princess"],
                "location": ["ancient castle"],
                "action": ["opens door"],
                "mood": ["tense"],
                "props": ["silver key"],
            },
        )

    async def test_translate_visual_keywords_to_english_parses_noisy_json_output(self) -> None:
        raw_output = 'Sure.\n{"subject": ["witch"], "mood": ["ominous"]}\nDone.'

        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value=raw_output),
        ):
            result = await llm.translate_visual_keywords_to_english({"주체": ["마녀"]})

        self.assertEqual(result["subject"], ["witch"])
        self.assertEqual(result["mood"], ["ominous"])

    async def test_translate_visual_keywords_to_english_retries_keyword_with_hangul(self) -> None:
        mock_generate = AsyncMock(
            side_effect=[
                '{"subject": ["공주"], "action": ["waits"]}',
                '{"subject": ["princess"], "action": ["waits"]}',
            ],
        )

        with patch.object(llm, "generate_prompt_with_llm", new=mock_generate):
            result = await llm.translate_visual_keywords_to_english({"주체": ["공주"]})

        self.assertEqual(result["subject"], ["princess"])
        self.assertEqual(mock_generate.await_count, 2)

    async def test_translate_visual_keywords_to_english_rejects_bad_keywords(self) -> None:
        for raw_output in (
            '{"subject": ["```json"]}',
            '{"subject": [""]}',
            '{"subject": [123]}',
            '{"action": ["opens the very heavy black door"]}',
        ):
            with self.subTest(raw_output=raw_output):
                with patch.object(
                    llm,
                    "generate_prompt_with_llm",
                    new=AsyncMock(return_value=raw_output),
                ):
                    with self.assertRaises(HTTPException) as raised:
                        await llm.translate_visual_keywords_to_english({"주체": ["공주"]})

                self.assertEqual(raised.exception.status_code, 502)

    async def test_translate_visual_keywords_to_english_allows_five_words_and_removes_duplicates(self) -> None:
        raw_output = (
            '{"subject": ["Princess princess", "princess"], '
            '"action": ["opens the heavy black door"], '
            '"mood": ["quiet quiet"]}'
        )

        with patch.object(
            llm,
            "generate_prompt_with_llm",
            new=AsyncMock(return_value=raw_output),
        ):
            result = await llm.translate_visual_keywords_to_english({"주체": ["공주"]})

        self.assertEqual(result["subject"], ["Princess"])
        self.assertEqual(result["action"], ["opens the heavy black door"])
        self.assertEqual(result["mood"], ["quiet"])


if __name__ == "__main__":
    unittest.main()
