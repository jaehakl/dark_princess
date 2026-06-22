import { useState } from 'react';
import { useCutStore } from '../../api/store';
import type { CutRecord } from '../../api/type';
import { CutEditModal } from '../../components/CutEditModal';
import { CutExplorerComponent } from '../../components/CutExplorerComponent';
import { Button, Panel } from '../../components/ui';

const EMPTY_INITIAL_CUT: CutRecord = {
  id: null,
  image_id: null,
  image_url: null,
  scribble_url: null,
  pose_url: null,
  script: '',
  status_change: { turn: 1 },
  prompt_situation: null,
  prompt_hero: null,
  prompt_detail: null,
  prompt_camera: null,
  prompt_negative: null,
};

function createEmptyInitialCut(): CutRecord {
  return {
    ...EMPTY_INITIAL_CUT,
    status_change: { ...EMPTY_INITIAL_CUT.status_change },
  };
}

function createDuplicateInitialCut(cut: CutRecord): CutRecord {
  return {
    ...cut,
    id: null,
    status_change: { ...cut.status_change },
  };
}

export function CutWizardPage() {
  const handleCutDeleted = useCutStore((state) => state.handleCutDeleted);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [cutId, setCutId] = useState<number | null>(null);
  const [initialCut, setInitialCut] = useState<CutRecord>(() => createEmptyInitialCut());
  const [explorerReloadKey, setExplorerReloadKey] = useState(0);

  function refreshExplorer() {
    setExplorerReloadKey((current) => current + 1);
  }

  function openNewCut() {
    setCutId(null);
    setInitialCut(createEmptyInitialCut());
    setIsEditorOpen(true);
  }

  function openExistingCut(selectedCutId: number) {
    setCutId(selectedCutId);
    setInitialCut(createEmptyInitialCut());
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
  }

  function handleSaved(cutId: number) {
    setCutId(cutId);
    refreshExplorer();
  }

  function handleDeleted(deletedCutId: number) {
    handleCutDeleted(deletedCutId);
    setCutId(null);
    setInitialCut(createEmptyInitialCut());
    setIsEditorOpen(false);
    refreshExplorer();
  }

  function handleDuplicate(cut: CutRecord) {
    setCutId(null);
    setInitialCut(createDuplicateInitialCut(cut));
    setIsEditorOpen(true);
  }

  return (
    <div className="relative left-1/2 w-[min(1840px,calc(100vw-36px))] -translate-x-1/2 space-y-4">
      <div className="flex justify-end px-1">
        <Button className="px-4 py-2 text-xs" onClick={openNewCut}>
          새 Cut 생성
        </Button>
      </div>

      <Panel className="min-h-[calc(100vh-10rem)]">
        <CutExplorerComponent
          key={explorerReloadKey}
          currentCutId={isEditorOpen ? cutId : null}
          onSelect={openExistingCut}
        />
      </Panel>

      {isEditorOpen ? (
        <CutEditModal
          cutId={cutId}
          initialCut={initialCut}
          onClose={closeEditor}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onDuplicate={handleDuplicate}
        />
      ) : null}
    </div>
  );
}
