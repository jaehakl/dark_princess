// YOU MUST OPEN ALL FRONTEND SOURCE FILES with UTF-8 ENCODING to READ KOREAN CHARACTERS CORRECTLY.

import { API_URL, request } from './http';
import type {
  AdjustSelectionModelRequest,
  GenerateImageRequest,
  GenerateSelectionModelRequest,
  GetListRequest,
  GetListResponse,
  ImageDeleteResponse,
  ImageGenerationSettings,
  ImageRecord,
  NextSceneRequest,
  SceneRecord,
  SelectionModelRecord,
  StatusRecord,
  UpdateSceneContextRequest,
  UpdateSceneImageRequest,
  UpsertResponse,
} from './type';

export { API_URL };

async function readResponseError(response: Response, fallbackMessage: string) {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string' && body.detail) {
      return body.detail;
    }
  } catch {
    // Use fallback below when the server does not return JSON.
  }
  return fallbackMessage;
}

export const dbTables = {
  Scene: {
    label: '장면',
    columns: {
      id: { label: 'ID', type: 'id' },
      image_id: { label: 'Image ID', type: 'int' },
      image_url: { label: '이미지 URL', type: 'text' },
      scribble_url: { label: 'Scribble URL', type: 'text' },
      pose_url: { label: 'Pose URL', type: 'text' },
      script: { label: '스크립트', type: 'text' },
      status_change: { label: '상태 변화', type: 'dict-list' },
      prompt_situation: { label: '상황 프롬프트', type: 'text' },
      prompt_hero: { label: '주인공 프롬프트', type: 'text' },
      prompt_camera: { label: '카메라 프롬프트', type: 'text' },
      prompt_detail: { label: '디테일 프롬프트', type: 'text' },
      prompt_negative: { label: 'Negative 프롬프트', type: 'text' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<SceneRecord>>('post', '/scene/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/scene/upsert', items),
    generateScene: (item: FormData) =>
      request<SceneRecord>('post', '/scene/generate', item),
    similarScenes: (text: string) =>
      request<SceneRecord[]>('post', '/scene/similar', { text }),
    updateContext: (item: UpdateSceneContextRequest) =>
      request<StatusRecord>('post', '/scene/update-context', item),
    updateImage: (item: UpdateSceneImageRequest) =>
      request<SceneRecord>('post', '/scene/update-image', item),
    deleteRows: (ids: number[]) => request<null>('delete', '/scene/', ids).then(() => undefined),
  },

  Image: {
    label: '이미지',
    columns: {
      id: { label: 'ID', type: 'id' },
      image_object_key: { label: '이미지 Object Key', type: 'text' },
      scribble_object_key: { label: 'Scribble Object Key', type: 'text' },
      pose_object_key: { label: 'Pose Object Key', type: 'text' },
      positive_prompt: { label: 'Positive 프롬프트', type: 'text' },
      negative_prompt: { label: 'Negative 프롬프트', type: 'text' },
      seed_image_id: { label: 'Seed 이미지', type: 'fk', targetTable: 'Image' },
      model_parameters: { label: '모델 파라미터', type: 'dict-list' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<ImageRecord>>('post', '/image/list', listRequest),
    generateImage: (items: GenerateImageRequest[]) =>
      request<ImageRecord[]>('post', '/image/generate', items),
    upsertRow: (items: ImageRecord[]) => request<UpsertResponse[]>('post', '/image/upsert', items),
    getLineageIds: (imageId: number) => request<number[]>('get', `/image/${imageId}/lineage`),
    deleteRows: (ids: number[]) => request<ImageDeleteResponse>('delete', '/image/', ids),
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
  ImageUtil: {
    getImageSettingsDefaults: () =>
      request<ImageGenerationSettings>('get', '/image-util/image-settings/defaults'),
    translateCommaTexts: (texts: string[]) =>
      request<string[]>('post', '/image-util/translate-comma-texts', texts),
    postprocessImage: async (
      image: Blob,
      operation: string,
      parameters: Record<string, unknown> = {},
    ) => {
      const formData = new FormData();
      formData.append('image', image, 'image.png');
      formData.append('operation', operation);
      formData.append('parameters', JSON.stringify(parameters));

      const response = await fetch(`${API_URL}/image-util/postprocess`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response, '이미지 후처리에 실패했습니다.'));
      }
      return await response.blob();
    },
  },
};
