import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { SceneOptionRecord, SceneRecord } from '../api/type';

type SceneOptionEditorModalProps = {
  scene: SceneRecord;
  option: SceneOptionRecord | null;
  onClose: () => void;
  onSaved: (option: SceneOptionRecord) => void;
  onDeleted: (optionId: number) => void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

export function SceneOptionEditorModal({
  scene,
  option,
  onClose,
  onSaved,
  onDeleted,
}: SceneOptionEditorModalProps) {
  const [optionText, setOptionText] = useState(option?.option_text ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = Boolean(option?.id) && !isSaving && !isDeleting;
  const canSave = optionText.trim().length > 0 && !isSaving && !isDeleting;
  const title = useMemo(
    () => (option?.id ? `Option #${option.id} 편집` : '새 Option 추가'),
    [option?.id],
  );

  useEffect(() => {
    setOptionText(option?.option_text ?? '');
    setIsSaving(false);
    setIsDeleting(false);
    setError(null);
  }, [option]);

  async function saveOption() {
    const trimmedOptionText = optionText.trim();
    if (!trimmedOptionText) {
      setError('option_text를 입력해 주세요.');
      return;
    }

    if (!scene.id) {
      setError('Scene ID를 확인할 수 없습니다.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const savedOption = await dbTables.SceneOption.generateOption({
        option_id: option?.id ?? null,
        scene_id: scene.id,
        option_text: trimmedOptionText,
      });
      onSaved(savedOption);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteOption() {
    if (!option?.id) {
      return;
    }

    const shouldDelete = window.confirm(`Option #${option.id}을 삭제할까요?`);
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await dbTables.SceneOption.deleteRows([option.id]);
      onDeleted(option.id);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="vn-modal-backdrop" role="presentation">
      <section
        className="vn-panel vn-scene-option-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-option-editor-title"
      >
        <div className="vn-panel-header">
          <div className="min-w-0">
            <p className="vn-subtitle">Scene option</p>
            <h2
              id="scene-option-editor-title"
              className="truncate text-lg font-semibold text-[#fff7ef]"
            >
              {title}
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
          <div className="text-xs font-semibold text-[var(--app-muted)]">
            Scene #{scene.id ?? '-'}
          </div>

          <label className="block space-y-1">
            <span className="edit-label edit-label--required">
              <span className="edit-label__text">option_text</span>
            </span>
            <textarea
              value={optionText}
              onChange={(event) => setOptionText(event.target.value)}
              className="edit-control min-h-28 w-full resize-y px-3 py-2"
              disabled={isSaving || isDeleting}
            />
          </label>

          {error ? (
            <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
          ) : null}

          <div className="vn-modal-footer">
            <div>
              {option?.id ? (
                <button
                  type="button"
                  className="vn-danger-button inline-flex items-center gap-2 px-5 py-3"
                  onClick={() => void deleteOption()}
                  disabled={!canDelete}
                >
                  {isDeleting ? <span className="vn-spinner" aria-hidden="true" /> : null}
                  {isDeleting ? '삭제 중' : 'Option 삭제'}
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
                onClick={() => void saveOption()}
                disabled={!canSave}
              >
                {isSaving ? <span className="vn-spinner" aria-hidden="true" /> : null}
                {isSaving ? '저장 중' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
