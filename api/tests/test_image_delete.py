import unittest

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import Base, Image
from service.image import forward_deleted_image_seed_links


class ImageDeleteTest(unittest.IsolatedAsyncioTestCase):
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

    async def test_forward_single_deleted_parent_to_grandparent(self):
        async with self.Session() as db:
            root = Image()
            db.add(root)
            await db.flush()
            middle = Image(seed_image_id=root.id)
            db.add(middle)
            await db.flush()
            child = Image(seed_image_id=middle.id)
            db.add(child)
            await db.flush()

            await forward_deleted_image_seed_links(db, [middle.id])

            self.assertEqual(await self._seed_image_id(db, child.id), root.id)

    async def test_forward_batch_deleted_chain_to_nearest_living_ancestor(self):
        async with self.Session() as db:
            root = Image()
            db.add(root)
            await db.flush()
            first_deleted = Image(seed_image_id=root.id)
            db.add(first_deleted)
            await db.flush()
            second_deleted = Image(seed_image_id=first_deleted.id)
            db.add(second_deleted)
            await db.flush()
            child = Image(seed_image_id=second_deleted.id)
            db.add(child)
            await db.flush()

            await forward_deleted_image_seed_links(db, [first_deleted.id, second_deleted.id])

            self.assertEqual(await self._seed_image_id(db, child.id), root.id)

    async def test_forward_deleted_root_to_none(self):
        async with self.Session() as db:
            root = Image()
            db.add(root)
            await db.flush()
            child = Image(seed_image_id=root.id)
            db.add(child)
            await db.flush()

            await forward_deleted_image_seed_links(db, [root.id])

            self.assertIsNone(await self._seed_image_id(db, child.id))

    async def test_forward_deleted_internal_cycle_to_none(self):
        async with self.Session() as db:
            first = Image()
            second = Image()
            db.add_all([first, second])
            await db.flush()
            first.seed_image_id = second.id
            second.seed_image_id = first.id
            await db.flush()
            child = Image(seed_image_id=first.id)
            db.add(child)
            await db.flush()

            await forward_deleted_image_seed_links(db, [first.id, second.id])

            self.assertIsNone(await self._seed_image_id(db, child.id))

    async def _seed_image_id(self, db, image_id):
        return (
            await db.execute(select(Image.seed_image_id).where(Image.id == image_id))
        ).scalar_one()


if __name__ == "__main__":
    unittest.main()
