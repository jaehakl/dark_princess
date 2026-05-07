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


class SceneBase(BaseModel):
    id: Optional[int] = None
    name: str
    description: Optional[str] = None
    prompt: Optional[str] = None
    triggers: Optional[Dict[str, Any]] = None
    options: Optional[Dict[str, Any]] = None
    results: Optional[Dict[str, Any]] = None
    image: Optional[str] = None
    audio: Optional[str] = None


class StatusBase(BaseModel):
    id: Optional[int] = None
    name: str
    user_id: Optional[str] = None
    turn: int = 0
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
    turn: int
    sub_turn: int
    decisions: Optional[Dict[str, Any]] = None


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


class TargetStatusTagBase(BaseModel):
    id: Optional[int] = None
    target_status_id: int
    tag_id: int
