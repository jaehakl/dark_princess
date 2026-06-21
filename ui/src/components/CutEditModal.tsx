import type { CutRecord } from '../api/type';
import { CutEditComponent } from './cut-editor';
import { ModalBackdrop } from './ui';

type CutEditModalProps = {
  cutId: number | null;
  initialCut: CutRecord;
  onClose: () => void;
  onSaved: (cutId: number) => void;
  onDeleted: (cutId: number) => void;
  onDuplicate?: (cut: CutRecord) => void;
};

export function CutEditModal({
  cutId,
  initialCut,
  onClose,
  onSaved,
  onDeleted,
  onDuplicate,
}: CutEditModalProps) {
  return (
    <ModalBackdrop role="presentation" topAligned blurred={false}>
      <CutEditComponent
        cutId={cutId}
        initialCut={initialCut}
        onSaved={onSaved}
        onDeleted={onDeleted}
        onClose={onClose}
        onDuplicate={onDuplicate}
        modalLayout
      />
    </ModalBackdrop>
  );
}
