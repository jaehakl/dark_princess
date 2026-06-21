import { useEffect, useMemo, useRef, useState } from 'react';
import type { WheelEvent } from 'react';
import { useParams } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type {
  GetListRequest,
  SceneRecord,
  StatusRecord,
} from '../../api/type';
import { useSceneStore } from '../../api/store';
import { SceneEditModal } from '../../components/SceneEditModal';
import { SceneExplorerModal } from '../../components/SceneExplorerModal';
import {
  Button,
  FieldLabel,
  FormControl,
  ImageFrame,
  Panel,
  PanelHeader,
  SectionBody,
  cx,
} from '../../components/ui';

const HEADER_STATUS_FIELDS = [
  { key: 'turn', label: '턴' },
  { key: 'cash', label: '현금' },
  { key: 'stress', label: '스트레스' },
] as const;

const CORE_STATUS_FIELDS = [
  { key: 'strength', label: '힘' },
  { key: 'agility', label: '민첩' },
  { key: 'intelligence', label: '지력' },
  { key: 'sense', label: '센스' },
  { key: 'attractiveness', label: '매력' },
  { key: 'toughness', label: '근성' },
] as const;

const STATUS_FIELDS = [
  ...HEADER_STATUS_FIELDS,
  ...CORE_STATUS_FIELDS,
] as const;

type StatusNumberKey = (typeof STATUS_FIELDS)[number]['key'];
type StatusDeltas = Partial<Record<StatusNumberKey, number>>;
type PendingTransition = {
  sourceScene: SceneRecord;
  sourceSceneId: number;
  optionText: string;
  targetSceneId: number;
  statusBeforeTarget: StatusRecord;
};
type ScriptLineState = {
  sceneId: number | null;
  script: string;
  index: number;
};
type SceneEditorMode = 'edit' | 'replace' | 'next';

const FEEDBACK_LEARN_RATE = 0.1;
const AUTO_PLAY_INTERVAL_MS = 2000;
const SCRIPT_WHEEL_THRESHOLD = 20;
const STATUS_CHART_CENTER = 110;
const STATUS_CHART_RADIUS = 68;
const STATUS_CHART_LABEL_RADIUS = 95;
const STATUS_CHART_LEVELS = [25, 50, 75, 100];

function createListRequest(overrides: Partial<GetListRequest> = {}): GetListRequest {
  return {
    offset: 0,
    limit: 100,
    selected_ids: [],
    search_text: null,
    text_filter: {},
    filter: {},
    sort: null,
    ...overrides,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function toScriptLines(script: string): string[] {
  return script
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function clampStatusValue(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function getHexPoint(index: number, radius: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / CORE_STATUS_FIELDS.length;
  return {
    x: STATUS_CHART_CENTER + Math.cos(angle) * radius,
    y: STATUS_CHART_CENTER + Math.sin(angle) * radius,
  };
}

function pointList(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function applyStatusChange(
  status: StatusRecord,
  statusChange: Record<string, unknown>,
): { nextStatus: StatusRecord; deltas: StatusDeltas } {
  const nextStatus = { ...status };
  const deltas: StatusDeltas = {};

  for (const field of STATUS_FIELDS) {
    const rawDelta = statusChange[field.key];
    if (typeof rawDelta !== 'number' || !Number.isFinite(rawDelta)) {
      continue;
    }
    nextStatus[field.key] += rawDelta;
    deltas[field.key] = rawDelta;
  }

  return { nextStatus, deltas };
}

function isValidId(value: string | undefined) {
  if (!value) {
    return false;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function createNextSceneDraft(scene: SceneRecord): SceneRecord {
  return {
    ...scene,
    id: null,
    status_change: { ...scene.status_change },
  };
}

export function PlayPage() {
  const { statusId } = useParams();
  const parsedStatusId = isValidId(statusId) ? Number(statusId) : null;
  const selectedScene = useSceneStore((state) => state.selectedScene);
  const deletedSceneId = useSceneStore((state) => state.deletedSceneId);
  const setCurrentScene = useSceneStore((state) => state.setCurrentScene);
  const handleSceneDeleted = useSceneStore((state) => state.handleSceneDeleted);
  const clearDeletedScene = useSceneStore((state) => state.clearDeletedScene);
  const [status, setStatus] = useState<StatusRecord | null>(null);
  const [scene, setScene] = useState<SceneRecord | null>(null);
  const [deltas, setDeltas] = useState<StatusDeltas>({});
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [contextSyncedSceneId, setContextSyncedSceneId] = useState<number | null>(null);
  const [optionText, setOptionText] = useState('');
  const [currentSceneEditorSceneId, setCurrentSceneEditorSceneId] = useState<number | null>(null);
  const [currentSceneEditorInitialScene, setCurrentSceneEditorInitialScene] = useState<SceneRecord | null>(null);
  const [currentSceneEditorMode, setCurrentSceneEditorMode] = useState<SceneEditorMode>('edit');
  const [isSceneExplorerOpen, setIsSceneExplorerOpen] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const optionTextRef = useRef('');
  const [scriptLineState, setScriptLineState] = useState<ScriptLineState>({
    sceneId: null,
    script: '',
    index: 0,
  });

  const currentSceneId = scene?.id ?? null;
  const currentSceneLabel = currentSceneId ? `Scene #${currentSceneId}` : 'Scene 없음';
  const currentScript = scene?.script ?? '';
  const scriptLines = useMemo(
    () => toScriptLines(currentScript),
    [currentScript],
  );
  const scriptLineIndex =
    scriptLineState.sceneId === currentSceneId && scriptLineState.script === currentScript
      ? scriptLineState.index
      : 0;
  const lastScriptLineIndex = Math.max(scriptLines.length - 1, 0);
  const visibleScriptLineIndex = Math.min(scriptLineIndex, lastScriptLineIndex);
  const currentScriptLine = scriptLines[visibleScriptLineIndex] ?? null;
  const canReverseScript = visibleScriptLineIndex > 0;
  const canAdvanceScript = visibleScriptLineIndex < scriptLines.length - 1;
  const canNavigateScript = canReverseScript || canAdvanceScript;
  const canEditNextScene = Boolean(scene?.id && status?.id && !isAdvancing);
  const canStartAutoPlay = Boolean(
    scene?.id &&
    status?.id &&
    !isLoading &&
    !error &&
    !currentSceneEditorInitialScene &&
    !isSceneExplorerOpen,
  );
  const canRerollScene =
    Boolean(pendingTransition && scene?.id === pendingTransition.targetSceneId && status?.id);
  const canGoBackScene = canRerollScene;
  const previousOptionText =
    pendingTransition && scene?.id === pendingTransition.targetSceneId
      ? pendingTransition.optionText
      : null;
  const coreStatusChartPoints = status
    ? CORE_STATUS_FIELDS.map((field, index) =>
        getHexPoint(index, STATUS_CHART_RADIUS * (clampStatusValue(status[field.key]) / 100)),
      )
    : [];
  const coreStatusPolygon = pointList(coreStatusChartPoints);

  useEffect(() => {
    setCurrentScene(scene);
  }, [scene, setCurrentScene]);

  useEffect(() => {
    optionTextRef.current = optionText;
  }, [optionText]);

  useEffect(() => {
    if (!selectedScene?.id || selectedScene.id === scene?.id) {
      return;
    }
    setScene(selectedScene);
    setDeltas({});
    setPendingTransition(null);
    setContextSyncedSceneId(null);
    setOptionText('');
    setIsAutoPlaying(false);
    setError(null);
  }, [selectedScene, scene?.id]);

  useEffect(() => {
    if (!deletedSceneId) {
      return;
    }

    if (scene?.id !== deletedSceneId) {
      clearDeletedScene();
      return;
    }

    let isActive = true;

    async function loadFallbackScene() {
      setIsLoading(true);
      setError(null);
      setOptionText('');
      try {
        const sceneResponse = await dbTables.Scene.listRows(
          createListRequest({
            limit: 1,
            sort: ['id', 'asc'],
          }),
        );
        if (!isActive) {
          return;
        }

        const fallbackScene = sceneResponse.items[0] ?? null;
        setScene(fallbackScene);
        setDeltas({});
        setPendingTransition(null);
        setContextSyncedSceneId(null);
        setOptionText('');
        setIsAutoPlaying(false);
        if (!fallbackScene) {
          setError('시작할 Scene이 없습니다.');
        }
      } catch (loadError) {
        if (isActive) {
          setScene(null);
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
          clearDeletedScene();
        }
      }
    }

    void loadFallbackScene();

    return () => {
      isActive = false;
    };
  }, [deletedSceneId, scene?.id, clearDeletedScene]);

  useEffect(() => {
    let isActive = true;

    async function loadPlayData() {
      if (parsedStatusId === null) {
        setError('올바르지 않은 Status ID입니다.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const statusResponse = await dbTables.Status.listRows(
          createListRequest({
            limit: 1,
            selected_ids: [parsedStatusId],
          }),
        );
        if (!isActive) {
          return;
        }

        const loadedStatus = statusResponse.items[0] ?? null;
        if (!loadedStatus) {
          throw new Error('Status를 찾을 수 없습니다.');
        }
        if (!loadedStatus.id) {
          throw new Error('Status ID를 확인할 수 없습니다.');
        }

        const initialScene = await dbTables.SelectionModel.nextScene({
          scene_id: null,
          status_id: loadedStatus.id,
          option_text: '',
        });
        if (!isActive) {
          return;
        }
        if (!initialScene.id) {
          throw new Error('시작할 Scene ID를 확인할 수 없습니다.');
        }

        const { nextStatus, deltas: nextDeltas } = applyStatusChange(
          loadedStatus,
          initialScene.status_change,
        );
        await dbTables.Status.upsertRow([nextStatus]);
        if (!isActive) {
          return;
        }

        setStatus(nextStatus);
        setDeltas(nextDeltas);
        setScene(initialScene);
        setPendingTransition(null);
        setContextSyncedSceneId(null);
        setOptionText('');
        setIsAutoPlaying(false);
      } catch (loadError) {
        if (isActive) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPlayData();

    return () => {
      isActive = false;
    };
  }, [parsedStatusId]);

  function openCurrentSceneEditor() {
    if (!scene || !currentSceneId || isAdvancing) {
      return;
    }
    setIsAutoPlaying(false);
    setCurrentSceneEditorMode('edit');
    setCurrentSceneEditorSceneId(currentSceneId);
    setCurrentSceneEditorInitialScene(scene);
  }

  function openNextSceneEditor() {
    if (!scene?.id || !status?.id || isAdvancing) {
      return;
    }
    setIsAutoPlaying(false);
    setError(null);
    setCurrentSceneEditorMode('next');
    setCurrentSceneEditorSceneId(null);
    setCurrentSceneEditorInitialScene(createNextSceneDraft(scene));
  }

  function closeCurrentSceneEditor() {
    setCurrentSceneEditorSceneId(null);
    setCurrentSceneEditorInitialScene(null);
    setCurrentSceneEditorMode('edit');
  }

  async function handleCurrentSceneSaved(sceneId: number) {
    setError(null);
    try {
      const sceneResponse = await dbTables.Scene.listRows(
        createListRequest({
          limit: 1,
          selected_ids: [sceneId],
        }),
      );
      const reloadedScene = sceneResponse.items[0] ?? null;
      if (!reloadedScene) {
        throw new Error('저장한 Scene을 다시 불러올 수 없습니다.');
      }

      const isDuplicateSave = currentSceneEditorSceneId === null;
      const shouldCreateNextScene = isDuplicateSave && currentSceneEditorMode === 'next';
      const shouldReplacePendingScene =
        isDuplicateSave &&
        currentSceneEditorMode === 'replace' &&
        Boolean(pendingTransition && status?.id && scene?.id === pendingTransition.targetSceneId);

      if (shouldCreateNextScene) {
        const didAdvance = await advanceToCreatedScene(reloadedScene);
        if (!didAdvance) {
          return;
        }
      } else if (shouldReplacePendingScene) {
        const didReplace = await replacePendingScene(reloadedScene);
        if (!didReplace) {
          return;
        }
      } else {
        setScene(reloadedScene);
        setCurrentScene(reloadedScene);
        setPendingTransition(null);
        setContextSyncedSceneId(null);
        setIsAutoPlaying(false);
      }
      setCurrentSceneEditorSceneId(sceneId);
      setCurrentSceneEditorInitialScene(reloadedScene);
      setCurrentSceneEditorMode('edit');
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    }
  }

  function handleCurrentSceneDuplicate(sceneDraft: SceneRecord) {
    setCurrentSceneEditorMode('replace');
    setCurrentSceneEditorSceneId(null);
    setCurrentSceneEditorInitialScene({
      ...sceneDraft,
      id: null,
      status_change: { ...sceneDraft.status_change },
    });
  }

  function handleCurrentSceneDeleted(deletedSceneId: number) {
    closeCurrentSceneEditor();
    handleSceneDeleted(deletedSceneId);
  }

  function openManualSceneExplorer() {
    if (!pendingTransition || isAdvancing) {
      return;
    }
    setIsAutoPlaying(false);
    setIsSceneExplorerOpen(true);
  }

  function closeManualSceneExplorer() {
    setIsSceneExplorerOpen(false);
  }

  async function advanceToCreatedScene(nextScene: SceneRecord): Promise<boolean> {
    if (!scene?.id || !status?.id) {
      setError('현재 Scene 또는 Status를 확인할 수 없습니다.');
      return false;
    }
    if (!nextScene.id) {
      setError('Scene ID를 확인할 수 없습니다.');
      return false;
    }

    const sourceSceneId = scene.id;
    const sourceScene = scene;
    const statusBeforeTarget = { ...status };
    setIsAdvancing(true);
    setError(null);
    try {
      await reinforcePendingTransitionIfCurrent(sourceSceneId, status.id);
      await syncSceneContextOnce(status.id, sourceSceneId);

      const { nextStatus, deltas: nextDeltas } = applyStatusChange(
        statusBeforeTarget,
        nextScene.status_change,
      );

      await dbTables.Status.upsertRow([nextStatus]);
      setStatus(nextStatus);
      setDeltas(nextDeltas);
      setScene(nextScene);
      setCurrentScene(nextScene);
      setPendingTransition({
        sourceScene,
        sourceSceneId,
        optionText: '',
        targetSceneId: nextScene.id,
        statusBeforeTarget,
      });
      setOptionText('');
      return true;
    } catch (advanceError) {
      setError(getErrorMessage(advanceError));
      return false;
    } finally {
      setIsAdvancing(false);
    }
  }

  async function syncSceneContextOnce(statusId: number, sceneId: number) {
    if (contextSyncedSceneId === sceneId) {
      return;
    }

    await dbTables.Scene.updateContext({
      status_id: statusId,
      scene_id: sceneId,
    });
    setContextSyncedSceneId(sceneId);
  }

  async function reinforcePendingTransitionIfCurrent(sceneId: number, statusId: number) {
    if (!pendingTransition || pendingTransition.targetSceneId !== sceneId) {
      return;
    }

    await dbTables.SelectionModel.adjustModel({
      scene_id: pendingTransition.sourceSceneId,
      status_id: statusId,
      option_text: pendingTransition.optionText,
      target_scene_id: pendingTransition.targetSceneId,
      learn_rate: FEEDBACK_LEARN_RATE,
    });
  }

  async function advanceToNextScene(sourceScene: SceneRecord, submittedOptionText: string): Promise<boolean> {
    if (!status?.id || !sourceScene.id) {
      return false;
    }

    const sourceSceneId = sourceScene.id;
    setIsAdvancing(true);
    setError(null);
    try {
      await reinforcePendingTransitionIfCurrent(sourceSceneId, status.id);
      await syncSceneContextOnce(status.id, sourceSceneId);
      setPendingTransition(null);

      const nextScene = await dbTables.SelectionModel.nextScene({
        scene_id: sourceSceneId,
        status_id: status.id,
        option_text: submittedOptionText,
      });
      if (!nextScene.id) {
        throw new Error('다음 Scene ID를 확인할 수 없습니다.');
      }

      const { nextStatus, deltas: nextDeltas } = applyStatusChange(
        status,
        nextScene.status_change,
      );

      await dbTables.Status.upsertRow([nextStatus]);
      setStatus(nextStatus);
      setDeltas(nextDeltas);
      setScene(nextScene);
      setCurrentScene(nextScene);
      setPendingTransition({
        sourceScene,
        sourceSceneId,
        optionText: submittedOptionText,
        targetSceneId: nextScene.id,
        statusBeforeTarget: { ...status },
      });
      setOptionText('');
      return true;
    } catch (advanceError) {
      setError(getErrorMessage(advanceError));
      return false;
    } finally {
      setIsAdvancing(false);
    }
  }

  async function submitOptionText() {
    if (!scene?.id) {
      return;
    }

    await advanceToNextScene(scene, optionText.trim());
  }

  async function goBackToPreviousScene() {
    if (!pendingTransition || !status?.id || scene?.id !== pendingTransition.targetSceneId) {
      return;
    }

    setIsAutoPlaying(false);
    setIsAdvancing(true);
    setError(null);
    try {
      const restoredStatus = { ...pendingTransition.statusBeforeTarget };
      await dbTables.Status.upsertRow([restoredStatus]);
      setStatus(restoredStatus);
      setDeltas({});
      setScene(pendingTransition.sourceScene);
      setCurrentScene(pendingTransition.sourceScene);
      setOptionText(pendingTransition.optionText);
      setPendingTransition(null);
    } catch (backError) {
      setError(getErrorMessage(backError));
    } finally {
      setIsAdvancing(false);
    }
  }

  async function rerollScene() {
    if (!pendingTransition || !status?.id || scene?.id !== pendingTransition.targetSceneId) {
      return;
    }

    setIsAutoPlaying(false);
    setIsAdvancing(true);
    setError(null);
    try {
      const restoredStatus = { ...pendingTransition.statusBeforeTarget };
      await dbTables.Status.upsertRow([restoredStatus]);
      setStatus(restoredStatus);
      setDeltas({});

      await dbTables.SelectionModel.adjustModel({
        scene_id: pendingTransition.sourceSceneId,
        status_id: status.id,
        option_text: pendingTransition.optionText,
        target_scene_id: pendingTransition.targetSceneId,
        learn_rate: -FEEDBACK_LEARN_RATE,
      });

      const nextScene = await dbTables.SelectionModel.nextScene({
        scene_id: pendingTransition.sourceSceneId,
        status_id: status.id,
        option_text: pendingTransition.optionText,
      });
      if (!nextScene.id) {
        throw new Error('다음 Scene ID를 확인할 수 없습니다.');
      }

      const { nextStatus, deltas: nextDeltas } = applyStatusChange(
        restoredStatus,
        nextScene.status_change,
      );

      await dbTables.Status.upsertRow([nextStatus]);
      setStatus(nextStatus);
      setDeltas(nextDeltas);
      setScene(nextScene);
      setCurrentScene(nextScene);
      setPendingTransition({
        ...pendingTransition,
        targetSceneId: nextScene.id,
        statusBeforeTarget: restoredStatus,
      });
      setOptionText('');
    } catch (rerollError) {
      setError(getErrorMessage(rerollError));
    } finally {
      setIsAdvancing(false);
    }
  }

  async function replacePendingScene(replacementScene: SceneRecord): Promise<boolean> {
    if (!pendingTransition || !status?.id || scene?.id !== pendingTransition.targetSceneId) {
      return false;
    }
    if (!replacementScene.id) {
      setError('Scene ID를 확인할 수 없습니다.');
      return false;
    }

    setIsAdvancing(true);
    setError(null);
    try {
      const restoredStatus = { ...pendingTransition.statusBeforeTarget };
      await dbTables.Status.upsertRow([restoredStatus]);
      setStatus(restoredStatus);
      setDeltas({});

      await dbTables.SelectionModel.adjustModel({
        scene_id: pendingTransition.sourceSceneId,
        status_id: status.id,
        option_text: pendingTransition.optionText,
        target_scene_id: pendingTransition.targetSceneId,
        learn_rate: -FEEDBACK_LEARN_RATE,
      });

      const { nextStatus, deltas: nextDeltas } = applyStatusChange(
        restoredStatus,
        replacementScene.status_change,
      );

      await dbTables.Status.upsertRow([nextStatus]);
      setStatus(nextStatus);
      setDeltas(nextDeltas);
      setScene(replacementScene);
      setCurrentScene(replacementScene);
      setPendingTransition({
        ...pendingTransition,
        targetSceneId: replacementScene.id,
        statusBeforeTarget: restoredStatus,
      });
      setOptionText('');
      return true;
    } catch (replaceError) {
      setError(getErrorMessage(replaceError));
      return false;
    } finally {
      setIsAdvancing(false);
    }
  }

  async function selectManualScene(sceneId: number) {
    setIsAutoPlaying(false);
    if (sceneId === scene?.id) {
      setIsSceneExplorerOpen(false);
      return;
    }

    setError(null);
    try {
      const sceneResponse = await dbTables.Scene.listRows(
        createListRequest({
          limit: 1,
          selected_ids: [sceneId],
        }),
      );
      const selectedScene = sceneResponse.items[0] ?? null;
      if (!selectedScene) {
        setError('선택한 Scene을 찾을 수 없습니다.');
        return;
      }

      const didReplace = await replacePendingScene(selectedScene);
      if (didReplace) {
        setIsSceneExplorerOpen(false);
      }
    } catch (selectError) {
      setError(getErrorMessage(selectError));
    }
  }

  function moveScriptLine(direction: -1 | 1): boolean {
    const nextIndex = Math.min(
      lastScriptLineIndex,
      Math.max(0, visibleScriptLineIndex + direction),
    );
    if (nextIndex === visibleScriptLineIndex) {
      return false;
    }

    setScriptLineState({
      sceneId: currentSceneId,
      script: currentScript,
      index: nextIndex,
    });
    return true;
  }

  function advanceScriptLine() {
    moveScriptLine(1);
  }

  function toggleAutoPlay() {
    setIsAutoPlaying((current) => !current);
  }

  function handleScriptWheel(event: WheelEvent<HTMLElement>) {
    if (Math.abs(event.deltaY) < SCRIPT_WHEEL_THRESHOLD) {
      return;
    }

    const direction = event.deltaY > 0 ? 1 : -1;
    const canMove = direction > 0 ? canAdvanceScript : canReverseScript;
    if (!canMove) {
      return;
    }

    event.preventDefault();
    moveScriptLine(direction);
  }

  useEffect(() => {
    if (!isAutoPlaying) {
      return undefined;
    }
    if (error) {
      setIsAutoPlaying(false);
      return undefined;
    }
    if (
      isLoading ||
      isAdvancing ||
      currentSceneEditorInitialScene ||
      isSceneExplorerOpen ||
      !scene?.id
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (canAdvanceScript) {
        moveScriptLine(1);
        return;
      }

      void (async () => {
        const didAdvance = await advanceToNextScene(scene, optionTextRef.current.trim());
        if (!didAdvance) {
          setIsAutoPlaying(false);
        }
      })();
    }, AUTO_PLAY_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isAutoPlaying,
    isLoading,
    isAdvancing,
    error,
    currentSceneEditorInitialScene,
    isSceneExplorerOpen,
    scene,
    canAdvanceScript,
    visibleScriptLineIndex,
    moveScriptLine,
    advanceToNextScene,
  ]);

  return (
    <div className="mx-auto max-w-[1080px] rounded-[8px] border border-[rgba(255,204,220,0.28)] bg-[linear-gradient(180deg,rgba(255,238,247,0.05),rgba(14,4,18,0.62)),rgba(13,5,18,0.52)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),var(--app-shadow)] backdrop-blur-[14px] max-[640px]:p-[0.65rem]">
      <div className="grid grid-cols-[minmax(24rem,1fr)_minmax(18rem,0.42fr)] grid-rows-[auto_auto] gap-4 max-[960px]:grid-cols-1 max-[960px]:grid-rows-[auto_auto_auto]">
        <Panel className="min-h-0 min-w-0">
          <PanelHeader>
            <div className="min-w-0">
              <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene</p>
              <h1 className="truncate text-lg font-semibold text-[#fff7ef]">
                {currentSceneLabel}
              </h1>
            </div>
          </PanelHeader>
          <SectionBody className="grid place-items-center p-0">
            <ImageFrame
              className={cx(
                'relative mx-auto w-full rounded-[8px] border border-[rgba(255,218,228,0.22)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_80px_rgba(5,0,10,0.46)]',
                canNavigateScript && 'cursor-pointer',
              )}
              role={canAdvanceScript ? 'button' : undefined}
              tabIndex={canAdvanceScript ? 0 : undefined}
              aria-label={canAdvanceScript ? '다음 대사' : undefined}
              onClick={advanceScriptLine}
              onWheel={handleScriptWheel}
              onKeyDown={(event) => {
                if (canAdvanceScript && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  advanceScriptLine();
                }
              }}
            >
              {scene?.image_url ? (
                <img
                  src={scene.image_url}
                  alt="현재 Scene 이미지"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <div className="grid h-full min-h-72 w-full place-items-center gap-3 bg-[linear-gradient(145deg,rgba(255,231,238,0.1),transparent_42%),rgba(15,5,20,0.78)] p-6 text-center text-[0.95rem] text-[var(--app-muted)]">
                  {isLoading ? '장면을 불러오는 중' : '아직 이미지가 없습니다'}
                </div>
              )}
            </ImageFrame>
          </SectionBody>
        </Panel>

        <Panel className="min-w-0 self-stretch">
          <PanelHeader className="flex-col items-stretch">
            <div className="min-w-0">
              <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Status</p>
              <h2 className="truncate text-lg font-semibold text-[#fff7ef]">
                {status?.name ?? 'Status'}
              </h2>
            </div>
            {status ? (
              <div className="grid grid-cols-3 gap-2 max-[640px]:grid-cols-1">
                {HEADER_STATUS_FIELDS.map((field) => {
                  const delta = deltas[field.key];
                  const hasDelta = typeof delta === 'number' && delta !== 0;
                  return (
                    <div
                      key={field.key}
                      className={cx(
                        'relative min-h-[4.5rem] overflow-hidden rounded-[8px] border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]',
                        field.key === 'stress'
                          ? 'border-[rgba(255,133,165,0.48)] bg-[linear-gradient(145deg,rgba(232,90,135,0.25),transparent_58%),rgba(54,10,34,0.78)]'
                          : field.key === 'cash'
                            ? 'border-[rgba(255,224,170,0.5)] bg-[linear-gradient(145deg,rgba(240,179,95,0.28),transparent_56%),rgba(50,28,16,0.68)]'
                            : 'border-[rgba(255,218,228,0.42)] bg-[linear-gradient(145deg,rgba(255,229,238,0.18),transparent_56%),rgba(34,12,44,0.72)]',
                        hasDelta && 'animate-[status-pulse_1200ms_ease] border-[rgba(255,232,183,0.82)]',
                      )}
                    >
                      <span className="block text-[0.68rem] font-extrabold tracking-[0.12em] text-[#f1c4d0] uppercase">{field.label}</span>
                      <span className="mt-1.5 block text-[1.55rem] leading-none font-black text-[#fff7ef] [text-shadow:0_0_14px_rgba(255,196,214,0.28)]">
                        {status[field.key]}
                      </span>
                      {hasDelta ? (
                        <span
                          className={cx(
                            'absolute right-2.5 bottom-2.5 rounded-full px-2 py-0.5 text-[0.72rem] leading-tight font-black',
                            delta > 0
                              ? 'bg-[rgba(126,231,172,0.16)] text-[#a9f5c6]'
                              : 'bg-[rgba(255,133,165,0.16)] text-[#ff9ab8]',
                          )}
                        >
                          {formatDelta(delta)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </PanelHeader>
          <SectionBody>
            {isLoading ? (
              <p className="text-sm text-[var(--app-muted)]">불러오는 중</p>
            ) : status ? (
              <div className="grid gap-4">
                <div className="relative mx-auto w-full max-w-[24rem]">
                  <svg
                    viewBox="0 0 220 220"
                    role="img"
                    aria-label="핵심 상태 육각형 차트"
                    className="block h-auto w-full overflow-visible"
                  >
                    <defs>
                      <radialGradient id="status-chart-fill" cx="50%" cy="50%" r="58%">
                        <stop offset="0%" stopColor="rgba(255,232,183,0.62)" />
                        <stop offset="100%" stopColor="rgba(232,90,135,0.34)" />
                      </radialGradient>
                    </defs>
                    {STATUS_CHART_LEVELS.map((level) => (
                      <polygon
                        key={level}
                        points={pointList(
                          CORE_STATUS_FIELDS.map((_field, index) =>
                            getHexPoint(index, STATUS_CHART_RADIUS * (level / 100)),
                          ),
                        )}
                        fill="none"
                        stroke={level === 100 ? 'rgba(255,222,187,0.46)' : 'rgba(255,196,214,0.2)'}
                        strokeWidth={level === 100 ? 1.2 : 0.8}
                      />
                    ))}
                    {CORE_STATUS_FIELDS.map((field, index) => {
                      const edgePoint = getHexPoint(index, STATUS_CHART_RADIUS);
                      return (
                        <line
                          key={field.key}
                          x1={STATUS_CHART_CENTER}
                          y1={STATUS_CHART_CENTER}
                          x2={edgePoint.x}
                          y2={edgePoint.y}
                          stroke="rgba(255,196,214,0.18)"
                          strokeWidth="0.8"
                        />
                      );
                    })}
                    <polygon
                      points={coreStatusPolygon}
                      fill="url(#status-chart-fill)"
                      stroke="rgba(255,239,214,0.92)"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    {coreStatusChartPoints.map((point, index) => (
                      <circle
                        key={CORE_STATUS_FIELDS[index].key}
                        cx={point.x}
                        cy={point.y}
                        r="3"
                        fill="#fff7ef"
                        stroke="rgba(232,90,135,0.82)"
                        strokeWidth="1.5"
                      />
                    ))}
                    {CORE_STATUS_FIELDS.map((field, index) => {
                      const labelPoint = getHexPoint(index, STATUS_CHART_LABEL_RADIUS);
                      const delta = deltas[field.key];
                      const hasDelta = typeof delta === 'number' && delta !== 0;
                      const textAnchor =
                        labelPoint.x < STATUS_CHART_CENTER - 8
                          ? 'end'
                          : labelPoint.x > STATUS_CHART_CENTER + 8
                            ? 'start'
                            : 'middle';
                      const labelY =
                        labelPoint.y > STATUS_CHART_CENTER + 8
                          ? labelPoint.y - 10
                          : labelPoint.y < STATUS_CHART_CENTER - 8
                            ? labelPoint.y + 2
                            : labelPoint.y;
                      return (
                        <g key={field.key}>
                          <text
                            x={labelPoint.x}
                            y={labelY}
                            textAnchor={textAnchor}
                            className="fill-[#f1c4d0] text-[8px] font-black tracking-[0.08em]"
                          >
                            {field.label}
                          </text>
                          <text
                            x={labelPoint.x}
                            y={labelY + 11}
                            textAnchor={textAnchor}
                            className="fill-[#fff7ef] text-[10px] font-black"
                          >
                            {status[field.key]}
                          </text>
                          {hasDelta ? (
                            <text
                              x={labelPoint.x}
                              y={labelY + 22}
                              textAnchor={textAnchor}
                              className={cx(
                                'text-[7px] font-black',
                                delta > 0 ? 'fill-[#a9f5c6]' : 'fill-[#ff9ab8]',
                              )}
                            >
                              {formatDelta(delta)}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="min-h-11 w-full px-3 py-2 text-sm leading-tight"
                    onClick={openCurrentSceneEditor}
                    disabled={!currentSceneId || isAdvancing}
                  >
                    현재 장면 편집
                  </Button>
                  <Button
                    className="min-h-11 w-full px-3 py-2 text-sm leading-tight"
                    onClick={openNextSceneEditor}
                    disabled={!canEditNextScene}
                  >
                    다음장면 편집
                  </Button>
                  <Button
                    className="min-h-11 w-full px-3 py-2 text-sm leading-tight"
                    onClick={toggleAutoPlay}
                    disabled={!isAutoPlaying && !canStartAutoPlay}
                  >
                    {isAutoPlaying ? '자동 정지' : '자동플레이'}
                  </Button>
                  {canRerollScene ? (
                    <>
                      <Button
                        className="min-h-11 w-full px-3 py-2 text-sm leading-tight"
                        onClick={() => void goBackToPreviousScene()}
                        disabled={!canGoBackScene || isAdvancing}
                      >
                        이전 장면
                      </Button>
                      <Button
                        className="min-h-11 w-full px-3 py-2 text-sm leading-tight"
                        onClick={() => void rerollScene()}
                        disabled={isAdvancing}
                      >
                        다시 뽑기
                      </Button>
                      <Button
                        className="min-h-11 w-full px-3 py-2 text-sm leading-tight"
                        onClick={openManualSceneExplorer}
                        disabled={isAdvancing}
                      >
                        다른 장면
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#ff9ab8]">Status를 표시할 수 없습니다.</p>
            )}
          </SectionBody>
        </Panel>

        <Panel className="col-span-full min-w-0 p-4 max-[960px]:col-auto">
          {!isLoading && !error && previousOptionText !== null ? (
            <div className="mb-4 rounded-[8px] border border-[rgba(255,208,222,0.25)] bg-[rgba(12,5,18,0.52)] px-4 py-3">
              <FieldLabel>이전 Option</FieldLabel>
              <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-[#fff7ef]">
                {previousOptionText || '(빈 선택)'}
              </p>
            </div>
          ) : null}

          {isLoading || error || scriptLines.length > 0 ? (
            <div
              className={cx(
                'relative flex min-h-28 w-full items-center justify-start rounded-[8px] border border-[rgba(255,218,228,0.36)] bg-[linear-gradient(135deg,rgba(255,245,232,0.12),transparent_55%),rgba(12,4,17,0.74)] px-5 py-[1.15rem] text-left text-[1.05rem] leading-[1.65] font-bold text-[#fff7ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_18px_45px_rgba(5,0,10,0.34)] max-[640px]:min-h-32 max-[640px]:p-4',
                canNavigateScript && 'cursor-pointer',
              )}
              role={error ? 'alert' : canAdvanceScript ? 'button' : undefined}
              tabIndex={canAdvanceScript ? 0 : undefined}
              aria-label={canAdvanceScript ? '다음 대사' : undefined}
              onClick={advanceScriptLine}
              onWheel={handleScriptWheel}
              onKeyDown={(event) => {
                if (canAdvanceScript && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  advanceScriptLine();
                }
              }}
            >
              {isLoading ? (
                <span>운명의 장면을 펼치는 중...</span>
              ) : error ? (
                <span className="text-[#ff9ab8]">{error}</span>
              ) : currentScriptLine ? (
                <div className="grid w-full gap-3">
                  <p className="m-0 whitespace-pre-wrap">{currentScriptLine}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {!isLoading && !error ? (
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submitOptionText();
              }}
            >
              <div className="grid items-end gap-3 min-[760px]:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-1">
                  <FieldLabel htmlFor="next-option-text">Option</FieldLabel>
                  <FormControl
                    id="next-option-text"
                    value={optionText}
                    onChange={(event) => setOptionText(event.target.value)}
                    className="h-12 w-full px-3"
                    disabled={isAdvancing || !scene?.id}
                  />
                </div>
                <Button
                  type="submit"
                  className="h-12 px-5 py-3"
                  disabled={isAdvancing || !scene?.id}
                >
                  {isAdvancing ? '다음장면 찾는 중' : '다음장면'}
                </Button>
              </div>
            </form>
          ) : null}
        </Panel>
      </div>

      {currentSceneEditorInitialScene ? (
        <SceneEditModal
          sceneId={currentSceneEditorSceneId}
          initialScene={currentSceneEditorInitialScene}
          onClose={closeCurrentSceneEditor}
          onSaved={(sceneId) => void handleCurrentSceneSaved(sceneId)}
          onDeleted={handleCurrentSceneDeleted}
          onDuplicate={handleCurrentSceneDuplicate}
        />
      ) : null}

      {isSceneExplorerOpen ? (
        <SceneExplorerModal
          currentSceneId={scene?.id ?? null}
          onClose={closeManualSceneExplorer}
          onSelect={(sceneId) => void selectManualScene(sceneId)}
        />
      ) : null}
    </div>
  );
}
