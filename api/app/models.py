from typing import Any, Dict, List, Optional

from pydantic import BaseModel as PydanticBaseModel, Field


class BaseModel(PydanticBaseModel):
    pass


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


class NextSceneRequestBase(BaseModel):
    scene_id: Optional[int] = None
    status_id: int
    scene_option_id: Optional[int] = None


class UpdateSceneContextRequestBase(BaseModel):
    status_id: int
    scene_id: int


class GenerateSceneRequestBase(BaseModel):
    scene_id: Optional[int] = None
    prompt: str
    script: str = ""
    status_change: Dict[str, Any] = Field(default_factory=dict)
    generate_image: bool = True


class GenerateScenePromptRequestBase(BaseModel):
    text: str
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


class GenerateScenePromptResponseBase(BaseModel):
    prompt: str


class GenerateSceneScriptRequestBase(BaseModel):
    history: str
    direction: str
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


class GenerateSceneScriptResponseBase(BaseModel):
    script: str


class GenerateSceneOptionRequestBase(BaseModel):
    option_id: Optional[int] = None
    scene_id: int
    option_text: str


class GenerateSelectionModelRequestBase(BaseModel):
    model_id: Optional[int] = None
    name: str
    parameters: Dict[str, Any] = Field(default_factory=dict)


class RecommendPromptItemBase(BaseModel):
    word: str
    score: float


class AdjustSelectionModelRequestBase(NextSceneRequestBase):
    target_scene_id: int
    learn_rate: float


class SceneBase(BaseModel):
    id: Optional[int] = None
    prompt: str
    image_url: Optional[str] = None
    script: str = ""
    status_change: Dict[str, Any] = Field(default_factory=dict)


class SceneOptionBase(BaseModel):
    id: Optional[int] = None
    scene_id: int
    option_text: str


class SelectionModelBase(BaseModel):
    id: Optional[int] = None
    name: str
    file_url: Optional[str] = None


class StatusBase(BaseModel):
    id: Optional[int] = None
    selection_model_id: Optional[int] = None
    name: str
    turn: int
    cash: int
    strength: int
    agility: int
    intelligence: int
    sense: int
    attractiveness: int
    toughness: int
    stress: int
