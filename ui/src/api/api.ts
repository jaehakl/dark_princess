// YOU MUST OPEN ALL FRONTEND SOURCE FILES with UTF-8 ENCODING to READ KOREAN CHARACTERS CORRECTLY.

import { API_URL, request, requestResponse } from './http';
import type {
  GenerateImageRequest,
  GetListRequest,
  GetListResponse,
  ImageDeleteResponse,
  ImageGenerationSettings,
  ImageRecord,
  LlmAskRequest,
  RecommendSceneRequest,
  CutRecord,
  SceneRecord,
  SceneRecommendation,
  StatusRecord,
  UpdateCutContextRequest,
  UpdateCutFavoriteRequest,
  UpdateCutImageRequest,
  UpdateCutLinksRequest,
  UpdateSceneFirstCutRequest,
  UpsertResponse,
} from './type';

export { API_URL };

export const dbTables = {
  Cut: {
    label: '컷',
    columns: {
      id: { label: 'ID', type: 'id' },
      image_id: { label: 'Image ID', type: 'int' },
      scene_id: { label: 'Scene', type: 'fk', targetTable: 'Scene' },
      prev_cut_id: { label: '이전 컷', type: 'fk', targetTable: 'Cut' },
      image_url: { label: '이미지 URL', type: 'text' },
      scribble_url: { label: 'Scribble URL', type: 'text' },
      pose_url: { label: 'Pose URL', type: 'text' },
      favorited: { label: '즐겨찾기', type: 'bool' },
      script: { label: '스크립트', type: 'text' },
      status_change: { label: '상태 변화', type: 'dict-list' },
      prompt_situation: { label: '상황 프롬프트', type: 'text' },
      prompt_hero: { label: '주인공 프롬프트', type: 'text' },
      prompt_detail: { label: '디테일 프롬프트', type: 'text' },
      prompt_camera: { label: '카메라 프롬프트', type: 'text' },
      prompt_negative: { label: 'Negative 프롬프트', type: 'text' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<CutRecord>>('post', '/cut/list', listRequest),
    upsertRow: (items: unknown) => request<UpsertResponse[]>('post', '/cut/upsert', items),
    generateCut: (item: FormData) =>
      request<CutRecord>('post', '/cut/generate', item),
    similarCuts: (text: string) =>
      request<CutRecord[]>('post', '/cut/similar', { text }),
    updateContext: (item: UpdateCutContextRequest) =>
      request<StatusRecord>('post', '/cut/update-context', item),
    updateImage: (item: UpdateCutImageRequest) =>
      request<CutRecord>('post', '/cut/update-image', item),
    updateFavorite: (item: UpdateCutFavoriteRequest) =>
      request<CutRecord>('post', '/cut/update-favorite', item),
    updateLinks: (item: UpdateCutLinksRequest) =>
      request<CutRecord>('post', '/cut/update-links', item),
    deleteRows: (ids: number[]) => request<null>('delete', '/cut/', ids).then(() => undefined),
  },

  Scene: {
    label: '씬',
    columns: {
      id: { label: 'ID', type: 'id' },
      title: { label: '제목', type: 'text', required: true },
      context: { label: '컨텍스트', type: 'text', required: true },
      turn: { label: '턴', type: 'int', required: true },
      cash: { label: '현금', type: 'int', required: true },
      strength: { label: '힘', type: 'int', required: true },
      agility: { label: '민첩', type: 'int', required: true },
      intelligence: { label: '지력', type: 'int', required: true },
      sense: { label: '센스', type: 'int', required: true },
      attractiveness: { label: '매력', type: 'int', required: true },
      toughness: { label: '근성', type: 'int', required: true },
      stress: { label: '스트레스', type: 'int', required: true },
      first_cut_id: { label: '첫 컷', type: 'fk', targetTable: 'Cut' },
    },
    listRows: (listRequest: GetListRequest) =>
      request<GetListResponse<SceneRecord>>('post', '/scene/list', listRequest),
    upsertRow: (items: SceneRecord[]) => request<UpsertResponse[]>('post', '/scene/upsert', items),
    updateFirstCut: (item: UpdateSceneFirstCutRequest) =>
      request<SceneRecord>('post', '/scene/update-first-cut', item),
    recommend: (item: RecommendSceneRequest) =>
      request<SceneRecommendation>('post', '/scene/recommend', item),
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

  Status: {
    label: '상태',
    columns: {
      id: { label: 'ID', type: 'id' },
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
    generateImageBlob: (item: GenerateImageRequest) =>
      requestResponse<Blob>('post', '/image-util/generate-image', item, { responseType: 'blob', fallbackMessage: '이미지 생성에 실패했습니다.' }),
    postprocessImage: (formData: FormData) =>
      request<Blob>('post', '/image-util/postprocess', formData, { responseType: 'blob', fallbackMessage: '이미지 후처리에 실패했습니다.' }),
  },
  LlmUtil: {
    ask: (item: LlmAskRequest) => request<string>('post', '/llm-util/ask', item, { responseType: 'text' }),
  },
};
