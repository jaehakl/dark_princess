import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { ImageGenerationSettings, RecommendPromptItem, SceneRecord } from '../api/type';

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

const IMAGE_SETTINGS_SESSION_KEY = 'dark_princess.scene.image_settings';
const IMAGE_SAMPLER_OPTIONS = ['', 'euler', 'euler_a', 'dpmpp_2m', 'unipc'] as const;
const IMAGE_SCHEDULER_OPTIONS = ['', 'karras'] as const;

type StatusChangeKey = (typeof STATUS_CHANGE_FIELDS)[number]['key'];
type StatusChangeValues = Record<StatusChangeKey, string>;
type SaveMode = 'text' | 'image' | 'create';
type ImageGenerationSettingsDraft = {
  positive_base: string;
  negative_prompt: string;
  steps: string;
  cfg: string;
  sampler: string;
  scheduler: string;
  clip_skip: string;
  height: string;
  width: string;
};

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

function mergeImageSettings(
  defaults: ImageGenerationSettings,
  overrides: Partial<ImageGenerationSettings>,
): ImageGenerationSettings {
  return {
    positive_base: overrides.positive_base ?? defaults.positive_base,
    negative_prompt: overrides.negative_prompt ?? defaults.negative_prompt,
    steps: overrides.steps ?? defaults.steps,
    cfg: overrides.cfg ?? defaults.cfg,
    sampler: overrides.sampler ?? defaults.sampler,
    scheduler: overrides.scheduler ?? defaults.scheduler,
    clip_skip: overrides.clip_skip ?? defaults.clip_skip,
    height: overrides.height ?? defaults.height,
    width: overrides.width ?? defaults.width,
  };
}

function imageSettingsToDraft(settings: ImageGenerationSettings): ImageGenerationSettingsDraft {
  return {
    positive_base: settings.positive_base,
    negative_prompt: settings.negative_prompt,
    steps: String(settings.steps),
    cfg: String(settings.cfg),
    sampler: settings.sampler,
    scheduler: settings.scheduler,
    clip_skip: settings.clip_skip === null ? '' : String(settings.clip_skip),
    height: String(settings.height),
    width: String(settings.width),
  };
}

function readSessionImageSettings(defaults: ImageGenerationSettings): ImageGenerationSettings {
  const rawSettings = sessionStorage.getItem(IMAGE_SETTINGS_SESSION_KEY);
  if (!rawSettings) {
    return defaults;
  }

  try {
    const parsedSettings = JSON.parse(rawSettings) as Partial<ImageGenerationSettings>;
    return mergeImageSettings(defaults, parsedSettings);
  } catch {
    sessionStorage.removeItem(IMAGE_SETTINGS_SESSION_KEY);
    return defaults;
  }
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
  const [imageUrl, setImageUrl] = useState(scene?.image_url ?? null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecommendingPrompt, setIsRecommendingPrompt] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptRecommendations, setPromptRecommendations] = useState<RecommendPromptItem[]>([]);
  const [imageSettingsDefaults, setImageSettingsDefaults] = useState<ImageGenerationSettings | null>(null);
  const [imageSettings, setImageSettings] = useState<ImageGenerationSettings | null>(null);
  const [imageSettingsDraft, setImageSettingsDraft] = useState<ImageGenerationSettingsDraft | null>(null);
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
  const isGeneratingImage = savingMode === 'image' || savingMode === 'create';

  const modalTitle = useMemo(
    () => (editedSceneId ? `Scene #${editedSceneId} 편집` : '새 Scene 생성'),
    [editedSceneId],
  );

  useEffect(() => {
    setPrompt(scene?.prompt ?? '');
    setScript(scene?.script ?? '');
    setStatusChangeValues(statusChangeToValues(scene?.status_change));
    setImageUrl(scene?.image_url ?? null);
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
        const defaults = await dbTables.Scene.getImageSettingsDefaults();
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

  function updateImageSettingsDraft(field: keyof ImageGenerationSettingsDraft, value: string) {
    setImageSettingsDraft((currentDraft) => (
      currentDraft ? { ...currentDraft, [field]: value } : currentDraft
    ));
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
      const recommendations = await dbTables.Scene.recommendPrompt(text);
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
      const generation = await dbTables.Scene.generatePrompt(text);
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
      const savedScene = await dbTables.Scene.generateScene({
        scene_id: mode === 'create' ? null : scene?.id ?? null,
        prompt: trimmedPrompt,
        script,
        status_change: statusChange,
        generate_image: mode !== 'text',
        ...(mode === 'text' || !imageSettings ? {} : { image_settings: imageSettings }),
      });
      setPrompt(savedScene.prompt);
      setScript(savedScene.script);
      setStatusChangeValues(statusChangeToValues(savedScene.status_change));
      setImageUrl(savedScene.image_url ?? null);
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
    <div className="vn-modal-backdrop" role="presentation">
      <section
        className="vn-panel vn-scene-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-editor-title"
      >
        <div className="vn-panel-header">
          <div className="min-w-0">
            <p className="vn-subtitle">Scene generation</p>
            <h2
              id="scene-editor-title"
              className="truncate text-lg font-semibold text-[#fff7ef]"
            >
              {modalTitle}
            </h2>
          </div>
          <button
            type="button"
            className="vn-danger-button px-3 py-2 text-xs"
            onClick={onClose}
            disabled={isInputDisabled}
          >
            닫기
          </button>
        </div>

        <div className="vn-section-body vn-scene-editor-body">
          <div className="vn-scene-editor-meta">
            <button
              type="button"
              className="vn-button px-3 py-1.5 text-xs"
              onClick={openImageSettings}
              disabled={isInputDisabled}
            >
              이미지 설정
            </button>
            <span className="ml-auto text-xs text-[var(--app-muted)]">
              {editedSceneId ? `scene_id ${editedSceneId}` : 'scene_id null'}
            </span>
          </div>

          <div className="vn-scene-editor-grid">
            <div className="vn-scene-editor-fields">
              <div className="block space-y-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <label htmlFor="scene-editor-prompt" className="edit-label edit-label--required">
                    <span className="edit-label__text">prompt</span>
                  </label>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="vn-button inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                      onClick={() => void recommendPromptFromScript()}
                      disabled={!canRecommendPrompt}
                    >
                      {isRecommendingPrompt ? <span className="vn-spinner" aria-hidden="true" /> : null}
                      {isRecommendingPrompt ? '추천 중' : 'prompt 추천'}
                    </button>
                    <button
                      type="button"
                      className="vn-button inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                      onClick={() => void generatePromptFromScript()}
                      disabled={!canGeneratePrompt}
                    >
                      {isGeneratingPrompt ? <span className="vn-spinner" aria-hidden="true" /> : null}
                      {isGeneratingPrompt ? '생성 중' : 'prompt 생성'}
                    </button>
                  </div>
                </div>
                <textarea
                  id="scene-editor-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="edit-control min-h-20 w-full resize-y px-3 py-2 text-sm"
                  disabled={isInputDisabled}
                />
                {promptRecommendations.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {promptRecommendations.slice(0, 16).map((item) => (
                      <button
                        key={item.word}
                        type="button"
                        className="vn-button px-2.5 py-1 text-xs"
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
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <label className="block space-y-1">
                <span className="edit-label">
                  <span className="edit-label__text">script</span>
                </span>
                <textarea
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                  className="edit-control min-h-40 w-full resize-y px-3 py-2 text-sm"
                  disabled={isInputDisabled}
                />
              </label>

              <div className="space-y-2">
                <span className="edit-label">
                  <span className="edit-label__text">status_change</span>
                </span>
                <div className="vn-status-change-grid">
                  {STATUS_CHANGE_FIELDS.map((field) => (
                    <label key={field.key} className="vn-status-change-field">
                      <span>{field.label}</span>
                      <input
                        type="number"
                        step="1"
                        value={statusChangeValues[field.key]}
                        onChange={(event) =>
                          setStatusChangeValues((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                        className="edit-control h-9 w-full px-2 text-right text-sm"
                        disabled={isInputDisabled}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="vn-scene-editor-preview">
              <span className="edit-label">
                <span className="edit-label__text">image</span>
              </span>
              <div className="dp-image-frame vn-scene-editor-image-frame">
                {isGeneratingImage ? (
                  <div className="vn-scene-empty">
                    <span className="vn-spinner" aria-hidden="true" />
                    <span>이미지 생성 중</span>
                  </div>
                ) : imageUrl ? (
                  <img src={imageUrl} alt={prompt || 'Scene image'} className="dp-image-media" />
                ) : (
                  <div className="vn-scene-empty">생성된 이미지가 없습니다.</div>
                )}
              </div>
            </div>
          </div>

          {error ? (
            <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
          ) : null}

          <div className="vn-modal-footer">
            <div>
              {editedSceneId ? (
                <button
                  type="button"
                  className="vn-danger-button inline-flex items-center gap-2 px-4 py-2 text-sm"
                  onClick={() => void deleteScene()}
                  disabled={!canDelete}
                >
                  {isDeleting ? <span className="vn-spinner" aria-hidden="true" /> : null}
                  {isDeleting ? '삭제 중' : 'Scene 삭제'}
                </button>
              ) : null}
            </div>
            <div className="vn-modal-footer-actions">
              <button
                type="button"
                className="vn-button px-4 py-2 text-sm"
                onClick={onClose}
                disabled={isInputDisabled}
              >
                취소
              </button>
              <button
                type="button"
                className="vn-button inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('text')}
                disabled={!canSave || !canSaveWithoutCreate}
              >
                {savingMode === 'text' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                {savingMode === 'text' ? '텍스트 저장 중' : '텍스트 저장'}
              </button>
              <button
                type="button"
                className="vn-button inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('image')}
                disabled={!canSave || !canSaveWithoutCreate}
              >
                {savingMode === 'image' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                {savingMode === 'image' ? '이미지 업데이트 중' : '이미지 업데이트'}
              </button>
              <button
                type="button"
                className="vn-button vn-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('create')}
                disabled={!canSave}
              >
                {savingMode === 'create' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                {savingMode === 'create' ? 'Scene 생성 중' : '새 Scene 생성'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {isImageSettingsOpen && imageSettingsDraft ? (
        <div className="vn-nested-modal-backdrop" role="presentation">
          <section
            className="vn-panel vn-image-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-settings-title"
          >
            <div className="vn-panel-header">
              <div className="min-w-0">
                <p className="vn-subtitle">Image generation</p>
                <h3
                  id="image-settings-title"
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
