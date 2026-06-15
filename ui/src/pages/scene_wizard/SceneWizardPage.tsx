import { useEffect, useMemo, useRef, useState } from 'react';
import { useSceneStore } from '../../api/store';
import type { SceneRecord } from '../../api/type';
import { SceneEditComponent } from '../../components/SceneEditComponent';
import { Button } from '../../components/ui';

const EMPTY_INITIAL_SCENE: SceneRecord = {
  id: null,
  prompt: '',
  image_url: null,
  script: '',
  status_change: { turn: 1 },
  background: null,
  subject: null,
  object: null,
  action: null,
  detail: null,
};

export function SceneWizardPage() {
  const selectedScene = useSceneStore((state) => state.selectedScene);
  const handleSceneDeleted = useSceneStore((state) => state.handleSceneDeleted);
  const lastAppliedSelectedSceneRef = useRef<SceneRecord | null>(selectedScene);
  const [sceneId, setSceneId] = useState<number | null>(selectedScene?.id ?? null);
  const initialScene = useMemo(
    () => ({
      ...EMPTY_INITIAL_SCENE,
      status_change: { ...EMPTY_INITIAL_SCENE.status_change },
    }),
    [],
  );

  useEffect(() => {
    if (
      !selectedScene?.id ||
      selectedScene === lastAppliedSelectedSceneRef.current ||
      selectedScene.id === sceneId
    ) {
      return;
    }

    lastAppliedSelectedSceneRef.current = selectedScene;
    setSceneId(selectedScene.id);
  }, [sceneId, selectedScene]);

  function startFreshScene() {
    setSceneId(null);
  }

  function handleSaved(savedSceneId: number) {
    setSceneId(savedSceneId);
  }

  function handleDeleted(deletedSceneId: number) {
    handleSceneDeleted(deletedSceneId);
    setSceneId(null);
  }

  return (
    <div className="relative left-1/2 w-[min(1840px,calc(100vw-36px))] -translate-x-1/2 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene wizard</p>
          <h1 className="text-[clamp(1.25rem,2vw,2.2rem)] leading-[1.05] font-extrabold tracking-[0.02em] text-[#fff7ef] [text-shadow:0_0_22px_rgba(255,194,211,0.42),0_2px_12px_rgba(0,0,0,0.58)]">Scene Wizard</h1>
        </div>
        <Button className="px-3 py-2 text-xs" onClick={startFreshScene}>
          새 Scene 생성
        </Button>
      </div>

      <SceneEditComponent
        sceneId={sceneId}
        initialScene={initialScene}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
