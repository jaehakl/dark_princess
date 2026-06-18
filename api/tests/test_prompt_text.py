import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from service import image as image_service
from service import scene as scene_service
from service.prompt_text import strip_prompt_weight_syntax


class PromptTextTest(unittest.TestCase):
    def test_strip_single_weighted_prompt(self):
        self.assertEqual(strip_prompt_weight_syntax("girl, (red dress:1.3)"), "girl, red dress")
        self.assertEqual(strip_prompt_weight_syntax("girl, (red dress: 1.3)"), "girl, red dress")

    def test_strip_multiple_weighted_prompts(self):
        self.assertEqual(
            strip_prompt_weight_syntax("(keyword:1), (another keyword:0.8)"),
            "keyword, another keyword",
        )

    def test_strip_nested_weighted_prompt(self):
        self.assertEqual(strip_prompt_weight_syntax("((keyword:1.3):1.2)"), "keyword")

    def test_keep_unweighted_or_non_numeric_weight_prompts(self):
        self.assertEqual(strip_prompt_weight_syntax("(keyword)"), "(keyword)")
        self.assertEqual(strip_prompt_weight_syntax("(keyword:high)"), "(keyword:high)")

    def test_scene_embedding_strips_visual_prompt_only(self):
        script = "script keeps weighted text: (do not change:1.3)"
        with patch.object(scene_service, "encode_scene_text", new_callable=AsyncMock) as encode_scene_text:
            encode_scene_text.return_value = [0.0] * scene_service.VECTOR_DIMENSION

            asyncio.run(scene_service.make_scene_embedding("castle, (dark princess:1.3)", script))

        self.assertEqual(
            encode_scene_text.await_args.args[1],
            "passage: castle, dark princess\nscript keeps weighted text: (do not change:1.3)",
        )

    def test_image_positive_prompt_embedding_strips_prompt_weight_syntax(self):
        with patch.object(image_service, "encode_scene_text", new_callable=AsyncMock) as encode_scene_text:
            encode_scene_text.return_value = [0.0] * image_service.VECTOR_DIMENSION

            asyncio.run(image_service.make_positive_prompt_embedding("girl, (red dress:1.3)"))

        self.assertEqual(encode_scene_text.await_args.args[1], "passage: girl, red dress")


if __name__ == "__main__":
    unittest.main()
