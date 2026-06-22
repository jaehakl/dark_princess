import { useNavigate } from 'react-router-dom';
import type { CutRecord } from '../../api/type';
import { CutExplorerComponent } from '../../components/CutExplorerComponent';
import { Panel } from '../../components/ui';

export function CutWizardPage() {
  const navigate = useNavigate();

  function openSceneEdit(cut: CutRecord) {
    const cutId = cut.id;
    if (typeof cutId !== 'number') {
      return;
    }

    const sceneEditPath = typeof cut.scene_id === 'number'
      ? `/scene-edit/${cut.scene_id}`
      : '/scene-edit/unassigned';
    navigate(`${sceneEditPath}?cut_id=${cutId}`);
  }

  return (
    <div className="relative left-1/2 w-[min(1840px,calc(100vw-36px))] -translate-x-1/2 space-y-4">
      <Panel className="min-h-[calc(100vh-10rem)]">
        <CutExplorerComponent
          currentCutId={null}
          onSelect={openSceneEdit}
        />
      </Panel>
    </div>
  );
}
