import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbTables } from '../../api/api';
import { useImageSettingsStore } from '../../api/store';
import type {
  GenerateSceneRequest,
  ImageRecord,
  PromptColumnName,
  SceneRecord,
} from '../../api/type';
import type { ImageEditorSubmitPayload } from '../image-editor';
import {
  Panel,
  SectionBody,
  Spinner,
  cx,
} from '../ui';
import {
  DEFAULT_STATUS_CHANGE,
  EMPTY_INSTANT_PROMPT_DRAFT,
  EMPTY_PROMPT_DRAFT,
  EMPTY_TRANSLATION_DRAFT,
  FETCH_SCENE_BY_ID_REQUEST,
  PROMPT_COLUMNS,
  PROMPT_EDITOR_COLUMNS,
  STATUS_CHANGE_FIELDS,
} from './constants';
import { SceneEditorHeader } from './SceneEditorHeader';
import { SceneImagePanel } from './SceneImagePanel';
import { ScenePromptPanel } from './ScenePromptPanel';
import type {
  InstantPromptName,
  PromptEditorColumnName,
  SaveMode,
  SceneEditComponentProps,
  StatusChangeValues,
} from './types';

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

function promptColumnsToScenePayload(
  promptColumns: Record<PromptColumnName, string>,
  promptNegative: string,
) {
  return {
    prompt_situation: promptColumns.prompt_situation.trim() || null,
    prompt_hero: promptColumns.prompt_hero.trim() || null,
    prompt_camera: promptColumns.prompt_camera.trim() || null,
    prompt_detail: promptColumns.prompt_detail.trim() || null,
    prompt_negative: promptNegative.trim() || null,
  };
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
  const imageSettingsDefaults = useImageSettingsStore((state) => state.defaults);
  const imageSettings = useImageSettingsStore((state) => state.settings);
  const openImageSettings = useImageSettingsStore((state) => state.openDialog);
  const updateImageParameters = useImageSettingsStore((state) => state.updateSettings);
  const [strengthControlValue, setStrengthControlValue] = useState('');
  const [imageHistory, setImageHistory] = useState({ ids: [] as number[], index: -1 });
  const [selectedImageOverride, setSelectedImageOverride] = useState<ImageRecord | null>(null);
  const [isLoadingHistoryImage, setIsLoadingHistoryImage] = useState(false);
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
  const isBusy = isLoadingScene || isLoadingHistoryImage || isTranslatingPromptColumns || isDeleting || Boolean(savingMode);
  const canEdit = Boolean(activeScene);
  const canSaveData = canEdit && composedPrompt.length > 0 && !isBusy;
  const canDelete = sceneId !== null && !isBusy;
  const canTranslatePromptColumns =
    canEdit
    && !isBusy
    && PROMPT_EDITOR_COLUMNS.some(
      (column) => column.key !== 'prompt_camera' && translationDraft[column.key].trim().length > 0,
    );
  const canDuplicate = Boolean(modalLayout && onDuplicate && sceneId !== null && canEdit && !isBusy);
  const cameraSamples = imageSettingsDefaults?.camera_samples ?? imageSettings?.camera_samples ?? {};
  const displayedImageId = selectedImageOverride?.id ?? activeScene?.image_id ?? null;
  const displayedBaseImageUrl = selectedImageOverride
    ? selectedImageOverride.image_object_key ?? null
    : activeScene?.image_url ?? null;
  const displayedScribbleImageUrl = selectedImageOverride
    ? selectedImageOverride.scribble_object_key ?? null
    : activeScene?.scribble_url ?? null;
  const displayedPoseImageUrl = selectedImageOverride
    ? selectedImageOverride.pose_object_key ?? null
    : activeScene?.pose_url ?? null;
  const canGoPreviousImage = imageHistory.index > 0;
  const canGoNextImage = imageHistory.index >= 0 && imageHistory.index < imageHistory.ids.length - 1;
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
    setImageHistory({ ids: [], index: -1 });
    setSelectedImageOverride(null);
    setIsLoadingHistoryImage(false);
  }, [sceneId]);

  useEffect(() => {
    const nextImageId = activeScene?.image_id;
    if (!nextImageId || (sceneId !== null && activeScene?.id !== sceneId)) {
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
  }, [activeScene?.id, activeScene?.image_id, sceneId]);

  useEffect(() => {
    if (imageSettings) {
      setStrengthControlValue(String(imageSettings.strength));
    }
  }, [imageSettings]);

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

  function selectLineageImage(image: ImageRecord) {
    const imageId = image.id;
    if (typeof imageId !== 'number') {
      setError('Image ID를 확인할 수 없습니다.');
      return;
    }
    if (!image.image_object_key) {
      setError(`Image #${imageId}에 이미지 URL이 없습니다.`);
      return;
    }

    setSelectedImageOverride(image);
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
    setError(null);
  }

  async function submitSceneForm(formData: FormData) {
    const generatedScene = await dbTables.Scene.generateScene(formData);
    const generatedSceneId = generatedScene.id;
    if (!generatedSceneId) {
      throw new Error('Scene 저장 결과를 확인할 수 없습니다.');
    }

    preserveInstantPromptSceneIdRef.current = generatedSceneId;
    applySceneDraft(generatedScene, false);
    onSaved(generatedSceneId);
  }

  async function saveDataOnlyScene() {
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
      const payload: GenerateSceneRequest = {
        scene_id: sceneId ?? null,
        image_id: displayedImageId,
        script,
        status_change: statusChange,
        generate_image: false,
        ...promptColumnsToScenePayload(promptDraft, promptNegativeDraft),
      };
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));

      await submitSceneForm(formData);
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
      const payload: GenerateSceneRequest = {
        scene_id: sceneId ?? null,
        parent_image_id: displayedImageId,
        script,
        status_change: statusChange,
        generate_image: true,
        image_settings: imagePayload.parameters,
        ...promptColumnsToScenePayload(imagePayload.promptColumns, promptNegativeDraft),
        prompt_instant_positive: instantPromptDraft.prompt_instant_positive.trim() || null,
        prompt_instant_negative: instantPromptDraft.prompt_instant_negative.trim() || null,
      };
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));

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

      await submitSceneForm(formData);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSavingMode(null);
    }
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
      image_id: activeScene.image_id ?? null,
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

  function closeEditor() {
    preserveInstantPromptSceneIdRef.current = null;
    onClose?.();
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
        <SceneEditorHeader
          selectedLabel={selectedLabel}
          sceneId={sceneId}
          modalLayout={modalLayout}
          showDuplicate={Boolean(modalLayout && onDuplicate && sceneId !== null)}
          canDelete={canDelete}
          canDuplicate={canDuplicate}
          canSaveData={canSaveData}
          canOpenImageSettings={Boolean(imageSettings && !isBusy)}
          isBusy={isBusy}
          isDeleting={isDeleting}
          savingMode={savingMode}
          onDelete={() => void deleteScene()}
          onDuplicate={duplicateScene}
          onSaveData={() => {
            void saveDataOnlyScene();
          }}
          onOpenImageSettings={openImageSettings}
          onClose={onClose ? closeEditor : undefined}
        />

        <SectionBody>
          <div className="space-y-4">
            {isLoadingScene ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-muted)]">
                <Spinner aria-hidden="true" />
                <span>Scene을 불러오는 중</span>
              </div>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.44fr)] xl:items-start">
              <ScenePromptPanel
                script={script}
                promptDraft={promptDraft}
                instantPromptDraft={instantPromptDraft}
                promptNegativeDraft={promptNegativeDraft}
                translationDraft={translationDraft}
                cameraSamples={cameraSamples}
                isLoadingScene={isLoadingScene}
                savingMode={savingMode}
                isTranslatingPromptColumns={isTranslatingPromptColumns}
                canTranslatePromptColumns={canTranslatePromptColumns}
                setScript={setScript}
                setPromptDraft={setPromptDraft}
                setInstantPromptDraft={setInstantPromptDraft}
                setPromptNegativeDraft={setPromptNegativeDraft}
                setTranslationDraft={setTranslationDraft}
                onTranslatePromptColumns={() => void translatePromptColumns()}
              />

              <SceneImagePanel
                imageId={displayedImageId}
                baseImageUrl={displayedBaseImageUrl}
                scribbleImageUrl={displayedScribbleImageUrl}
                poseImageUrl={displayedPoseImageUrl}
                imageSettings={imageSettings}
                promptDraft={promptDraft}
                strengthControlValue={strengthControlValue}
                statusChangeValues={statusChangeValues}
                canSaveData={canSaveData}
                isLoadingScene={isLoadingScene}
                isLoadingHistoryImage={isLoadingHistoryImage}
                savingMode={savingMode}
                canGoPreviousImage={canGoPreviousImage}
                canGoNextImage={canGoNextImage}
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
    </>
  );
}
