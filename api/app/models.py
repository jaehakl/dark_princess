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
    option_text: str


class UpdateSceneContextRequestBase(BaseModel):
    status_id: int
    scene_id: int


class ImageGenerationSettingsBase(BaseModel):
    model_filename: Optional[str] = None
    model_filenames: Optional[List[str]] = None
    available_gpu_ids: Optional[List[int]] = None
    camera_samples: Optional[Dict[str, List[str]]] = None
    prompt_default_positive: Optional[str] = None
    prompt_default_negative: Optional[str] = None
    steps: Optional[int] = None
    cfg: Optional[float] = None
    strength: Optional[float] = None
    sampler: Optional[str] = None
    scheduler: Optional[str] = None
    clip_skip: Optional[int] = None
    height: Optional[int] = None
    width: Optional[int] = None
    scribble_scale: Optional[float] = None
    scribble_guidance_start: Optional[float] = None
    scribble_guidance_end: Optional[float] = None
    pose_scale: Optional[float] = None
    pose_guidance_start: Optional[float] = None
    pose_guidance_end: Optional[float] = None


class ImagePromptExtractionResponseBase(BaseModel):
    model: str
    prompt: str
    general_tags: Dict[str, float]
    character_tags: Dict[str, float]
    rating_tags: Dict[str, float]
    thresholds: Dict[str, float]


class GenerateImageRequestBase(BaseModel):
    positive_prompt: str
    negative_prompt: Optional[str] = None
    model_parameters: Optional[ImageGenerationSettingsBase] = None


class GenerateSceneRequestBase(BaseModel):
    scene_id: Optional[int] = None
    image_id: Optional[int] = None
    parent_image_id: Optional[int] = None
    script: str = ""
    status_change: Dict[str, Any] = Field(default_factory=dict)
    generate_image: bool = True
    image_settings: Optional[ImageGenerationSettingsBase] = None
    prompt_situation: Optional[str] = None
    prompt_instant_positive: Optional[str] = None
    prompt_hero: Optional[str] = None
    prompt_camera: Optional[str] = None
    prompt_detail: Optional[str] = None
    prompt_instant_negative: Optional[str] = None
    prompt_negative: Optional[str] = None


class GenerateScenePromptRequestBase(BaseModel):
    text: str
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


class GenerateScenePromptResponseBase(BaseModel):
    prompt: str


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
    image_id: Optional[int] = None
    image_url: Optional[str] = None
    scribble_url: Optional[str] = None
    pose_url: Optional[str] = None
    script: str = ""
    status_change: Dict[str, Any] = Field(default_factory=dict)
    prompt_situation: Optional[str] = None
    prompt_hero: Optional[str] = None
    prompt_camera: Optional[str] = None
    prompt_detail: Optional[str] = None
    prompt_negative: Optional[str] = None


class ImageBase(BaseModel):
    id: Optional[int] = None
    image_object_key: Optional[str] = None
    scribble_object_key: Optional[str] = None
    pose_object_key: Optional[str] = None
    positive_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed_image_id: Optional[int] = None
    model_parameters: Optional[Dict[str, Any]] = None


class ImageListItemBase(ImageBase):
    scene_count: int = 0
    family_root_image_id: Optional[int] = None
    family_image_count: int = 0


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
