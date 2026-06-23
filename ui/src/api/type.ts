export type GetListRequest = {
  offset: number;
  limit: number | null;
  selected_ids: number[];
  search_text: string | null;
  text_filter: Record<string, string[]>;
  filter: Record<string, unknown[]>;
  sort: [string, 'asc' | 'desc'] | null;
};

export type GetListResponse<T> = {
  total: number;
  items: T[];
};

export type UpsertResponse = {
  id: number;
  fk_not_found?: Record<string, number[]> | null;
};

export type ImageDeleteResponse = {
  requested_ids: number[];
  deleted_ids: number[];
  skipped_cut_linked_ids: number[];
};

export type CameraSamples = Record<string, Record<string, string>>;

export type ImageGenerationSettings = {
  model_filename: string;
  model_filenames: string[];
  available_gpu_ids: number[];
  camera_samples: CameraSamples;
  prompt_default_positive: string;
  prompt_default_negative: string;
  steps: number;
  cfg: number;
  strength: number;
  sampler: string;
  scheduler: string;
  clip_skip: number | null;
  height: number;
  width: number;
  scribble_scale: number;
  scribble_guidance_start: number;
  scribble_guidance_end: number;
  pose_scale: number;
  pose_guidance_start: number;
  pose_guidance_end: number;
};

export type GenerateImageRequest = {
  positive_prompt: string;
  negative_prompt: string | null;
  model_parameters: Partial<ImageGenerationSettings> | null;
};

export type GenImageResponse = {
  id: number;
  image: string;
  seed: number;
};

export type GenerateCutRequest = {
  cut_id?: number | null;
  image_id?: number | null;
  scene_id?: number | null;
  prev_cut_id?: number | null;
  parent_image_id?: number | null;
  script: string;
  status_change: Record<string, unknown>;
  favorited?: boolean | null;
  generate_image?: boolean;
  image_settings?: Partial<ImageGenerationSettings> | null;
  prompt_situation?: string | null;
  prompt_instant_positive?: string | null;
  prompt_hero?: string | null;
  prompt_detail?: string | null;
  prompt_camera?: string | null;
  prompt_instant_negative?: string | null;
  prompt_negative?: string | null;
};

export type LlmAskRequest = {
  system_message: string;
  question: string;
  max_tokens?: number | null;
  temperature?: number | null;
};

export type UpdateCutImageRequest = {
  cut_id: number;
  image_id: number | null;
};

export type UpdateCutLinksRequest = {
  cut_id: number;
  scene_id?: number | null;
  prev_cut_id?: number | null;
};

export type UpdateCutFavoriteRequest = {
  cut_id: number;
  favorited: boolean;
};

export type UpdateSceneFirstCutRequest = {
  scene_id: number;
  cut_id: number | null;
};

export type RecommendSceneRequest = {
  status_id: number;
  current_scene_id?: number | null;
  current_cut_id?: number | null;
  option_text: string;
};

export type PromptColumnName = 'prompt_situation' | 'prompt_hero' | 'prompt_detail' | 'prompt_camera';

export type CutRecord = {
  id?: number | null;
  image_id?: number | null;
  scene_id?: number | null;
  prev_cut_id?: number | null;
  image_url?: string | null;
  scribble_url?: string | null;
  pose_url?: string | null;
  favorited?: boolean;
  script: string;
  status_change: Record<string, unknown>;
  prompt_situation?: string | null;
  prompt_hero?: string | null;
  prompt_detail?: string | null;
  prompt_camera?: string | null;
  prompt_negative?: string | null;
};

export type SceneRecord = {
  id?: number | null;
  title: string;
  context: string;
  turn: number;
  cash: number;
  strength: number;
  agility: number;
  intelligence: number;
  sense: number;
  attractiveness: number;
  toughness: number;
  stress: number;
  first_cut_id?: number | null;
  first_cut_image_url?: string | null;
  cut_count?: number;
};

export type SceneRecommendation = {
  scene: SceneRecord;
  first_cut: CutRecord;
};

export type ImageRecord = {
  id?: number | null;
  image_object_key?: string | null;
  scribble_object_key?: string | null;
  pose_object_key?: string | null;
  positive_prompt?: string | null;
  negative_prompt?: string | null;
  seed_image_id?: number | null;
  model_parameters?: Record<string, unknown> | null;
  cut_count?: number | null;
  family_root_image_id?: number | null;
  family_image_count?: number | null;
};

export type UpdateCutContextRequest = {
  status_id: number;
  cut_id: number;
};

export type StatusRecord = {
  id?: number | null;
  name: string;
  turn: number;
  cash: number;
  strength: number;
  agility: number;
  intelligence: number;
  sense: number;
  attractiveness: number;
  toughness: number;
  stress: number;
};

export type DbTableName =
  | 'Cut'
  | 'Scene'
  | 'Image'
  | 'Status';
