from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import Image


async def get_image_lineage_ids(db: AsyncSession, image_id: int) -> list[int]:
    image = await db.get(Image, image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image_id not found")

    ancestor_ids = set()
    visited_ancestor_ids = set()
    current_image = image
    while current_image is not None and current_image.id not in visited_ancestor_ids:
        visited_ancestor_ids.add(current_image.id)
        ancestor_ids.add(current_image.id)
        if current_image.seed_image_id is None:
            break
        current_image = await db.get(Image, current_image.seed_image_id)

    lineage_ids = set(ancestor_ids)
    frontier_ids = set(ancestor_ids)
    while frontier_ids:
        child_ids = (
            await db.execute(
                select(Image.id).where(Image.seed_image_id.in_(frontier_ids))
            )
        ).scalars().all()
        next_frontier_ids = {child_id for child_id in child_ids if child_id not in lineage_ids}
        lineage_ids.update(next_frontier_ids)
        frontier_ids = next_frontier_ids

    return sorted(lineage_ids)
