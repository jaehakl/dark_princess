from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_ROOT))

from models import GenerateScenePromptRequestBase
from routers import scene as scene_router
from service import scene as scene_service


class ScenePromptByStructTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_prompt_by_struct_extracts_then_translates_and_joins_keywords(self) -> None:
        calls: list[str] = []

        async def extract(text: str, max_tokens: int | None = None, temperature: float | None = None) -> dict[str, list[str]]:
            calls.append(f"extract:{text}:{max_tokens}:{temperature}")
            return {
                "주체": ["공주"],
                "장소": ["달빛 성"],
                "행동": ["기다림"],
                "분위기": ["고요", "고독"],
                "소품": ["은 열쇠"],
            }

        async def translate(
            keywords: dict[str, list[str]],
            max_tokens: int | None = None,
            temperature: float | None = None,
        ) -> dict[str, list[str]]:
            calls.append(f"translate:{keywords}:{max_tokens}:{temperature}")
            return {
                "subject": ["princess"],
                "location": ["moonlit castle"],
                "action": ["waits"],
                "mood": ["quiet", "lonely"],
                "props": ["silver key"],
            }

        with (
            patch.object(scene_service, "extract_visual_keywords", side_effect=extract),
            patch.object(scene_service, "translate_visual_keywords_to_english", side_effect=translate),
        ):
            result = await scene_service.generate_prompt_by_struct(
                "공주는 달빛 아래 성에서 기다렸다.",
                max_tokens=128,
                temperature=0.2,
            )

        self.assertEqual(
            calls,
            [
                "extract:공주는 달빛 아래 성에서 기다렸다.:128:0.2",
                (
                    "translate:{'주체': ['공주'], '장소': ['달빛 성'], '행동': ['기다림'], "
                    "'분위기': ['고요', '고독'], '소품': ['은 열쇠']}:128:0.2"
                ),
            ],
        )
        self.assertEqual(result, "princess, moonlit castle, waits, quiet, lonely, silver key")

    async def test_generate_prompt_by_struct_skips_empty_arrays_and_empty_keywords(self) -> None:
        with (
            patch.object(
                scene_service,
                "extract_visual_keywords",
                new=AsyncMock(
                    return_value={
                        "주체": ["공주"],
                        "날씨": ["아침빛"],
                    },
                ),
            ),
            patch.object(
                scene_service,
                "translate_visual_keywords_to_english",
                new=AsyncMock(
                    return_value={
                        "subject": ["princess"],
                        "weather": ["morning light"],
                        "action": [" waits "],
                        "mood": [],
                        "props": [""],
                    },
                ),
            ),
        ):
            result = await scene_service.generate_prompt_by_struct("공주는 기다렸다.")

        self.assertEqual(result, "princess, morning light, waits")

    async def test_generate_prompt_by_struct_propagates_keyword_extraction_error(self) -> None:
        with patch.object(
            scene_service,
            "extract_visual_keywords",
            new=AsyncMock(side_effect=HTTPException(status_code=400, detail="text is required")),
        ):
            with self.assertRaises(HTTPException) as raised:
                await scene_service.generate_prompt_by_struct("  ")

        self.assertEqual(raised.exception.status_code, 400)

    async def test_generate_prompt_by_struct_propagates_keyword_translation_error(self) -> None:
        with (
            patch.object(
                scene_service,
                "extract_visual_keywords",
                new=AsyncMock(return_value={"주체": ["공주"]}),
            ),
            patch.object(
                scene_service,
                "translate_visual_keywords_to_english",
                new=AsyncMock(side_effect=HTTPException(status_code=502, detail="failed")),
            ),
        ):
            with self.assertRaises(HTTPException) as raised:
                await scene_service.generate_prompt_by_struct("공주는 기다렸다.")

        self.assertEqual(raised.exception.status_code, 502)

    async def test_api_generate_prompt_by_struct_returns_prompt_response(self) -> None:
        request = GenerateScenePromptRequestBase(
            text="공주는 기다렸다.",
            max_tokens=64,
            temperature=0.1,
        )

        with patch.object(
            scene_router,
            "generate_prompt_by_struct",
            new=AsyncMock(return_value="princess, waits"),
        ) as generate:
            response = await scene_router.api_generate_prompt_by_struct(request)

        generate.assert_awaited_once_with("공주는 기다렸다.", max_tokens=64, temperature=0.1)
        self.assertEqual(response.prompt, "princess, waits")

    async def test_api_generate_prompt_returns_struct_prompt_response(self) -> None:
        request = GenerateScenePromptRequestBase(
            text="공주는 기다렸다.",
            max_tokens=64,
            temperature=0.1,
        )

        with patch.object(
            scene_router,
            "generate_prompt_by_struct",
            new=AsyncMock(return_value="princess, waits"),
        ) as generate:
            response = await scene_router.api_generate_prompt(request)

        generate.assert_awaited_once_with("공주는 기다렸다.", max_tokens=64, temperature=0.1)
        self.assertEqual(response.prompt, "princess, waits")


if __name__ == "__main__":
    unittest.main()
