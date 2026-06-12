from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_ROOT))

from utils import llm


class SceneScriptLlmTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_scene_script_rejects_empty_history_or_direction(self) -> None:
        for history, direction in (("  ", "다음 장면"), ("이전 장면", "  ")):
            with self.subTest(history=history, direction=direction):
                with self.assertRaises(HTTPException) as raised:
                    await llm.generate_scene_script(history, direction)

                self.assertEqual(raised.exception.status_code, 400)

    async def test_generate_scene_script_returns_script_from_json(self) -> None:
        with patch.object(
            llm,
            "generate_prompt_with_llm",
            return_value='{"script": "공주는 촛불을 낮게 들고 복도를 걸었다.\\n문 너머에서 낯선 숨소리가 들렸다."}',
        ):
            result = await llm.generate_scene_script("공주는 성에 들어섰다.", "긴장감을 높인다.")

        self.assertEqual(
            result,
            "공주는 촛불을 낮게 들고 복도를 걸었다.\n문 너머에서 낯선 숨소리가 들렸다.",
        )

    async def test_generate_scene_script_parses_json_with_surrounding_noise(self) -> None:
        with patch.object(
            llm,
            "generate_prompt_with_llm",
            return_value='좋아요.\n{"script": "그녀는 숨을 고르고 검은 문을 밀었다."}\n끝',
        ):
            result = await llm.generate_scene_script("검은 문 앞에 섰다.", "문 안으로 들어간다.")

        self.assertEqual(result, "그녀는 숨을 고르고 검은 문을 밀었다.")

    async def test_generate_scene_script_strips_code_fence_from_script_value(self) -> None:
        with patch.object(
            llm,
            "generate_prompt_with_llm",
            return_value='{"script": "```\\n달빛 아래, 그녀는 오래된 서약을 떠올렸다.\\n```"}',
        ):
            result = await llm.generate_scene_script("밤이 되었다.", "회상으로 이어간다.")

        self.assertEqual(result, "달빛 아래, 그녀는 오래된 서약을 떠올렸다.")

    async def test_generate_scene_script_rejects_bad_llm_output(self) -> None:
        for raw_output in ("", "not json", '{"script": ""}', '{"script": 123}', '["script"]'):
            with self.subTest(raw_output=raw_output):
                with patch.object(llm, "generate_prompt_with_llm", return_value=raw_output):
                    with self.assertRaises(HTTPException) as raised:
                        await llm.generate_scene_script("이전 장면", "다음 방향")

                self.assertEqual(raised.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
