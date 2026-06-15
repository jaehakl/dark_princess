import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbTables } from '../../api/api';
import { useSceneStore } from '../../api/store';
import type {
  GenerateSceneRequest,
  GetListRequest,
  ImageGenerationSettings,
  PromptColumnName,
  RecommendPromptColumns,
  SceneRecord,
} from '../../api/type';
import {
  createNoiseSeedImage,
  createSeedImageFromUrl,
  IMAGE_SAMPLER_OPTIONS,
  IMAGE_SCHEDULER_OPTIONS,
  IMAGE_SETTINGS_SESSION_KEY,
  imageSettingsToDraft,
  readSessionImageSettings,
} from '../../lib/scene-image';
import type { ImageGenerationSettingsDraft, SeedImageSource, SeedImageState } from '../../lib/scene-image';

const PROMPT_COLUMNS = [
  { key: 'background', label: '배경' },
  { key: 'subject', label: '인물' },
  { key: 'object', label: '대상' },
  { key: 'action', label: '행동' },
  { key: 'detail', label: '디테일' },
] as const;

const EMPTY_PROMPT_DRAFT: Record<PromptColumnName, string> = {
  background: '',
  subject: '',
  object: '',
  action: '',
  detail: '',
};

const EMPTY_RECOMMENDATIONS: RecommendPromptColumns = {
  background: [],
  subject: [],
  object: [],
  action: [],
  detail: [],
};

const DEFAULT_STATUS_CHANGE: Record<string, number> = { turn: 1 };

const FETCH_SCENE_BY_ID_REQUEST: GetListRequest = {
  offset: 0,
  limit: 1,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: null,
};

type SaveMode =
  | 'existing-text'
  | 'existing-image'
  | 'new-image';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function sceneToPromptDraft(scene: SceneRecord): Record<PromptColumnName, string> {
  return {
    background: scene.background ?? '',
    subject: scene.subject ?? '',
    object: scene.object ?? '',
    action: scene.action ?? '',
    detail: scene.detail ?? scene.prompt ?? '',
  };
}

function normalizeStatusChange(statusChange: Record<string, unknown> | undefined) {
  return statusChange && Object.keys(statusChange).length > 0
    ? statusChange
    : { ...DEFAULT_STATUS_CHANGE };
}

export function SceneWizardPage() {
  const selectedScene = useSceneStore((state) => state.selectedScene);
  const handleSceneDeleted = useSceneStore((state) => state.handleSceneDeleted);
  const lastAppliedSelectedSceneRef = useRef<SceneRecord | null>(selectedScene);
  const [activeScene, setActiveScene] = useState<SceneRecord | null>(null);
  const [isFreshDraft, setIsFreshDraft] = useState(true);
  const [promptDraft, setPromptDraft] = useState<Record<PromptColumnName, string>>({
    ...EMPTY_PROMPT_DRAFT,
  });
  const [translationDraft, setTranslationDraft] = useState<Record<PromptColumnName, string>>({
    ...EMPTY_PROMPT_DRAFT,
  });
  const [script, setScript] = useState('');
  const [statusChange, setStatusChange] = useState<Record<string, unknown>>({
    ...DEFAULT_STATUS_CHANGE,
  });
  const [recommendations, setRecommendations] = useState<RecommendPromptColumns>({
    ...EMPTY_RECOMMENDATIONS,
  });
  const [seedImage, setSeedImage] = useState<SeedImageState | null>(null);
  const [isPreparingSeedImage, setIsPreparingSeedImage] = useState(false);
  const [seedImageError, setSeedImageError] = useState<string | null>(null);
  const [imageSettingsDefaults, setImageSettingsDefaults] = useState<ImageGenerationSettings | null>(null);
  const [imageSettings, setImageSettings] = useState<ImageGenerationSettings | null>(null);
  const [imageSettingsDraft, setImageSettingsDraft] = useState<ImageGenerationSettingsDraft | null>(null);
  const [strengthControlValue, setStrengthControlValue] = useState('');
  const [isImageSettingsOpen, setIsImageSettingsOpen] = useState(false);
  const [imageSettingsError, setImageSettingsError] = useState<string | null>(null);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isTranslatingPromptColumns, setIsTranslatingPromptColumns] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSceneId = activeScene?.id ?? null;
  const composedPrompt = useMemo(
    () =>
      PROMPT_COLUMNS
        .map((column) => promptDraft[column.key].trim())
        .filter(Boolean)
        .join(', '),
    [promptDraft],
  );
  const isBusy = isRecommending || isTranslatingPromptColumns || isDeleting || Boolean(savingMode);
  const canEdit = Boolean(activeScene || isFreshDraft);
  const canSaveText = canEdit && composedPrompt.length > 0 && !isBusy;
  const canDelete = Boolean(activeSceneId) && !isBusy;
  const canSaveExisting = canSaveText && Boolean(activeSceneId);
  const canSaveImage = canSaveText && Boolean(seedImage) && !isPreparingSeedImage && Boolean(imageSettings);
  const canSaveExistingImage = canSaveImage && Boolean(activeSceneId);
  const canRefreshRecommendations =
    canEdit && script.trim().length > 0 && !isRecommending && !isTranslatingPromptColumns && !savingMode;
  const canTranslatePromptColumns =
    canEdit && !isBusy && PROMPT_COLUMNS.some((column) => translationDraft[column.key].trim().length > 0);
  const imageWidth = imageSettings?.width;
  const imageHeight = imageSettings?.height;
  const selectedLabel = activeSceneId
    ? `Scene #${activeSceneId}`
    : isFreshDraft
      ? '새 Scene 생성'
      : '선택 없음';

  const applySeedImage = useCallback((blob: Blob, source: SeedImageSource) => {
    setSeedImage({
      blob,
      previewUrl: URL.createObjectURL(blob),
      source,
    });
  }, []);

  const selectExistingScene = useCallback((scene: SceneRecord) => {
    setActiveScene(scene);
    setIsFreshDraft(false);
    setPromptDraft(sceneToPromptDraft(scene));
    setTranslationDraft({ ...EMPTY_PROMPT_DRAFT });
    setScript(scene.script ?? '');
    setStatusChange(normalizeStatusChange(scene.status_change));
    setRecommendations({ ...EMPTY_RECOMMENDATIONS });
    setError(null);
    setSeedImageError(null);
  }, []);

  useEffect(() => () => {
    if (seedImage?.previewUrl) {
      URL.revokeObjectURL(seedImage.previewUrl);
    }
  }, [seedImage?.previewUrl]);

  useEffect(() => {
    let isCancelled = false;

    async function loadImageSettingsDefaults() {
      try {
        const defaults = await dbTables.ImageUtil.getImageSettingsDefaults();
        if (isCancelled) {
          return;
        }

        const settingsFromSession = readSessionImageSettings(defaults);
        setImageSettingsDefaults(defaults);
        setImageSettings(settingsFromSession);
        setImageSettingsDraft(imageSettingsToDraft(settingsFromSession));
        setStrengthControlValue(String(settingsFromSession.strength));
      } catch (settingsError) {
        if (!isCancelled) {
          setError(getErrorMessage(settingsError));
        }
      }
    }

    void loadImageSettingsDefaults();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canEdit || imageWidth === undefined || imageHeight === undefined) {
      return;
    }

    const resolvedImageWidth = imageWidth;
    const resolvedImageHeight = imageHeight;
    let isCancelled = false;
    async function prepareSeedImage() {
      setIsPreparingSeedImage(true);
      setSeedImageError(null);
      try {
        const blob = activeScene?.image_url
          ? await createSeedImageFromUrl(
            activeScene.image_url,
            resolvedImageWidth,
            resolvedImageHeight,
          )
          : await createNoiseSeedImage(resolvedImageWidth, resolvedImageHeight);
        if (!isCancelled) {
          applySeedImage(blob, activeScene?.image_url ? 'existing' : 'noise');
        }
      } catch (seedError) {
        if (!isCancelled) {
          setSeedImage(null);
          setSeedImageError(getErrorMessage(seedError));
        }
      } finally {
        if (!isCancelled) {
          setIsPreparingSeedImage(false);
        }
      }
    }

    void prepareSeedImage();
    return () => {
      isCancelled = true;
    };
  }, [
    activeScene?.id,
    activeScene?.image_url,
    applySeedImage,
    canEdit,
    imageHeight,
    imageWidth,
  ]);

  useEffect(() => {
    if (
      !selectedScene?.id ||
      selectedScene === lastAppliedSelectedSceneRef.current ||
      selectedScene.id === activeSceneId
    ) {
      return;
    }

    lastAppliedSelectedSceneRef.current = selectedScene;
    selectExistingScene(selectedScene);
  }, [activeSceneId, selectExistingScene, selectedScene]);

  async function refreshRecommendationsFromScript() {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      setError('장면 스크립트를 입력해 주세요.');
      return;
    }

    setIsRecommending(true);
    setError(null);
    try {
      setRecommendations(await dbTables.ImageUtil.recommendPromptColumns(trimmedScript));
    } catch (recommendError) {
      setRecommendations({ ...EMPTY_RECOMMENDATIONS });
      setError(getErrorMessage(recommendError));
    } finally {
      setIsRecommending(false);
    }
  }

  function startFreshScene() {
    setActiveScene(null);
    setIsFreshDraft(true);
    setSeedImage(null);
    setPromptDraft({ ...EMPTY_PROMPT_DRAFT });
    setTranslationDraft({ ...EMPTY_PROMPT_DRAFT });
    setScript('');
    setStatusChange({ ...DEFAULT_STATUS_CHANGE });
    setRecommendations({ ...EMPTY_RECOMMENDATIONS });
    setError(null);
    setSeedImageError(null);
  }

  function appendRecommendation(column: PromptColumnName, tag: string) {
    setPromptDraft((current) => {
      const values = current[column]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (values.includes(tag)) {
        return current;
      }
      return {
        ...current,
        [column]: [...values, tag].join(', '),
      };
    });
  }

  async function translatePromptColumns() {
    const targets = PROMPT_COLUMNS
      .map((column) => ({
        key: column.key,
        text: translationDraft[column.key].trim(),
      }))
      .filter((target) => target.text.length > 0);

    if (targets.length === 0) {
      setError('번역할 한국어 텍스트를 입력해 주세요.');
      return;
    }

    setIsTranslatingPromptColumns(true);
    setError(null);
    try {
      const translatedTexts = await dbTables.ImageUtil.translateCommaTexts(
        targets.map((target) => target.text),
      );
      if (translatedTexts.length !== targets.length) {
        throw new Error('번역 결과 개수를 확인할 수 없습니다.');
      }

      const translatedByColumn = targets
        .map((target, index) => ({
          key: target.key,
          text: translatedTexts[index]?.trim() ?? '',
        }))
        .filter((item) => item.text.length > 0);
      if (translatedByColumn.length === 0) {
        throw new Error('번역된 텍스트가 없습니다.');
      }

      setPromptDraft((current) => {
        const next = { ...current };
        for (const item of translatedByColumn) {
          const currentText = next[item.key].trim();
          next[item.key] = currentText ? `${currentText}, ${item.text}` : item.text;
        }
        return next;
      });
      setTranslationDraft((current) => {
        const next = { ...current };
        for (const item of translatedByColumn) {
          next[item.key] = '';
        }
        return next;
      });
    } catch (translateError) {
      setError(getErrorMessage(translateError));
    } finally {
      setIsTranslatingPromptColumns(false);
    }
  }

  async function shuffleSeedImage() {
    if (!imageSettings) {
      setSeedImageError('이미지 설정 기본값을 불러오는 중입니다.');
      return;
    }

    setIsPreparingSeedImage(true);
    setSeedImageError(null);
    try {
      applySeedImage(
        await createNoiseSeedImage(imageSettings.width, imageSettings.height),
        'noise',
      );
    } catch (seedError) {
      setSeedImageError(getErrorMessage(seedError));
    } finally {
      setIsPreparingSeedImage(false);
    }
  }

  function updateImageSettingsDraft(field: keyof ImageGenerationSettingsDraft, value: string) {
    setImageSettingsDraft((currentDraft) => (
      currentDraft ? { ...currentDraft, [field]: value } : currentDraft
    ));
  }

  function updateImageStrength(value: string) {
    setStrengthControlValue(value);
    if (!imageSettings) {
      return;
    }

    const strength = Number(value);
    if (!Number.isFinite(strength) || strength <= 0 || strength > 1) {
      setSeedImageError('strength는 0보다 크고 1 이하인 숫자로 입력해 주세요.');
      return;
    }

    const nextImageSettings = { ...imageSettings, strength };
    setImageSettings(nextImageSettings);
    setImageSettingsDraft(imageSettingsToDraft(nextImageSettings));
    sessionStorage.setItem(IMAGE_SETTINGS_SESSION_KEY, JSON.stringify(nextImageSettings));
    setSeedImageError(null);
  }

  function openImageSettings() {
    if (!imageSettings) {
      setError('이미지 설정 기본값을 불러오는 중입니다.');
      return;
    }

    setImageSettingsDraft(imageSettingsToDraft(imageSettings));
    setImageSettingsError(null);
    setIsImageSettingsOpen(true);
  }

  function resetImageSettingsToDefaults() {
    if (!imageSettingsDefaults) {
      setImageSettingsError('이미지 설정 기본값을 불러오지 못했습니다.');
      return;
    }

    setImageSettings(imageSettingsDefaults);
    setImageSettingsDraft(imageSettingsToDraft(imageSettingsDefaults));
    setStrengthControlValue(String(imageSettingsDefaults.strength));
    sessionStorage.setItem(IMAGE_SETTINGS_SESSION_KEY, JSON.stringify(imageSettingsDefaults));
    setImageSettingsError(null);
  }

  function applyImageSettings() {
    if (!imageSettingsDraft) {
      return;
    }

    const steps = Number(imageSettingsDraft.steps);
    const cfg = Number(imageSettingsDraft.cfg);
    const strength = Number(imageSettingsDraft.strength);
    const height = Number(imageSettingsDraft.height);
    const width = Number(imageSettingsDraft.width);
    const clipSkip = imageSettingsDraft.clip_skip.trim() === ''
      ? null
      : Number(imageSettingsDraft.clip_skip);
    const sampler = imageSettingsDraft.sampler.trim().toLowerCase();
    const scheduler = imageSettingsDraft.scheduler.trim().toLowerCase();

    if (!Number.isInteger(steps) || steps < 1) {
      setImageSettingsError('steps는 1 이상의 정수로 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(cfg) || cfg <= 0) {
      setImageSettingsError('cfg는 0보다 큰 숫자로 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(strength) || strength <= 0 || strength > 1) {
      setImageSettingsError('strength는 0보다 크고 1 이하인 숫자로 입력해 주세요.');
      return;
    }
    if (!Number.isInteger(height) || height <= 0 || height % 8 !== 0) {
      setImageSettingsError('height는 8의 배수인 양의 정수로 입력해 주세요.');
      return;
    }
    if (!Number.isInteger(width) || width <= 0 || width % 8 !== 0) {
      setImageSettingsError('width는 8의 배수인 양의 정수로 입력해 주세요.');
      return;
    }
    if (clipSkip !== null && (!Number.isInteger(clipSkip) || clipSkip < 1)) {
      setImageSettingsError('clip skip은 비우거나 1 이상의 정수로 입력해 주세요.');
      return;
    }
    if (!IMAGE_SAMPLER_OPTIONS.includes(sampler as (typeof IMAGE_SAMPLER_OPTIONS)[number])) {
      setImageSettingsError('지원하지 않는 sampler입니다.');
      return;
    }
    if (!IMAGE_SCHEDULER_OPTIONS.includes(scheduler as (typeof IMAGE_SCHEDULER_OPTIONS)[number])) {
      setImageSettingsError('지원하지 않는 scheduler입니다.');
      return;
    }

    const nextImageSettings = {
      positive_base: imageSettingsDraft.positive_base.trim(),
      negative_prompt: imageSettingsDraft.negative_prompt.trim(),
      steps,
      cfg,
      strength,
      sampler,
      scheduler,
      clip_skip: clipSkip,
      height,
      width,
    };
    setImageSettings(nextImageSettings);
    setImageSettingsDraft(imageSettingsToDraft(nextImageSettings));
    setStrengthControlValue(String(nextImageSettings.strength));
    sessionStorage.setItem(IMAGE_SETTINGS_SESSION_KEY, JSON.stringify(nextImageSettings));
    setImageSettingsError(null);
    setIsImageSettingsOpen(false);
  }

  async function saveScene(mode: SaveMode) {
    const isNewSave = mode.startsWith('new');
    const isImageSave = mode.endsWith('image');
    const targetSceneId = isNewSave ? null : activeSceneId;
    const trimmedPrompt = composedPrompt.trim();

    if (!trimmedPrompt) {
      setError('프롬프트 항목을 하나 이상 입력해 주세요.');
      return;
    }
    if (!isNewSave && !targetSceneId) {
      setError('기존 데이터에 저장할 Scene ID가 없습니다.');
      return;
    }

    setSavingMode(mode);
    setError(null);
    try {
      const sceneColumns = {
        background: promptDraft.background.trim() || null,
        subject: promptDraft.subject.trim() || null,
        object: promptDraft.object.trim() || null,
        action: promptDraft.action.trim() || null,
        detail: promptDraft.detail.trim() || null,
      };

      if (isImageSave) {
        if (!seedImage) {
          throw new Error(seedImageError ?? 'seed image를 준비해 주세요.');
        }

        const payload: GenerateSceneRequest = {
          scene_id: targetSceneId,
          prompt: trimmedPrompt,
          script,
          status_change: statusChange,
          generate_image: true,
          image_settings: imageSettings,
          ...sceneColumns,
        };
        const formData = new FormData();
        formData.append('payload', JSON.stringify(payload));
        formData.append('seed_image', seedImage.blob, `scene-wizard-seed-${seedImage.source}.png`);
        const savedScene = await dbTables.Scene.generateScene(formData);
        setActiveScene(savedScene);
        setIsFreshDraft(false);
        setPromptDraft(sceneToPromptDraft(savedScene));
        setScript(savedScene.script ?? '');
        setStatusChange(normalizeStatusChange(savedScene.status_change));
        return;
      }

      const row: SceneRecord = {
        ...(targetSceneId ? { id: targetSceneId } : {}),
        prompt: trimmedPrompt,
        image_url: activeScene?.image_url ?? null,
        script,
        status_change: statusChange,
        ...sceneColumns,
      };
      const response = await dbTables.Scene.upsertRow([row]);
      const savedSceneId = response[0]?.id;
      if (!savedSceneId) {
        throw new Error('Scene 저장 결과를 확인할 수 없습니다.');
      }

      const sceneResponse = await dbTables.Scene.listRows({
        ...FETCH_SCENE_BY_ID_REQUEST,
        selected_ids: [savedSceneId],
      });
      const savedScene = sceneResponse.items[0] ?? { ...row, id: savedSceneId };
      setActiveScene(savedScene);
      setIsFreshDraft(false);
      setPromptDraft(sceneToPromptDraft(savedScene));
      setScript(savedScene.script ?? '');
      setStatusChange(normalizeStatusChange(savedScene.status_change));
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSavingMode(null);
    }
  }

  async function deleteScene() {
    if (!activeSceneId) {
      return;
    }

    const shouldDelete = window.confirm(
      `Scene #${activeSceneId}을 삭제할까요? 연결된 옵션도 함께 삭제됩니다.`,
    );
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await dbTables.Scene.deleteRows([activeSceneId]);
      handleSceneDeleted(activeSceneId);
      startFreshScene();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="relative left-1/2 w-[min(1840px,calc(100vw-36px))] -translate-x-1/2 space-y-5">
      <div className="flex flex-col gap-2 px-1">
        <p className="vn-subtitle">Scene wizard</p>
        <h1 className="vn-title">Scene Wizard</h1>
      </div>

      <section className="vn-panel min-h-[calc(100vh-10rem)]">
        <div className="vn-panel-header">
          <div className="min-w-0">
            <p className="vn-subtitle">Scene edit</p>
            <h2 className="truncate text-base font-semibold text-[#fff7ef]">{selectedLabel}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="vn-button px-3 py-2 text-xs"
              onClick={startFreshScene}
              disabled={isBusy}
            >
              새 Scene 생성
            </button>
            <button
              type="button"
              className="vn-button px-3 py-2 text-xs"
              onClick={openImageSettings}
              disabled={!imageSettings || isBusy}
            >
              이미지 설정
            </button>
          </div>
        </div>

        <div className="vn-section-body">
          <div className="space-y-4">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.44fr)] xl:items-start">
                  <div className="min-w-0 space-y-4">
                    <label className="block space-y-2">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="edit-label">
                          <span className="edit-label__text">장면 스크립트</span>
                        </span>
                        <button
                          type="button"
                          className="vn-button inline-flex items-center gap-2 px-3 py-2 text-xs"
                          onClick={() => void refreshRecommendationsFromScript()}
                          disabled={!canRefreshRecommendations}
                        >
                          {isRecommending ? <span className="vn-spinner" aria-hidden="true" /> : null}
                          {isRecommending ? '추천 갱신 중' : '스크립트 기반 추천 갱신'}
                        </button>
                      </span>
                      <textarea
                        value={script}
                        onChange={(event) => setScript(event.target.value)}
                        className="edit-control min-h-44 w-full resize-y px-3 py-2 text-sm leading-6"
                        disabled={Boolean(savingMode)}
                      />
                    </label>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[#fff7ef]">프롬프트 항목</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--app-muted)]">
                            추천 태그는 눌러서 추가
                          </span>
                          <button
                            type="button"
                            className="vn-button inline-flex items-center gap-2 px-3 py-2 text-xs"
                            onClick={() => void translatePromptColumns()}
                            disabled={!canTranslatePromptColumns}
                          >
                            {isTranslatingPromptColumns ? <span className="vn-spinner" aria-hidden="true" /> : null}
                            {isTranslatingPromptColumns ? '번역 중' : '번역하여 추가'}
                          </button>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[rgba(12,5,18,0.46)]">
                        {PROMPT_COLUMNS.map((column) => (
                          <div
                            key={column.key}
                            className="grid gap-2 border-b border-[rgba(255,208,222,0.16)] p-2 last:border-b-0 md:grid-cols-[5.5rem_minmax(0,1fr)] md:items-start"
                          >
                            <div className="pt-2">
                              <span className="edit-label">
                                <span className="edit-label__text">{column.label}</span>
                              </span>
                            </div>
                            <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                              <label className="block min-w-0">
                                <span className="sr-only">{column.label}</span>
                                <textarea
                                  rows={1}
                                  value={promptDraft[column.key]}
                                  onChange={(event) =>
                                    setPromptDraft((current) => ({
                                      ...current,
                                      [column.key]: event.target.value,
                                    }))
                                  }
                                  className="edit-control min-h-10 w-full resize-y px-3 py-2 text-sm"
                                  disabled={Boolean(savingMode) || isTranslatingPromptColumns}
                                />
                              </label>
                              <label className="block min-w-0">
                                <span className="sr-only">{column.label} 한국어 번역 입력</span>
                                <textarea
                                  rows={1}
                                  value={translationDraft[column.key]}
                                  onChange={(event) =>
                                    setTranslationDraft((current) => ({
                                      ...current,
                                      [column.key]: event.target.value,
                                    }))
                                  }
                                  className="edit-control min-h-10 w-full resize-y px-3 py-2 text-sm"
                                  placeholder="한국어, 콤마 구분"
                                  disabled={Boolean(savingMode) || isTranslatingPromptColumns}
                                />
                              </label>
                            </div>
                            <div className="flex min-w-0 flex-wrap gap-1.5 md:col-start-2">
                              {recommendations[column.key].slice(0, 12).map((tag) => (
                                <button
                                  key={`${column.key}-${tag}`}
                                  type="button"
                                  className="vn-button px-2 py-1 text-xs"
                                  onClick={() => appendRecommendation(column.key, tag)}
                                  disabled={Boolean(savingMode) || isTranslatingPromptColumns}
                                >
                                  {tag}
                                </button>
                              ))}
                              {recommendations[column.key].length === 0 ? (
                                <span className="px-1 py-2 text-xs font-semibold text-[var(--app-muted)]">
                                  추천 없음
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <aside className="min-w-0 space-y-3">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <span className="edit-label">
                        <span className="edit-label__text">SEED 이미지</span>
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {seedImage ? (
                          <span className="truncate text-xs font-semibold text-[var(--app-muted)]">
                            {seedImage.source === 'existing' ? 'existing seed' : 'noise seed'}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="vn-button px-2.5 py-1 text-xs"
                          onClick={() => void shuffleSeedImage()}
                          disabled={Boolean(savingMode) || isPreparingSeedImage || !imageSettings}
                        >
                          shuffle
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--app-muted)]">
                          <span>strength</span>
                          <input
                            type="number"
                            min="0.01"
                            max="1"
                            step="0.01"
                            value={strengthControlValue}
                            onChange={(event) => updateImageStrength(event.target.value)}
                            className="edit-control h-8 w-24 px-2 text-right text-xs"
                            disabled={Boolean(savingMode) || !imageSettings}
                          />
                        </label>

                        <div className="dp-image-frame vn-scene-editor-image-frame vn-scene-wizard-image-frame">
                          {seedImage ? (
                            <img src={seedImage.previewUrl} alt={composedPrompt || 'Seed image'} className="dp-image-media" />
                          ) : isPreparingSeedImage ? (
                            <div className="vn-scene-empty">
                              <span className="vn-spinner" aria-hidden="true" />
                              <span>seed 준비 중</span>
                            </div>
                          ) : (
                            <div className="vn-scene-empty">seed image가 없습니다.</div>
                          )}
                          {isPreparingSeedImage && seedImage ? (
                            <div className="vn-scene-seed-overlay">
                              <span className="vn-spinner" aria-hidden="true" />
                              <span>seed 준비 중</span>
                            </div>
                          ) : null}
                          {savingMode?.endsWith('image') && seedImage ? (
                            <div className="vn-scene-seed-overlay">
                              <span className="vn-spinner" aria-hidden="true" />
                              <span>이미지 생성 중</span>
                            </div>
                          ) : null}
                        </div>

                        {seedImageError ? (
                          <p className="text-sm font-semibold text-[#ff9ab8]">{seedImageError}</p>
                        ) : null}
                      </div>
                    </div>
                  </aside>
                </div>
                {/*
                  Keep the save buttons below both columns so narrow screens preserve
                  script -> prompt -> seed -> save order.
                */}
                {error ? (
                  <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
                ) : null}

                <div className="vn-modal-footer">
                  <div className="flex flex-wrap gap-2">
                    {activeSceneId ? (
                      <button
                        type="button"
                        className="vn-danger-button inline-flex items-center gap-2 px-3 py-2 text-xs"
                        onClick={() => void deleteScene()}
                        disabled={!canDelete}
                      >
                        {isDeleting ? <span className="vn-spinner" aria-hidden="true" /> : null}
                        {isDeleting ? '삭제 중' : 'Scene 삭제'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="vn-button inline-flex items-center gap-2 px-3 py-2 text-xs"
                      onClick={() => void saveScene('existing-text')}
                      disabled={!canSaveExisting}
                    >
                      {savingMode === 'existing-text' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                      기존 데이터에 텍스트 저장
                    </button>
                    <button
                      type="button"
                      className="vn-button inline-flex items-center gap-2 px-3 py-2 text-xs"
                      onClick={() => void saveScene('existing-image')}
                      disabled={!canSaveExistingImage}
                    >
                      {savingMode === 'existing-image' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                      기존 데이터 이미지 생성 저장
                    </button>
                  </div>
                  <div className="vn-modal-footer-actions">
                    <button
                      type="button"
                      className="vn-button vn-button-primary inline-flex items-center gap-2 px-3 py-2 text-xs"
                      onClick={() => void saveScene('new-image')}
                      disabled={!canSaveImage}
                    >
                      {savingMode === 'new-image' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                      새 데이터 이미지 생성 저장
                    </button>
                  </div>
                </div>
          </div>
        </div>
      </section>

      {isImageSettingsOpen && imageSettingsDraft ? (
        <div className="vn-modal-backdrop" role="presentation">
          <section
            className="vn-panel vn-image-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wizard-image-settings-title"
          >
            <div className="vn-panel-header">
              <div className="min-w-0">
                <p className="vn-subtitle">Image generation</p>
                <h3
                  id="wizard-image-settings-title"
                  className="truncate text-base font-semibold text-[#fff7ef]"
                >
                  이미지 설정
                </h3>
              </div>
              <button
                type="button"
                className="vn-danger-button px-3 py-2 text-xs"
                onClick={() => setIsImageSettingsOpen(false)}
              >
                닫기
              </button>
            </div>

            <div className="vn-section-body vn-image-settings-body">
              <label className="vn-image-settings-field vn-image-settings-wide">
                <span className="edit-label">
                  <span className="edit-label__text">positive base</span>
                </span>
                <textarea
                  value={imageSettingsDraft.positive_base}
                  onChange={(event) => updateImageSettingsDraft('positive_base', event.target.value)}
                  className="edit-control min-h-20 w-full resize-y px-3 py-2 text-sm"
                />
              </label>

              <label className="vn-image-settings-field vn-image-settings-wide">
                <span className="edit-label">
                  <span className="edit-label__text">negative prompt</span>
                </span>
                <textarea
                  value={imageSettingsDraft.negative_prompt}
                  onChange={(event) => updateImageSettingsDraft('negative_prompt', event.target.value)}
                  className="edit-control min-h-24 w-full resize-y px-3 py-2 text-sm"
                />
              </label>

              <div className="vn-image-settings-grid">
                <label className="vn-image-settings-field">
                  <span className="edit-label">
                    <span className="edit-label__text">steps</span>
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={imageSettingsDraft.steps}
                    onChange={(event) => updateImageSettingsDraft('steps', event.target.value)}
                    className="edit-control h-10 w-full px-3 text-right text-sm"
                  />
                </label>

                <label className="vn-image-settings-field">
                  <span className="edit-label">
                    <span className="edit-label__text">cfg</span>
                  </span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={imageSettingsDraft.cfg}
                    onChange={(event) => updateImageSettingsDraft('cfg', event.target.value)}
                    className="edit-control h-10 w-full px-3 text-right text-sm"
                  />
                </label>

                <label className="vn-image-settings-field">
                  <span className="edit-label">
                    <span className="edit-label__text">sampler</span>
                  </span>
                  <select
                    value={imageSettingsDraft.sampler}
                    onChange={(event) => updateImageSettingsDraft('sampler', event.target.value)}
                    className="edit-control h-10 w-full px-3 text-sm"
                  >
                    <option value="">default</option>
                    <option value="euler">euler</option>
                    <option value="euler_a">euler_a</option>
                    <option value="dpmpp_2m">dpmpp_2m</option>
                    <option value="unipc">unipc</option>
                  </select>
                </label>

                <label className="vn-image-settings-field">
                  <span className="edit-label">
                    <span className="edit-label__text">scheduler</span>
                  </span>
                  <select
                    value={imageSettingsDraft.scheduler}
                    onChange={(event) => updateImageSettingsDraft('scheduler', event.target.value)}
                    className="edit-control h-10 w-full px-3 text-sm"
                  >
                    <option value="">default</option>
                    <option value="karras">karras</option>
                  </select>
                </label>

                <label className="vn-image-settings-field">
                  <span className="edit-label">
                    <span className="edit-label__text">clip skip</span>
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={imageSettingsDraft.clip_skip}
                    onChange={(event) => updateImageSettingsDraft('clip_skip', event.target.value)}
                    className="edit-control h-10 w-full px-3 text-right text-sm"
                  />
                </label>

                <label className="vn-image-settings-field">
                  <span className="edit-label">
                    <span className="edit-label__text">height</span>
                  </span>
                  <input
                    type="number"
                    min="8"
                    step="8"
                    value={imageSettingsDraft.height}
                    onChange={(event) => updateImageSettingsDraft('height', event.target.value)}
                    className="edit-control h-10 w-full px-3 text-right text-sm"
                  />
                </label>

                <label className="vn-image-settings-field">
                  <span className="edit-label">
                    <span className="edit-label__text">width</span>
                  </span>
                  <input
                    type="number"
                    min="8"
                    step="8"
                    value={imageSettingsDraft.width}
                    onChange={(event) => updateImageSettingsDraft('width', event.target.value)}
                    className="edit-control h-10 w-full px-3 text-right text-sm"
                  />
                </label>
              </div>

              {imageSettingsError ? (
                <p className="text-sm font-semibold text-[#ff9ab8]">{imageSettingsError}</p>
              ) : null}

              <div className="vn-modal-footer">
                <button
                  type="button"
                  className="vn-button px-4 py-2 text-sm"
                  onClick={resetImageSettingsToDefaults}
                >
                  기본값으로 초기화
                </button>
                <div className="vn-modal-footer-actions">
                  <button
                    type="button"
                    className="vn-button px-4 py-2 text-sm"
                    onClick={() => setIsImageSettingsOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="vn-button vn-button-primary px-4 py-2 text-sm"
                    onClick={applyImageSettings}
                  >
                    적용
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
