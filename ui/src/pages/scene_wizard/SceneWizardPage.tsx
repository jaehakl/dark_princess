import { useState } from 'react';
import { useSceneStore } from '../../api/store';
import type { SceneRecord } from '../../api/type';
import { SceneEditModal } from '../../components/SceneEditModal';
import { SceneExplorerComponent } from '../../components/SceneExplorerComponent';
import { Button, Panel } from '../../components/ui';

const EMPTY_INITIAL_SCENE: SceneRecord = {
  id: null,
  image_id: null,
  image_url: null,
  scribble_url: null,
  pose_url: null,
  script: '',
  status_change: { turn: 1 },
  prompt_situation: null,
  prompt_hero: null,
  prompt_camera: null,
  prompt_detail: null,
  prompt_negative: null,
};

function createEmptyInitialScene(): SceneRecord {
  return {
    ...EMPTY_INITIAL_SCENE,
    status_change: { ...EMPTY_INITIAL_SCENE.status_change },
  };
}

function createDuplicateInitialScene(scene: SceneRecord): SceneRecord {
  return {
    ...scene,
    id: null,
    status_change: { ...scene.status_change },
  };
}

export function SceneWizardPage() {
  const handleSceneDeleted = useSceneStore((state) => state.handleSceneDeleted);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [initialScene, setInitialScene] = useState<SceneRecord>(() => createEmptyInitialScene());
  const [explorerReloadKey, setExplorerReloadKey] = useState(0);

  function refreshExplorer() {
    setExplorerReloadKey((current) => current + 1);
  }

  function openNewScene() {
    setSceneId(null);
    setInitialScene(createEmptyInitialScene());
    setIsEditorOpen(true);
  }

  function openExistingScene(selectedSceneId: number) {
    setSceneId(selectedSceneId);
    setInitialScene(createEmptyInitialScene());
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
  }

  function handleSaved(sceneId: number) {
    setSceneId(sceneId);
    refreshExplorer();
  }

  function handleDeleted(deletedSceneId: number) {
    handleSceneDeleted(deletedSceneId);
    setSceneId(null);
    setInitialScene(createEmptyInitialScene());
    setIsEditorOpen(false);
    refreshExplorer();
  }

  function handleDuplicate(scene: SceneRecord) {
    setSceneId(null);
    setInitialScene(createDuplicateInitialScene(scene));
    setIsEditorOpen(true);
  }

  return (
    <div className="relative left-1/2 w-[min(1840px,calc(100vw-36px))] -translate-x-1/2 space-y-4">
      <div className="flex justify-end px-1">
        <Button className="px-4 py-2 text-xs" onClick={openNewScene}>
          새 Scene 생성
        </Button>
      </div>

      <Panel className="min-h-[calc(100vh-10rem)]">
        <SceneExplorerComponent
          key={explorerReloadKey}
          currentSceneId={isEditorOpen ? sceneId : null}
          onSelect={openExistingScene}
        />
      </Panel>

      {isEditorOpen ? (
        <SceneEditModal
          sceneId={sceneId}
          initialScene={initialScene}
          onClose={closeEditor}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onDuplicate={handleDuplicate}
        />
      ) : null}
    </div>
  );
}
