import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { SceneRecord } from '../api/type';

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

function stringifyScriptLine(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const text = objectValue.text ?? objectValue.line ?? objectValue.content;
    if (typeof text === 'string') {
      return text;
    }
    return JSON.stringify(value);
  }
  return '';
}

function scriptsToLines(scripts: SceneRecord['scripts'] | undefined): string[] {
  if (!scripts) {
    return [''];
  }

  const values = Array.isArray(scripts)
    ? scripts
    : Object.keys(scripts)
        .sort()
        .map((key) => scripts[key]);

  const lines = values.map((value) => stringifyScriptLine(value));
  return lines.length > 0 ? lines : [''];
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
  const [scriptLines, setScriptLines] = useState<string[]>(() => scriptsToLines(scene?.scripts));
  const [statusChangeValues, setStatusChangeValues] = useState<StatusChangeValues>(() =>
    statusChangeToValues(scene?.status_change),
  );
  const [imageUrl, setImageUrl] = useState(scene?.image_url ?? null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editedSceneId = scene?.id ?? null;
  const canSaveWithoutCreate = Boolean(scene?.id);
  const canDelete = Boolean(editedSceneId) && !savingMode && !isDeleting;
  const canSave = prompt.trim().length > 0 && !savingMode && !isDeleting;
  const isGeneratingImage = savingMode === 'image' || savingMode === 'create';

  const modalTitle = useMemo(
    () => (editedSceneId ? `Scene #${editedSceneId} 편집` : '새 Scene 생성'),
    [editedSceneId],
  );

  useEffect(() => {
    setPrompt(scene?.prompt ?? '');
    setScriptLines(scriptsToLines(scene?.scripts));
    setStatusChangeValues(statusChangeToValues(scene?.status_change));
    setImageUrl(scene?.image_url ?? null);
    setError(null);
    setSavingMode(null);
    setIsDeleting(false);
  }, [scene]);

  function updateScriptLine(index: number, value: string) {
    setScriptLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? value : line)),
    );
  }

  function addScriptLine() {
    setScriptLines((current) => [...current, '']);
  }

  function deleteScriptLine(index: number) {
    setScriptLines((current) => {
      const nextLines = current.filter((_, lineIndex) => lineIndex !== index);
      return nextLines.length > 0 ? nextLines : [''];
    });
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
        scripts: scriptLines,
        status_change: statusChange,
        generate_image: mode !== 'text',
      });
      setPrompt(savedScene.prompt);
      setScriptLines(scriptsToLines(savedScene.scripts));
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
            disabled={Boolean(savingMode) || isDeleting}
          >
            닫기
          </button>
        </div>

        <div className="vn-section-body vn-scene-editor-body">
          <div className="vn-scene-editor-meta">
            <span className="ml-auto text-xs text-[var(--app-muted)]">
              {editedSceneId ? `scene_id ${editedSceneId}` : 'scene_id null'}
            </span>
          </div>

          <div className="vn-scene-editor-grid">
            <div className="vn-scene-editor-fields">
              <label className="block space-y-1">
                <span className="edit-label edit-label--required">
                  <span className="edit-label__text">prompt</span>
                </span>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="edit-control min-h-20 w-full resize-y px-3 py-2 text-sm"
                  disabled={Boolean(savingMode) || isDeleting}
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="edit-label">
                    <span className="edit-label__text">scripts</span>
                  </span>
                  <button
                    type="button"
                    className="vn-button px-3 py-2 text-xs"
                    onClick={addScriptLine}
                    disabled={Boolean(savingMode) || isDeleting}
                  >
                    추가
                  </button>
                </div>

                <div className="space-y-2">
                  {scriptLines.map((line, index) => (
                    <div key={`${index}-${scriptLines.length}`} className="vn-script-row">
                      <textarea
                        value={line}
                        onChange={(event) => updateScriptLine(index, event.target.value)}
                        className="edit-control min-h-14 flex-1 resize-y px-3 py-2 text-sm"
                        disabled={Boolean(savingMode) || isDeleting}
                      />
                      <button
                        type="button"
                        className="vn-danger-button h-9 px-3 text-xs"
                        onClick={() => deleteScriptLine(index)}
                        disabled={Boolean(savingMode) || isDeleting}
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>

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
                        disabled={Boolean(savingMode) || isDeleting}
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
                disabled={Boolean(savingMode) || isDeleting}
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
    </div>
  );
}
