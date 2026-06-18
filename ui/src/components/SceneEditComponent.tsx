import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbTables } from '../api/api';
import type {
  GenerateSceneRequest,
  GetListRequest,
  ImageGenerationSettings,
  PromptColumnName,
  RecommendPromptColumns,
  SceneRecord,
} from '../api/type';
import {
  IMAGE_SAMPLER_OPTIONS,
  IMAGE_SCHEDULER_OPTIONS,
  IMAGE_SETTINGS_SESSION_KEY,
  imageSettingsToDraft,
  readSessionImageSettings,
} from '../lib/scene-image';
import type { ImageGenerationSettingsDraft } from '../lib/scene-image';
import { ImageEditor } from './image-editor';
import type { ImageEditorSubmitPayload } from './image-editor';
import {
  Button,
  FieldLabel,
  FormControl,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
  cx,
} from './ui';

const PROMPT_COLUMNS = [
  { key: 'prompt_situation', label: '상황' },
  { key: 'prompt_hero', label: '주인공' },
  { key: 'prompt_camera', label: '카메라' },
  { key: 'prompt_detail', label: '디테일' },
] as const;

const PROMPT_EDITOR_COLUMNS = [
  { key: 'prompt_situation', label: '상황', kind: 'stored' },
  { key: 'prompt_instant_positive', label: 'instant positive', kind: 'instant' },
  { key: 'prompt_hero', label: '주인공', kind: 'stored' },
  { key: 'prompt_camera', label: '카메라', kind: 'stored' },
  { key: 'prompt_detail', label: '디테일', kind: 'stored' },
  { key: 'prompt_instant_negative', label: 'instant negative', kind: 'instant' },
  { key: 'prompt_negative', label: 'negative', kind: 'negative' },
] as const;

type PromptEditorColumnName = (typeof PROMPT_EDITOR_COLUMNS)[number]['key'];

const EMPTY_PROMPT_DRAFT: Record<PromptColumnName, string> = {
  prompt_situation: '',
  prompt_hero: '',
  prompt_camera: '',
  prompt_detail: '',
};

const EMPTY_RECOMMENDATIONS: RecommendPromptColumns = {
  prompt_situation: [],
  prompt_hero: [],
  prompt_camera: [],
  prompt_detail: [],
};

const EMPTY_INSTANT_PROMPT_DRAFT = {
  prompt_instant_positive: '',
  prompt_instant_negative: '',
};

const EMPTY_TRANSLATION_DRAFT: Record<PromptEditorColumnName, string> =
  PROMPT_EDITOR_COLUMNS.reduce((draft, column) => {
    draft[column.key] = '';
    return draft;
  }, {} as Record<PromptEditorColumnName, string>);

const QUICK_IMAGE_STRENGTHS = [0.5, 0.75, 0.85, 0.95, 1];
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
  | 'text'
  | 'image';

type StatusChangeKey = (typeof STATUS_CHANGE_FIELDS)[number]['key'];
type StatusChangeValues = Record<StatusChangeKey, string>;
type InstantPromptName = keyof typeof EMPTY_INSTANT_PROMPT_DRAFT;

type SceneEditComponentProps = {
  sceneId: number | null;
  initialScene: SceneRecord;
  onSaved: (sceneId: number) => void;
  onDeleted?: (sceneId: number) => void;
  onClose?: () => void;
  onDuplicate?: (scene: SceneRecord) => void;
  modalLayout?: boolean;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function sceneToPromptDraft(scene: SceneRecord): Record<PromptColumnName, string> {
  return {
    prompt_situation: scene.prompt_situation ?? '',
    prompt_hero: scene.prompt_hero ?? '',
    prompt_camera: scene.prompt_camera ?? '',
    prompt_detail: scene.prompt_detail ?? '',
  };
}

function statusChangeToValues(statusChange: Record<string, unknown> | undefined): StatusChangeValues {
  return STATUS_CHANGE_FIELDS.reduce((values, field) => {
    const rawValue = statusChange?.[field.key];
    values[field.key] = typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? String(rawValue)
      : '0';
    return values;
  }, {} as StatusChangeValues);
}

function confirmAction(message: string, action: () => void) {
  if (window.confirm(message)) {
    action();
  }
}

export function SceneEditComponent({
  sceneId,
  initialScene,
  onSaved,
  onDeleted,
  onClose,
  onDuplicate,
  modalLayout = false,
}: SceneEditComponentProps) {
  const [activeScene, setActiveScene] = useState<SceneRecord | null>(initialScene);
  const [isLoadingScene, setIsLoadingScene] = useState(false);
  const [promptDraft, setPromptDraft] = useState<Record<PromptColumnName, string>>(
    () => sceneToPromptDraft(initialScene),
  );
  const [instantPromptDraft, setInstantPromptDraft] = useState<Record<InstantPromptName, string>>({
    ...EMPTY_INSTANT_PROMPT_DRAFT,
  });
  const [promptNegativeDraft, setPromptNegativeDraft] = useState(initialScene.prompt_negative ?? '');
  const [translationDraft, setTranslationDraft] = useState<Record<PromptEditorColumnName, string>>({
    ...EMPTY_TRANSLATION_DRAFT,
  });
  const [script, setScript] = useState(initialScene.script ?? '');
  const [statusChangeValues, setStatusChangeValues] = useState<StatusChangeValues>(
    () => statusChangeToValues(initialScene.status_change),
  );
  const [recommendations, setRecommendations] = useState<RecommendPromptColumns>({
    ...EMPTY_RECOMMENDATIONS,
  });
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
  const preserveInstantPromptSceneIdRef = useRef<number | null>(null);

  const composedPrompt = useMemo(
    () =>
      PROMPT_COLUMNS
        .map((column) => promptDraft[column.key].trim())
        .filter(Boolean)
        .join(', '),
    [promptDraft],
  );
  const isBusy = isLoadingScene || isRecommending || isTranslatingPromptColumns || isDeleting || Boolean(savingMode);
  const canEdit = Boolean(activeScene);
  const canSaveText = canEdit && composedPrompt.length > 0 && !isBusy;
  const canDelete = sceneId !== null && !isBusy;
  const canRefreshRecommendations =
    canEdit && script.trim().length > 0 && !isRecommending && !isTranslatingPromptColumns && !savingMode;
  const canTranslatePromptColumns =
    canEdit && !isBusy && PROMPT_EDITOR_COLUMNS.some((column) => translationDraft[column.key].trim().length > 0);
  const canDuplicate = Boolean(modalLayout && onDuplicate && sceneId !== null && canEdit && !isBusy);
  const imageModelFilenameOptions = imageSettings?.model_filenames ?? imageSettingsDefaults?.model_filenames ?? [];
  const selectedLabel = sceneId === null
    ? '새 Scene 생성'
    : isLoadingScene
      ? `Scene #${sceneId} 불러오는 중`
      : `Scene #${sceneId}`;

  const applySceneDraft = useCallback((scene: SceneRecord, resetInstantPrompts = true) => {
    setActiveScene(scene);
    setPromptDraft(sceneToPromptDraft(scene));
    setPromptNegativeDraft(scene.prompt_negative ?? '');
    if (resetInstantPrompts) {
      setInstantPromptDraft({ ...EMPTY_INSTANT_PROMPT_DRAFT });
    }
    setTranslationDraft({ ...EMPTY_TRANSLATION_DRAFT });
    setScript(scene.script ?? '');
    setStatusChangeValues(statusChangeToValues(scene.status_change));
    setRecommendations({ ...EMPTY_RECOMMENDATIONS });
    setError(null);
  }, []);

  useEffect(() => {
    if (sceneId === null) {
      setIsLoadingScene(false);
      setIsDeleting(false);
      setSavingMode(null);
      preserveInstantPromptSceneIdRef.current = null;
      applySceneDraft({ ...initialScene, id: null });
      return;
    }

    const targetSceneId = sceneId;
    let isCancelled = false;

    async function loadScene() {
      setIsLoadingScene(true);
      setIsDeleting(false);
      setSavingMode(null);
      setActiveScene(null);
      setError(null);
      try {
        const sceneResponse = await dbTables.Scene.listRows({
          ...FETCH_SCENE_BY_ID_REQUEST,
          selected_ids: [targetSceneId],
        });
        const loadedScene = sceneResponse.items[0];
        if (!loadedScene) {
          throw new Error(`Scene #${targetSceneId}을 찾을 수 없습니다.`);
        }
        if (!isCancelled) {
          const shouldPreserveInstantPrompts = preserveInstantPromptSceneIdRef.current === targetSceneId;
          if (shouldPreserveInstantPrompts || preserveInstantPromptSceneIdRef.current !== null) {
            preserveInstantPromptSceneIdRef.current = null;
          }
          applySceneDraft(loadedScene, !shouldPreserveInstantPrompts);
        }
      } catch (loadError) {
        if (!isCancelled) {
          preserveInstantPromptSceneIdRef.current = null;
          setActiveScene(null);
          setPromptDraft({ ...EMPTY_PROMPT_DRAFT });
          setInstantPromptDraft({ ...EMPTY_INSTANT_PROMPT_DRAFT });
          setPromptNegativeDraft('');
          setTranslationDraft({ ...EMPTY_TRANSLATION_DRAFT });
          setScript('');
          setStatusChangeValues(statusChangeToValues(DEFAULT_STATUS_CHANGE));
          setRecommendations({ ...EMPTY_RECOMMENDATIONS });
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingScene(false);
        }
      }
    }

    void loadScene();
    return () => {
      isCancelled = true;
    };
  }, [applySceneDraft, initialScene, sceneId]);

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
    const targets = PROMPT_EDITOR_COLUMNS
      .map((column) => ({
        key: column.key,
        kind: column.kind,
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
          kind: target.kind,
          text: translatedTexts[index]?.trim() ?? '',
        }))
        .filter((item) => item.text.length > 0);
      if (translatedByColumn.length === 0) {
        throw new Error('번역된 텍스트가 없습니다.');
      }

      setPromptDraft((current) => {
        const next = { ...current };
        for (const item of translatedByColumn) {
          if (item.kind !== 'stored') {
            continue;
          }
          const key = item.key as PromptColumnName;
          const currentText = next[key].trim();
          next[key] = currentText ? `${currentText}, ${item.text}` : item.text;
        }
        return next;
      });
      setInstantPromptDraft((current) => {
        const next = { ...current };
        for (const item of translatedByColumn) {
          if (item.kind !== 'instant') {
            continue;
          }
          const key = item.key as InstantPromptName;
          const currentText = next[key].trim();
          next[key] = currentText ? `${currentText}, ${item.text}` : item.text;
        }
        return next;
      });
      const negativeTranslation = translatedByColumn.find((item) => item.kind === 'negative');
      if (negativeTranslation) {
        setPromptNegativeDraft((current) => {
          const currentText = current.trim();
          return currentText ? `${currentText}, ${negativeTranslation.text}` : negativeTranslation.text;
        });
      }
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
      setError('strength는 0보다 크고 1 이하인 숫자로 입력해 주세요.');
      return;
    }

    updateImageParameters({ ...imageSettings, strength });
  }

  function updateImageParameters(nextImageSettings: ImageGenerationSettings) {
    setImageSettings(nextImageSettings);
    setImageSettingsDraft(imageSettingsToDraft(nextImageSettings));
    setStrengthControlValue(String(nextImageSettings.strength));
    sessionStorage.setItem(IMAGE_SETTINGS_SESSION_KEY, JSON.stringify(nextImageSettings));
    setError(null);
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
    const scribbleScale = Number(imageSettingsDraft.scribble_scale);
    const scribbleGuidanceStart = Number(imageSettingsDraft.scribble_guidance_start);
    const scribbleGuidanceEnd = Number(imageSettingsDraft.scribble_guidance_end);
    const poseScale = Number(imageSettingsDraft.pose_scale);
    const poseGuidanceStart = Number(imageSettingsDraft.pose_guidance_start);
    const poseGuidanceEnd = Number(imageSettingsDraft.pose_guidance_end);
    const clipSkip = imageSettingsDraft.clip_skip.trim() === ''
      ? null
      : Number(imageSettingsDraft.clip_skip);
    const sampler = imageSettingsDraft.sampler.trim().toLowerCase();
    const scheduler = imageSettingsDraft.scheduler.trim().toLowerCase();
    const modelFilename = imageSettingsDraft.model_filename.trim();

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
    if (!Number.isFinite(scribbleScale) || scribbleScale < 0 || scribbleScale > 2) {
      setImageSettingsError('Scribble scale은 0 이상 2 이하인 숫자로 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(scribbleGuidanceStart) || scribbleGuidanceStart < 0 || scribbleGuidanceStart > 1) {
      setImageSettingsError('Scribble start는 0 이상 1 이하인 숫자로 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(scribbleGuidanceEnd) || scribbleGuidanceEnd < 0 || scribbleGuidanceEnd > 1) {
      setImageSettingsError('Scribble end는 0 이상 1 이하인 숫자로 입력해 주세요.');
      return;
    }
    if (scribbleGuidanceEnd < scribbleGuidanceStart) {
      setImageSettingsError('Scribble end는 start 이상이어야 합니다.');
      return;
    }
    if (!Number.isFinite(poseScale) || poseScale < 0 || poseScale > 2) {
      setImageSettingsError('Pose scale은 0 이상 2 이하인 숫자로 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(poseGuidanceStart) || poseGuidanceStart < 0 || poseGuidanceStart > 1) {
      setImageSettingsError('Pose start는 0 이상 1 이하인 숫자로 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(poseGuidanceEnd) || poseGuidanceEnd < 0 || poseGuidanceEnd > 1) {
      setImageSettingsError('Pose end는 0 이상 1 이하인 숫자로 입력해 주세요.');
      return;
    }
    if (poseGuidanceEnd < poseGuidanceStart) {
      setImageSettingsError('Pose end는 start 이상이어야 합니다.');
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

    if (!imageModelFilenameOptions.includes(modelFilename)) {
      setImageSettingsError('Unsupported model file.');
      return;
    }

    const nextImageSettings: ImageGenerationSettings = {
      model_filename: modelFilename,
      model_filenames: imageModelFilenameOptions,
      prompt_default_positive: imageSettingsDraft.prompt_default_positive.trim(),
      prompt_default_negative: imageSettingsDraft.prompt_default_negative.trim(),
      steps,
      cfg,
      strength,
      sampler,
      scheduler,
      clip_skip: clipSkip,
      height,
      width,
      scribble_scale: scribbleScale,
      scribble_guidance_start: scribbleGuidanceStart,
      scribble_guidance_end: scribbleGuidanceEnd,
      pose_scale: poseScale,
      pose_guidance_start: poseGuidanceStart,
      pose_guidance_end: poseGuidanceEnd,
    };
    updateImageParameters(nextImageSettings);
    setImageSettingsError(null);
    setIsImageSettingsOpen(false);
  }

  function buildStatusChange() {
    const statusChange: Record<string, number> = { ...DEFAULT_STATUS_CHANGE };

    for (const field of STATUS_CHANGE_FIELDS) {
      const rawValue = statusChangeValues[field.key].trim();
      const parsedValue = rawValue === '' ? 0 : Number(rawValue);
      if (!Number.isInteger(parsedValue) || !Number.isFinite(parsedValue)) {
        setError(`${field.label} 변화량은 정수로 입력해 주세요.`);
        return null;
      }
      statusChange[field.key] = parsedValue;
    }

    return statusChange;
  }

  async function saveScene(mode: SaveMode, imagePayload: ImageEditorSubmitPayload | null = null) {
    const isImageSave = mode === 'image';
    const targetSceneId = sceneId ?? null;
    const trimmedPrompt = composedPrompt.trim();

    if (!trimmedPrompt) {
      setError('프롬프트 항목을 하나 이상 입력해 주세요.');
      return;
    }

    const statusChange = buildStatusChange();
    if (!statusChange) {
      return;
    }

    setSavingMode(mode);
    setError(null);
    try {
      if (isImageSave && !imagePayload) {
        throw new Error('이미지 생성 payload를 확인할 수 없습니다.');
      }

      const imagePromptColumns = imagePayload?.promptColumns ?? promptDraft;
      const sceneColumns = {
        prompt_situation: imagePromptColumns.prompt_situation.trim() || null,
        prompt_hero: imagePromptColumns.prompt_hero.trim() || null,
        prompt_camera: imagePromptColumns.prompt_camera.trim() || null,
        prompt_detail: imagePromptColumns.prompt_detail.trim() || null,
        prompt_negative: promptNegativeDraft.trim() || null,
      };

      const payload: GenerateSceneRequest = {
        scene_id: targetSceneId,
        script,
        status_change: statusChange,
        generate_image: isImageSave,
        ...sceneColumns,
      };
      const imagePromptPayload = isImageSave
        ? {
            ...payload,
            prompt_instant_positive: instantPromptDraft.prompt_instant_positive.trim() || null,
            prompt_instant_negative: instantPromptDraft.prompt_instant_negative.trim() || null,
          }
        : payload;
      const formData = new FormData();

      const imageSettingsForPayload = isImageSave && imagePayload
        ? imagePayload.parameters
        : imageSettings;
      formData.append('payload', JSON.stringify(
        isImageSave
          ? { ...imagePromptPayload, image_settings: imageSettingsForPayload }
          : imagePromptPayload,
      ));

      if (isImageSave && imagePayload) {
        if (imagePayload.image) {
          formData.append('image', imagePayload.image, 'scene-inpaint-image.png');
        }
        if (imagePayload.mask) {
          formData.append('mask', imagePayload.mask, 'scene-inpaint-mask.png');
        }
        if (imagePayload.scribbleImage) {
          formData.append('scribble_image', imagePayload.scribbleImage, 'scene-controlnet-scribble.png');
        }
        if (imagePayload.poseImage) {
          formData.append('pose_image', imagePayload.poseImage, 'scene-controlnet-openpose.png');
        }
      }

      const generatedScene = await dbTables.Scene.generateScene(formData);
      const generatedSceneId = generatedScene.id;
      if (!generatedSceneId) {
        throw new Error('Scene 저장 결과를 확인할 수 없습니다.');
      }

      preserveInstantPromptSceneIdRef.current = generatedSceneId;
      applySceneDraft(generatedScene, false);
      onSaved(generatedSceneId);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSavingMode(null);
    }
  }

  async function saveGeneratedImage(imagePayload: ImageEditorSubmitPayload) {
    await saveScene('image', imagePayload);
  }

  async function deleteScene() {
    if (sceneId === null) {
      return;
    }

    const deletedSceneId = sceneId;
    const shouldDelete = window.confirm(
      `Scene #${deletedSceneId}을 삭제할까요? 연결된 옵션도 함께 삭제됩니다.`,
    );
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await dbTables.Scene.deleteRows([deletedSceneId]);
      preserveInstantPromptSceneIdRef.current = null;
      onDeleted?.(deletedSceneId);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  function duplicateScene() {
    if (!onDuplicate || !activeScene) {
      return;
    }

    const statusChange = buildStatusChange();
    if (!statusChange) {
      return;
    }

    onDuplicate({
      id: null,
      image_url: activeScene.image_url ?? null,
      scribble_url: activeScene.scribble_url ?? null,
      pose_url: activeScene.pose_url ?? null,
      script,
      status_change: { ...statusChange },
      prompt_situation: promptDraft.prompt_situation,
      prompt_hero: promptDraft.prompt_hero,
      prompt_camera: promptDraft.prompt_camera,
      prompt_detail: promptDraft.prompt_detail,
      prompt_negative: promptNegativeDraft,
    });
  }

  return (
    <>
      <Panel
        className={cx(
          modalLayout
            ? 'max-h-[calc(100dvh-3rem)] w-[min(96rem,calc(100vw-2rem))] overflow-y-auto'
            : 'min-h-[calc(100vh-10rem)]',
        )}
        role={modalLayout ? 'dialog' : undefined}
        aria-modal={modalLayout ? true : undefined}
        aria-labelledby={modalLayout ? 'scene-edit-modal-title' : undefined}
      >
        <PanelHeader className="flex-wrap items-start">
          <div className="min-w-0">
            <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene edit</p>
            <h2
              id={modalLayout ? 'scene-edit-modal-title' : undefined}
              className="truncate text-base font-semibold text-[#fff7ef]"
            >
              {selectedLabel}
            </h2>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
            {sceneId !== null ? (
              <Button
                variant="danger"
                className="inline-flex items-center gap-2 !border-red-400 !bg-red-700 px-3 py-2 text-xs !text-white hover:enabled:!border-red-300 hover:enabled:!bg-red-600"
                onClick={() => void deleteScene()}
                disabled={!canDelete}
              >
                {isDeleting ? <Spinner aria-hidden="true" /> : null}
                {isDeleting ? '삭제 중' : '삭제'}
              </Button>
            ) : null}
            {modalLayout && onDuplicate && sceneId !== null ? (
              <Button
                className="inline-flex items-center gap-2 px-3 py-2 text-xs"
                onClick={() => confirmAction('현재 입력값으로 새 장면 편집을 세팅할까요?', duplicateScene)}
                disabled={!canDuplicate}
              >
                장면 복제
              </Button>
            ) : null}
            <Button
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={() =>
                confirmAction('텍스트만 저장할까요?', () => {
                  void saveScene('text');
                })}
              disabled={!canSaveText}
            >
              {savingMode === 'text' ? <Spinner aria-hidden="true" /> : null}
              텍스트만 저장
            </Button>
            <Button
              className="px-3 py-2 text-base leading-none"
              onClick={openImageSettings}
              disabled={!imageSettings || isBusy}
              aria-label="이미지 설정"
              title="이미지 설정"
            >
              ⚙️
            </Button>
            {modalLayout && onClose ? (
              <Button
                variant="danger"
                className="px-3 py-2 text-xs"
                onClick={() => {
                  preserveInstantPromptSceneIdRef.current = null;
                  onClose();
                }}
                disabled={isBusy}
              >
                닫기
              </Button>
            ) : null}
          </div>
        </PanelHeader>

        <SectionBody>
          <div className="space-y-4">
            {isLoadingScene ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-muted)]">
                <Spinner aria-hidden="true" />
                <span>Scene을 불러오는 중</span>
              </div>
            ) : null}

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
                    disabled={isLoadingScene || Boolean(savingMode)}
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
                    {PROMPT_EDITOR_COLUMNS.map((column) => {
                      const value = column.kind === 'stored'
                        ? promptDraft[column.key]
                        : column.kind === 'negative'
                          ? promptNegativeDraft
                          : instantPromptDraft[column.key];

                      return (
                        <div
                          key={column.key}
                          className="grid gap-2 border-b border-[rgba(255,208,222,0.16)] p-2 last:border-b-0 md:grid-cols-[5.5rem_minmax(0,1fr)] md:items-start"
                        >
                          <div className="pt-2">
                            <FieldLabel>{column.label}</FieldLabel>
                          </div>
                          <div
                            className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
                          >
                            <label className="block min-w-0">
                              <span className="sr-only">{column.label}</span>
                              <FormControl
                                as="textarea"
                                rows={1}
                                value={value}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (column.kind === 'stored') {
                                    setPromptDraft((current) => ({
                                      ...current,
                                      [column.key]: nextValue,
                                    }));
                                    return;
                                  }
                                  if (column.kind === 'negative') {
                                    setPromptNegativeDraft(nextValue);
                                    return;
                                  }
                                  setInstantPromptDraft((current) => ({
                                    ...current,
                                    [column.key]: nextValue,
                                  }));
                                }}
                                className="min-h-10 w-full resize-y px-3 py-2 text-sm"
                                disabled={isLoadingScene || Boolean(savingMode)}
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
                                disabled={isLoadingScene || Boolean(savingMode) || isTranslatingPromptColumns}
                              />
                            </label>
                          </div>
                          {column.kind === 'stored' ? (
                            <div className="flex min-w-0 flex-wrap gap-1.5 md:col-start-2">
                              {recommendations[column.key].slice(0, 12).map((tag) => (
                                <Button
                                  key={`${column.key}-${tag}`}
                                  className="px-2 py-1 text-xs"
                                  onClick={() => appendRecommendation(column.key, tag)}
                                  disabled={isLoadingScene || Boolean(savingMode) || isTranslatingPromptColumns}
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
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <aside className="min-w-0 space-y-3">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
                        <span>strength</span>
                        <FormControl
                          type="number"
                          min="0.01"
                          max="1"
                          step="0.01"
                          value={strengthControlValue}
                          onChange={(event) => updateImageStrength(event.target.value)}
                          className="h-8 w-24 px-2 text-right text-xs"
                          disabled={isLoadingScene || Boolean(savingMode) || !imageSettings}
                        />
                      </label>
                      {QUICK_IMAGE_STRENGTHS.map((strength) => (
                        <Button
                          key={strength}
                          className="h-7 px-2.5 py-0 text-xs"
                          variant={imageSettings?.strength === strength ? 'primary' : 'default'}
                          onClick={() => updateImageStrength(String(strength))}
                          disabled={isLoadingScene || Boolean(savingMode) || !imageSettings}
                        >
                          {strength === 1 ? '1.0' : String(strength)}
                        </Button>
                      ))}
                    </div>

                    {imageSettings ? (
                      <ImageEditor
                        parameters={imageSettings}
                        promptColumns={promptDraft}
                        baseImageUrl={activeScene?.image_url ?? null}
                        scribbleImageUrl={activeScene?.scribble_url ?? null}
                        poseImageUrl={activeScene?.pose_url ?? null}
                        disabled={!canSaveText || isLoadingScene}
                        isSubmitting={savingMode === 'image'}
                        onParameterUpdated={updateImageParameters}
                        onSubmit={saveGeneratedImage}
                      />
                    ) : (
                      <div className="grid aspect-square min-h-72 w-full place-items-center rounded-[8px] border border-[rgba(255,218,228,0.22)] bg-[rgba(15,5,20,0.78)] p-6 text-center text-[0.95rem] text-[var(--app-muted)]">
                        이미지 설정을 불러오는 중
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel>상태 변화</FieldLabel>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                    {STATUS_CHANGE_FIELDS.map((field) => (
                      <label
                        key={field.key}
                        className="grid min-w-0 gap-1 text-xs font-semibold text-[#fff1f5]"
                      >
                        <span className="truncate">{field.label}</span>
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
                          disabled={isLoadingScene || Boolean(savingMode)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </aside>
            </div>

            {error ? (
              <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
            ) : null}
          </div>
        </SectionBody>
      </Panel>

      {isImageSettingsOpen && imageSettingsDraft ? (
        <ModalBackdrop nested={modalLayout} role="presentation">
          <Panel
            className="max-h-[min(46rem,calc(100dvh-3rem))] w-[min(48rem,100%)] overflow-y-auto"
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
                <FieldLabel>model</FieldLabel>
                <FormControl
                  as="select"
                  value={imageSettingsDraft.model_filename}
                  onChange={(event) => updateImageSettingsDraft('model_filename', event.target.value)}
                  className="h-10 w-full px-3 text-sm"
                >
                  {imageModelFilenameOptions.map((modelFilename) => (
                    <option key={modelFilename} value={modelFilename}>{modelFilename}</option>
                  ))}
                </FormControl>
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <FieldLabel>prompt default positive</FieldLabel>
                <FormControl
                  as="textarea"
                  value={imageSettingsDraft.prompt_default_positive}
                  onChange={(event) => updateImageSettingsDraft('prompt_default_positive', event.target.value)}
                  className="min-h-20 w-full resize-y px-3 py-2 text-sm"
                />
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <FieldLabel>prompt default negative</FieldLabel>
                <FormControl
                  as="textarea"
                  value={imageSettingsDraft.prompt_default_negative}
                  onChange={(event) => updateImageSettingsDraft('prompt_default_negative', event.target.value)}
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
                <WizardSettingsInput label="scribble scale" value={imageSettingsDraft.scribble_scale} onChange={(value) => updateImageSettingsDraft('scribble_scale', value)} min="0" step="0.05" />
                <WizardSettingsInput label="scribble start" value={imageSettingsDraft.scribble_guidance_start} onChange={(value) => updateImageSettingsDraft('scribble_guidance_start', value)} min="0" step="0.05" />
                <WizardSettingsInput label="scribble end" value={imageSettingsDraft.scribble_guidance_end} onChange={(value) => updateImageSettingsDraft('scribble_guidance_end', value)} min="0" step="0.05" />
                <WizardSettingsInput label="pose scale" value={imageSettingsDraft.pose_scale} onChange={(value) => updateImageSettingsDraft('pose_scale', value)} min="0" step="0.05" />
                <WizardSettingsInput label="pose start" value={imageSettingsDraft.pose_guidance_start} onChange={(value) => updateImageSettingsDraft('pose_guidance_start', value)} min="0" step="0.05" />
                <WizardSettingsInput label="pose end" value={imageSettingsDraft.pose_guidance_end} onChange={(value) => updateImageSettingsDraft('pose_guidance_end', value)} min="0" step="0.05" />
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
    </>
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
