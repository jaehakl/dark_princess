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

export type ImageGenerationSettings = {
  model_filename: string;
  model_filenames: string[];
  camera_samples: Record<string, string[]>;
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

export type GenImageResponse = {
  id: number;
  image: string;
  seed: number;
};

export type GenerateSceneRequest = {
  scene_id?: number | null;
  parent_image_id?: number | null;
  script: string;
  status_change: Record<string, unknown>;
  generate_image?: boolean;
  image_settings?: Partial<ImageGenerationSettings> | null;
  prompt_situation?: string | null;
  prompt_instant_positive?: string | null;
  prompt_hero?: string | null;
  prompt_camera?: string | null;
  prompt_detail?: string | null;
  prompt_instant_negative?: string | null;
  prompt_negative?: string | null;
};

export type PromptColumnName = 'prompt_situation' | 'prompt_hero' | 'prompt_camera' | 'prompt_detail';

export type SceneRecord = {
  id?: number | null;
  image_id?: number | null;
  image_url?: string | null;
  scribble_url?: string | null;
  pose_url?: string | null;
  script: string;
  status_change: Record<string, unknown>;
  prompt_situation?: string | null;
  prompt_hero?: string | null;
  prompt_camera?: string | null;
  prompt_detail?: string | null;
  prompt_negative?: string | null;
};

export type NextSceneRequest = {
  scene_id: number | null;
  status_id: number;
  option_text: string;
};

export type AdjustSelectionModelRequest = NextSceneRequest & {
  target_scene_id: number;
  learn_rate: number;
};

export type UpdateSceneContextRequest = {
  status_id: number;
  scene_id: number;
};

export type GenerateSelectionModelRequest = {
  model_id?: number | null;
  name: string;
  parameters: Record<string, unknown>;
};

export type SelectionModelRecord = {
  id?: number | null;
  name: string;
  file_url?: string | null;
};

export type StatusRecord = {
  id?: number | null;
  selection_model_id?: number | null;
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
  | 'Scene'
  | 'SelectionModel'
  | 'Status';
