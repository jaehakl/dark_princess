import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { SceneRecord } from '../api/type';

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

export function SceneEditorModal({
  scene,
  onClose,
  onSaved,
  onDeleted,
}: SceneEditorModalProps) {
  const [isCreateNew, setIsCreateNew] = useState(!scene?.id);
  const [prompt, setPrompt] = useState(scene?.prompt ?? '');
  const [scriptLines, setScriptLines] = useState<string[]>(() => scriptsToLines(scene?.scripts));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editedSceneId = isCreateNew ? null : scene?.id ?? null;
  const canToggleCreateNew = Boolean(scene?.id);
  const canDelete = Boolean(editedSceneId) && !isSaving && !isDeleting;
  const canSave = prompt.trim().length > 0 && !isSaving && !isDeleting;

  const modalTitle = useMemo(
    () => (editedSceneId ? `Scene #${editedSceneId} 편집` : '새 Scene 생성'),
    [editedSceneId],
  );

  useEffect(() => {
    setIsCreateNew(!scene?.id);
    setPrompt(scene?.prompt ?? '');
    setScriptLines(scriptsToLines(scene?.scripts));
    setError(null);
    setIsSaving(false);
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

  async function saveScene() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('prompt를 입력해 주세요.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const savedScene = await dbTables.Scene.generateScene({
        scene_id: editedSceneId,
        prompt: trimmedPrompt,
        scripts: scriptLines,
        status_change: editedSceneId ? scene?.status_change ?? {} : {},
      });
      onSaved(savedScene, editedSceneId);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
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
            disabled={isSaving || isDeleting}
          >
            닫기
          </button>
        </div>

        <div className="vn-section-body space-y-4">
          <label className="vn-toggle-row">
            <input
              type="checkbox"
              checked={isCreateNew}
              onChange={(event) => setIsCreateNew(event.target.checked)}
              disabled={!canToggleCreateNew || isSaving || isDeleting}
            />
            <span>새 Scene 생성</span>
            <span className="ml-auto text-xs text-[var(--app-muted)]">
              {editedSceneId ? `scene_id ${editedSceneId}` : 'scene_id null'}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="edit-label edit-label--required">
              <span className="edit-label__text">prompt</span>
            </span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="edit-control min-h-28 w-full resize-y px-3 py-2"
              disabled={isSaving || isDeleting}
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
                disabled={isSaving || isDeleting}
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
                    className="edit-control min-h-20 flex-1 resize-y px-3 py-2"
                    disabled={isSaving || isDeleting}
                  />
                  <button
                    type="button"
                    className="vn-danger-button h-10 px-3 text-xs"
                    onClick={() => deleteScriptLine(index)}
                    disabled={isSaving || isDeleting}
                  >
                    삭제
                  </button>
                </div>
              ))}
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
                  className="vn-danger-button inline-flex items-center gap-2 px-5 py-3"
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
                className="vn-button px-5 py-3"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                취소
              </button>
              <button
                type="button"
                className="vn-button vn-button-primary inline-flex items-center gap-2 px-5 py-3"
                onClick={() => void saveScene()}
                disabled={!canSave}
              >
                {isSaving ? <span className="vn-spinner" aria-hidden="true" /> : null}
                {isSaving ? '생성 중' : 'Scene 생성'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
