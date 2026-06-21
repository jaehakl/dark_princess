import { CutExplorerComponent } from './CutExplorerComponent';
import {
  Button,
  ModalBackdrop,
  Panel,
  PanelHeader,
} from './ui';

type CutExplorerModalProps = {
  currentCutId: number | null;
  onClose: () => void;
  onSelect: (cutId: number) => void;
};

export function CutExplorerModal({
  currentCutId,
  onClose,
  onSelect,
}: CutExplorerModalProps) {
  return (
    <ModalBackdrop role="presentation">
      <Panel
        className="flex h-[calc(100dvh-3rem)] w-[min(96rem,calc(100vw-2rem))] flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cut-explorer-title"
      >
        <PanelHeader>
          <div className="min-w-0">
            <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Cut archive</p>
            <h2
              id="cut-explorer-title"
              className="truncate text-lg font-semibold text-[#fff7ef]"
            >
              Cut 탐색
            </h2>
          </div>
          <Button
            variant="danger"
            className="px-3 py-2 text-xs"
            onClick={onClose}
          >
            닫기
          </Button>
        </PanelHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <CutExplorerComponent
            currentCutId={currentCutId}
            onSelect={onSelect}
          />
        </div>
      </Panel>
    </ModalBackdrop>
  );
}
