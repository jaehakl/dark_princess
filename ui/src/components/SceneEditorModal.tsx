import { useCallback, useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { ImageGenerationSettings, RecommendPromptItem, SceneRecord } from '../api/type';
import {
  createNoiseSeedImage,
  createSeedImageFromBlob,
  createSeedImageFromUrl,
  IMAGE_SAMPLER_OPTIONS,
  IMAGE_SCHEDULER_OPTIONS,
  IMAGE_SETTINGS_SESSION_KEY,
  imageSettingsToDraft,
  readSessionImageSettings,
} from '../lib/scene-image';
import type {
  ImageGenerationSettingsDraft,
  SeedImageSource,
  SeedImageState,
} from '../lib/scene-image';
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
} from './ui';

const STATUS_CHANGE_FIELDS = [
  { key: 'cash', label: '현금' },
  { key: 'strength', label: '힘' },
  { key: 'agility', label: '민첩' },
  { key: 'intelligence', label: '지력' },
  { key: 'sense', label: '센스' },
  { key: 'attractiveness', label: '매력' },
  { key: 'toughness', label: '근성' },
  { key: 'stress', label: '스트레스' },
] as const;

type StatusChangeKey = (typeof STATUS_CHANGE_FIELDS)[number]['key'];
type StatusChangeValues = Record<StatusChangeKey, string>;
type SaveMode = 'text' | 'image' | 'create';

type SceneEditorModalProps = {
  scene: SceneRecord | null;
  onClose: () => void;
  onSaved: (scene: SceneRecord, editedSceneId: number | null) => void;
  onDeleted: (sceneId: number) => void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function statusChangeToValues(statusChange: SceneRecord['status_change'] | undefined): StatusChangeValues {
  return STATUS_CHANGE_FIELDS.reduce((values, field) => {
    const rawValue = statusChange?.[field.key];
    values[field.key] = typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? String(rawValue)
      : '0';
    return values;
  }, {} as StatusChangeValues);
}

export function SceneEditorModal({
  scene,
  onClose,
  onSaved,
  onDeleted,
}: SceneEditorModalProps) {
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const [prompt, setPrompt] = useState(scene?.prompt ?? '');
  const [script, setScript] = useState(scene?.script ?? '');
  const [statusChangeValues, setStatusChangeValues] = useState<StatusChangeValues>(() =>
    statusChangeToValues(scene?.status_change),
  );
  const [seedImage, setSeedImage] = useState<SeedImageState | null>(null);
  const [isPreparingSeedImage, setIsPreparingSeedImage] = useState(false);
  const [seedImageError, setSeedImageError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecommendingPrompt, setIsRecommendingPrompt] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptRecommendations, setPromptRecommendations] = useState<RecommendPromptItem[]>([]);
  const [imageSettingsDefaults, setImageSettingsDefaults] = useState<ImageGenerationSettings | null>(null);
  const [imageSettings, setImageSettings] = useState<ImageGenerationSettings | null>(null);
  const [imageSettingsDraft, setImageSettingsDraft] = useState<ImageGenerationSettingsDraft | null>(null);
  const [strengthControlValue, setStrengthControlValue] = useState('');
  const [isImageSettingsOpen, setIsImageSettingsOpen] = useState(false);
  const [imageSettingsError, setImageSettingsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editedSceneId = scene?.id ?? null;
  const canSaveWithoutCreate = Boolean(scene?.id);
  const isInputDisabled =
    Boolean(savingMode) || isDeleting || isRecommendingPrompt || isGeneratingPrompt;
  const canDelete = Boolean(editedSceneId) && !isInputDisabled;
  const canSave = prompt.trim().length > 0 && !isInputDisabled;
  const canRecommendPrompt = script.trim().length > 0 && !isInputDisabled;
  const canGeneratePrompt = script.trim().length > 0 && !isInputDisabled;
  const canGenerateImage = canSave && Boolean(seedImage) && !isPreparingSeedImage;
  const isGeneratingImage = savingMode === 'image' || savingMode === 'create';

  const modalTitle = useMemo(
    () => (editedSceneId ? `Scene #${editedSceneId} 편집` : '새 Scene 생성'),
    [editedSceneId],
  );

  const applySeedImage = useCallback((blob: Blob, source: SeedImageSource) => {
    setSeedImage({
      blob,
      previewUrl: URL.createObjectURL(blob),
      source,
    });
  }, []);

  useEffect(() => () => {
    if (seedImage?.previewUrl) {
      URL.revokeObjectURL(seedImage.previewUrl);
    }
  }, [seedImage?.previewUrl]);

  useEffect(() => {
    setPrompt(scene?.prompt ?? '');
    setScript(scene?.script ?? '');
    setStatusChangeValues(statusChangeToValues(scene?.status_change));
    setSeedImageError(null);
    setError(null);
    setSavingMode(null);
    setIsDeleting(false);
    setIsRecommendingPrompt(false);
    setIsGeneratingPrompt(false);
    setPromptRecommendations([]);
  }, [scene]);

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
    setStrengthControlValue(imageSettings ? String(imageSettings.strength) : '');
  }, [imageSettings]);

  useEffect(() => {
    if (!imageSettings) {
      return;
    }

    const resolvedImageSettings = imageSettings;
    let isCancelled = false;
    async function prepareSeedImage() {
      const width = resolvedImageSettings.width;
      const height = resolvedImageSettings.height;
      setIsPreparingSeedImage(true);
      setSeedImageError(null);
      try {
        const source: SeedImageSource = scene?.image_url ? 'existing' : 'noise';
        const blob = scene?.image_url
          ? await createSeedImageFromUrl(scene.image_url, width, height)
          : await createNoiseSeedImage(width, height);
        if (!isCancelled) {
          applySeedImage(blob, source);
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
  }, [applySeedImage, imageSettings?.height, imageSettings?.width, scene?.id, scene?.image_url]);

  const applyClipboardSeedImage = useCallback(async (blob: Blob) => {
    if (!imageSettings) {
      setSeedImageError('이미지 설정 기본값을 불러오는 중입니다.');
      return;
    }

    setIsPreparingSeedImage(true);
    setSeedImageError(null);
    try {
      applySeedImage(
        await createSeedImageFromBlob(blob, imageSettings.width, imageSettings.height),
        'clipboard',
      );
    } catch (seedError) {
      setSeedImageError(getErrorMessage(seedError));
    } finally {
      setIsPreparingSeedImage(false);
    }
  }, [applySeedImage, imageSettings]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (isInputDisabled || isImageSettingsOpen || isPreparingSeedImage) {
        return;
      }

      const imageItem = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.type.startsWith('image/'));
      const imageFile = imageItem?.getAsFile();
      if (!imageFile) {
        return;
      }

      event.preventDefault();
      void applyClipboardSeedImage(imageFile);
    }

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [applyClipboardSeedImage, isImageSettingsOpen, isInputDisabled, isPreparingSeedImage]);

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

  async function recommendPromptFromScript() {
    const text = script.trim();
    if (!text) {
      setError('script를 입력해 주세요.');
      return;
    }

    setIsRecommendingPrompt(true);
    setError(null);
    try {
      const recommendations = await dbTables.ImageUtil.recommendPrompt(text);
      if (!recommendations.length) {
        setError('추천할 prompt가 없습니다.');
        return;
      }

      setPromptRecommendations(recommendations);
    } catch (recommendError) {
      setError(getErrorMessage(recommendError));
    } finally {
      setIsRecommendingPrompt(false);
    }
  }

  async function generatePromptFromScript() {
    const text = script.trim();
    if (!text) {
      setError('script를 입력해 주세요.');
      return;
    }

    setIsGeneratingPrompt(true);
    setError(null);
    try {
      const generation = await dbTables.ImageUtil.generatePrompt(text);
      const generatedPrompt = generation.prompt.trim();
      if (!generatedPrompt) {
        setError('생성된 prompt가 없습니다.');
        return;
      }

      setPrompt(generatedPrompt);
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    } finally {
      setIsGeneratingPrompt(false);
    }
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
    sessionStorage.setItem(IMAGE_SETTINGS_SESSION_KEY, JSON.stringify(nextImageSettings));
    setImageSettingsError(null);
    setIsImageSettingsOpen(false);
  }

  async function saveScene(mode: SaveMode) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('prompt를 입력해 주세요.');
      return;
    }
    if (mode !== 'create' && !scene?.id) {
      setError('수정할 scene_id가 없습니다.');
      return;
    }

    const statusChange: Record<string, number> = { turn: 1 };
    for (const field of STATUS_CHANGE_FIELDS) {
      const rawValue = statusChangeValues[field.key].trim();
      const parsedValue = rawValue === '' ? 0 : Number(rawValue);
      if (!Number.isInteger(parsedValue) || !Number.isFinite(parsedValue)) {
        setError(`${field.label} 변화량은 정수로 입력해 주세요.`);
        return;
      }
      statusChange[field.key] = parsedValue;
    }

    setSavingMode(mode);
    setError(null);
    try {
      const payload = {
        scene_id: mode === 'create' ? null : scene?.id ?? null,
        prompt: trimmedPrompt,
        script,
        status_change: statusChange,
        generate_image: mode !== 'text',
        background: scene?.background ?? null,
        subject: scene?.subject ?? null,
        object: scene?.object ?? null,
        action: scene?.action ?? null,
        detail: scene?.detail ?? null,
        ...(mode === 'text' || !imageSettings ? {} : { image_settings: imageSettings }),
      };
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      if (mode !== 'text') {
        if (!seedImage) {
          throw new Error(seedImageError ?? 'seed image를 준비해 주세요.');
        }
        formData.append('seed_image', seedImage.blob, `scene-seed-${seedImage.source}.png`);
      }
      const savedScene = await dbTables.Scene.generateScene(formData);
      setPrompt(savedScene.prompt);
      setScript(savedScene.script);
      setStatusChangeValues(statusChangeToValues(savedScene.status_change));
      onSaved(savedScene, mode === 'create' ? null : scene?.id ?? null);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSavingMode(null);
    }
  }

  async function deleteScene() {
    if (!editedSceneId) {
      return;
    }

    const shouldDelete = window.confirm(
      `Scene #${editedSceneId}을 삭제할까요? 연결된 옵션도 함께 삭제됩니다.`,
    );
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await dbTables.Scene.deleteRows([editedSceneId]);
      onDeleted(editedSceneId);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <ModalBackdrop role="presentation">
      <Panel
        className="max-h-[calc(100vh-1.5rem)] w-[min(76rem,100%)] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-editor-title"
      >
        <PanelHeader>
          <div className="min-w-0">
            <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene generation</p>
            <h2
              id="scene-editor-title"
              className="truncate text-lg font-semibold text-[#fff7ef]"
            >
              {modalTitle}
            </h2>
          </div>
          <Button
            variant="danger"
            className="px-3 py-2 text-xs"
            onClick={onClose}
            disabled={isInputDisabled}
          >
            닫기
          </Button>
        </PanelHeader>

        <SectionBody className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[rgba(12,5,18,0.56)] px-3 py-2.5">
            <Button
              className="px-3 py-1.5 text-xs"
              onClick={openImageSettings}
              disabled={isInputDisabled}
            >
              이미지 설정
            </Button>
            <span className="ml-auto text-xs text-[var(--app-muted)]">
              {editedSceneId ? `scene_id ${editedSceneId}` : 'scene_id null'}
            </span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(20rem,0.36fr)] items-start gap-4 max-[960px]:grid-cols-1">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="block space-y-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <FieldLabel htmlFor="scene-editor-prompt" required>prompt</FieldLabel>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                      onClick={() => void recommendPromptFromScript()}
                      disabled={!canRecommendPrompt}
                    >
                      {isRecommendingPrompt ? <Spinner aria-hidden="true" /> : null}
                      {isRecommendingPrompt ? '추천 중' : 'prompt 추천'}
                    </Button>
                    <Button
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                      onClick={() => void generatePromptFromScript()}
                      disabled={!canGeneratePrompt}
                    >
                      {isGeneratingPrompt ? <Spinner aria-hidden="true" /> : null}
                      {isGeneratingPrompt ? '생성 중' : 'prompt 생성'}
                    </Button>
                  </div>
                </div>
                <FormControl
                  as="textarea"
                  id="scene-editor-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-20 w-full resize-y px-3 py-2 text-sm"
                  disabled={isInputDisabled}
                />
                {promptRecommendations.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {promptRecommendations.slice(0, 16).map((item) => (
                      <Button
                        key={item.word}
                        className="px-2.5 py-1 text-xs"
                        onClick={() =>
                          setPrompt((currentPrompt) => {
                            const currentWords = currentPrompt
                              .split(',')
                              .map((value) => value.trim())
                              .filter(Boolean);
                            return currentWords.includes(item.word)
                              ? currentPrompt
                              : [...currentWords, item.word].join(', ');
                          })}
                        disabled={isInputDisabled}
                        title={`score ${item.score.toFixed(3)}`}
                      >
                        {item.word}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="block space-y-1">
                <FieldLabel>script</FieldLabel>
                <FormControl
                  as="textarea"
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                  className="min-h-40 w-full resize-y px-3 py-2 text-sm"
                  disabled={isInputDisabled}
                />
              </div>

              <div className="space-y-2">
                <FieldLabel>status_change</FieldLabel>
                <div className="grid grid-cols-3 gap-2 max-[640px]:grid-cols-1">
                  {STATUS_CHANGE_FIELDS.map((field) => (
                    <label
                      key={field.key}
                      className="grid grid-cols-[minmax(3.5rem,0.8fr)_minmax(0,1fr)] items-center gap-2 text-[0.82rem] font-extrabold text-[#fff1f5] max-[640px]:grid-cols-[minmax(4.5rem,0.5fr)_minmax(0,1fr)]"
                    >
                      <span>{field.label}</span>
                      <FormControl
                        type="number"
                        step="1"
                        value={statusChangeValues[field.key]}
                        onChange={(event) =>
                          setStatusChangeValues((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                        className="h-9 w-full px-2 text-right text-sm"
                        disabled={isInputDisabled}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <FieldLabel>image</FieldLabel>
                <div className="flex min-w-0 items-center gap-2">
                  {seedImage ? (
                    <span className="truncate text-xs font-semibold text-[var(--app-muted)]">
                      {seedImage.source === 'existing'
                        ? 'existing seed'
                        : seedImage.source === 'clipboard'
                          ? 'clipboard seed'
                          : 'noise seed'}
                    </span>
                  ) : null}
                  <label className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
                    <span>strength</span>
                    <FormControl
                      type="number"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={strengthControlValue}
                      onChange={(event) => updateImageStrength(event.target.value)}
                      className="h-8 w-20 px-2 text-right text-xs"
                      disabled={isInputDisabled || !imageSettings}
                    />
                  </label>
                  <Button
                    className="px-2.5 py-1 text-xs"
                    onClick={() => void shuffleSeedImage()}
                    disabled={isInputDisabled || isPreparingSeedImage || !imageSettings}
                  >
                    shuffle
                  </Button>
                </div>
              </div>
              <ImageFrame className="relative mx-auto w-[min(100%,24rem)] rounded-[8px] border border-[rgba(255,218,228,0.22)] max-[960px]:w-[min(100%,22rem)]">
                {seedImage ? (
                  <img src={seedImage.previewUrl} alt={prompt || 'Seed image'} className="block h-full w-full object-contain" />
                ) : isPreparingSeedImage ? (
                  <div className="grid h-full min-h-72 w-full place-items-center gap-3 bg-[linear-gradient(145deg,rgba(255,231,238,0.1),transparent_42%),rgba(15,5,20,0.78)] p-6 text-center text-[0.95rem] text-[var(--app-muted)]">
                    <Spinner aria-hidden="true" />
                    <span>seed 준비 중</span>
                  </div>
                ) : (
                  <div className="grid h-full min-h-72 w-full place-items-center bg-[linear-gradient(145deg,rgba(255,231,238,0.1),transparent_42%),rgba(15,5,20,0.78)] p-6 text-center text-[0.95rem] text-[var(--app-muted)]">seed image가 없습니다.</div>
                )}
                {isGeneratingImage && seedImage ? (
                  <div className="absolute inset-0 grid place-items-center gap-3 bg-[rgba(7,1,12,0.54)] text-center text-[0.95rem] font-extrabold text-[#fff7ef]">
                    <Spinner aria-hidden="true" />
                    <span>이미지 생성 중</span>
                  </div>
                ) : null}
                {isPreparingSeedImage && seedImage ? (
                  <div className="absolute inset-0 grid place-items-center gap-3 bg-[rgba(7,1,12,0.54)] text-center text-[0.95rem] font-extrabold text-[#fff7ef]">
                    <Spinner aria-hidden="true" />
                    <span>seed 준비 중</span>
                  </div>
                ) : null}
              </ImageFrame>
              {seedImageError ? (
                <p className="text-sm font-semibold text-[#ff9ab8]">{seedImageError}</p>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
            <div>
              {editedSceneId ? (
                <Button
                  variant="danger"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm"
                  onClick={() => void deleteScene()}
                  disabled={!canDelete}
                >
                  {isDeleting ? <Spinner aria-hidden="true" /> : null}
                  {isDeleting ? '삭제 중' : 'Scene 삭제'}
                </Button>
              ) : null}
            </div>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <Button
                className="px-4 py-2 text-sm"
                onClick={onClose}
                disabled={isInputDisabled}
              >
                취소
              </Button>
              <Button
                className="inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('text')}
                disabled={!canSave || !canSaveWithoutCreate}
              >
                {savingMode === 'text' ? <Spinner aria-hidden="true" /> : null}
                {savingMode === 'text' ? '텍스트 저장 중' : '텍스트 저장'}
              </Button>
              <Button
                className="inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('image')}
                disabled={!canGenerateImage || !canSaveWithoutCreate}
              >
                {savingMode === 'image' ? <Spinner aria-hidden="true" /> : null}
                {savingMode === 'image' ? '이미지 업데이트 중' : '이미지 업데이트'}
              </Button>
              <Button
                variant="primary"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('create')}
                disabled={!canGenerateImage}
              >
                {savingMode === 'create' ? <Spinner aria-hidden="true" /> : null}
                {savingMode === 'create' ? 'Scene 생성 중' : '새 Scene 생성'}
              </Button>
            </div>
          </div>
        </SectionBody>
      </Panel>

      {isImageSettingsOpen && imageSettingsDraft ? (
        <ModalBackdrop nested role="presentation">
          <Panel
            className="max-h-[min(46rem,calc(100vh-2rem))] w-[min(48rem,100%)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-settings-title"
          >
            <PanelHeader>
              <div className="min-w-0">
                <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Image generation</p>
                <h3
                  id="image-settings-title"
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
                <SettingsInput label="steps" value={imageSettingsDraft.steps} onChange={(value) => updateImageSettingsDraft('steps', value)} min="1" step="1" />
                <SettingsInput label="cfg" value={imageSettingsDraft.cfg} onChange={(value) => updateImageSettingsDraft('cfg', value)} min="0.1" step="0.1" />
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
                <SettingsInput label="clip skip" value={imageSettingsDraft.clip_skip} onChange={(value) => updateImageSettingsDraft('clip_skip', value)} min="1" step="1" />
                <SettingsInput label="height" value={imageSettingsDraft.height} onChange={(value) => updateImageSettingsDraft('height', value)} min="8" step="8" />
                <SettingsInput label="width" value={imageSettingsDraft.width} onChange={(value) => updateImageSettingsDraft('width', value)} min="8" step="8" />
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
    </ModalBackdrop>
  );
}

function SettingsInput({
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
