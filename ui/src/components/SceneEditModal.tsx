import type { SceneRecord } from '../api/type';
import { SceneEditComponent } from './SceneEditComponent';
import { ModalBackdrop } from './ui';

type SceneEditModalProps = {
  sceneId: number | null;
  initialScene: SceneRecord;
  onClose: () => void;
  onSaved: (sceneId: number) => void;
  onDeleted: (sceneId: number) => void;
  onDuplicate?: (scene: SceneRecord) => void;
};

export function SceneEditModal({
  sceneId,
  initialScene,
  onClose,
  onSaved,
  onDeleted,
  onDuplicate,
}: SceneEditModalProps) {
  return (
    <ModalBackdrop role="presentation" topAligned blurred={false}>
      <SceneEditComponent
        sceneId={sceneId}
        initialScene={initialScene}
        onSaved={onSaved}
        onDeleted={onDeleted}
        onClose={onClose}
        onDuplicate={onDuplicate}
        modalLayout
      />
    </ModalBackdrop>
  );
}
