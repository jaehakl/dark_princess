import { Button, PanelHeader, Spinner } from '../ui';
import type { SaveMode } from './types';

type CutEditorHeaderProps = {
  selectedLabel: string;
  cutId: number | null;
  favorited: boolean;
  canDelete: boolean;
  canToggleFavorite: boolean;
  canOpenImport: boolean;
  canOpenSceneEdit: boolean;
  canSaveData: boolean;
  canOpenCutContext: boolean;
  canOpenImageSettings: boolean;
  isDeleting: boolean;
  isUpdatingFavorite: boolean;
  savingMode: SaveMode | null;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onOpenImport: () => void;
  onOpenSceneEdit: () => void;
  onSaveData: () => void;
  onOpenCutContext: () => void;
  onOpenImageSettings: () => void;
};

function confirmAction(message: string, action: () => void) {
  if (window.confirm(message)) {
    action();
  }
}

export function CutEditorHeader({
  selectedLabel,
  cutId,
  favorited,
  canDelete,
  canToggleFavorite,
  canOpenImport,
  canOpenSceneEdit,
  canSaveData,
  canOpenCutContext,
  canOpenImageSettings,
  isDeleting,
  isUpdatingFavorite,
  savingMode,
  onDelete,
  onToggleFavorite,
  onOpenImport,
  onOpenSceneEdit,
  onSaveData,
  onOpenCutContext,
  onOpenImageSettings,
}: CutEditorHeaderProps) {
  return (
    <PanelHeader className="flex-wrap items-start">
      <div className="min-w-0">
        <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Cut edit</p>
        <h2 className="truncate text-base font-semibold text-[#fff7ef]">
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
        <Button
          className="inline-flex items-center gap-2 px-3 py-2 text-xs"
          variant={favorited ? 'primary' : 'default'}
          onClick={onToggleFavorite}
          disabled={!canToggleFavorite}
          aria-pressed={favorited}
          title={favorited ? '즐겨찾기 해제' : '즐겨찾기'}
        >
          {isUpdatingFavorite ? <Spinner aria-hidden="true" /> : null}
          {favorited ? '★ favorited' : '☆ favorite'}
        </Button>
        <Button
          className="inline-flex items-center gap-2 px-3 py-2 text-xs"
          onClick={onOpenImport}
          disabled={!canOpenImport}
        >
          다른 Cut 에서 Import
        </Button>
        {canOpenSceneEdit ? (
          <Button
            className="inline-flex items-center gap-2 px-3 py-2 text-xs"
            onClick={onOpenSceneEdit}
          >
            Scene edit
          </Button>
        ) : null}
        <Button
          className="inline-flex items-center gap-2 px-3 py-2 text-xs"
          onClick={onOpenCutContext}
          disabled={!canOpenCutContext}
        >
          cut_context
        </Button>
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
      </div>
    </PanelHeader>
  );
}
