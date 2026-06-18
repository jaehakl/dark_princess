import type {
  GetListRequest,
  PromptColumnName,
} from '../../api/type';

export const PROMPT_COLUMNS = [
  { key: 'prompt_situation', label: '상황' },
  { key: 'prompt_hero', label: '주인공' },
  { key: 'prompt_camera', label: '카메라' },
  { key: 'prompt_detail', label: '디테일' },
] as const;

export const PROMPT_EDITOR_COLUMNS = [
  { key: 'prompt_situation', label: '상황', kind: 'stored' },
  { key: 'prompt_instant_positive', label: 'instant positive', kind: 'instant' },
  { key: 'prompt_hero', label: '주인공', kind: 'stored' },
  { key: 'prompt_camera', label: '카메라', kind: 'stored' },
  { key: 'prompt_detail', label: '디테일', kind: 'stored' },
  { key: 'prompt_instant_negative', label: 'instant negative', kind: 'instant' },
  { key: 'prompt_negative', label: 'negative', kind: 'negative' },
] as const;

export const EMPTY_PROMPT_DRAFT: Record<PromptColumnName, string> = {
  prompt_situation: '',
  prompt_hero: '',
  prompt_camera: '',
  prompt_detail: '',
};

export const EMPTY_INSTANT_PROMPT_DRAFT = {
  prompt_instant_positive: '',
  prompt_instant_negative: '',
};

export const EMPTY_TRANSLATION_DRAFT = PROMPT_EDITOR_COLUMNS.reduce(
  (draft, column) => {
    draft[column.key] = '';
    return draft;
  },
  {} as Record<(typeof PROMPT_EDITOR_COLUMNS)[number]['key'], string>,
);

export const QUICK_IMAGE_STRENGTHS = [0.5, 0.75, 0.85, 0.95, 1];

export const STATUS_CHANGE_FIELDS = [
  { key: 'cash', label: '현금' },
  { key: 'strength', label: '힘' },
  { key: 'agility', label: '민첩' },
  { key: 'intelligence', label: '지력' },
  { key: 'sense', label: '센스' },
  { key: 'attractiveness', label: '매력' },
  { key: 'toughness', label: '근성' },
  { key: 'stress', label: '스트레스' },
] as const;

export const DEFAULT_STATUS_CHANGE: Record<string, number> = { turn: 1 };

export const FETCH_SCENE_BY_ID_REQUEST: GetListRequest = {
  offset: 0,
  limit: 1,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: null,
};
