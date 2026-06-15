import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type {
  GetListRequest,
  SceneOptionRecord,
  SceneRecord,
  StatusRecord,
} from '../../api/type';
import { useSceneStore } from '../../api/store';
import { SceneEditorModal } from '../../components/SceneEditorModal';
import { SceneExplorerModal } from '../../components/SceneExplorerModal';
import { SceneOptionEditorModal } from '../../components/SceneOptionEditorModal';
import {
  Button,
  ImageFrame,
  Panel,
  PanelHeader,
  SectionBody,
  cx,
} from '../../components/ui';

const STATUS_FIELDS = [
  { key: 'turn', label: '턴' },
  { key: 'cash', label: '현금' },
  { key: 'strength', label: '힘' },
  { key: 'agility', label: '민첩' },
  { key: 'intelligence', label: '지력' },
  { key: 'sense', label: '센스' },
  { key: 'attractiveness', label: '매력' },
  { key: 'toughness', label: '근성' },
  { key: 'stress', label: '스트레스' },
] as const;

type StatusNumberKey = (typeof STATUS_FIELDS)[number]['key'];
type StatusDeltas = Partial<Record<StatusNumberKey, number>>;
type PendingTransition = {
  sourceSceneId: number;
  sceneOptionId: number | null;
  targetSceneId: number;
  statusBeforeTarget: StatusRecord;
};
type ScriptLineState = {
  sceneId: number | null;
  script: string;
  index: number;
};

const FEEDBACK_LEARN_RATE = 0.1;

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

export function PlayPage() {
  const { statusId } = useParams();
  const parsedStatusId = isValidId(statusId) ? Number(statusId) : null;
  const savedScene = useSceneStore((state) => state.savedScene);
  const selectedScene = useSceneStore((state) => state.selectedScene);
  const deletedSceneId = useSceneStore((state) => state.deletedSceneId);
  const setCurrentScene = useSceneStore((state) => state.setCurrentScene);
  const clearDeletedScene = useSceneStore((state) => state.clearDeletedScene);
  const [status, setStatus] = useState<StatusRecord | null>(null);
  const [scene, setScene] = useState<SceneRecord | null>(null);
  const [options, setOptions] = useState<SceneOptionRecord[]>([]);
  const [deltas, setDeltas] = useState<StatusDeltas>({});
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [editingOption, setEditingOption] = useState<SceneOptionRecord | null>(null);
  const [isOptionEditorOpen, setIsOptionEditorOpen] = useState(false);
  const [isSceneExplorerOpen, setIsSceneExplorerOpen] = useState(false);
  const [isSceneEditorOpen, setIsSceneEditorOpen] = useState(false);
  const [createdReplacementScene, setCreatedReplacementScene] = useState<SceneRecord | null>(null);
  const [optionReloadKey, setOptionReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scriptLineState, setScriptLineState] = useState<ScriptLineState>({
    sceneId: null,
    script: '',
    index: 0,
  });

  const currentSceneId = scene?.id ?? null;
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
  const canAdvanceScript = visibleScriptLineIndex < scriptLines.length - 1;
  const canShowOptions = scriptLines.length === 0 || !canAdvanceScript;
  const canRerollScene =
    Boolean(pendingTransition && scene?.id === pendingTransition.targetSceneId && status?.id);

  useEffect(() => {
    setCurrentScene(scene);
  }, [scene, setCurrentScene]);

  useEffect(() => {
    if (!savedScene?.id || !scene?.id || savedScene.id !== scene.id) {
      return;
    }
    setScene(savedScene);
    setPendingTransition(null);
  }, [savedScene, scene?.id]);

  useEffect(() => {
    if (!selectedScene?.id || selectedScene.id === scene?.id) {
      return;
    }
    setScene(selectedScene);
    setDeltas({});
    setPendingTransition(null);
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
      setOptions([]);
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
          scene_option_id: null,
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

  useEffect(() => {
    let isActive = true;

    async function loadOptions() {
      if (!scene?.id) {
        setOptions([]);
        return;
      }

      setIsLoadingOptions(true);
      setError(null);
      try {
        const optionResponse = await dbTables.SceneOption.listRows(
          createListRequest({
            filter: {
              scene_id: [scene.id, scene.id],
            },
            sort: ['id', 'asc'],
          }),
        );
        if (isActive) {
          setOptions(optionResponse.items);
        }
      } catch (optionError) {
        if (isActive) {
          setError(getErrorMessage(optionError));
        }
      } finally {
        if (isActive) {
          setIsLoadingOptions(false);
        }
      }
    }

    void loadOptions();

    return () => {
      isActive = false;
    };
  }, [scene?.id, optionReloadKey]);

  function openOptionEditor(option: SceneOptionRecord | null) {
    if (!scene?.id) {
      setError('Scene을 먼저 불러와 주세요.');
      return;
    }
    setEditingOption(option);
    setIsOptionEditorOpen(true);
  }

  function closeOptionEditor() {
    setIsOptionEditorOpen(false);
    setEditingOption(null);
  }

  function handleOptionSaved() {
    closeOptionEditor();
    setOptionReloadKey((current) => current + 1);
  }

  function handleOptionDeleted() {
    closeOptionEditor();
    setOptionReloadKey((current) => current + 1);
  }

  function openManualSceneExplorer() {
    if (!pendingTransition || isAdvancing) {
      return;
    }
    setIsSceneExplorerOpen(true);
  }

  function closeManualSceneExplorer() {
    setIsSceneExplorerOpen(false);
  }

  function openReplacementSceneEditor() {
    if (!pendingTransition || isAdvancing) {
      return;
    }
    setCreatedReplacementScene(null);
    setIsSceneEditorOpen(true);
  }

  async function closeReplacementSceneEditor() {
    const sceneToApply = createdReplacementScene;
    setIsSceneEditorOpen(false);
    setCreatedReplacementScene(null);
    if (sceneToApply) {
      await replacePendingScene(sceneToApply);
    }
  }

  function handleReplacementSceneSaved(savedScene: SceneRecord) {
    setCreatedReplacementScene(savedScene);
  }

  function handleReplacementSceneDeleted() {
    setIsSceneEditorOpen(false);
    setCreatedReplacementScene(null);
  }

  async function reinforcePendingTransitionIfCurrent(sceneId: number, statusId: number) {
    if (!pendingTransition || pendingTransition.targetSceneId !== sceneId) {
      return;
    }

    await dbTables.SelectionModel.adjustModel({
      scene_id: pendingTransition.sourceSceneId,
      status_id: statusId,
      scene_option_id: pendingTransition.sceneOptionId,
      target_scene_id: pendingTransition.targetSceneId,
      learn_rate: FEEDBACK_LEARN_RATE,
    });
  }

  async function advanceToNextScene(sourceSceneId: number, sceneOptionId: number | null) {
    if (!status?.id) {
      return;
    }

    setIsAdvancing(true);
    setError(null);
    try {
      await reinforcePendingTransitionIfCurrent(sourceSceneId, status.id);
      await dbTables.Scene.updateContext({
        status_id: status.id,
        scene_id: sourceSceneId,
      });
      setPendingTransition(null);

      const nextScene = await dbTables.SelectionModel.nextScene({
        scene_id: sourceSceneId,
        status_id: status.id,
        scene_option_id: sceneOptionId,
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
        sourceSceneId,
        sceneOptionId,
        targetSceneId: nextScene.id,
        statusBeforeTarget: { ...status },
      });
    } catch (advanceError) {
      setError(getErrorMessage(advanceError));
    } finally {
      setIsAdvancing(false);
    }
  }

  async function chooseOption(option: SceneOptionRecord) {
    if (!scene?.id || !option.id) {
      return;
    }

    await advanceToNextScene(scene.id, option.id);
  }

  async function advanceWithoutOption() {
    if (!scene?.id) {
      return;
    }

    await advanceToNextScene(scene.id, null);
  }

  async function rerollScene() {
    if (!pendingTransition || !status?.id || scene?.id !== pendingTransition.targetSceneId) {
      return;
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
        scene_option_id: pendingTransition.sceneOptionId,
        target_scene_id: pendingTransition.targetSceneId,
        learn_rate: -FEEDBACK_LEARN_RATE,
      });

      const nextScene = await dbTables.SelectionModel.nextScene({
        scene_id: pendingTransition.sourceSceneId,
        status_id: status.id,
        scene_option_id: pendingTransition.sceneOptionId,
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
        scene_option_id: pendingTransition.sceneOptionId,
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
      return true;
    } catch (replaceError) {
      setError(getErrorMessage(replaceError));
      return false;
    } finally {
      setIsAdvancing(false);
    }
  }

  async function selectManualScene(selectedScene: SceneRecord) {
    if (selectedScene.id === scene?.id) {
      setIsSceneExplorerOpen(false);
      return;
    }

    const didReplace = await replacePendingScene(selectedScene);
    if (didReplace) {
      setIsSceneExplorerOpen(false);
    }
  }

  function advanceScriptLine() {
    if (!canAdvanceScript) {
      return;
    }
    setScriptLineState({
      sceneId: currentSceneId,
      script: currentScript,
      index: Math.min(visibleScriptLineIndex + 1, lastScriptLineIndex),
    });
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] rounded-[8px] border border-[rgba(255,204,220,0.28)] bg-[linear-gradient(180deg,rgba(255,238,247,0.05),rgba(14,4,18,0.62)),rgba(13,5,18,0.52)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),var(--app-shadow)] backdrop-blur-[14px] max-[640px]:p-[0.65rem]">
      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-[minmax(24rem,1fr)_minmax(18rem,0.42fr)] grid-rows-[minmax(0,1fr)_auto] gap-4 max-[960px]:grid-cols-1 max-[960px]:grid-rows-[auto_auto_auto]">
        <Panel className="min-h-0 min-w-0">
          <PanelHeader>
            <div className="min-w-0">
              <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Scene</p>
              <h1 className="truncate text-lg font-semibold text-[#fff7ef]">
                {scene?.prompt || 'Scene 없음'}
              </h1>
            </div>
            {canRerollScene ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button
                  className="px-4 py-2 text-sm"
                  onClick={() => void rerollScene()}
                  disabled={isAdvancing}
                >
                  다시 뽑기
                </Button>
                <Button
                  className="px-4 py-2 text-sm"
                  onClick={openManualSceneExplorer}
                  disabled={isAdvancing}
                >
                  다른 장면
                </Button>
                <Button
                  className="px-4 py-2 text-sm"
                  onClick={openReplacementSceneEditor}
                  disabled={isAdvancing}
                >
                  새 장면
                </Button>
              </div>
            ) : null}
          </PanelHeader>
          <SectionBody className="grid place-items-center p-0">
            <ImageFrame className="mx-auto w-[min(100%,max(28rem,calc(100vh-10rem)))] rounded-[8px] border border-[rgba(255,218,228,0.22)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_80px_rgba(5,0,10,0.46)] max-[960px]:w-[min(100%,34rem)]">
              {scene?.image_url ? (
                <img
                  src={scene.image_url}
                  alt={scene.prompt}
                  className="block h-full w-full object-cover"
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
          <PanelHeader>
            <div className="min-w-0">
              <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Status</p>
              <h2 className="truncate text-lg font-semibold text-[#fff7ef]">
                {status?.name ?? 'Status'}
              </h2>
            </div>
            {status?.id ? (
              <span className="text-xs font-semibold text-[var(--app-accent)]">
                #{status.id}
              </span>
            ) : null}
          </PanelHeader>
          <SectionBody>
            {isLoading ? (
              <p className="text-sm text-[var(--app-muted)]">불러오는 중</p>
            ) : status ? (
              <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
                {STATUS_FIELDS.map((field) => {
                  const delta = deltas[field.key];
                  const hasDelta = typeof delta === 'number' && delta !== 0;
                  return (
                    <div
                      key={field.key}
                      className={cx(
                        'relative min-h-[4.75rem] overflow-hidden rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[linear-gradient(135deg,rgba(255,229,238,0.1),transparent_58%),rgba(12,5,18,0.58)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
                        hasDelta && 'animate-[status-pulse_1200ms_ease] border-[rgba(255,232,183,0.82)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_28px_rgba(240,179,95,0.28)]',
                      )}
                    >
                      <span className="block text-xs font-extrabold tracking-[0.08em] text-[#f1c4d0] uppercase">{field.label}</span>
                      <span className="mt-1.5 block text-[1.45rem] leading-none font-extrabold text-[#fff7ef] [text-shadow:0_0_14px_rgba(255,196,214,0.28)]">{status[field.key]}</span>
                      {hasDelta ? (
                        <span
                          className={cx(
                            'absolute right-2.5 bottom-2.5 rounded-full px-2 py-0.5 text-[0.78rem] leading-tight font-black',
                            delta > 0
                              ? 'bg-[rgba(126,231,172,0.16)] text-[#a9f5c6]'
                              : 'bg-[rgba(255,133,165,0.16)] text-[#ff9ab8]',
                          )}
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-[#ff9ab8]">Status를 표시할 수 없습니다.</p>
            )}
          </SectionBody>
        </Panel>

        <Panel className="col-span-full min-w-0 p-4 max-[960px]:col-auto">
          {isLoading || error || scriptLines.length > 0 ? (
            <div
              className={cx(
                'relative flex min-h-28 w-full items-center justify-start rounded-[8px] border border-[rgba(255,218,228,0.36)] bg-[linear-gradient(135deg,rgba(255,245,232,0.12),transparent_55%),rgba(12,4,17,0.74)] px-5 py-[1.15rem] text-left text-[1.05rem] leading-[1.65] font-bold text-[#fff7ef] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_18px_45px_rgba(5,0,10,0.34)] max-[640px]:min-h-32 max-[640px]:p-4',
                canAdvanceScript && 'cursor-pointer',
              )}
              role={error ? 'alert' : canAdvanceScript ? 'button' : undefined}
              tabIndex={canAdvanceScript ? 0 : undefined}
              aria-label={canAdvanceScript ? '다음 대사' : undefined}
              onClick={advanceScriptLine}
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

          {!isLoading && !error && canShowOptions ? (
            <div className="mt-4 grid gap-3">
              {isLoadingOptions ? (
                <p className="text-sm text-[var(--app-muted)]">선택지를 불러오는 중</p>
              ) : options.length > 0 ? (
                <>
                  {options.map((option) => (
                    <div key={option.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2 max-[640px]:grid-cols-1">
                      <Button
                        className="w-full px-5 py-3 text-left"
                        onClick={() => void chooseOption(option)}
                        disabled={isAdvancing}
                      >
                        {option.option_text}
                      </Button>
                      <Button
                        className="self-stretch px-3 py-2 text-[0.78rem]"
                        onClick={() => openOptionEditor(option)}
                        disabled={isAdvancing}
                      >
                        편집
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-end gap-3 pt-1 max-[640px]:flex-col max-[640px]:items-stretch">
                    <Button
                      className="px-3 py-2 text-xs"
                      onClick={() => openOptionEditor(null)}
                      disabled={isAdvancing || !scene?.id}
                    >
                      새 옵션 추가
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-end gap-3 pt-1 max-[640px]:flex-col max-[640px]:items-stretch">
                  <Button
                    className="w-full px-5 py-3 text-left"
                    onClick={() => void advanceWithoutOption()}
                    disabled={isAdvancing || !scene?.id}
                  >
                    {isAdvancing ? '다음 장면을 찾는 중' : '다음 장면'}
                  </Button>
                  <Button
                    className="px-3 py-2 text-xs"
                    onClick={() => openOptionEditor(null)}
                    disabled={isAdvancing || !scene?.id}
                  >
                    새 옵션 추가
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </Panel>
      </div>

      {isOptionEditorOpen && scene ? (
        <SceneOptionEditorModal
          scene={scene}
          option={editingOption}
          onClose={closeOptionEditor}
          onSaved={handleOptionSaved}
          onDeleted={handleOptionDeleted}
        />
      ) : null}

      {isSceneExplorerOpen ? (
        <SceneExplorerModal
          currentScene={scene}
          onClose={closeManualSceneExplorer}
          onSelect={(selectedScene) => void selectManualScene(selectedScene)}
        />
      ) : null}

      {isSceneEditorOpen ? (
        <SceneEditorModal
          scene={null}
          onClose={() => void closeReplacementSceneEditor()}
          onSaved={handleReplacementSceneSaved}
          onDeleted={handleReplacementSceneDeleted}
        />
      ) : null}
    </div>
  );
}
