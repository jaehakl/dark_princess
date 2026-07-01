import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { dbTables } from '../../api/api';
import { useImageSettingsStore } from '../../api/store';
import type {
  GenerateCutRequest,
  ImageRecord,
  PromptColumnName,
  CutRecord,
} from '../../api/type';
import type { ImageEditorHandle, ImageEditorSubmitPayload } from '../image-editor';
import {
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
  Button,
  ModalBackdrop,
} from '../ui';
import {
  DEFAULT_STATUS_CHANGE,
  EMPTY_INSTANT_PROMPT_DRAFT,
  EMPTY_PROMPT_DRAFT,
  EMPTY_TRANSLATION_DRAFT,
  FETCH_CUT_BY_ID_REQUEST,
  FETCH_SCENE_BY_ID_REQUEST,
  FETCH_SCENE_CUTS_REQUEST,
  PROMPT_COLUMNS,
  PROMPT_EDITOR_COLUMNS,
  STATUS_CHANGE_FIELDS,
} from './constants';
import { CutEditorHeader } from './CutEditorHeader';
import { CutImagePanel } from './CutImagePanel';
import { CutImportModal } from './CutImportModal';
import { CutPromptPanel } from './CutPromptPanel';
import { CutVoicevoxModal } from './CutVoicevoxModal';
import { buildCutContext } from './cutContext';
import { generatePromptItemsFromScript } from './promptGeneration';
import { generateCutScript } from './scriptGeneration';
import { translatePromptTexts } from './promptTranslation';
import type { CutImportFields } from './CutImportModal';
import type {
  InstantPromptName,
  PromptEditorColumnName,
  SaveMode,
  CutEditComponentProps,
  StatusChangeValues,
} from './types';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function cutToPromptDraft(cut: CutRecord): Record<PromptColumnName, string> {
  return {
    prompt_situation: cut.prompt_situation ?? '',
    prompt_hero: cut.prompt_hero ?? '',
    prompt_detail: cut.prompt_detail ?? '',
    prompt_camera: cut.prompt_camera ?? '',
  };
}

function appendText(currentValue: string, nextValue: string | null | undefined, separator: string) {
  const nextText = (nextValue ?? '').trim();
  if (!nextText) {
    return currentValue;
  }

  const currentText = currentValue.trim();
  return currentText ? `${currentText}${separator}${nextText}` : nextText;
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

function promptColumnsToCutPayload(
  promptColumns: Record<PromptColumnName, string>,
  promptNegative: string,
) {
  return {
    prompt_situation: promptColumns.prompt_situation.trim() || null,
    prompt_hero: promptColumns.prompt_hero.trim() || null,
    prompt_detail: promptColumns.prompt_detail.trim() || null,
    prompt_camera: promptColumns.prompt_camera.trim() || null,
    prompt_negative: promptNegative.trim() || null,
  };
}

export function CutEditComponent({
  cutId,
  initialCut,
  onSaved,
  onDeleted,
}: CutEditComponentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeCut, setActiveCut] = useState<CutRecord | null>(initialCut);
  const [isLoadingCut, setIsLoadingCut] = useState(false);
  const [promptDraft, setPromptDraft] = useState<Record<PromptColumnName, string>>(
    () => cutToPromptDraft(initialCut),
  );
  const [instantPromptDraft, setInstantPromptDraft] = useState<Record<InstantPromptName, string>>({
    ...EMPTY_INSTANT_PROMPT_DRAFT,
  });
  const [promptNegativeDraft, setPromptNegativeDraft] = useState(initialCut.prompt_negative ?? '');
  const [translationDraft, setTranslationDraft] = useState<Record<PromptEditorColumnName, string>>({
    ...EMPTY_TRANSLATION_DRAFT,
  });
  const [script, setScript] = useState(initialCut.script ?? '');
  const [statusChangeValues, setStatusChangeValues] = useState<StatusChangeValues>(
    () => statusChangeToValues(initialCut.status_change),
  );
  const imageSettingsDefaults = useImageSettingsStore((state) => state.defaults);
  const imageSettings = useImageSettingsStore((state) => state.settings);
  const imageSettingsError = useImageSettingsStore((state) => state.error);
  const isLoadingImageSettings = useImageSettingsStore((state) => state.isLoading);
  const loadImageSettingsDefaults = useImageSettingsStore((state) => state.loadDefaults);
  const openImageSettings = useImageSettingsStore((state) => state.openDialog);
  const updateImageParameters = useImageSettingsStore((state) => state.updateSettings);
  const [strengthControlValue, setStrengthControlValue] = useState('');
  const [imageHistory, setImageHistory] = useState({ ids: [] as number[], index: -1 });
  const [selectedImageOverride, setSelectedImageOverride] = useState<ImageRecord | null>(null);
  const [isLoadingHistoryImage, setIsLoadingHistoryImage] = useState(false);
  const [isUpdatingCutImage, setIsUpdatingCutImage] = useState(false);
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isTranslatingPromptColumns, setIsTranslatingPromptColumns] = useState(false);
  const [isGeneratingPromptItems, setIsGeneratingPromptItems] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCutContextOpen, setIsCutContextOpen] = useState(false);
  const [isCutImportOpen, setIsCutImportOpen] = useState(false);
  const [voiceScriptSnapshot, setVoiceScriptSnapshot] = useState<string | null>(null);
  const [isLoadingCutContext, setIsLoadingCutContext] = useState(false);
  const [cutContextText, setCutContextText] = useState('');
  const [cutContextError, setCutContextError] = useState<string | null>(null);
  const preserveInstantPromptCutIdRef = useRef<number | null>(null);
  const imageEditorRef = useRef<ImageEditorHandle | null>(null);

  const composedPrompt = useMemo(
    () =>
      PROMPT_COLUMNS
        .map((column) => promptDraft[column.key].trim())
        .filter(Boolean)
        .join(', '),
    [promptDraft],
  );
  const isBusy = (
    isLoadingCut ||
    isLoadingHistoryImage ||
    isUpdatingCutImage ||
    isUpdatingFavorite ||
    isGeneratingScript ||
    isTranslatingPromptColumns ||
    isGeneratingPromptItems ||
    isDeleting ||
    Boolean(savingMode)
  );
  const canEdit = Boolean(activeCut);
  const canSaveData = canEdit && composedPrompt.length > 0 && !isBusy;
  const canDelete = cutId !== null && !isBusy;
  const canToggleFavorite = canEdit && !isBusy;
  const canOpenImport = canEdit && !isBusy;
  const activeSceneId = typeof activeCut?.scene_id === 'number' ? activeCut.scene_id : null;
  const activeCutId = typeof cutId === 'number' ? cutId : null;
  const sceneEditPath = activeSceneId === null
    ? activeCut && activeCut.scene_id == null ? '/scene-edit/unassigned' : null
    : `/scene-edit/${activeSceneId}`;
  const isCurrentSceneEditUrl = sceneEditPath !== null
    && activeCutId !== null
    && location.pathname.replace(/\/$/, '') === sceneEditPath
    && new URLSearchParams(location.search).get('cut_id') === String(activeCutId);
  const canOpenSceneEdit = sceneEditPath !== null && activeCutId !== null && !isCurrentSceneEditUrl;
  const canOpenCutContext = canEdit && typeof activeCut?.scene_id === 'number' && !isBusy && !isLoadingCutContext;
  const canTranslatePromptColumns =
    canEdit
    && !isBusy
    && PROMPT_EDITOR_COLUMNS.some(
      (column) => column.key !== 'prompt_camera' && translationDraft[column.key].trim().length > 0,
    );
  const canGeneratePromptItems = canEdit && script.trim().length > 0 && !isBusy;
  const canOpenScriptVoice = canEdit && script.trim().length > 0 && !isBusy;
  const cameraSamples = imageSettingsDefaults?.camera_samples ?? imageSettings?.camera_samples ?? {};
  const displayedImageId = selectedImageOverride?.id ?? activeCut?.image_id ?? null;
  const displayedBaseImageUrl = selectedImageOverride
    ? selectedImageOverride.image_object_key ?? null
    : activeCut?.image_url ?? null;
  const displayedScribbleImageUrl = selectedImageOverride
    ? selectedImageOverride.scribble_object_key ?? null
    : activeCut?.scribble_url ?? null;
  const displayedPoseImageUrl = selectedImageOverride
    ? selectedImageOverride.pose_object_key ?? null
    : activeCut?.pose_url ?? null;
  const canGoPreviousImage = imageHistory.index > 0;
  const canGoNextImage = imageHistory.index >= 0 && imageHistory.index < imageHistory.ids.length - 1;
  const selectedLabel = cutId === null
    ? '새 Cut 생성'
    : isLoadingCut
      ? `Cut #${cutId} 불러오는 중`
      : `Cut #${cutId}`;

  const applyCutDraft = useCallback((cut: CutRecord, resetInstantPrompts = true) => {
    setActiveCut(cut);
    setPromptDraft(cutToPromptDraft(cut));
    setPromptNegativeDraft(cut.prompt_negative ?? '');
    if (resetInstantPrompts) {
      setInstantPromptDraft({ ...EMPTY_INSTANT_PROMPT_DRAFT });
    }
    setTranslationDraft({ ...EMPTY_TRANSLATION_DRAFT });
    setScript(cut.script ?? '');
    setStatusChangeValues(statusChangeToValues(cut.status_change));
    setError(null);
    setIsUpdatingFavorite(false);
    setIsGeneratingScript(false);
    setIsCutContextOpen(false);
    setIsCutImportOpen(false);
    setVoiceScriptSnapshot(null);
    setIsLoadingCutContext(false);
    setCutContextText('');
    setCutContextError(null);
  }, []);

  useEffect(() => {
    if (cutId === null) {
      setIsLoadingCut(false);
      setIsUpdatingCutImage(false);
      setIsUpdatingFavorite(false);
      setIsGeneratingScript(false);
      setIsDeleting(false);
      setSavingMode(null);
      preserveInstantPromptCutIdRef.current = null;
      applyCutDraft({ ...initialCut, id: null });
      return;
    }

    const targetCutId = cutId;
    let isCancelled = false;

    async function loadCut() {
      setIsLoadingCut(true);
      setIsUpdatingCutImage(false);
      setIsUpdatingFavorite(false);
      setIsGeneratingScript(false);
      setIsDeleting(false);
      setSavingMode(null);
      setActiveCut(null);
      setError(null);
      try {
        const cutResponse = await dbTables.Cut.listRows({
          ...FETCH_CUT_BY_ID_REQUEST,
          selected_ids: [targetCutId],
        });
        const loadedCut = cutResponse.items[0];
        if (!loadedCut) {
          throw new Error(`Cut #${targetCutId}을 찾을 수 없습니다.`);
        }
        if (!isCancelled) {
          const shouldPreserveInstantPrompts = preserveInstantPromptCutIdRef.current === targetCutId;
          if (shouldPreserveInstantPrompts || preserveInstantPromptCutIdRef.current !== null) {
            preserveInstantPromptCutIdRef.current = null;
          }
          applyCutDraft(loadedCut, !shouldPreserveInstantPrompts);
        }
      } catch (loadError) {
        if (!isCancelled) {
          preserveInstantPromptCutIdRef.current = null;
          setActiveCut(null);
          setPromptDraft({ ...EMPTY_PROMPT_DRAFT });
          setInstantPromptDraft({ ...EMPTY_INSTANT_PROMPT_DRAFT });
          setPromptNegativeDraft('');
          setTranslationDraft({ ...EMPTY_TRANSLATION_DRAFT });
          setScript('');
          setStatusChangeValues(statusChangeToValues(DEFAULT_STATUS_CHANGE));
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingCut(false);
        }
      }
    }

    void loadCut();
    return () => {
      isCancelled = true;
    };
  }, [applyCutDraft, initialCut, cutId]);

  useEffect(() => {
    setImageHistory({ ids: [], index: -1 });
    setSelectedImageOverride(null);
    setIsLoadingHistoryImage(false);
    setIsUpdatingCutImage(false);
    setIsUpdatingFavorite(false);
    setIsGeneratingScript(false);
    setIsCutImportOpen(false);
  }, [cutId]);

  useEffect(() => {
    const nextImageId = activeCut?.image_id;
    if (!nextImageId || (cutId !== null && activeCut?.id !== cutId)) {
      setSelectedImageOverride(null);
      return;
    }

    setImageHistory((current) => {
      const currentImageId = current.index >= 0 ? current.ids[current.index] : null;
      if (currentImageId === nextImageId) {
        return current;
      }

      const baseIds = current.index >= 0
        ? current.ids.slice(0, current.index + 1)
        : [];
      if (baseIds[baseIds.length - 1] === nextImageId) {
        return { ids: baseIds, index: baseIds.length - 1 };
      }

      const nextIds = [...baseIds, nextImageId];
      return { ids: nextIds, index: nextIds.length - 1 };
    });
    setSelectedImageOverride(null);
  }, [activeCut?.id, activeCut?.image_id, cutId]);

  useEffect(() => {
    if (!imageSettings && !imageSettingsDefaults && !isLoadingImageSettings) {
      void loadImageSettingsDefaults();
    }
  }, [imageSettings, imageSettingsDefaults, isLoadingImageSettings, loadImageSettingsDefaults]);

  useEffect(() => {
    if (imageSettings) {
      setStrengthControlValue(String(imageSettings.strength));
    }
  }, [imageSettings]);

  useEffect(() => {
    setIsCutContextOpen(false);
    setIsLoadingCutContext(false);
    setCutContextText('');
    setCutContextError(null);
  }, [cutId]);

  async function handleGeneratePromptItemsFromScript() {
    const trimmedScript = script.trim();
    if (!trimmedScript) {
      setError('스크립트를 입력해 주세요.');
      return;
    }

    setIsGeneratingPromptItems(true);
    setError(null);
    try {
      const nextGeneratedPrompt = await generatePromptItemsFromScript(trimmedScript);
      setPromptDraft({
        prompt_situation: nextGeneratedPrompt.prompt_situation,
        prompt_hero: nextGeneratedPrompt.prompt_hero,
        prompt_detail: nextGeneratedPrompt.prompt_detail,
        prompt_camera: nextGeneratedPrompt.prompt_camera,
      });
      setPromptNegativeDraft(nextGeneratedPrompt.prompt_negative);
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    } finally {
      setIsGeneratingPromptItems(false);
    }
  }

  async function translatePromptColumns() {
    const targets = PROMPT_EDITOR_COLUMNS
      .filter((column) => column.key !== 'prompt_camera')
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
      const translatedTexts = await translatePromptTexts(targets.map((target) => target.text));
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
    setError(null);
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

  async function loadHistoryImage(index: number) {
    const imageId = imageHistory.ids[index];
    if (!imageId) {
      return;
    }

    setIsLoadingHistoryImage(true);
    setError(null);
    try {
      const imageResponse = await dbTables.Image.listRows({
        offset: 0,
        limit: 1,
        selected_ids: [imageId],
        search_text: null,
        text_filter: {},
        filter: {},
        sort: null,
      });
      const image = imageResponse.items.find((item) => item.id === imageId) ?? imageResponse.items[0];
      if (!image) {
        throw new Error(`Image #${imageId}을 찾을 수 없습니다.`);
      }
      if (!image.image_object_key) {
        throw new Error(`Image #${imageId}에 이미지 URL이 없습니다.`);
      }

      setSelectedImageOverride(image);
      setImageHistory((current) => (
        current.ids[index] === imageId
          ? { ...current, index }
          : current
      ));
    } catch (historyImageError) {
      setError(getErrorMessage(historyImageError));
    } finally {
      setIsLoadingHistoryImage(false);
    }
  }

  async function loadCutContext(currentCut: CutRecord) {
    const sceneId = currentCut.scene_id;
    if (typeof sceneId !== 'number') {
      throw new Error('Scene ID를 확인할 수 없습니다.');
    }

    const [sceneResponse, cutResponse] = await Promise.all([
      dbTables.Scene.listRows({
        ...FETCH_SCENE_BY_ID_REQUEST,
        selected_ids: [sceneId],
      }),
      dbTables.Cut.listRows({
        ...FETCH_SCENE_CUTS_REQUEST,
        filter: { scene_id: [sceneId, sceneId] },
      }),
    ]);
    const scene = sceneResponse.items[0];
    if (!scene) {
      throw new Error(`Scene #${sceneId}을 찾을 수 없습니다.`);
    }

    return buildCutContext(scene, cutResponse.items, currentCut.prev_cut_id ?? null);
  }

  async function handleGenerateScript() {
    const currentCut = activeCut;
    if (!currentCut) {
      setError('Cut을 먼저 불러와 주세요.');
      return;
    }

    setIsGeneratingScript(true);
    setError(null);
    try {
      const previousSituation = await loadCutContext(currentCut);
      const generatedScript = await generateCutScript(previousSituation, script);
      setScript((currentScript) => {
        const trimmedCurrentScript = currentScript.trim();
        return trimmedCurrentScript ? `${trimmedCurrentScript}\n${generatedScript}` : generatedScript;
      });
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    } finally {
      setIsGeneratingScript(false);
    }
  }

  async function openCutContextModal() {
    const currentCut = activeCut;
    if (!currentCut) {
      setError('Scene ID를 확인할 수 없습니다.');
      return;
    }

    setIsCutContextOpen(true);
    setIsLoadingCutContext(true);
    setCutContextText('');
    setCutContextError(null);
    try {
      setCutContextText(await loadCutContext(currentCut));
    } catch (contextError) {
      setCutContextText('');
      setCutContextError(getErrorMessage(contextError));
    } finally {
      setIsLoadingCutContext(false);
    }
  }

  function openScriptVoiceModal() {
    const scriptSnapshot = script.trim();
    if (!scriptSnapshot) {
      setError('음성으로 만들 컷 스크립트를 입력해 주세요.');
      return;
    }

    setVoiceScriptSnapshot(scriptSnapshot);
    setError(null);
  }

  async function toggleFavorite() {
    const currentCut = activeCut;
    if (!currentCut) {
      setError('Cut을 먼저 불러와 주세요.');
      return;
    }

    const nextFavorited = !(currentCut.favorited ?? false);
    if (cutId === null) {
      setActiveCut({ ...currentCut, favorited: nextFavorited });
      setError(null);
      return;
    }

    setIsUpdatingFavorite(true);
    setError(null);
    try {
      const updatedCut = await dbTables.Cut.updateFavorite({
        cut_id: cutId,
        favorited: nextFavorited,
      });
      setActiveCut((current) => (
        current
          ? { ...current, favorited: updatedCut.favorited ?? nextFavorited }
          : updatedCut
      ));
    } catch (favoriteError) {
      setError(getErrorMessage(favoriteError));
    } finally {
      setIsUpdatingFavorite(false);
    }
  }

  async function importCutDraft(importCut: CutRecord, fields: CutImportFields) {
    if (!Object.values(fields).some(Boolean)) {
      throw new Error('가져올 항목을 하나 이상 선택해 주세요.');
    }

    if (fields.image) {
      const imageUrl = importCut.image_url?.trim();
      if (!imageUrl) {
        throw new Error('선택한 Cut에 가져올 이미지가 없습니다.');
      }
      if (!imageEditorRef.current) {
        throw new Error('이미지 에디터를 사용할 수 없습니다.');
      }
      await imageEditorRef.current.addImageObjectFromUrl(imageUrl);
    }

    if (fields.script) {
      setScript((current) => appendText(current, importCut.script, '\n'));
    }

    if (fields.prompt) {
      setPromptDraft((current) => ({
        prompt_situation: appendText(current.prompt_situation, importCut.prompt_situation, ', '),
        prompt_hero: appendText(current.prompt_hero, importCut.prompt_hero, ', '),
        prompt_detail: appendText(current.prompt_detail, importCut.prompt_detail, ', '),
        prompt_camera: appendText(current.prompt_camera, importCut.prompt_camera, ', '),
      }));
      setPromptNegativeDraft((current) => appendText(current, importCut.prompt_negative, ', '));
    }

    if (fields.status_change) {
      setStatusChangeValues(statusChangeToValues(importCut.status_change));
    }

    setError(null);
  }

  function goPreviousImage() {
    if (!canGoPreviousImage || isBusy || isLoadingHistoryImage) {
      return;
    }
    void loadHistoryImage(imageHistory.index - 1);
  }

  function goNextImage() {
    if (!canGoNextImage || isBusy || isLoadingHistoryImage) {
      return;
    }
    void loadHistoryImage(imageHistory.index + 1);
  }

  function addImageToHistory(imageId: number) {
    setImageHistory((current) => {
      const existingIndex = current.ids.indexOf(imageId);
      if (existingIndex >= 0) {
        return { ...current, index: existingIndex };
      }
      const baseIds = current.index >= 0
        ? current.ids.slice(0, current.index + 1)
        : current.ids;
      return { ids: [...baseIds, imageId], index: baseIds.length };
    });
  }

  async function selectLineageImage(image: ImageRecord) {
    const imageId = image.id;
    if (typeof imageId !== 'number') {
      setError('Image ID를 확인할 수 없습니다.');
      return;
    }
    if (!image.image_object_key) {
      setError(`Image #${imageId}에 이미지 URL이 없습니다.`);
      return;
    }

    if (cutId === null) {
      setSelectedImageOverride(image);
      addImageToHistory(imageId);
      setError(null);
      return;
    }

    setIsUpdatingCutImage(true);
    setError(null);
    try {
      const updatedCut = await dbTables.Cut.updateImage({
        cut_id: cutId,
        image_id: imageId,
      });
      setActiveCut((current) => (
        current
          ? {
              ...current,
              image_id: updatedCut.image_id ?? null,
              image_url: updatedCut.image_url ?? null,
              scribble_url: updatedCut.scribble_url ?? null,
              pose_url: updatedCut.pose_url ?? null,
            }
          : updatedCut
      ));
      setSelectedImageOverride(null);
    } catch (selectError) {
      setError(getErrorMessage(selectError));
    } finally {
      setIsUpdatingCutImage(false);
    }
  }

  async function submitCutForm(formData: FormData) {
    const generatedCut = await dbTables.Cut.generateCut(formData);
    const generatedCutId = generatedCut.id;
    if (!generatedCutId) {
      throw new Error('Cut 저장 결과를 확인할 수 없습니다.');
    }

    preserveInstantPromptCutIdRef.current = generatedCutId;
    applyCutDraft(generatedCut, false);
    onSaved(generatedCutId);
  }

  async function saveDataOnlyCut() {
    const trimmedPrompt = composedPrompt.trim();

    if (!trimmedPrompt) {
      setError('프롬프트 항목을 하나 이상 입력해 주세요.');
      return;
    }

    const statusChange = buildStatusChange();
    if (!statusChange) {
      return;
    }

    setSavingMode('data');
    setError(null);
    try {
      const payload: GenerateCutRequest = {
        cut_id: cutId ?? null,
        image_id: displayedImageId,
        scene_id: activeCut?.scene_id ?? null,
        prev_cut_id: activeCut?.prev_cut_id ?? null,
        script,
        status_change: statusChange,
        favorited: activeCut?.favorited ?? false,
        generate_image: false,
        ...promptColumnsToCutPayload(promptDraft, promptNegativeDraft),
      };
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));

      await submitCutForm(formData);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSavingMode(null);
    }
  }

  async function saveGeneratedImage(imagePayload: ImageEditorSubmitPayload) {
    const trimmedPrompt = composedPrompt.trim();

    if (!trimmedPrompt) {
      setError('프롬프트 항목을 하나 이상 입력해 주세요.');
      return;
    }

    const statusChange = buildStatusChange();
    if (!statusChange) {
      return;
    }

    setSavingMode('image');
    setError(null);
    try {
      const payload: GenerateCutRequest = {
        cut_id: cutId ?? null,
        scene_id: activeCut?.scene_id ?? null,
        prev_cut_id: activeCut?.prev_cut_id ?? null,
        parent_image_id: displayedImageId,
        script,
        status_change: statusChange,
        favorited: activeCut?.favorited ?? false,
        generate_image: true,
        image_settings: imagePayload.parameters,
        ...promptColumnsToCutPayload(imagePayload.promptColumns, promptNegativeDraft),
        prompt_instant_positive: instantPromptDraft.prompt_instant_positive.trim() || null,
        prompt_instant_negative: instantPromptDraft.prompt_instant_negative.trim() || null,
      };
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));

      if (imagePayload.image) {
        formData.append('image', imagePayload.image, 'cut-inpaint-image.png');
      }
      if (imagePayload.mask) {
        formData.append('mask', imagePayload.mask, 'cut-inpaint-mask.png');
      }
      if (imagePayload.scribbleImage) {
        formData.append('scribble_image', imagePayload.scribbleImage, 'cut-controlnet-scribble.png');
      }
      if (imagePayload.poseImage) {
        formData.append('pose_image', imagePayload.poseImage, 'cut-controlnet-openpose.png');
      }

      await submitCutForm(formData);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSavingMode(null);
    }
  }

  async function deleteCut() {
    if (cutId === null) {
      return;
    }

    const deletedCutId = cutId;
    const shouldDelete = window.confirm(
      `Cut #${deletedCutId}을 삭제할까요? 연결된 옵션도 함께 삭제됩니다.`,
    );
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await dbTables.Cut.deleteRows([deletedCutId]);
      preserveInstantPromptCutIdRef.current = null;
      onDeleted?.(deletedCutId);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  function openSceneEdit() {
    if (sceneEditPath === null || activeCutId === null) {
      return;
    }

    navigate(`${sceneEditPath}?cut_id=${activeCutId}`);
  }

  return (
    <>
      <Panel
        className="min-h-[calc(100vh-10rem)]"
      >
        <CutEditorHeader
          selectedLabel={selectedLabel}
          cutId={cutId}
          favorited={activeCut?.favorited ?? false}
          canDelete={canDelete}
          canToggleFavorite={canToggleFavorite}
          canOpenImport={canOpenImport}
          canOpenSceneEdit={canOpenSceneEdit}
          canSaveData={canSaveData}
          canOpenCutContext={canOpenCutContext}
          canOpenImageSettings={Boolean(imageSettings && !isBusy)}
          isDeleting={isDeleting}
          isUpdatingFavorite={isUpdatingFavorite}
          savingMode={savingMode}
          onDelete={() => void deleteCut()}
          onToggleFavorite={() => void toggleFavorite()}
          onOpenImport={() => setIsCutImportOpen(true)}
          onOpenSceneEdit={openSceneEdit}
          onSaveData={() => {
            void saveDataOnlyCut();
          }}
          onOpenCutContext={() => void openCutContextModal()}
          onOpenImageSettings={openImageSettings}
        />

        <SectionBody>
          <div className="space-y-4">
            {isLoadingCut ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-muted)]">
                <Spinner aria-hidden="true" />
                <span>Cut을 불러오는 중</span>
              </div>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.44fr)] xl:items-start">
              <CutPromptPanel
                script={script}
                promptDraft={promptDraft}
                instantPromptDraft={instantPromptDraft}
                promptNegativeDraft={promptNegativeDraft}
                translationDraft={translationDraft}
                cameraSamples={cameraSamples}
                isLoadingCut={isLoadingCut}
                savingMode={savingMode}
                isGeneratingScript={isGeneratingScript}
                isTranslatingPromptColumns={isTranslatingPromptColumns}
                isGeneratingPromptItems={isGeneratingPromptItems}
                canGenerateScript={canEdit && typeof activeCut?.scene_id === 'number' && !isBusy}
                canTranslatePromptColumns={canTranslatePromptColumns}
                canGeneratePromptItems={canGeneratePromptItems}
                canOpenScriptVoice={canOpenScriptVoice}
                setScript={setScript}
                setPromptDraft={setPromptDraft}
                setInstantPromptDraft={setInstantPromptDraft}
                setPromptNegativeDraft={setPromptNegativeDraft}
                setTranslationDraft={setTranslationDraft}
                onGenerateScript={() => void handleGenerateScript()}
                onGeneratePromptItems={() => void handleGeneratePromptItemsFromScript()}
                onTranslatePromptColumns={() => void translatePromptColumns()}
                onOpenScriptVoice={openScriptVoiceModal}
              />

              <CutImagePanel
                cutId={cutId}
                imageId={displayedImageId}
                baseImageUrl={displayedBaseImageUrl}
                scribbleImageUrl={displayedScribbleImageUrl}
                poseImageUrl={displayedPoseImageUrl}
                imageSettings={imageSettings}
                promptDraft={promptDraft}
                strengthControlValue={strengthControlValue}
                statusChangeValues={statusChangeValues}
                canSaveData={canSaveData}
                isLoadingCut={isLoadingCut}
                isLoadingHistoryImage={isLoadingHistoryImage}
                isLoadingImageSettings={isLoadingImageSettings}
                imageSettingsError={imageSettingsError}
                savingMode={savingMode}
                canGoPreviousImage={canGoPreviousImage}
                canGoNextImage={canGoNextImage}
                imageEditorRef={imageEditorRef}
                setStatusChangeValues={setStatusChangeValues}
                onImageStrengthChange={updateImageStrength}
                onImageParametersUpdated={updateImageParameters}
                onSubmitImage={saveGeneratedImage}
                onPreviousImage={goPreviousImage}
                onNextImage={goNextImage}
                onSelectLineageImage={selectLineageImage}
              />
            </div>

            {error ? (
              <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
            ) : null}
          </div>
        </SectionBody>
      </Panel>
      {isCutContextOpen ? (
        <ModalBackdrop role="presentation" topAligned>
          <Panel
            role="dialog"
            aria-modal="true"
            className="max-h-[calc(100dvh-3rem)] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto"
          >
            <PanelHeader>
              <h2 className="text-base font-semibold text-[#fff7ef]">cut_context</h2>
              <Button className="px-3 py-2 text-xs" onClick={() => setIsCutContextOpen(false)}>
                닫기
              </Button>
            </PanelHeader>
            <SectionBody>
              {isLoadingCutContext ? (
                <div className="flex min-h-72 items-center justify-center gap-3 text-sm font-semibold text-[var(--app-muted)]">
                  <Spinner aria-hidden="true" />
                  <span>cut_context를 불러오는 중</span>
                </div>
              ) : (
                <pre className="min-h-72 whitespace-pre-wrap rounded-[8px] border border-[rgba(255,196,214,0.28)] bg-[rgba(9,3,14,0.76)] p-4 text-sm leading-6 text-[var(--app-text)]">
                  {cutContextError ?? (cutContextText || '표시할 cut_context가 없습니다.')}
                </pre>
              )}
            </SectionBody>
          </Panel>
        </ModalBackdrop>
      ) : null}
      {isCutImportOpen ? (
        <CutImportModal
          currentCutId={cutId}
          onClose={() => setIsCutImportOpen(false)}
          onSelect={importCutDraft}
        />
      ) : null}
      {voiceScriptSnapshot !== null ? (
        <CutVoicevoxModal
          script={voiceScriptSnapshot}
          onClose={() => setVoiceScriptSnapshot(null)}
        />
      ) : null}
    </>
  );
}
