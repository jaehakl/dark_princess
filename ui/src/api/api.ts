// YOU MUST OPEN ALL FRONTEND SOURCE FILES with UTF-8 ENCODING to READ KOREAN CHARACTERS CORRECTLY.

import { API_URL, request } from './http';

export { API_URL };

export type UserData = {
  id: string;
  email?: string | null;
  display_name?: string | null;
  picture_url?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  roles: string[];
};

export async function fetchMe() {
  try {
    return await request<UserData>('get', '/auth/me');
  } catch {
    return null;
  }
}

export function startGoogleLogin() {
  const returnTo = window.location.href;
  window.location.href = `${API_URL}/auth/google/start?return_to=${encodeURIComponent(returnTo)}`;
}

export async function logout() {
  await request<{ ok: true }>('post', '/auth/logout');
}

export const getAllUsersAdmin = (limit: number, offset: number) =>
  request<UserData[]>(
    'get',
    `/user_admin/get_all_users/${encodeURIComponent(String(limit))}/${encodeURIComponent(String(offset))}`,
  );
export const deleteUserAdmin = (id: string) =>
  request<boolean>('get', `/user_admin/delete/${encodeURIComponent(id)}`);
export const getUserSummaryAdmin = (userId: string) =>
  request<UserData | null>('get', `/user_data/summary/admin/${encodeURIComponent(userId)}`);
export const getUserSummaryUser = () => request<UserData | null>('get', '/user_data/summary/user');

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

export const dbTables = {
  Tag: {
    label: '태그',
    columns: {
      id: { label: 'ID', type: 'id' },
      name: { label: '이름', type: 'text', required: true },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/tag/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/tag/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/tag/', ids).then(() => undefined),
  },

  Scene: {
    label: '장면',
    columns: {
      id: { label: 'ID', type: 'id' },
      name: { label: '이름', type: 'text', required: true },
      description: { label: '설명', type: 'text' },
      prompt: { label: '프롬프트', type: 'text' },
      triggers: { label: '트리거', type: 'dict-list' },
      options: { label: '선택지', type: 'dict-list' },
      results: { label: '결과', type: 'dict-list' },
      image: { label: '이미지', type: 'image' },
      audio: { label: '오디오', type: 'file' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene/', ids).then(() => undefined),
    upsertFormRow: (item: unknown, files: Record<string, File | null | undefined> = {}) =>
      request<UpsertResponse>('post', '/scene/upsert-form', buildUpsertFormData(item, files)),
  },

  Status: {
    label: '상태',
    columns: {
      id: { label: 'ID', type: 'id' },
      name: { label: '이름', type: 'text', required: true },
      turn: { label: '턴', type: 'int' },
      cash: { label: '현금', type: 'int' },
      strength: { label: '근력', type: 'int' },
      agility: { label: '민첩', type: 'int' },
      intelligence: { label: '지능', type: 'int' },
      sense: { label: '감각', type: 'int' },
      attractiveness: { label: '매력', type: 'int' },
      toughness: { label: '맷집', type: 'int' },
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

  SceneHistory: {
    label: '장면 기록',
    columns: {
      id: { label: 'ID', type: 'id' },
      status_id: { label: '상태', type: 'fk', targetTable: 'Status', required: true },
      scene_id: { label: '장면', type: 'fk', targetTable: 'Scene', required: true },
      turn: { label: '턴', type: 'int', required: true },
      sub_turn: { label: '서브턴', type: 'int', required: true },
      decisions: { label: '결정', type: 'dict-list' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<Record<string, unknown>>>('post', '/scene_history/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_history/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_history/', ids).then(() => undefined),
  },

  Target: {
    label: '대상',
    columns: {
      id: { label: 'ID', type: 'id' },
      type: { label: '유형', type: 'text', required: true },
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

  TargetStatus: {
    label: '대상 상태',
    columns: {
      id: { label: 'ID', type: 'id' },
      status_id: { label: '상태', type: 'fk', targetTable: 'Status', required: true },
      target_id: { label: '대상', type: 'fk', targetTable: 'Target', required: true },
      interactions: { label: '상호작용', type: 'dict-list' },
      target_status_tags: { label: '대상 상태 태그', type: 'list-fk', targetTable: 'TargetStatusTag', linkType: 'children' },
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
};
