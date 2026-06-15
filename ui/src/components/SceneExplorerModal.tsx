import { SceneExplorerComponent } from './SceneExplorerComponent';
import {
  Button,
  ModalBackdrop,
  Panel,
  PanelHeader,
} from './ui';

type SceneExplorerModalProps = {
  currentSceneId: number | null;
  onClose: () => void;
  onSelect: (sceneId: number) => void;
};

export function SceneExplorerModal({
  currentSceneId,
  onClose,
  onSelect,
}: SceneExplorerModalProps) {
  return (
    <ModalBackdrop role="presentation">
      <Panel
        className="max-h-[min(48rem,calc(100vh-2rem))] w-[min(96rem,calc(100vw-2rem))] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-explorer-title"
      >
        <PanelHeader>
          <div className="min-w-0">
            <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene archive</p>
            <h2
              id="scene-explorer-title"
              className="truncate text-lg font-semibold text-[#fff7ef]"
            >
              Scene 탐색
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

        <SceneExplorerComponent
          currentSceneId={currentSceneId}
          onSelect={onSelect}
        />
      </Panel>
    </ModalBackdrop>
  );
}
