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
  positive_base: string;
  negative_prompt: string;
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
  script: string;
  status_change: Record<string, unknown>;
  generate_image?: boolean;
  image_settings?: Partial<ImageGenerationSettings> | null;
  background?: string | null;
  subject?: string | null;
  object?: string | null;
  action?: string | null;
  detail?: string | null;
};

export type PromptColumnName = 'background' | 'subject' | 'object' | 'action' | 'detail';

export type RecommendPromptColumns = Record<PromptColumnName, string[]>;

export type GenerateSceneOptionRequest = {
  option_id?: number | null;
  scene_id: number;
  option_text: string;
};

export type SceneRecord = {
  id?: number | null;
  image_url?: string | null;
  scribble_url?: string | null;
  pose_url?: string | null;
  script: string;
  status_change: Record<string, unknown>;
  background?: string | null;
  subject?: string | null;
  object?: string | null;
  action?: string | null;
  detail?: string | null;
};

export type SceneOptionRecord = {
  id?: number | null;
  scene_id: number;
  option_text: string;
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
  | 'SceneOption'
  | 'SelectionModel'
  | 'Status';
