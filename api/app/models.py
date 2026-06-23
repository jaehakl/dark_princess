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


class ImageDeleteResponseBase(BaseModel):
    requested_ids: List[int]
    deleted_ids: List[int]
    skipped_cut_linked_ids: List[int]


class UpdateCutContextRequestBase(BaseModel):
    status_id: int
    cut_id: int


class UpdateCutImageRequestBase(BaseModel):
    cut_id: int
    image_id: Optional[int] = None


class UpdateCutLinksRequestBase(BaseModel):
    cut_id: int
    scene_id: Optional[int] = None
    prev_cut_id: Optional[int] = None


class UpdateCutFavoriteRequestBase(BaseModel):
    cut_id: int
    favorited: bool


class UpdateSceneFirstCutRequestBase(BaseModel):
    scene_id: int
    cut_id: Optional[int] = None


class RecommendSceneRequestBase(BaseModel):
    status_id: int
    current_scene_id: Optional[int] = None
    current_cut_id: Optional[int] = None
    option_text: str = ""


class ImageGenerationSettingsBase(BaseModel):
    model_filename: Optional[str] = None
    model_filenames: Optional[List[str]] = None
    available_gpu_ids: Optional[List[int]] = None
    camera_samples: Optional[Dict[str, Dict[str, str]]] = None
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


class GenerateCutRequestBase(BaseModel):
    cut_id: Optional[int] = None
    image_id: Optional[int] = None
    scene_id: Optional[int] = None
    prev_cut_id: Optional[int] = None
    parent_image_id: Optional[int] = None
    script: str = ""
    status_change: Dict[str, Any] = Field(default_factory=dict)
    favorited: Optional[bool] = None
    generate_image: bool = True
    image_settings: Optional[ImageGenerationSettingsBase] = None
    prompt_situation: Optional[str] = None
    prompt_instant_positive: Optional[str] = None
    prompt_hero: Optional[str] = None
    prompt_detail: Optional[str] = None
    prompt_camera: Optional[str] = None
    prompt_instant_negative: Optional[str] = None
    prompt_negative: Optional[str] = None


class LlmAskRequestBase(BaseModel):
    system_message: str
    question: str
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


class CutBase(BaseModel):
    id: Optional[int] = None
    image_id: Optional[int] = None
    scene_id: Optional[int] = None
    prev_cut_id: Optional[int] = None
    image_url: Optional[str] = None
    scribble_url: Optional[str] = None
    pose_url: Optional[str] = None
    favorited: bool = False
    script: str = ""
    status_change: Dict[str, Any] = Field(default_factory=dict)
    prompt_situation: Optional[str] = None
    prompt_hero: Optional[str] = None
    prompt_detail: Optional[str] = None
    prompt_camera: Optional[str] = None
    prompt_negative: Optional[str] = None


class SceneBase(BaseModel):
    id: Optional[int] = None
    title: str = ""
    context: str = ""
    turn: int = 0
    cash: int = 0
    strength: int = 0
    agility: int = 0
    intelligence: int = 0
    sense: int = 0
    attractiveness: int = 0
    toughness: int = 0
    stress: int = 0
    first_cut_id: Optional[int] = None
    first_cut_image_url: Optional[str] = None
    cut_count: int = 0


class SceneRecommendationBase(BaseModel):
    scene: SceneBase
    first_cut: CutBase


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
    cut_count: int = 0
    family_root_image_id: Optional[int] = None
    family_image_count: int = 0


class StatusBase(BaseModel):
    id: Optional[int] = None
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
