import { Button, PanelHeader, Spinner } from '../ui';
import type { SaveMode } from './types';

type CutEditorHeaderProps = {
  selectedLabel: string;
  cutId: number | null;
  modalLayout: boolean;
  showDuplicate: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canSaveData: boolean;
  canOpenImageSettings: boolean;
  isBusy: boolean;
  isDeleting: boolean;
  savingMode: SaveMode | null;
  onDelete: () => void;
  onDuplicate: () => void;
  onSaveData: () => void;
  onOpenImageSettings: () => void;
  onClose?: () => void;
};

function confirmAction(message: string, action: () => void) {
  if (window.confirm(message)) {
    action();
  }
}

export function CutEditorHeader({
  selectedLabel,
  cutId,
  modalLayout,
  showDuplicate,
  canDelete,
  canDuplicate,
  canSaveData,
  canOpenImageSettings,
  isBusy,
  isDeleting,
  savingMode,
  onDelete,
  onDuplicate,
  onSaveData,
  onOpenImageSettings,
  onClose,
}: CutEditorHeaderProps) {
  return (
    <PanelHeader className="flex-wrap items-start">
      <div className="min-w-0">
        <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Cut edit</p>
        <h2
          id={modalLayout ? 'cut-edit-modal-title' : undefined}
          className="truncate text-base font-semibold text-[#fff7ef]"
        >
          {selectedLabel}
        </h2>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
        {cutId !== null ? (
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
            onClick={() => confirmAction('현재 입력값으로 새 컷 편집을 세팅할까요?', onDuplicate)}
            disabled={!canDuplicate}
          >
            컷 복제
          </Button>
        ) : null}
        <Button
          className="inline-flex items-center gap-2 px-3 py-2 text-xs"
          onClick={() => confirmAction('데이터만 저장할까요?', onSaveData)}
          disabled={!canSaveData}
        >
          {savingMode === 'data' ? <Spinner aria-hidden="true" /> : null}
          데이터만 저장
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
