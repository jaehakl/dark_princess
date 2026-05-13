// YOU MUST OPEN ALL FRONTEND SOURCE FILES with UTF-8 ENCODING to READ KOREAN CHARACTERS CORRECTLY.

import { API_URL, request } from './http';

export { API_URL };

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

function buildUpsertFormData(
  payload: unknown,
  files: Record<string, File | null | undefined> = {},
) {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));

  Object.entries(files).forEach(([field, file]) => {
    if (!file) {
      return;
    }

    formData.append(field, file, file.name);
  });

  return formData;
}


export const settings = {
  getStableDiffusionModelPath: () => request<StableDiffusionModelPathSettings>('get', '/settings/stable-diffusion-model-path'),
  updateStableDiffusionModelPath: (value: string) => request<{ value: string }>('post', '/settings/stable-diffusion-model-path', { value }),
};

export const dbTables = {
  Tag: {
    label: '태그',
    columns: {
      id: { label: 'ID', type: 'id' },
      name: { label: '이름', type: 'text', required: true },
      scope: { label: '범위', type: 'text' },
      system_key: { label: '시스템 키', type: 'text' },
      description: { label: '설명', type: 'text' },
      color: { label: '색상', type: 'text' },
      trigger_default: { label: '기본 트리거', type: 'boolean' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/tag/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/tag/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/tag/', ids).then(() => undefined),
  },

  Target: {
    label: '대상',
    columns: {
      id: { label: 'ID', type: 'id' },
      type: { label: '유형', type: 'text', required: true, options: [{ key: 'place', label: '방문처' }, { key: 'person', label: '인물' }] },
      name: { label: '이름', type: 'text', required: true },
      description: { label: '설명', type: 'text' },
      properties: { label: '속성', type: 'dict-list' },
      image: { label: '이미지', type: 'image' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/target/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/target/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/target/', ids).then(() => undefined),
    upsertFormRow: (item: unknown, files: Record<string, File | null | undefined> = {}) =>
      request<UpsertResponse>('post', '/target/upsert-form', buildUpsertFormData(item, files)),
  },

  Scene: {
    label: '장면',
    columns: {
      id: { label: 'ID', type: 'id' },
      name: { label: '이름', type: 'text', required: true },
      description: { label: '설명', type: 'text' },
      prompt: { label: '프롬프트', type: 'text' },
      priority: { label: '우선순위', type: 'int' },
      repeat_policy: { label: '반복 정책', type: 'text', required: true, options: [{ key: 'always', label: '매번' }, { key: 'once_per_turn', label: '턴당 1회' }, { key: 'once_per_status', label: 'Status당 1회' }] },
      cooldown_turns: { label: '쿨다운 턴', type: 'int' },
      image: { label: '이미지', type: 'image' },
      audio: { label: '오디오', type: 'file' },
      scene_histories: { label: '장면 기록', type: 'list-fk', targetTable: 'SceneHistory', linkType: 'children' },
      trigger_blocks: { label: '트리거 블록', type: 'list-fk', targetTable: 'SceneTriggerBlock', linkType: 'children' },
      scene_options: { label: '선택지', type: 'list-fk', targetTable: 'SceneOption', linkType: 'children' },
      scene_results: { label: '결과', type: 'list-fk', targetTable: 'SceneResult', linkType: 'children' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene/', ids).then(() => undefined),
    upsertFormRow: (item: unknown, files: Record<string, File | null | undefined> = {}) =>
      request<UpsertResponse>('post', '/scene/upsert-form', buildUpsertFormData(item, files)),
  },

  SceneTriggerBlock: {
    label: '장면 트리거 블록',
    columns: {
      id: { label: 'ID', type: 'id' },
      scene_id: { label: '장면', type: 'fk', targetTable: 'Scene', required: true },
      label: { label: '라벨', type: 'text' },
      sort_order: { label: '정렬 순서', type: 'int' },
      conditions: { label: '조건', type: 'list-fk', targetTable: 'SceneCondition', linkType: 'children' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene_trigger_block/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_trigger_block/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_trigger_block/', ids).then(() => undefined),
  },

  SceneOption: {
    label: '장면 선택지',
    columns: {
      id: { label: 'ID', type: 'id' },
      scene_id: { label: '장면', type: 'fk', targetTable: 'Scene', required: true },
      option_key: { label: '선택지 키', type: 'text', required: true },
      label: { label: '라벨', type: 'text', required: true },
      description: { label: '설명', type: 'text' },
      next_scene_id: { label: '다음 장면', type: 'fk', targetTable: 'Scene' },
      sort_order: { label: '정렬 순서', type: 'int' },
      is_active: { label: '활성', type: 'boolean' },
      conditions: { label: '조건', type: 'list-fk', targetTable: 'SceneCondition', linkType: 'children' },
      decisions: { label: '결정 기록', type: 'list-fk', targetTable: 'SceneDecision', linkType: 'children' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene_option/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_option/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_option/', ids).then(() => undefined),
  },

  SceneCondition: {
    label: '장면 조건',
    columns: {
      id: { label: 'ID', type: 'id' },
      trigger_block_id: { label: '트리거 블록', type: 'fk', targetTable: 'SceneTriggerBlock' },
      option_id: { label: '선택지', type: 'fk', targetTable: 'SceneOption' },
      kind: { label: '종류', type: 'text', required: true, options: [{ key: 'target', label: '대상' }, { key: 'status_tag', label: 'Status 태그' }, { key: 'target_tag', label: 'TargetStatus 태그' }, { key: 'scene_seen', label: '장면 확인' }, { key: 'option_chosen', label: '선택지 선택' }, { key: 'status_stat', label: 'Status 수치' }, { key: 'target_interaction', label: 'Target 상호작용' }] },
      operator: { label: '연산자', type: 'text', required: true, options: [{ key: 'eq', label: '같음' }, { key: 'ne', label: '다름' }, { key: 'gt', label: '초과' }, { key: 'gte', label: '이상' }, { key: 'lt', label: '미만' }, { key: 'lte', label: '이하' }, { key: 'has', label: '있음' }, { key: 'not', label: '없음/아님' }] },
      tag_id: { label: '태그', type: 'fk', targetTable: 'Tag' },
      target_id: { label: '대상', type: 'fk', targetTable: 'Target' },
      scene_ref_id: { label: '참조 장면', type: 'fk', targetTable: 'Scene' },
      option_ref_id: { label: '참조 선택지', type: 'fk', targetTable: 'SceneOption' },
      stat_field: { label: '스탯 필드', type: 'text' },
      numeric_value: { label: '숫자값', type: 'int' },
      value: { label: '값', type: 'dict-list' },
      sort_order: { label: '정렬 순서', type: 'int' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene_condition/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_condition/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_condition/', ids).then(() => undefined),
  },

  SceneResult: {
    label: '장면 결과',
    columns: {
      id: { label: 'ID', type: 'id' },
      scene_id: { label: '장면', type: 'fk', targetTable: 'Scene' },
      kind: { label: '종류', type: 'text', required: true, options: [{ key: 'status_stat_delta', label: 'Status 수치 증감' }, { key: 'status_stat_set', label: 'Status 수치 설정' }, { key: 'target_interaction_delta', label: 'Target 상호작용 증감' }, { key: 'target_interaction_set', label: 'Target 상호작용 설정' }, { key: 'status_tag_add', label: 'Status 태그 추가' }, { key: 'status_tag_remove', label: 'Status 태그 제거' }, { key: 'target_tag_add', label: 'Target 태그 추가' }, { key: 'target_tag_remove', label: 'Target 태그 제거' }, { key: 'target_visitable_set', label: '방문 가능 설정' }, { key: 'target_visitable_toggle', label: '방문 가능 토글' }] },
      tag_id: { label: '태그', type: 'fk', targetTable: 'Tag' },
      target_id: { label: '대상', type: 'fk', targetTable: 'Target' },
      stat_field: { label: '스탯 필드', type: 'text', options: [{ key: 'cash', label: '현금' }, { key: 'strength', label: '힘' }, { key: 'agility', label: '민첩' }, { key: 'intelligence', label: '지력' }, { key: 'sense', label: '센스' }, { key: 'attractiveness', label: '매력' }, { key: 'toughness', label: '근성' }, { key: 'stress', label: '스트레스' }]},
      numeric_value: { label: '숫자값', type: 'int'},
      key: { label: '키', type: 'text' },
      value: { label: '값', type: 'dict-list' },
      sort_order: { label: '정렬 순서', type: 'int' },
      applied_results: { label: '적용 결과', type: 'list-fk', targetTable: 'SceneAppliedResult', linkType: 'children' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene_result/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_result/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_result/', ids).then(() => undefined),
  },

  Status: {
    label: '상태',
    columns: {
      id: { label: 'ID', type: 'id' },
      name: { label: '이름', type: 'text', required: true },
      turn: { label: '턴', type: 'int' },
      cash: { label: '현금', type: 'int' },
      strength: { label: '힘', type: 'int' },
      agility: { label: '민첩', type: 'int' },
      intelligence: { label: '지력', type: 'int' },
      sense: { label: '센스', type: 'int' },
      attractiveness: { label: '매력', type: 'int' },
      toughness: { label: '근성', type: 'int' },
      stress: { label: '스트레스', type: 'int' },
      status_tags: { label: '상태 태그', type: 'list-fk', targetTable: 'StatusTag', linkType: 'children' },
      scene_histories: { label: '장면 기록', type: 'list-fk', targetTable: 'SceneHistory', linkType: 'children' },
      target_statuses: { label: '대상 상태', type: 'list-fk', targetTable: 'TargetStatus', linkType: 'children' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/status/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/status/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/status/', ids).then(() => undefined),
  },


  StatusTag: {
    label: '상태 태그',
    columns: {
      id: { label: 'ID', type: 'id' },
      status_id: { label: '상태', type: 'fk', targetTable: 'Status', required: true },
      tag_id: { label: '태그', type: 'fk', targetTable: 'Tag', required: true },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/status_tag/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/status_tag/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/status_tag/', ids).then(() => undefined),
  },

  TargetStatus: {
    label: '대상 상태',
    columns: {
      id: { label: 'ID', type: 'id' },
      status_id: { label: '상태', type: 'fk', targetTable: 'Status', required: true },
      target_id: { label: '대상', type: 'fk', targetTable: 'Target', required: true },
      interactions: { label: '상호작용', type: 'dict-list' },
      visitable: { label: '방문 가능', type: 'boolean' },
      target_status_tags: { label: '대상 상태 태그', type: 'list-fk', targetTable: 'TargetStatusTag', linkType: 'children' },
      scene_histories: { label: '장면 기록', type: 'list-fk', targetTable: 'SceneHistory', linkType: 'children' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/target_status/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/target_status/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/target_status/', ids).then(() => undefined),
  },

  TargetStatusTag: {
    label: '대상 상태 태그',
    columns: {
      id: { label: 'ID', type: 'id' },
      target_status_id: { label: '대상 상태', type: 'fk', targetTable: 'TargetStatus', required: true },
      tag_id: { label: '태그', type: 'fk', targetTable: 'Tag', required: true },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/target_status_tag/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/target_status_tag/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/target_status_tag/', ids).then(() => undefined),
  },


  SceneHistory: {
    label: '장면 기록',
    columns: {
      id: { label: 'ID', type: 'id' },
      status_id: { label: '상태', type: 'fk', targetTable: 'Status', required: true },
      scene_id: { label: '장면', type: 'fk', targetTable: 'Scene', required: true },
      target_status_id: { label: '대상 상태', type: 'fk', targetTable: 'TargetStatus' },
      turn: { label: '턴', type: 'int', required: true },
      sub_turn: { label: '서브턴', type: 'int', required: true },
      scene_decisions: { label: '결정', type: 'list-fk', targetTable: 'SceneDecision', linkType: 'children' },
      applied_results: { label: '적용 결과', type: 'list-fk', targetTable: 'SceneAppliedResult', linkType: 'children' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene_history/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_history/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_history/', ids).then(() => undefined),
  },

  SceneDecision: {
    label: '장면 결정',
    columns: {
      id: { label: 'ID', type: 'id' },
      scene_history_id: { label: '장면 기록', type: 'fk', targetTable: 'SceneHistory', required: true },
      option_id: { label: '선택지', type: 'fk', targetTable: 'SceneOption' },
      option_key: { label: '선택지 키', type: 'text' },
      option_label: { label: '선택지 라벨', type: 'text' },
      value: { label: '값', type: 'dict-list' },
      sort_order: { label: '정렬 순서', type: 'int' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene_decision/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_decision/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_decision/', ids).then(() => undefined),
  },

  SceneAppliedResult: {
    label: '장면 적용 결과',
    columns: {
      id: { label: 'ID', type: 'id' },
      scene_history_id: { label: '장면 기록', type: 'fk', targetTable: 'SceneHistory', required: true },
      result_id: { label: '결과', type: 'fk', targetTable: 'SceneResult' },
      kind: { label: '종류', type: 'text', required: true },
      payload: { label: '페이로드', type: 'dict-list' },
      before: { label: '이전 값', type: 'dict-list' },
      after: { label: '이후 값', type: 'dict-list' },
      sort_order: { label: '정렬 순서', type: 'int' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene_applied_result/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_applied_result/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_applied_result/', ids).then(() => undefined),
  },

};
