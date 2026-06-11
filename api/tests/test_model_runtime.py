from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_ROOT))

from utils import model_runtime
from service import scene, scene_option


class ModelRuntimeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        model_runtime.reset_model_runtime_for_tests()

    async def asyncTearDown(self) -> None:
        model_runtime.reset_model_runtime_for_tests()

    async def test_embedding_model_is_reused_and_replaced_by_name(self) -> None:
        loaded_names: list[str] = []

        class FakeSentenceTransformer:
            def __init__(self, model_name: str) -> None:
                loaded_names.append(model_name)

            def encode(self, text: str) -> list[float]:
                return [float(len(text))]

        fake_module = types.SimpleNamespace(SentenceTransformer=FakeSentenceTransformer)

        with patch.dict(sys.modules, {"sentence_transformers": fake_module}):
            first = await model_runtime.encode_scene_text("model-a", "one")
            second = await model_runtime.encode_scene_text("model-a", "two")
            third = await model_runtime.encode_scene_text("model-b", "three")

        self.assertEqual(first, [3.0])
        self.assertEqual(second, [3.0])
        self.assertEqual(third, [5.0])
        self.assertEqual(loaded_names, ["model-a", "model-b"])

    async def test_scene_and_option_embeddings_share_one_runtime_model(self) -> None:
        loaded_names: list[str] = []

        class FakeSentenceTransformer:
            def __init__(self, model_name: str) -> None:
                loaded_names.append(model_name)

            def encode(self, _text: str) -> list[float]:
                return [7.0]

        fake_module = types.SimpleNamespace(SentenceTransformer=FakeSentenceTransformer)
        old_scene_dimension = scene.VECTOR_DIMENSION
        old_option_dimension = scene_option.VECTOR_DIMENSION
        old_model_name = scene.settings.SCENE_EMBEDDING_MODEL_NAME

        try:
            scene.VECTOR_DIMENSION = 1
            scene_option.VECTOR_DIMENSION = 1
            scene.settings.SCENE_EMBEDDING_MODEL_NAME = "shared-model"
            with patch.dict(sys.modules, {"sentence_transformers": fake_module}):
                scene_embedding = await scene.make_scene_embedding("prompt", [])
                option_embedding = await scene_option.make_scene_option_embedding("option")
        finally:
            scene.VECTOR_DIMENSION = old_scene_dimension
            scene_option.VECTOR_DIMENSION = old_option_dimension
            scene.settings.SCENE_EMBEDDING_MODEL_NAME = old_model_name

        self.assertEqual(scene_embedding, [7.0])
        self.assertEqual(option_embedding, [7.0])
        self.assertEqual(loaded_names, ["shared-model"])

    async def test_image_pipeline_is_reused_and_replaced_by_checkpoint(self) -> None:
        loaded_paths: list[str] = []

        class FakeGenerator:
            def __init__(self, device: str) -> None:
                self.device = device

            def manual_seed(self, seed: int) -> "FakeGenerator":
                self.seed = seed
                return self

        class FakeCuda:
            def empty_cache(self) -> None:
                return None

        fake_torch = types.SimpleNamespace(
            Generator=FakeGenerator,
            cuda=FakeCuda(),
            float16=object(),
        )

        class FakePipeline:
            def __init__(self, ckpt_path: str) -> None:
                self.ckpt_path = ckpt_path

            @classmethod
            def from_single_file(cls, ckpt_path: str, **_kwargs: object) -> "FakePipeline":
                loaded_paths.append(ckpt_path)
                return cls(ckpt_path)

            def to(self, _device: str) -> None:
                return None

            def enable_attention_slicing(self) -> None:
                return None

            def enable_vae_slicing(self) -> None:
                return None

            def __call__(self, **_kwargs: object) -> object:
                return types.SimpleNamespace(images=[f"image:{self.ckpt_path}"])

        fake_diffusers = types.SimpleNamespace(StableDiffusionXLPipeline=FakePipeline)

        with patch.dict(sys.modules, {"torch": fake_torch, "diffusers": fake_diffusers}):
            first_images, _ = await model_runtime.generate_images_batch(
                "a.safetensors",
                ["p"],
                ["n"],
                [1],
                1,
                1.0,
                64,
                64,
                1,
                0,
                10,
            )
            second_images, _ = await model_runtime.generate_images_batch(
                "a.safetensors",
                ["p"],
                ["n"],
                [2],
                1,
                1.0,
                64,
                64,
                1,
                0,
                10,
            )
            third_images, _ = await model_runtime.generate_images_batch(
                "b.safetensors",
                ["p"],
                ["n"],
                [3],
                1,
                1.0,
                64,
                64,
                1,
                0,
                10,
            )

        self.assertEqual(first_images, ["image:a.safetensors"])
        self.assertEqual(second_images, ["image:a.safetensors"])
        self.assertEqual(third_images, ["image:b.safetensors"])
        self.assertEqual(loaded_paths, ["a.safetensors", "b.safetensors"])

    async def test_selection_model_is_reused_and_replaced_by_file_url(self) -> None:
        loaded_urls: list[str] = []
        built_parameters: list[dict[str, object]] = []

        class FakeTensor:
            def squeeze(self, _dimension: int) -> "FakeTensor":
                return self

            def tolist(self) -> list[float]:
                return [1.0, 2.0, 3.0]

        class FakeNoGrad:
            def __enter__(self) -> None:
                return None

            def __exit__(self, *_args: object) -> None:
                return None

        class FakeTorch:
            float32 = object()

            def no_grad(self) -> FakeNoGrad:
                return FakeNoGrad()

            def tensor(self, values: list[list[float]], dtype: object) -> list[list[float]]:
                self.values = values
                self.dtype = dtype
                return values

        class FakeModel:
            def load_state_dict(self, _state_dict: dict[str, object]) -> None:
                return None

            def eval(self) -> None:
                return None

            def __call__(self, _values: list[list[float]]) -> FakeTensor:
                return FakeTensor()

        def load_model_artifact(model_file_url: str) -> dict[str, object]:
            loaded_urls.append(model_file_url)
            return {"parameters": {"url": model_file_url}, "state_dict": {}}

        def build_model(parameters: dict[str, object]) -> FakeModel:
            built_parameters.append(parameters)
            return FakeModel()

        def load_torch() -> tuple[FakeTorch, object]:
            return FakeTorch(), object()

        first = await model_runtime.predict_target_scene_embedding(
            "model-a.pt",
            [0.0],
            load_model_artifact=load_model_artifact,
            build_model=build_model,
            load_torch=load_torch,
        )
        second = await model_runtime.predict_target_scene_embedding(
            "model-a.pt",
            [0.0],
            load_model_artifact=load_model_artifact,
            build_model=build_model,
            load_torch=load_torch,
        )
        third = await model_runtime.predict_target_scene_embedding(
            "model-b.pt",
            [0.0],
            load_model_artifact=load_model_artifact,
            build_model=build_model,
            load_torch=load_torch,
        )

        self.assertEqual(first, [1.0, 2.0, 3.0])
        self.assertEqual(second, [1.0, 2.0, 3.0])
        self.assertEqual(third, [1.0, 2.0, 3.0])
        self.assertEqual(loaded_urls, ["model-a.pt", "model-b.pt"])
        self.assertEqual(built_parameters, [{"url": "model-a.pt"}, {"url": "model-b.pt"}])


if __name__ == "__main__":
    unittest.main()
