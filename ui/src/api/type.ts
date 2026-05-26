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

export type StableDiffusionModelPathSettings = {
  value: string;
  directory: string;
  files: string[];
};

export type ImageGenerationSettings = {
  positive_prompt: string;
  negative_prompt: string;
  steps: number;
  cfg: number;
  height: number;
  width: number;
  seed_min: number;
  seed_max: number;
};

export type GenImageResponse = {
  id: number;
  image: string;
  seed: number;
};

export type DbTableName =
  | 'Tag'
  | 'Target'
  | 'Scene'
  | 'SceneTriggerBlock'
  | 'SceneOption'
  | 'SceneCondition'
  | 'SceneResult'
  | 'Status'
  | 'StatusTag'
  | 'TargetStatus'
  | 'TargetStatusTag'
  | 'SceneHistory'
  | 'SceneDecision'
  | 'SceneAppliedResult';
