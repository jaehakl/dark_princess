from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db import (
    Scene,
    SceneAppliedResult,
    SceneCondition,
    SceneDecision,
    SceneHistory,
    SceneOption,
    SceneTriggerBlock,
    Status,
    StatusTag,
    TargetStatus,
    TargetStatusTag,
)
from utils.aws_s3 import presign_get_url


async def get_snapshot(db: AsyncSession, status_id: Any, user_id: str) -> dict[str, Any]:
    status = await load_status(db, status_id, user_id)
    return await build_snapshot(db, status)


async def select_target(
    db: AsyncSession,
    status_id: Any,
    target_status_id: Any,
    user_id: str,
) -> dict[str, Any]:
    status = await load_status(db, status_id, user_id)
    target_status = await load_target_status(db, target_status_id, status.id)
    if not target_status.visitable:
        raise HTTPException(status_code=400, detail="target is not visitable")
    if status.sub_turn > 0 and await load_active_history(db, status):
        raise HTTPException(status_code=409, detail="turn already has an active scene")

    scene = await find_next_scene(db, status, target_status)
    if scene is None:
        raise HTTPException(status_code=404, detail="eligible scene not found")

    history = SceneHistory(
        status_id=status.id,
        scene_id=scene.id,
        target_status_id=target_status.id,
        turn=status.turn,
        sub_turn=status.sub_turn + 1,
    )
    status.sub_turn += 1
    db.add(history)
    await db.flush()
    await apply_scene_results(db, status, target_status, history, scene)
    await db.commit()
    return await build_snapshot(db, status)


async def choose_option(
    db: AsyncSession,
    status_id: Any,
    scene_history_id: Any,
    option_id: Any,
    user_id: str,
) -> dict[str, Any]:
    status = await load_status(db, status_id, user_id)
    history = await load_history(db, scene_history_id, status.id)
    if history.turn != status.turn or history.sub_turn != status.sub_turn:
        raise HTTPException(status_code=400, detail="scene history is not active")

    option = await db.get(
        SceneOption,
        option_id,
        options=(selectinload(SceneOption.conditions),),
    )
    if option is None or option.scene_id != history.scene_id or not option.is_active:
        raise HTTPException(status_code=404, detail="option not found")

    target_status = history.target_status
    if target_status is None:
        raise HTTPException(status_code=400, detail="scene has no target status")

    state = await build_condition_state(db, status, target_status)
    if any(not condition_matches(condition, status, target_status, state) for condition in option.conditions):
        raise HTTPException(status_code=400, detail="option conditions are not met")

    decision_count = await db.scalar(
        select(func.count()).select_from(SceneDecision).where(
            SceneDecision.scene_history_id == history.id
        )
    )
    db.add(
        SceneDecision(
            scene_history_id=history.id,
            option_id=option.id,
            option_key=option.option_key,
            option_label=option.label,
            sort_order=int(decision_count or 0),
        )
    )
    await db.flush()

    if option.next_scene_id is not None:
        next_scene = await load_scene(db, option.next_scene_id)
    else:
        next_scene = await find_next_scene(db, status, target_status)

    if next_scene is None:
        status.turn += 1
        status.sub_turn = 0
        await db.commit()
        return await build_snapshot(db, status)

    next_history = SceneHistory(
        status_id=status.id,
        scene_id=next_scene.id,
        target_status_id=target_status.id,
        turn=status.turn,
        sub_turn=status.sub_turn + 1,
    )
    status.sub_turn += 1
    db.add(next_history)
    await db.flush()
    await apply_scene_results(db, status, target_status, next_history, next_scene)
    await db.commit()
    return await build_snapshot(db, status)


async def load_status(db: AsyncSession, status_id: Any, user_id: str) -> Status:
    if not isinstance(status_id, int):
        raise HTTPException(status_code=400, detail="status_id is required")

    status = await db.scalar(
        select(Status).where(Status.id == status_id, Status.user_id == user_id)
    )
    if status is None:
        raise HTTPException(status_code=404, detail="status not found")
    return status


async def load_target_status(
    db: AsyncSession,
    target_status_id: Any,
    status_id: int,
) -> TargetStatus:
    if not isinstance(target_status_id, int):
        raise HTTPException(status_code=400, detail="target_status_id is required")

    target_status = await db.scalar(
        select(TargetStatus)
        .options(selectinload(TargetStatus.target))
        .where(TargetStatus.id == target_status_id, TargetStatus.status_id == status_id)
    )
    if target_status is None:
        raise HTTPException(status_code=404, detail="target status not found")
    return target_status


async def load_history(
    db: AsyncSession,
    history_id: Any,
    status_id: int,
) -> SceneHistory:
    if not isinstance(history_id, int):
        raise HTTPException(status_code=400, detail="scene_history_id is required")

    history = await db.scalar(
        select(SceneHistory)
        .options(selectinload(SceneHistory.target_status).selectinload(TargetStatus.target))
        .where(SceneHistory.id == history_id, SceneHistory.status_id == status_id)
    )
    if history is None:
        raise HTTPException(status_code=404, detail="scene history not found")
    return history


async def load_scene(db: AsyncSession, scene_id: int) -> Scene | None:
    return await db.scalar(
        select(Scene)
        .options(
            selectinload(Scene.trigger_blocks).selectinload(SceneTriggerBlock.conditions),
            selectinload(Scene.scene_results),
        )
        .where(Scene.id == scene_id)
    )


async def load_active_history(db: AsyncSession, status: Status) -> SceneHistory | None:
    if status.sub_turn <= 0:
        return None

    return await db.scalar(
        select(SceneHistory)
        .options(selectinload(SceneHistory.target_status).selectinload(TargetStatus.target))
        .where(
            SceneHistory.status_id == status.id,
            SceneHistory.turn == status.turn,
            SceneHistory.sub_turn == status.sub_turn,
        )
    )


async def build_snapshot(db: AsyncSession, status: Status) -> dict[str, Any]:
    active_history = await load_active_history(db, status)
    scene = await load_scene(db, active_history.scene_id) if active_history else None
    target_status = active_history.target_status if active_history else None
    options: list[SceneOption] = []

    if scene is not None and target_status is not None:
        state = await build_condition_state(db, status, target_status)
        candidates = (
            await db.execute(
                select(SceneOption)
                .options(selectinload(SceneOption.conditions))
                .where(SceneOption.scene_id == scene.id, SceneOption.is_active.is_(True))
                .order_by(SceneOption.sort_order.asc(), SceneOption.id.asc())
            )
        ).scalars().all()
        options = [
            option
            for option in candidates
            if all(condition_matches(condition, status, target_status, state) for condition in option.conditions)
        ]

    target_statuses = (
        await db.execute(
            select(TargetStatus)
            .options(selectinload(TargetStatus.target))
            .where(TargetStatus.status_id == status.id)
            .order_by(TargetStatus.id.asc())
        )
    ).scalars().all()

    return {
        "phase": "scene" if scene is not None else "target_select",
        "status": status_to_dict(status),
        "scene": scene_to_dict(scene) if scene else None,
        "scene_history": history_to_dict(active_history) if active_history else None,
        "target_status": target_status_to_dict(target_status) if target_status else None,
        "scene_options": [option_to_dict(option) for option in options],
        "target_statuses": [target_status_to_dict(item) for item in target_statuses],
    }


async def find_next_scene(
    db: AsyncSession,
    status: Status,
    target_status: TargetStatus,
) -> Scene | None:
    scenes = (
        await db.execute(
            select(Scene)
            .options(
                selectinload(Scene.trigger_blocks).selectinload(SceneTriggerBlock.conditions),
                selectinload(Scene.scene_results),
            )
            .order_by(Scene.priority.desc(), Scene.id.asc())
        )
    ).scalars().all()
    state = await build_condition_state(db, status, target_status)

    for scene in scenes:
        if not scene.trigger_blocks:
            continue

        seen_turns = state["seen_scene_turns"].get(scene.id, [])
        if scene.repeat_policy == "once_per_status" and seen_turns:
            continue
        if scene.repeat_policy == "once_per_turn" and status.turn in seen_turns:
            continue
        if scene.cooldown_turns > 0 and seen_turns and status.turn - max(seen_turns) < scene.cooldown_turns:
            continue

        for block in scene.trigger_blocks:
            if all(condition_matches(condition, status, target_status, state) for condition in block.conditions):
                return scene

    return None


async def build_condition_state(
    db: AsyncSession,
    status: Status,
    target_status: TargetStatus,
) -> dict[str, Any]:
    status_tags = set(
        (
            await db.execute(select(StatusTag.tag_id).where(StatusTag.status_id == status.id))
        ).scalars().all()
    )
    target_tags = set(
        (
            await db.execute(
                select(TargetStatusTag.tag_id).where(TargetStatusTag.target_status_id == target_status.id)
            )
        ).scalars().all()
    )
    history_rows = (
        await db.execute(
            select(SceneHistory.scene_id, SceneHistory.turn).where(SceneHistory.status_id == status.id)
        )
    ).all()
    chosen_options = set(
        (
            await db.execute(
                select(SceneDecision.option_id)
                .join(SceneHistory, SceneHistory.id == SceneDecision.scene_history_id)
                .where(SceneHistory.status_id == status.id, SceneDecision.option_id.is_not(None))
            )
        ).scalars().all()
    )
    seen_scene_turns: dict[int, list[int]] = {}
    for scene_id, turn in history_rows:
        seen_scene_turns.setdefault(scene_id, []).append(turn)

    return {
        "status_tags": status_tags,
        "target_tags": target_tags,
        "seen_scene_turns": seen_scene_turns,
        "chosen_options": chosen_options,
    }


def condition_matches(
    condition: SceneCondition,
    status: Status,
    target_status: TargetStatus,
    state: dict[str, Any],
) -> bool:
    operator = (condition.operator or "").lower()

    if condition.kind == "target":
        return compare_values(target_status.target_id, condition.target_id, operator)
    if condition.kind == "status_tag":
        exists = condition.tag_id in state["status_tags"]
        return not exists if operator in ("not", "not_has", "ne", "!=") else exists
    if condition.kind == "target_tag":
        exists = condition.tag_id in state["target_tags"]
        return not exists if operator in ("not", "not_has", "ne", "!=") else exists
    if condition.kind == "scene_seen":
        exists = condition.scene_ref_id in state["seen_scene_turns"]
        return not exists if operator in ("not", "not_seen", "ne", "!=") else exists
    if condition.kind == "option_chosen":
        exists = condition.option_ref_id in state["chosen_options"]
        return not exists if operator in ("not", "not_chosen", "ne", "!=") else exists
    if condition.kind == "status_stat":
        return compare_values(
            getattr(status, condition.stat_field or "", None),
            condition.numeric_value,
            operator,
        )
    if condition.kind == "target_interaction":
        interactions = target_status.interactions or {}
        expected = condition.numeric_value
        if expected is None and isinstance(condition.value, dict):
            expected = condition.value.get("value")
        return compare_values(interactions.get(condition.stat_field or ""), expected, operator)

    return False


def compare_values(left: Any, right: Any, operator: str) -> bool:
    if operator in ("eq", "=", "==", ""):
        return left == right
    if operator in ("ne", "!=", "not"):
        return left != right
    if operator in ("gt", ">"):
        return left is not None and right is not None and left > right
    if operator in ("gte", ">="):
        return left is not None and right is not None and left >= right
    if operator in ("lt", "<"):
        return left is not None and right is not None and left < right
    if operator in ("lte", "<="):
        return left is not None and right is not None and left <= right
    return False


async def apply_scene_results(
    db: AsyncSession,
    status: Status,
    target_status: TargetStatus,
    history: SceneHistory,
    scene: Scene,
) -> None:
    valid_status_fields = {
        "cash",
        "strength",
        "agility",
        "intelligence",
        "sense",
        "attractiveness",
        "toughness",
        "stress",
    }

    for index, result in enumerate(sorted(scene.scene_results, key=lambda item: (item.sort_order, item.id))):
        applied = None
        if result.kind in ("status_stat_delta", "status_stat_set") and result.stat_field in valid_status_fields:
            before = getattr(status, result.stat_field)
            after = (before + (result.numeric_value or 0)) if result.kind.endswith("_delta") else (result.numeric_value or 0)
            setattr(status, result.stat_field, after)
            applied = ({"field": result.stat_field}, before, after)

        if result.kind in ("target_interaction_delta", "target_interaction_set"):
            key = result.key or result.stat_field
            if key:
                interactions = dict(target_status.interactions or {})
                before = interactions.get(key, 0 if result.kind.endswith("_delta") else None)
                after = (before or 0) + (result.numeric_value or 0) if result.kind.endswith("_delta") else result.value
                interactions[key] = after
                target_status.interactions = interactions
                applied = ({"key": key}, before, after)

        if result.kind in ("status_tag_add", "status_tag_remove") and result.tag_id is not None:
            exists = await db.scalar(
                select(StatusTag).where(StatusTag.status_id == status.id, StatusTag.tag_id == result.tag_id)
            )
            before = bool(exists)
            if result.kind.endswith("_add") and exists is None:
                db.add(StatusTag(status_id=status.id, tag_id=result.tag_id))
            if result.kind.endswith("_remove") and exists is not None:
                await db.delete(exists)
            applied = ({"tag_id": result.tag_id}, before, result.kind.endswith("_add"))

        if result.kind in ("target_tag_add", "target_tag_remove") and result.tag_id is not None:
            result_target_status = target_status
            if result.target_id is not None and result.target_id != target_status.target_id:
                result_target_status = await db.scalar(
                    select(TargetStatus).where(
                        TargetStatus.status_id == status.id,
                        TargetStatus.target_id == result.target_id,
                    )
                )
                if result_target_status is None:
                    result_target_status = TargetStatus(
                        status_id=status.id,
                        target_id=result.target_id,
                        interactions={},
                        visitable=True,
                    )
                    db.add(result_target_status)
                    await db.flush()
            exists = await db.scalar(
                select(TargetStatusTag).where(
                    TargetStatusTag.target_status_id == result_target_status.id,
                    TargetStatusTag.tag_id == result.tag_id,
                )
            )
            before = bool(exists)
            if result.kind.endswith("_add") and exists is None:
                db.add(TargetStatusTag(target_status_id=result_target_status.id, tag_id=result.tag_id))
            if result.kind.endswith("_remove") and exists is not None:
                await db.delete(exists)
            applied = ({"tag_id": result.tag_id, "target_status_id": result_target_status.id}, before, result.kind.endswith("_add"))

        if result.kind in ("target_visitable_set", "target_visitable_toggle"):
            result_target_status = target_status
            if result.target_id is not None and result.target_id != target_status.target_id:
                result_target_status = await db.scalar(
                    select(TargetStatus).where(
                        TargetStatus.status_id == status.id,
                        TargetStatus.target_id == result.target_id,
                    )
                )
                if result_target_status is None:
                    result_target_status = TargetStatus(
                        status_id=status.id,
                        target_id=result.target_id,
                        interactions={},
                        visitable=True,
                    )
                    db.add(result_target_status)
                    await db.flush()
            before = result_target_status.visitable
            if result.kind.endswith("_toggle"):
                result_target_status.visitable = not before
            elif isinstance(result.value, dict) and isinstance(result.value.get("value"), bool):
                result_target_status.visitable = result.value["value"]
            else:
                result_target_status.visitable = bool(result.numeric_value)
            applied = ({"target_status_id": result_target_status.id}, before, result_target_status.visitable)

        if applied is not None:
            payload, before, after = applied
            db.add(
                SceneAppliedResult(
                    scene_history_id=history.id,
                    result_id=result.id,
                    kind=result.kind,
                    payload=payload,
                    before={"value": before},
                    after={"value": after},
                    sort_order=index,
                )
            )


def status_to_dict(status: Status) -> dict[str, Any]:
    return {
        "id": status.id,
        "name": status.name,
        "turn": status.turn,
        "sub_turn": status.sub_turn,
        "cash": status.cash,
        "strength": status.strength,
        "agility": status.agility,
        "intelligence": status.intelligence,
        "sense": status.sense,
        "attractiveness": status.attractiveness,
        "toughness": status.toughness,
        "stress": status.stress,
    }


def target_status_to_dict(target_status: TargetStatus) -> dict[str, Any]:
    target = target_status.target
    return {
        "id": target_status.id,
        "status_id": target_status.status_id,
        "target_id": target_status.target_id,
        "interactions": target_status.interactions,
        "visitable": target_status.visitable,
        "target": {
            "id": target.id,
            "type": target.type,
            "name": target.name,
            "description": target.description,
            "properties": target.properties,
            "image": presigned_image(target.image),
        } if target else None,
    }


def scene_to_dict(scene: Scene) -> dict[str, Any]:
    return {
        "id": scene.id,
        "name": scene.name,
        "description": scene.description,
        "prompt": scene.prompt,
        "priority": scene.priority,
        "repeat_policy": scene.repeat_policy,
        "cooldown_turns": scene.cooldown_turns,
        "image": presigned_image(scene.image),
        "audio": presigned_image(scene.audio),
    }


def history_to_dict(history: SceneHistory) -> dict[str, Any]:
    return {
        "id": history.id,
        "status_id": history.status_id,
        "scene_id": history.scene_id,
        "target_status_id": history.target_status_id,
        "turn": history.turn,
        "sub_turn": history.sub_turn,
    }


def option_to_dict(option: SceneOption) -> dict[str, Any]:
    return {
        "id": option.id,
        "scene_id": option.scene_id,
        "option_key": option.option_key,
        "label": option.label,
        "description": option.description,
        "next_scene_id": option.next_scene_id,
        "sort_order": option.sort_order,
        "is_active": option.is_active,
    }


def presigned_image(value: str | None) -> str | None:
    if not value or value.startswith(("http://", "https://", "data:")):
        return value
    try:
        return presign_get_url(value)
    except Exception:
        return value
