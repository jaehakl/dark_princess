import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { SceneOptionRecord, SceneRecord } from '../api/type';
import {
  Button,
  FieldLabel,
  FormControl,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
} from './ui';

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
    <ModalBackdrop role="presentation">
      <Panel
        className="max-h-[min(34rem,calc(100dvh-3rem))] w-[min(34rem,100%)] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-option-editor-title"
      >
        <PanelHeader>
          <div className="min-w-0">
            <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene option</p>
            <h2
              id="scene-option-editor-title"
              className="truncate text-lg font-semibold text-[#fff7ef]"
            >
              {title}
            </h2>
          </div>
          <Button
            variant="danger"
            className="px-3 py-2 text-xs"
            onClick={onClose}
            disabled={isSaving || isDeleting}
          >
            닫기
          </Button>
        </PanelHeader>

        <SectionBody className="space-y-4">
          <div className="text-xs font-semibold text-[var(--app-muted)]">
            Scene #{scene.id ?? '-'}
          </div>

          <div className="block space-y-1">
            <FieldLabel htmlFor="scene-option-text" required>option_text</FieldLabel>
            <FormControl
              as="textarea"
              id="scene-option-text"
              value={optionText}
              onChange={(event) => setOptionText(event.target.value)}
              className="min-h-28 w-full resize-y px-3 py-2"
              disabled={isSaving || isDeleting}
            />
          </div>

          {error ? (
            <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
            <div>
              {option?.id ? (
                <Button
                  variant="danger"
                  className="inline-flex items-center gap-2 px-5 py-3"
                  onClick={() => void deleteOption()}
                  disabled={!canDelete}
                >
                  {isDeleting ? <Spinner aria-hidden="true" /> : null}
                  {isDeleting ? '삭제 중' : 'Option 삭제'}
                </Button>
              ) : null}
            </div>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <Button
                className="px-5 py-3"
                onClick={onClose}
                disabled={isSaving || isDeleting}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="inline-flex items-center gap-2 px-5 py-3"
                onClick={() => void saveOption()}
                disabled={!canSave}
              >
                {isSaving ? <Spinner aria-hidden="true" /> : null}
                {isSaving ? '저장 중' : '저장'}
              </Button>
            </div>
          </div>
        </SectionBody>
      </Panel>
    </ModalBackdrop>
  );
}
