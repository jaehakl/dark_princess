import { useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { SceneOptionRecord, SceneRecord } from '../api/type';

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
type SaveMode = 'create' | 'text' | 'image';

type SceneOptionSceneEditorModalProps = {
  sourceScene: SceneRecord;
  onClose: () => void;
  onCreated: (option: SceneOptionRecord, scene: SceneRecord) => Promise<void> | void;
  onSceneUpdated: (scene: SceneRecord) => Promise<void> | void;
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

function buildStatusChange(values: StatusChangeValues): Record<string, number> | string {
  const statusChange: Record<string, number> = { turn: 1 };
  for (const field of STATUS_CHANGE_FIELDS) {
    const rawValue = values[field.key].trim();
    const parsedValue = rawValue === '' ? 0 : Number(rawValue);
    if (!Number.isInteger(parsedValue) || !Number.isFinite(parsedValue)) {
      return `${field.label} 변화량은 정수로 입력해 주세요.`;
    }
    statusChange[field.key] = parsedValue;
  }
  return statusChange;
}

export function SceneOptionSceneEditorModal({
  sourceScene,
  onClose,
  onCreated,
  onSceneUpdated,
}: SceneOptionSceneEditorModalProps) {
  const [createdOption, setCreatedOption] = useState<SceneOptionRecord | null>(null);
  const [createdScene, setCreatedScene] = useState<SceneRecord | null>(null);
  const [optionText, setOptionText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [script, setScript] = useState('');
  const [statusChangeValues, setStatusChangeValues] = useState<StatusChangeValues>(() =>
    statusChangeToValues(undefined),
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null);
  const [isRecommendingPrompt, setIsRecommendingPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editedSceneId = createdScene?.id ?? null;
  const isCreated = Boolean(createdOption?.id && editedSceneId);
  const isInputDisabled = Boolean(savingMode) || isRecommendingPrompt;
  const canCreate = optionText.trim().length > 0 && prompt.trim().length > 0 && !isCreated && !isInputDisabled;
  const canSaveScene = prompt.trim().length > 0 && isCreated && !isInputDisabled;
  const canRecommendPrompt = script.trim().length > 0 && !isInputDisabled;
  const isGeneratingImage = savingMode === 'create' || savingMode === 'image';
  const modalTitle = useMemo(
    () => (editedSceneId ? `Option #${createdOption?.id} -> Scene #${editedSceneId}` : '새 Option + Scene 생성'),
    [createdOption?.id, editedSceneId],
  );

  async function recommendPromptFromScript() {
    const text = script.trim();
    if (!text) {
      setError('script를 입력해 주세요.');
      return;
    }

    setIsRecommendingPrompt(true);
    setError(null);
    try {
      const recommendation = await dbTables.Scene.generatePrompt(text);
      const recommendedPrompt = recommendation.prompt.trim();
      if (!recommendedPrompt) {
        setError('추천할 prompt가 없습니다.');
        return;
      }

      setPrompt(recommendedPrompt);
    } catch (recommendError) {
      setError(getErrorMessage(recommendError));
    } finally {
      setIsRecommendingPrompt(false);
    }
  }

  async function saveScene(mode: SaveMode) {
    const sourceSceneId = sourceScene.id ?? null;
    const trimmedPrompt = prompt.trim();
    const trimmedOptionText = optionText.trim();
    if (!trimmedPrompt) {
      setError('prompt를 입력해 주세요.');
      return;
    }
    if (mode === 'create' && !trimmedOptionText) {
      setError('option_text를 입력해 주세요.');
      return;
    }
    if (mode === 'create' && !sourceSceneId) {
      setError('Source Scene ID를 확인할 수 없습니다.');
      return;
    }
    if (mode !== 'create' && !createdScene?.id) {
      setError('수정할 scene_id가 없습니다.');
      return;
    }

    const statusChange = buildStatusChange(statusChangeValues);
    if (typeof statusChange === 'string') {
      setError(statusChange);
      return;
    }

    setSavingMode(mode);
    setError(null);
    try {
      const savedScene = await dbTables.Scene.generateScene({
        scene_id: mode === 'create' ? null : createdScene?.id ?? null,
        prompt: trimmedPrompt,
        script,
        status_change: statusChange,
        generate_image: mode !== 'text',
      });
      setPrompt(savedScene.prompt);
      setScript(savedScene.script);
      setStatusChangeValues(statusChangeToValues(savedScene.status_change));
      setImageUrl(savedScene.image_url ?? null);
      setCreatedScene(savedScene);

      if (mode === 'create') {
        if (!sourceSceneId) {
          throw new Error('Source Scene ID를 확인할 수 없습니다.');
        }
        const savedOption = await dbTables.SceneOption.generateOption({
          option_id: null,
          scene_id: sourceSceneId,
          option_text: trimmedOptionText,
        });
        setCreatedOption(savedOption);
        await onCreated(savedOption, savedScene);
      } else {
        await onSceneUpdated(savedScene);
      }
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSavingMode(null);
    }
  }

  return (
    <div className="vn-modal-backdrop" role="presentation">
      <section
        className="vn-panel vn-scene-editor-modal vn-scene-option-scene-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-option-scene-editor-title"
      >
        <div className="vn-panel-header">
          <div className="min-w-0">
            <p className="vn-subtitle">Option + Scene generation</p>
            <h2
              id="scene-option-scene-editor-title"
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
            <span className="text-xs font-semibold text-[var(--app-muted)]">
              Source Scene #{sourceScene.id ?? '-'}
            </span>
            <span className="ml-auto text-xs text-[var(--app-muted)]">
              {editedSceneId ? `scene_id ${editedSceneId}` : 'scene_id null'}
            </span>
          </div>

          <label className="block space-y-1">
            <span className="edit-label edit-label--required">
              <span className="edit-label__text">option_text</span>
            </span>
            <textarea
              value={optionText}
              onChange={(event) => setOptionText(event.target.value)}
              className="edit-control min-h-20 w-full resize-y px-3 py-2 text-sm"
              disabled={isInputDisabled || isCreated}
            />
          </label>

          <div className="vn-scene-editor-grid">
            <div className="vn-scene-editor-fields">
              <div className="block space-y-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <label htmlFor="scene-option-scene-prompt" className="edit-label edit-label--required">
                    <span className="edit-label__text">prompt</span>
                  </label>
                  <button
                    type="button"
                    className="vn-button inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                    onClick={() => void recommendPromptFromScript()}
                    disabled={!canRecommendPrompt}
                  >
                    {isRecommendingPrompt ? <span className="vn-spinner" aria-hidden="true" /> : null}
                    {isRecommendingPrompt ? '추천 중' : 'script로 prompt 추천'}
                  </button>
                </div>
                <textarea
                  id="scene-option-scene-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="edit-control min-h-20 w-full resize-y px-3 py-2 text-sm"
                  disabled={isInputDisabled}
                />
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
            <div />
            <div className="vn-modal-footer-actions">
              <button
                type="button"
                className="vn-button px-4 py-2 text-sm"
                onClick={onClose}
                disabled={isInputDisabled}
              >
                닫기
              </button>
              <button
                type="button"
                className="vn-button inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('text')}
                disabled={!canSaveScene}
              >
                {savingMode === 'text' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                {savingMode === 'text' ? '텍스트 저장 중' : '텍스트 저장'}
              </button>
              <button
                type="button"
                className="vn-button inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('image')}
                disabled={!canSaveScene}
              >
                {savingMode === 'image' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                {savingMode === 'image' ? '이미지 업데이트 중' : '이미지 업데이트'}
              </button>
              <button
                type="button"
                className="vn-button vn-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={() => void saveScene('create')}
                disabled={!canCreate}
              >
                {savingMode === 'create' ? <span className="vn-spinner" aria-hidden="true" /> : null}
                {savingMode === 'create' ? 'Scene 생성 중' : '새 Scene 생성'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
