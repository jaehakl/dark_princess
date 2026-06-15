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
import {
  Button,
  FieldLabel,
  FormControl,
  ImageFrame,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
} from '../../components/ui';

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
        <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene wizard</p>
        <h1 className="text-[clamp(1.25rem,2vw,2.2rem)] leading-[1.05] font-extrabold tracking-[0.02em] text-[#fff7ef] [text-shadow:0_0_22px_rgba(255,194,211,0.42),0_2px_12px_rgba(0,0,0,0.58)]">Scene Wizard</h1>
      </div>

      <Panel className="min-h-[calc(100vh-10rem)]">
        <PanelHeader>
          <div className="min-w-0">
            <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene edit</p>
            <h2 className="truncate text-base font-semibold text-[#fff7ef]">{selectedLabel}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="px-3 py-2 text-xs" onClick={startFreshScene} disabled={isBusy}>
              새 Scene 생성
            </Button>
            <Button className="px-3 py-2 text-xs" onClick={openImageSettings} disabled={!imageSettings || isBusy}>
              이미지 설정
            </Button>
          </div>
        </PanelHeader>

        <SectionBody>
          <div className="space-y-4">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.44fr)] xl:items-start">
              <div className="min-w-0 space-y-4">
                <div className="block space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldLabel>장면 스크립트</FieldLabel>
                    <Button
                      className="inline-flex items-center gap-2 px-3 py-2 text-xs"
                      onClick={() => void refreshRecommendationsFromScript()}
                      disabled={!canRefreshRecommendations}
                    >
                      {isRecommending ? <Spinner aria-hidden="true" /> : null}
                      {isRecommending ? '추천 갱신 중' : '스크립트 기반 추천 갱신'}
                    </Button>
                  </div>
                  <FormControl
                    as="textarea"
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    className="min-h-44 w-full resize-y px-3 py-2 text-sm leading-6"
                    disabled={Boolean(savingMode)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#fff7ef]">프롬프트 항목</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--app-muted)]">
                        추천 태그는 눌러서 추가
                      </span>
                      <Button
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs"
                        onClick={() => void translatePromptColumns()}
                        disabled={!canTranslatePromptColumns}
                      >
                        {isTranslatingPromptColumns ? <Spinner aria-hidden="true" /> : null}
                        {isTranslatingPromptColumns ? '번역 중' : '번역하여 추가'}
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[rgba(12,5,18,0.46)]">
                    {PROMPT_COLUMNS.map((column) => (
                      <div
                        key={column.key}
                        className="grid gap-2 border-b border-[rgba(255,208,222,0.16)] p-2 last:border-b-0 md:grid-cols-[5.5rem_minmax(0,1fr)] md:items-start"
                      >
                        <div className="pt-2">
                          <FieldLabel>{column.label}</FieldLabel>
                        </div>
                        <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                          <label className="block min-w-0">
                            <span className="sr-only">{column.label}</span>
                            <FormControl
                              as="textarea"
                              rows={1}
                              value={promptDraft[column.key]}
                              onChange={(event) =>
                                setPromptDraft((current) => ({
                                  ...current,
                                  [column.key]: event.target.value,
                                }))
                              }
                              className="min-h-10 w-full resize-y px-3 py-2 text-sm"
                              disabled={Boolean(savingMode) || isTranslatingPromptColumns}
                            />
                          </label>
                          <label className="block min-w-0">
                            <span className="sr-only">{column.label} 한국어 번역 입력</span>
                            <FormControl
                              as="textarea"
                              rows={1}
                              value={translationDraft[column.key]}
                              onChange={(event) =>
                                setTranslationDraft((current) => ({
                                  ...current,
                                  [column.key]: event.target.value,
                                }))
                              }
                              className="min-h-10 w-full resize-y px-3 py-2 text-sm"
                              placeholder="한국어, 콤마 구분"
                              disabled={Boolean(savingMode) || isTranslatingPromptColumns}
                            />
                          </label>
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-1.5 md:col-start-2">
                          {recommendations[column.key].slice(0, 12).map((tag) => (
                            <Button
                              key={`${column.key}-${tag}`}
                              className="px-2 py-1 text-xs"
                              onClick={() => appendRecommendation(column.key, tag)}
                              disabled={Boolean(savingMode) || isTranslatingPromptColumns}
                            >
                              {tag}
                            </Button>
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
                  <FieldLabel>SEED 이미지</FieldLabel>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {seedImage ? (
                      <span className="truncate text-xs font-semibold text-[var(--app-muted)]">
                        {seedImage.source === 'existing' ? 'existing seed' : 'noise seed'}
                      </span>
                    ) : null}
                    <Button
                      className="px-2.5 py-1 text-xs"
                      onClick={() => void shuffleSeedImage()}
                      disabled={Boolean(savingMode) || isPreparingSeedImage || !imageSettings}
                    >
                      shuffle
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--app-muted)]">
                      <span>strength</span>
                      <FormControl
                        type="number"
                        min="0.01"
                        max="1"
                        step="0.01"
                        value={strengthControlValue}
                        onChange={(event) => updateImageStrength(event.target.value)}
                        className="h-8 w-24 px-2 text-right text-xs"
                        disabled={Boolean(savingMode) || !imageSettings}
                      />
                    </label>

                    <ImageFrame className="relative mx-auto w-[min(100%,32rem)] rounded-[8px] border border-[rgba(255,218,228,0.22)] max-[960px]:w-[min(100%,28rem)]">
                      {seedImage ? (
                        <img src={seedImage.previewUrl} alt={composedPrompt || 'Seed image'} className="block h-full w-full object-cover" />
                      ) : isPreparingSeedImage ? (
                        <div className="grid h-full min-h-72 w-full place-items-center gap-3 bg-[linear-gradient(145deg,rgba(255,231,238,0.1),transparent_42%),rgba(15,5,20,0.78)] p-6 text-center text-[0.95rem] text-[var(--app-muted)]">
                          <Spinner aria-hidden="true" />
                          <span>seed 준비 중</span>
                        </div>
                      ) : (
                        <div className="grid h-full min-h-72 w-full place-items-center bg-[linear-gradient(145deg,rgba(255,231,238,0.1),transparent_42%),rgba(15,5,20,0.78)] p-6 text-center text-[0.95rem] text-[var(--app-muted)]">seed image가 없습니다.</div>
                      )}
                      {isPreparingSeedImage && seedImage ? (
                        <div className="absolute inset-0 grid place-items-center gap-3 bg-[rgba(7,1,12,0.54)] text-center text-[0.95rem] font-extrabold text-[#fff7ef]">
                          <Spinner aria-hidden="true" />
                          <span>seed 준비 중</span>
                        </div>
                      ) : null}
                      {savingMode?.endsWith('image') && seedImage ? (
                        <div className="absolute inset-0 grid place-items-center gap-3 bg-[rgba(7,1,12,0.54)] text-center text-[0.95rem] font-extrabold text-[#fff7ef]">
                          <Spinner aria-hidden="true" />
                          <span>이미지 생성 중</span>
                        </div>
                      ) : null}
                    </ImageFrame>

                    {seedImageError ? (
                      <p className="text-sm font-semibold text-[#ff9ab8]">{seedImageError}</p>
                    ) : null}
                  </div>
                </div>
              </aside>
            </div>

            {error ? (
              <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
              <div className="flex flex-wrap gap-2">
                {activeSceneId ? (
                  <Button
                    variant="danger"
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs"
                    onClick={() => void deleteScene()}
                    disabled={!canDelete}
                  >
                    {isDeleting ? <Spinner aria-hidden="true" /> : null}
                    {isDeleting ? '삭제 중' : 'Scene 삭제'}
                  </Button>
                ) : null}
                <Button
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs"
                  onClick={() => void saveScene('existing-text')}
                  disabled={!canSaveExisting}
                >
                  {savingMode === 'existing-text' ? <Spinner aria-hidden="true" /> : null}
                  기존 데이터에 텍스트 저장
                </Button>
                <Button
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs"
                  onClick={() => void saveScene('existing-image')}
                  disabled={!canSaveExistingImage}
                >
                  {savingMode === 'existing-image' ? <Spinner aria-hidden="true" /> : null}
                  기존 데이터 이미지 생성 저장
                </Button>
              </div>
              <div className="ml-auto flex flex-wrap justify-end gap-2">
                <Button
                  variant="primary"
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs"
                  onClick={() => void saveScene('new-image')}
                  disabled={!canSaveImage}
                >
                  {savingMode === 'new-image' ? <Spinner aria-hidden="true" /> : null}
                  새 데이터 이미지 생성 저장
                </Button>
              </div>
            </div>
          </div>
        </SectionBody>
      </Panel>

      {isImageSettingsOpen && imageSettingsDraft ? (
        <ModalBackdrop role="presentation">
          <Panel
            className="max-h-[min(46rem,calc(100vh-2rem))] w-[min(48rem,100%)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wizard-image-settings-title"
          >
            <PanelHeader>
              <div className="min-w-0">
                <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Image generation</p>
                <h3
                  id="wizard-image-settings-title"
                  className="truncate text-base font-semibold text-[#fff7ef]"
                >
                  이미지 설정
                </h3>
              </div>
              <Button
                variant="danger"
                className="px-3 py-2 text-xs"
                onClick={() => setIsImageSettingsOpen(false)}
              >
                닫기
              </Button>
            </PanelHeader>

            <SectionBody className="flex flex-col gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <FieldLabel>positive base</FieldLabel>
                <FormControl
                  as="textarea"
                  value={imageSettingsDraft.positive_base}
                  onChange={(event) => updateImageSettingsDraft('positive_base', event.target.value)}
                  className="min-h-20 w-full resize-y px-3 py-2 text-sm"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <FieldLabel>negative prompt</FieldLabel>
                <FormControl
                  as="textarea"
                  value={imageSettingsDraft.negative_prompt}
                  onChange={(event) => updateImageSettingsDraft('negative_prompt', event.target.value)}
                  className="min-h-24 w-full resize-y px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 max-[960px]:grid-cols-2 max-[640px]:grid-cols-1">
                <WizardSettingsInput label="steps" value={imageSettingsDraft.steps} onChange={(value) => updateImageSettingsDraft('steps', value)} min="1" step="1" />
                <WizardSettingsInput label="cfg" value={imageSettingsDraft.cfg} onChange={(value) => updateImageSettingsDraft('cfg', value)} min="0.1" step="0.1" />
                <div className="flex min-w-0 flex-col gap-1">
                  <FieldLabel>sampler</FieldLabel>
                  <FormControl
                    as="select"
                    value={imageSettingsDraft.sampler}
                    onChange={(event) => updateImageSettingsDraft('sampler', event.target.value)}
                    className="h-10 w-full px-3 text-sm"
                  >
                    <option value="">default</option>
                    <option value="euler">euler</option>
                    <option value="euler_a">euler_a</option>
                    <option value="dpmpp_2m">dpmpp_2m</option>
                    <option value="unipc">unipc</option>
                  </FormControl>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <FieldLabel>scheduler</FieldLabel>
                  <FormControl
                    as="select"
                    value={imageSettingsDraft.scheduler}
                    onChange={(event) => updateImageSettingsDraft('scheduler', event.target.value)}
                    className="h-10 w-full px-3 text-sm"
                  >
                    <option value="">default</option>
                    <option value="karras">karras</option>
                  </FormControl>
                </div>
                <WizardSettingsInput label="clip skip" value={imageSettingsDraft.clip_skip} onChange={(value) => updateImageSettingsDraft('clip_skip', value)} min="1" step="1" />
                <WizardSettingsInput label="height" value={imageSettingsDraft.height} onChange={(value) => updateImageSettingsDraft('height', value)} min="8" step="8" />
                <WizardSettingsInput label="width" value={imageSettingsDraft.width} onChange={(value) => updateImageSettingsDraft('width', value)} min="8" step="8" />
              </div>

              {imageSettingsError ? (
                <p className="text-sm font-semibold text-[#ff9ab8]">{imageSettingsError}</p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
                <Button
                  className="px-4 py-2 text-sm"
                  onClick={resetImageSettingsToDefaults}
                >
                  기본값으로 초기화
                </Button>
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  <Button
                    className="px-4 py-2 text-sm"
                    onClick={() => setIsImageSettingsOpen(false)}
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    className="px-4 py-2 text-sm"
                    onClick={applyImageSettings}
                  >
                    적용
                  </Button>
                </div>
              </div>
            </SectionBody>
          </Panel>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}

function WizardSettingsInput({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: string;
  step: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <FormControl
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full px-3 text-right text-sm"
      />
    </div>
  );
}
