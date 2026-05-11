from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from service import play as play_service
from user_auth.routes import get_db
from user_auth.utils.auth_wrapper import require_roles

router = APIRouter(prefix="/play", tags=["play"])


@router.post("/snapshot")
async def api_get_play_snapshot(
    payload: dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await play_service.get_snapshot(db, payload.get("status_id"), str(user.id))


@router.post("/select-target")
async def api_select_target(
    payload: dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await play_service.select_target(
        db,
        payload.get("status_id"),
        payload.get("target_status_id"),
        str(user.id),
    )


@router.post("/choose-option")
async def api_choose_option(
    payload: dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_roles(["admin", "user"])),
):
    return await play_service.choose_option(
        db,
        payload.get("status_id"),
        payload.get("scene_history_id"),
        payload.get("option_id"),
        str(user.id),
    )
