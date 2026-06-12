from __future__ import annotations

import sys
import unittest
import builtins
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException


APP_ROOT = Path(__file__).resolve().parents[1] / "app"
sys.path.insert(0, str(APP_ROOT))

from db import Scene, SceneOption, SelectionModel, Status
from initserver import scene_script_to_text
from models import AdjustSelectionModelRequestBase, GenerateSceneRequestBase, UpdateSceneContextRequestBase
from service import scene as scene_service
from service import selection_model
from utils import llm
from utils.vector import VECTOR_DIMENSION


class FakeScalarResult:
    def __init__(self, items: list[object]) -> None:
        self.items = items

    def all(self) -> list[object]:
        return self.items


class FakeExecuteResult:
    def __init__(self, items: list[object]) -> None:
        self.items = items

    def scalars(self) -> FakeScalarResult:
        return FakeScalarResult(self.items)


class FakeDb:
    def __init__(
        self,
        rows: dict[tuple[type[object], int], object],
        execute_items: list[object] | None = None,
    ) -> None:
        self.rows = rows
        self.execute_items = execute_items or []
        self.committed = False
        self.rolled_back = False

    async def get(self, model: type[object], item_id: int) -> object | None:
        return self.rows.get((model, item_id))

    async def execute(self, _statement: object) -> FakeExecuteResult:
        return FakeExecuteResult(self.execute_items)

    async def commit(self) -> None:
        self.committed = True

    async def refresh(self, _entity: object) -> None:
        return None

    async def rollback(self) -> None:
        self.rolled_back = True


def make_embedding(value: float) -> list[float]:
    return [value] * VECTOR_DIMENSION


def make_status(selection_model_id: int | None = 1) -> Status:
    return Status(
        id=1,
        selection_model_id=selection_model_id,
        name="status",
        turn=1,
        cash=1,
        strength=1,
        agility=1,
        intelligence=1,
        sense=1,
        attractiveness=1,
        toughness=1,
        stress=1,
        context_embedding=make_embedding(0.0),
    )


def make_adjust_request(learn_rate: float) -> AdjustSelectionModelRequestBase:
    return AdjustSelectionModelRequestBase(
        scene_id=1,
        status_id=1,
        scene_option_id=1,
        target_scene_id=2,
        learn_rate=learn_rate,
    )


def make_valid_rows() -> dict[tuple[type[object], int], object]:
    return {
        (Status, 1): make_status(),
        (SelectionModel, 1): SelectionModel(id=1, name="model", file_url="old-model.pt"),
        (Scene, 1): Scene(id=1, prompt="current", embedding=make_embedding(0.1)),
        (Scene, 2): Scene(id=2, prompt="target", embedding=make_embedding(0.9)),
        (SceneOption, 1): SceneOption(id=1, scene_id=1, option_text="go", embedding=make_embedding(0.2)),
    }


class SelectionModelAdjustTests(unittest.IsolatedAsyncioTestCase):
    async def test_adjust_selection_model_replaces_existing_file_url(self) -> None:
        rows = make_valid_rows()
        model = rows[(SelectionModel, 1)]
        db = FakeDb(rows)
        trained: list[tuple[str, float]] = []

        async def run_update(callback):
            return callback()

        async def cleanup(_db, old_file_url: str | None, new_file_url: str) -> None:
            trained.append((old_file_url or "", 999.0 if new_file_url == "new-model.pt" else -999.0))

        with (
            patch.object(selection_model, "update_selection_model", run_update),
            patch.object(
                selection_model,
                "train_model_artifact",
                side_effect=lambda model_url, _inputs, _target, lr: trained.append((model_url, lr))
                or {"parameters": {}, "state_dict": {"updated": True}},
            ),
            patch.object(selection_model, "save_model_artifact", return_value=("new-model.pt", "new-key")),
            patch.object(selection_model, "cleanup_old_model_file", cleanup),
        ):
            result = await selection_model.adjust_selection_model(db, make_adjust_request(0.25))

        self.assertIs(result, model)
        self.assertTrue(db.committed)
        self.assertEqual(model.file_url, "new-model.pt")
        self.assertIn(("old-model.pt", 0.25), trained)
        self.assertIn(("old-model.pt", 999.0), trained)

    async def test_adjust_selection_model_rejects_zero_learn_rate(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            await selection_model.adjust_selection_model(FakeDb({}), make_adjust_request(0.0))

        self.assertEqual(raised.exception.status_code, 400)

    async def test_adjust_selection_model_rejects_missing_inputs(self) -> None:
        cases = [
            ("status", {}, 404),
            ("selection_model", {(Status, 1): make_status()}, 422),
            (
                "scene",
                {
                    (Status, 1): make_status(),
                    (SelectionModel, 1): SelectionModel(id=1, name="model", file_url="old-model.pt"),
                },
                404,
            ),
            (
                "scene_option",
                {
                    (Status, 1): make_status(),
                    (SelectionModel, 1): SelectionModel(id=1, name="model", file_url="old-model.pt"),
                    (Scene, 1): Scene(id=1, prompt="current", embedding=make_embedding(0.1)),
                },
                404,
            ),
            ("target_scene", {key: value for key, value in make_valid_rows().items() if key != (Scene, 2)}, 404),
            (
                "target_embedding",
                {
                    **make_valid_rows(),
                    (Scene, 2): Scene(id=2, prompt="target", embedding=None),
                },
                422,
            ),
        ]

        for _name, rows, status_code in cases:
            with self.subTest(_name):
                with self.assertRaises(HTTPException) as raised:
                    await selection_model.adjust_selection_model(FakeDb(rows), make_adjust_request(0.1))

                self.assertEqual(raised.exception.status_code, status_code)

    def test_train_model_artifact_uses_positive_learn_rate_to_pull_toward_target(self) -> None:
        records = run_train_model_artifact_with_fake_torch(0.5)

        self.assertEqual(records["optimizer_lr"], 0.5)
        self.assertEqual(records["backward_loss"], "negative_similarity")
        self.assertTrue(records["stepped"])
        self.assertEqual(records["state_dict"], {"updated": True})

    def test_train_model_artifact_uses_negative_learn_rate_to_push_away_from_target(self) -> None:
        records = run_train_model_artifact_with_fake_torch(-0.75)

        self.assertEqual(records["optimizer_lr"], 0.75)
        self.assertEqual(records["backward_loss"], "similarity")
        self.assertTrue(records["stepped"])
        self.assertEqual(records["state_dict"], {"updated": True})

    def test_normalize_model_parameters_accepts_and_defaults_temperature(self) -> None:
        explicit = selection_model.normalize_model_parameters(
            {
                "hidden_dims": [1],
                "activation": "relu",
                "dropout": 0,
                "seed": None,
                "temperature": "3.5",
            }
        )
        defaulted = selection_model.normalize_model_parameters({"hidden_dims": [1]})

        self.assertEqual(explicit["temperature"], 3.5)
        self.assertEqual(defaulted["temperature"], 2.0)

    def test_normalize_model_parameters_rejects_invalid_temperature(self) -> None:
        for temperature in (0, -1, float("inf"), "hot"):
            with self.subTest(temperature=temperature):
                with self.assertRaises(HTTPException) as raised:
                    selection_model.normalize_model_parameters(
                        {
                            "hidden_dims": [1],
                            "activation": "relu",
                            "dropout": 0,
                            "seed": None,
                            "temperature": temperature,
                        }
                    )

                self.assertEqual(raised.exception.status_code, 400)

    async def test_get_next_scene_samples_by_temperature_without_updating_context(self) -> None:
        rows = make_valid_rows()
        current_status = rows[(Status, 1)]
        current_status.context_embedding = make_embedding(0.25)
        near_scene = Scene(id=2, prompt="near", embedding=make_embedding(1.0))
        far_scene = Scene(id=3, prompt="far", embedding=make_embedding(-1.0))
        db = FakeDb(rows, execute_items=[near_scene, far_scene])
        choices_call: dict[str, object] = {}

        async def predict(_file_url, _scene_embedding, _option_embedding, _context_embedding, _normalized_status):
            return make_embedding(1.0)

        def choose(population, weights, k):
            choices_call["population"] = population
            choices_call["weights"] = weights
            choices_call["k"] = k
            return [far_scene]

        with (
            patch.object(selection_model, "predict_target_scene_embedding", predict),
            patch.object(selection_model, "get_model_temperature", return_value=2.0),
            patch.object(selection_model.random, "choices", choose),
        ):
            result = await selection_model.get_next_scene(
                db,
                scene_id=1,
                status_id=1,
                scene_option_id=1,
            )

        self.assertIs(result, far_scene)
        weights = choices_call["weights"]
        self.assertIsInstance(weights, list)
        self.assertEqual(choices_call["population"], [near_scene, far_scene])
        self.assertEqual(choices_call["k"], 1)
        self.assertGreater(weights[0], weights[1])
        self.assertFalse(db.committed)
        self.assertEqual(current_status.context_embedding, make_embedding(0.25))

    async def test_update_scene_context_updates_status_context_embedding(self) -> None:
        current_status = make_status()
        current_status.context_embedding = make_embedding(0.5)
        current_scene = Scene(id=1, prompt="current", embedding=make_embedding(1.0))
        db = FakeDb({(Status, 1): current_status, (Scene, 1): current_scene})

        result = await scene_service.update_scene_context(
            db,
            UpdateSceneContextRequestBase(status_id=1, scene_id=1),
        )

        self.assertIs(result, current_status)
        self.assertTrue(db.committed)
        self.assertEqual(current_status.context_embedding, make_embedding(1.45))

    async def test_recommend_prompt_rejects_empty_text(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            await scene_service.recommend_prompt(FakeDb({}), "  ")

        self.assertEqual(raised.exception.status_code, 400)

    async def test_recommend_prompt_scores_words_by_scene_distance_and_frequency(self) -> None:
        query_embedding = [0.0] * VECTOR_DIMENSION
        query_embedding[0] = 1.0
        near_embedding = [0.0] * VECTOR_DIMENSION
        near_embedding[0] = 1.0
        far_embedding = [0.0] * VECTOR_DIMENSION
        far_embedding[1] = 1.0
        scenes = [
            Scene(id=1, prompt="apple, banana", embedding=near_embedding),
            Scene(id=2, prompt="banana, carrot", embedding=far_embedding),
            Scene(id=3, prompt="ghost", embedding=None),
        ]
        db = FakeDb({}, execute_items=scenes)

        with patch.object(scene_service, "encode_scene_text", return_value=query_embedding):
            result = await scene_service.recommend_prompt(db, " heroine ")

        self.assertEqual([item.word for item in result], ["apple", "banana", "carrot"])
        scores = {item.word: item.score for item in result}
        self.assertGreater(scores["apple"], scores["banana"])
        self.assertGreater(scores["banana"], scores["carrot"])

    async def test_generate_stable_diffusion_prompt_rejects_empty_text(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            await llm.generate_stable_diffusion_prompt("  ")

        self.assertEqual(raised.exception.status_code, 400)

    async def test_generate_stable_diffusion_prompt_returns_prompt_from_json(self) -> None:
        with patch.object(
            llm,
            "generate_prompt_with_llm",
            return_value='{"prompt": "dark princess, moonlit castle, cinematic lighting"}',
        ):
            result = await llm.generate_stable_diffusion_prompt("달빛 아래 성에 선 공주")

        self.assertEqual(result, "dark princess, moonlit castle, cinematic lighting")

    async def test_generate_stable_diffusion_prompt_rejects_bad_llm_output(self) -> None:
        for raw_output in ("", "not json", '{"prompt": ""}', '{"prompt": 123}', '["prompt"]'):
            with self.subTest(raw_output=raw_output):
                with patch.object(llm, "generate_prompt_with_llm", return_value=raw_output):
                    with self.assertRaises(HTTPException) as raised:
                        await llm.generate_stable_diffusion_prompt("장면")

                self.assertEqual(raised.exception.status_code, 502)

    async def test_generate_scene_without_image_keeps_existing_image_url(self) -> None:
        scene = Scene(
            id=1,
            prompt="old",
            image_url="old-image.jpg",
            script="old",
            status_change={"turn": 1},
            embedding=make_embedding(0.1),
        )
        db = FakeDb({(Scene, 1): scene})
        request = GenerateSceneRequestBase(
            scene_id=1,
            prompt="new",
            script="new",
            status_change={"turn": 1, "cash": -2},
            generate_image=False,
        )

        with (
            patch.object(scene_service, "make_scene_embedding", return_value=make_embedding(0.8)),
            patch.object(scene_service, "generate_scene_image", side_effect=AssertionError("image generated")),
            patch.object(scene_service, "cleanup_old_scene_image", side_effect=AssertionError("cleanup called")),
        ):
            result = await scene_service.generate_scene(db, request)

        self.assertIs(result, scene)
        self.assertTrue(db.committed)
        self.assertEqual(scene.prompt, "new")
        self.assertEqual(scene.script, "new")
        self.assertEqual(scene.status_change, {"turn": 1, "cash": -2})
        self.assertEqual(scene.embedding, make_embedding(0.8))
        self.assertEqual(scene.image_url, "old-image.jpg")

    async def test_generate_scene_without_image_rejects_new_scene(self) -> None:
        request = GenerateSceneRequestBase(
            scene_id=None,
            prompt="new",
            script="new",
            status_change={"turn": 1},
            generate_image=False,
        )

        with self.assertRaises(HTTPException) as raised:
            await scene_service.generate_scene(FakeDb({}), request)

        self.assertEqual(raised.exception.status_code, 400)

    def test_scene_script_to_text_converts_json_array_to_newline_text(self) -> None:
        raw_script = '["첫 줄", {"text": "둘째 줄\\n셋째 줄"}, {"extra": "넷째 줄"}]'

        self.assertEqual(scene_script_to_text(raw_script), "첫 줄\n둘째 줄\n셋째 줄\n넷째 줄")

    def test_reset_llm_runtime_for_tests_clears_prompt_llm_cache(self) -> None:
        llm._prompt_llm_model_key = ("path", "repo", "file", 1, 0, 0)
        llm._prompt_llm = object()

        llm.reset_llm_runtime_for_tests()

        self.assertIsNone(llm._prompt_llm_model_key)
        self.assertIsNone(llm._prompt_llm)

    def test_get_prompt_llm_reports_missing_llama_cpp_dependency(self) -> None:
        config = llm.build_prompt_llm_config()

        with patch.dict("sys.modules", {"llama_cpp": None}):
            with self.assertRaises(HTTPException) as raised:
                llm._get_prompt_llm_locked(config)

        self.assertEqual(raised.exception.status_code, 503)

    def test_get_prompt_llm_reports_broken_llama_cpp_native_library(self) -> None:
        config = llm.build_prompt_llm_config()
        original_import = builtins.__import__

        def fail_llama_cpp_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "llama_cpp":
                raise RuntimeError("failed to load llama.dll")
            return original_import(name, globals, locals, fromlist, level)

        with patch.object(builtins, "__import__", fail_llama_cpp_import):
            with self.assertRaises(HTTPException) as raised:
                llm._get_prompt_llm_locked(config)

        self.assertEqual(raised.exception.status_code, 503)


def run_train_model_artifact_with_fake_torch(learn_rate: float) -> dict[str, object]:
    records: dict[str, object] = {}

    class FakeLoss:
        def __init__(self, name: str) -> None:
            self.name = name

        def __neg__(self) -> "FakeLoss":
            return FakeLoss(f"negative_{self.name}")

        def backward(self) -> None:
            records["backward_loss"] = self.name

    class FakeSimilarity:
        def mean(self) -> FakeLoss:
            return FakeLoss("similarity")

    class FakeFunctional:
        def cosine_similarity(self, _output: object, _target: object, dim: int) -> FakeSimilarity:
            records["cosine_dim"] = dim
            return FakeSimilarity()

    class FakeNn:
        functional = FakeFunctional()

    class FakeOptimizer:
        def __init__(self, _parameters: object, lr: float) -> None:
            records["optimizer_lr"] = lr

        def zero_grad(self) -> None:
            records["zero_grad"] = True

        def step(self) -> None:
            records["stepped"] = True

    class FakeOptim:
        SGD = FakeOptimizer

    class FakeTorch:
        float32 = object()
        optim = FakeOptim()

        def tensor(self, values: list[list[float]], dtype: object) -> dict[str, object]:
            return {"values": values, "dtype": dtype}

    class FakeModel:
        def load_state_dict(self, state_dict: dict[str, object]) -> None:
            records["loaded_state_dict"] = state_dict

        def train(self) -> None:
            records["train"] = True

        def parameters(self) -> list[object]:
            return [object()]

        def __call__(self, tensor: object) -> object:
            records["input_tensor"] = tensor
            return object()

        def eval(self) -> None:
            records["eval"] = True

        def state_dict(self) -> dict[str, bool]:
            return {"updated": True}

    with (
        patch.object(
            selection_model,
            "load_model_artifact",
            return_value={"parameters": {"hidden_dims": [1]}, "state_dict": {"old": True}},
        ),
        patch.object(selection_model, "build_model", return_value=FakeModel()),
        patch.object(selection_model, "load_torch", return_value=(FakeTorch(), FakeNn())),
    ):
        artifact = selection_model.train_model_artifact("model.pt", [0.1], [0.9], learn_rate)

    records["state_dict"] = artifact["state_dict"]
    return records


if __name__ == "__main__":
    unittest.main()
