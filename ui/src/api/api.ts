// YOU MUST OPEN ALL FRONTEND SOURCE FILES with UTF-8 ENCODING to READ KOREAN CHARACTERS CORRECTLY.

import { API_URL, request } from './http';
import type {
  AdjustSelectionModelRequest,
  GenerateSceneOptionRequest,
  GenerateScenePromptResponse,
  GenerateSceneRequest,
  GenerateSceneScriptRequest,
  GenerateSceneScriptResponse,
  GenerateSelectionModelRequest,
  GetListRequest,
  GetListResponse,
  NextSceneRequest,
  SceneOptionRecord,
  SceneRecord,
  SelectionModelRecord,
  StatusRecord,
  UpdateSceneContextRequest,
  UpsertResponse,
} from './type';

export { API_URL };

export const dbTables = {
  Scene: {
    label: '장면',
    columns: {
      id: { label: 'ID', type: 'id' },
      prompt: { label: '프롬프트', type: 'text', required: true },
      image_url: { label: '이미지 URL', type: 'text' },
      script: { label: '스크립트', type: 'text' },
      status_change: { label: '상태 변화', type: 'dict-list' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<SceneRecord>>('post', '/scene/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene/upsert', items),
    generateScene: (item: GenerateSceneRequest) =>
      request<SceneRecord>('post', '/scene/generate', item),
    generatePrompt: (text: string) =>
      request<GenerateScenePromptResponse>('post', '/scene/generate-prompt', { text }),
    generateScript: (item: GenerateSceneScriptRequest) =>
      request<GenerateSceneScriptResponse>('post', '/scene/generate-script', item),
    updateContext: (item: UpdateSceneContextRequest) =>
      request<StatusRecord>('post', '/scene/update-context', item),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene/', ids).then(() => undefined),
  },

  SceneOption: {
    label: '장면 선택지',
    columns: {
      id: { label: 'ID', type: 'id' },
      scene_id: { label: '장면', type: 'fk', targetTable: 'Scene', required: true },
      option_text: { label: '선택지', type: 'text', required: true },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<SceneOptionRecord>>('post', '/scene_option/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene_option/upsert', items),
    generateOption: (item: GenerateSceneOptionRequest) =>
      request<SceneOptionRecord>('post', '/scene_option/generate', item),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene_option/', ids).then(() => undefined),
  },

  SelectionModel: {
    label: '선택 모델',
    columns: {
      id: { label: 'ID', type: 'id' },
      name: { label: '이름', type: 'text', required: true },
      file_url: { label: '파일 URL', type: 'text' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<SelectionModelRecord>>('post', '/selection_model/list', listRequest),
    upsertRow: (items: SelectionModelRecord[]) => request<UpsertResponse[]>('post', '/selection_model/upsert', items),
    generateModel: (item: GenerateSelectionModelRequest) =>
      request<SelectionModelRecord>('post', '/selection_model/generate', item),
    adjustModel: (item: AdjustSelectionModelRequest) =>
      request<SelectionModelRecord>('post', '/selection_model/adjust', item),
    nextScene: (item: NextSceneRequest) => request<SceneRecord>('post', '/selection_model/next', item),
    deleteRows: (ids: number[]) => request<null>('delete', '/selection_model/', ids).then(() => undefined),
  },

  Status: {
    label: '상태',
    columns: {
      id: { label: 'ID', type: 'id' },
      selection_model_id: { label: '선택 모델', type: 'fk', targetTable: 'SelectionModel' },
      name: { label: '이름', type: 'text', required: true },
      turn: { label: '턴', type: 'int', required: true },
      cash: { label: '현금', type: 'int', required: true },
      strength: { label: '힘', type: 'int', required: true },
      agility: { label: '민첩', type: 'int', required: true },
      intelligence: { label: '지력', type: 'int', required: true },
      sense: { label: '센스', type: 'int', required: true },
      attractiveness: { label: '매력', type: 'int', required: true },
      toughness: { label: '근성', type: 'int', required: true },
      stress: { label: '스트레스', type: 'int', required: true },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<StatusRecord>>('post', '/status/list', listRequest),
    upsertRow: (items: StatusRecord[]) => request<UpsertResponse[]>('post', '/status/upsert', items),
    deleteRows: (ids: number[]) => request<null>('delete', '/status/', ids).then(() => undefined),
  },
};
