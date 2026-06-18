import { Button, PanelHeader, Spinner } from '../ui';
import type { SaveMode } from './types';

type SceneEditorHeaderProps = {
  selectedLabel: string;
  sceneId: number | null;
  modalLayout: boolean;
  showDuplicate: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canSaveText: boolean;
  canOpenImageSettings: boolean;
  isBusy: boolean;
  isDeleting: boolean;
  savingMode: SaveMode | null;
  onDelete: () => void;
  onDuplicate: () => void;
  onSaveText: () => void;
  onOpenImageSettings: () => void;
  onClose?: () => void;
};

function confirmAction(message: string, action: () => void) {
  if (window.confirm(message)) {
    action();
  }
}

export function SceneEditorHeader({
  selectedLabel,
  sceneId,
  modalLayout,
  showDuplicate,
  canDelete,
  canDuplicate,
  canSaveText,
  canOpenImageSettings,
  isBusy,
  isDeleting,
  savingMode,
  onDelete,
  onDuplicate,
  onSaveText,
  onOpenImageSettings,
  onClose,
}: SceneEditorHeaderProps) {
  return (
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
            onClick={onDelete}
            disabled={!canDelete}
          >
            {isDeleting ? <Spinner aria-hidden="true" /> : null}
            {isDeleting ? '삭제 중' : '삭제'}
          </Button>
        ) : null}
        {showDuplicate ? (
          <Button
            className="inline-flex items-center gap-2 px-3 py-2 text-xs"
            onClick={() => confirmAction('현재 입력값으로 새 장면 편집을 세팅할까요?', onDuplicate)}
            disabled={!canDuplicate}
          >
            장면 복제
          </Button>
        ) : null}
        <Button
          className="inline-flex items-center gap-2 px-3 py-2 text-xs"
          onClick={() => confirmAction('텍스트만 저장할까요?', onSaveText)}
          disabled={!canSaveText}
        >
          {savingMode === 'text' ? <Spinner aria-hidden="true" /> : null}
          텍스트만 저장
        </Button>
        <Button
          className="px-3 py-2 text-base leading-none"
          onClick={onOpenImageSettings}
          disabled={!canOpenImageSettings}
          aria-label="이미지 설정"
          title="이미지 설정"
        >
          ⚙️
        </Button>
        {modalLayout && onClose ? (
          <Button
            variant="danger"
            className="px-3 py-2 text-xs"
            onClick={onClose}
            disabled={isBusy}
          >
            닫기
          </Button>
        ) : null}
      </div>
    </PanelHeader>
  );
}
