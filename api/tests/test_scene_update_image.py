import unittest

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import Base, Image, Scene
from models import UpdateSceneImageRequestBase
from service.scene import update_scene_image


class SceneUpdateImageTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(
            bind=self.engine,
            expire_on_commit=False,
        )

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def test_update_scene_image_only_changes_image_id(self):
        async with self.Session() as db:
            first_image = Image(image_object_key="images/first.png")
            second_image = Image(image_object_key="images/second.png")
            scene = Scene(
                image=first_image,
                script="draft",
                status_change={"cash": 1},
                prompt_situation="castle",
            )
            db.add_all([first_image, second_image, scene])
            await db.commit()

            updated_scene = await update_scene_image(
                db,
                UpdateSceneImageRequestBase(scene_id=scene.id, image_id=second_image.id),
            )

            self.assertEqual(updated_scene.image_id, second_image.id)
            self.assertEqual(updated_scene.image.image_object_key, "images/second.png")
            stored_scene = (
                await db.execute(select(Scene).where(Scene.id == scene.id))
            ).scalar_one()
            self.assertEqual(stored_scene.script, "draft")
            self.assertEqual(stored_scene.status_change, {"cash": 1})
            self.assertEqual(stored_scene.prompt_situation, "castle")

    async def test_update_scene_image_can_clear_image_id(self):
        async with self.Session() as db:
            image = Image(image_object_key="images/first.png")
            scene = Scene(image=image, script="draft", status_change={})
            db.add_all([image, scene])
            await db.commit()

            updated_scene = await update_scene_image(
                db,
                UpdateSceneImageRequestBase(scene_id=scene.id, image_id=None),
            )

            self.assertIsNone(updated_scene.image_id)
            self.assertIsNone(updated_scene.image)

    async def test_update_scene_image_missing_scene(self):
        async with self.Session() as db:
            with self.assertRaises(HTTPException) as context:
                await update_scene_image(
                    db,
                    UpdateSceneImageRequestBase(scene_id=404, image_id=None),
                )

            self.assertEqual(context.exception.status_code, 404)

    async def test_update_scene_image_missing_image(self):
        async with self.Session() as db:
            scene = Scene(script="draft", status_change={})
            db.add(scene)
            await db.commit()

            with self.assertRaises(HTTPException) as context:
                await update_scene_image(
                    db,
                    UpdateSceneImageRequestBase(scene_id=scene.id, image_id=404),
                )

            self.assertEqual(context.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
