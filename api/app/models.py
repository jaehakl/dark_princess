from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel as PydanticBaseModel, EmailStr, field_serializer

from utils.datetime_utils import serialize_datetime_utc


class BaseModel(PydanticBaseModel):
    @field_serializer("*", when_used="json")
    def serialize_datetimes(self, value: Any) -> Any:
        return serialize_datetime_utc(value)


class RoleEnum(str, Enum):
    admin = "admin"
    user = "user"


class UserData(BaseModel):
    id: str
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    picture_url: Optional[str] = None
    is_active: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    roles: List[RoleEnum]


class GetListRequestBase(BaseModel):
    offset: Optional[int] = 0
    limit: Optional[int] = None
    selected_ids: Optional[List[int]] = None
    search_text: Optional[str] = None
    text_filter: Optional[Dict[str, List[str]]] = None
    filter: Optional[Dict[str, List[Any]]] = None
    sort: Optional[List[str]] = None


class GetListResponseBase(BaseModel):
    total: int
    items: List[Any]


class UpsertResponseBase(BaseModel):
    id: int
    fk_not_found: Optional[Dict[str, List[int]]] = None


class TagBase(BaseModel):
    id: Optional[int] = None
    name: str
    scope: Optional[str] = None
    system_key: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    trigger_default: bool = False


class SceneBase(BaseModel):
    id: Optional[int] = None
    name: str
    description: Optional[str] = None
    prompt: Optional[str] = None
    priority: int = 0
    repeat_policy: str = "once_per_status"
    cooldown_turns: int = 0
    image: Optional[str] = None
    audio: Optional[str] = None
    scene_histories: Optional[List[int]] = None
    trigger_blocks: Optional[List[int]] = None
    scene_options: Optional[List[int]] = None
    scene_results: Optional[List[int]] = None


class SceneTriggerBlockBase(BaseModel):
    id: Optional[int] = None
    scene_id: int
    label: Optional[str] = None
    sort_order: int = 0
    conditions: Optional[List[int]] = None


class SceneOptionBase(BaseModel):
    id: Optional[int] = None
    scene_id: int
    option_key: str
    label: str
    description: Optional[str] = None
    next_scene_id: Optional[int] = None
    sort_order: int = 0
    is_active: bool = True
    conditions: Optional[List[int]] = None
    decisions: Optional[List[int]] = None


class SceneConditionBase(BaseModel):
    id: Optional[int] = None
    trigger_block_id: Optional[int] = None
    option_id: Optional[int] = None
    kind: str
    operator: str
    tag_id: Optional[int] = None
    target_id: Optional[int] = None
    scene_ref_id: Optional[int] = None
    option_ref_id: Optional[int] = None
    stat_field: Optional[str] = None
    numeric_value: Optional[int] = None
    value: Optional[Dict[str, Any]] = None
    sort_order: int = 0


class SceneResultBase(BaseModel):
    id: Optional[int] = None
    scene_id: Optional[int] = None
    kind: str
    tag_id: Optional[int] = None
    target_id: Optional[int] = None
    stat_field: Optional[str] = None
    numeric_value: Optional[int] = None
    key: Optional[str] = None
    value: Optional[Dict[str, Any]] = None
    sort_order: int = 0
    applied_results: Optional[List[int]] = None


class StatusBase(BaseModel):
    id: Optional[int] = None
    name: str
    user_id: Optional[str] = None
    turn: int = 0
    sub_turn: int = 0
    cash: int = 0
    strength: int = 0
    agility: int = 0
    intelligence: int = 0
    sense: int = 0
    attractiveness: int = 0
    toughness: int = 0
    stress: int = 0
    status_tags: Optional[List[int]] = None
    scene_histories: Optional[List[int]] = None
    target_statuses: Optional[List[int]] = None


class StatusTagBase(BaseModel):
    id: Optional[int] = None
    status_id: int
    tag_id: int


class SceneHistoryBase(BaseModel):
    id: Optional[int] = None
    status_id: int
    scene_id: int
    target_status_id: Optional[int] = None
    turn: int
    sub_turn: int
    scene_decisions: Optional[List[int]] = None
    applied_results: Optional[List[int]] = None


class SceneDecisionBase(BaseModel):
    id: Optional[int] = None
    scene_history_id: int
    option_id: Optional[int] = None
    option_key: Optional[str] = None
    option_label: Optional[str] = None
    value: Optional[Dict[str, Any]] = None
    sort_order: int = 0


class SceneAppliedResultBase(BaseModel):
    id: Optional[int] = None
    scene_history_id: int
    result_id: Optional[int] = None
    kind: str
    payload: Optional[Dict[str, Any]] = None
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    sort_order: int = 0


class TargetBase(BaseModel):
    id: Optional[int] = None
    type: str
    name: str
    description: Optional[str] = None
    properties: Optional[Dict[str, Any]] = None
    image: Optional[str] = None


class TargetStatusBase(BaseModel):
    id: Optional[int] = None
    status_id: int
    target_id: int
    interactions: Optional[Dict[str, Any]] = None
    target_status_tags: Optional[List[int]] = None
    scene_histories: Optional[List[int]] = None


class TargetStatusTagBase(BaseModel):
    id: Optional[int] = None
    target_status_id: int
    tag_id: int
