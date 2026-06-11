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
  sceneOptionId: number;
  targetSceneId: number;
  statusBeforeTarget: StatusRecord;
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

function stringifyScriptLine(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const speaker = objectValue.speaker ?? objectValue.name ?? objectValue.character;
    const text = objectValue.text ?? objectValue.line ?? objectValue.content;
    const textLine = stringifyScriptLine(text);
    if (textLine && typeof speaker === 'string' && speaker.trim()) {
      return `${speaker.trim()}: ${textLine}`;
    }
    if (textLine) {
      return textLine;
    }
    return JSON.stringify(value);
  }
  return null;
}

function toScriptLines(scripts: SceneRecord['scripts']): string[] {
  const rawLines = Array.isArray(scripts)
    ? scripts
    : Object.keys(scripts ?? {})
        .sort()
        .map((key) => scripts[key]);

  return rawLines
    .map((line) => stringifyScriptLine(line))
    .filter((line): line is string => Boolean(line));
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
  const [scriptIndex, setScriptIndex] = useState(0);
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

  const scriptLines = useMemo(
    () => (scene ? toScriptLines(scene.scripts) : []),
    [scene],
  );
  const isShowingOptions = scriptLines.length === 0 || scriptIndex >= scriptLines.length;
  const currentLine = isShowingOptions ? null : scriptLines[scriptIndex];
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
    setScriptIndex(0);
    setPendingTransition(null);
  }, [savedScene, scene?.id]);

  useEffect(() => {
    if (!selectedScene?.id || selectedScene.id === scene?.id) {
      return;
    }
    setScene(selectedScene);
    setScriptIndex(0);
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
        setScriptIndex(0);
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
        const [statusResponse, sceneResponse] = await Promise.all([
          dbTables.Status.listRows(
            createListRequest({
              limit: 1,
              selected_ids: [parsedStatusId],
            }),
          ),
          dbTables.Scene.listRows(
            createListRequest({
              limit: 1,
              sort: ['id', 'asc'],
            }),
          ),
        ]);
        if (!isActive) {
          return;
        }

        const loadedStatus = statusResponse.items[0] ?? null;
        const loadedScene = sceneResponse.items[0] ?? null;
        if (!loadedStatus) {
          throw new Error('Status를 찾을 수 없습니다.');
        }
        if (!loadedScene) {
          throw new Error('시작할 Scene이 없습니다.');
        }

        setStatus(loadedStatus);
        setScene(loadedScene);
        setScriptIndex(0);
        setDeltas({});
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

  function advanceScript() {
    if (isAdvancing || isShowingOptions) {
      return;
    }
    setScriptIndex((current) => Math.min(current + 1, scriptLines.length));
  }

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

  async function chooseOption(option: SceneOptionRecord) {
    if (!scene?.id || !status?.id || !option.id) {
      return;
    }

    setIsAdvancing(true);
    setError(null);
    try {
      if (pendingTransition && pendingTransition.targetSceneId === scene.id) {
        await dbTables.SelectionModel.adjustModel({
          scene_id: pendingTransition.sourceSceneId,
          status_id: status.id,
          scene_option_id: pendingTransition.sceneOptionId,
          target_scene_id: pendingTransition.targetSceneId,
          learn_rate: FEEDBACK_LEARN_RATE,
        });
      }
      await dbTables.Scene.updateContext({
        status_id: status.id,
        scene_id: scene.id,
      });
      setPendingTransition(null);

      const nextScene = await dbTables.SelectionModel.nextScene({
        scene_id: scene.id,
        status_id: status.id,
        scene_option_id: option.id,
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
      setScriptIndex(0);
      setPendingTransition({
        sourceSceneId: scene.id,
        sceneOptionId: option.id,
        targetSceneId: nextScene.id,
        statusBeforeTarget: { ...status },
      });
    } catch (advanceError) {
      setError(getErrorMessage(advanceError));
    } finally {
      setIsAdvancing(false);
    }
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
      setScriptIndex(0);
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
      setScriptIndex(0);
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

  return (
    <div className="vn-play-stage">
      <div className="vn-play-layout">
        <section className="vn-panel vn-scene-panel">
          <div className="vn-panel-header">
            <div className="min-w-0">
              <p className="vn-subtitle">Scene</p>
              <h1 className="truncate text-lg font-semibold text-[#fff7ef]">
                {scene?.prompt || 'Scene 없음'}
              </h1>
            </div>
            {canRerollScene ? (
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="vn-button px-4 py-2 text-sm"
                  onClick={() => void rerollScene()}
                  disabled={isAdvancing}
                >
                  다시 뽑기
                </button>
                <button
                  type="button"
                  className="vn-button px-4 py-2 text-sm"
                  onClick={openManualSceneExplorer}
                  disabled={isAdvancing}
                >
                  다른 장면
                </button>
                <button
                  type="button"
                  className="vn-button px-4 py-2 text-sm"
                  onClick={openReplacementSceneEditor}
                  disabled={isAdvancing}
                >
                  새 장면
                </button>
              </div>
            ) : null}
          </div>
          <div className="vn-section-body">
            <div className="dp-image-frame vn-scene-image-frame">
              {scene?.image_url ? (
                <img
                  src={scene.image_url}
                  alt={scene.prompt}
                  className="dp-image-media"
                />
              ) : (
                <div className="vn-scene-empty">
                  {isLoading ? '장면을 불러오는 중' : '아직 이미지가 없습니다'}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="vn-panel vn-status-panel">
          <div className="vn-panel-header">
            <div className="min-w-0">
              <p className="vn-subtitle">Status</p>
              <h2 className="truncate text-lg font-semibold text-[#fff7ef]">
                {status?.name ?? 'Status'}
              </h2>
            </div>
            {status?.id ? (
              <span className="text-xs font-semibold text-[var(--app-accent)]">
                #{status.id}
              </span>
            ) : null}
          </div>
          <div className="vn-section-body">
            {isLoading ? (
              <p className="text-sm text-[var(--app-muted)]">불러오는 중</p>
            ) : status ? (
              <div className="vn-status-grid">
                {STATUS_FIELDS.map((field) => {
                  const delta = deltas[field.key];
                  const hasDelta = typeof delta === 'number' && delta !== 0;
                  return (
                    <div
                      key={field.key}
                      className={[
                        'vn-status-stat',
                        hasDelta ? 'vn-status-stat-changed' : '',
                      ].join(' ')}
                    >
                      <span className="vn-status-stat-label">{field.label}</span>
                      <span className="vn-status-stat-value">{status[field.key]}</span>
                      {hasDelta ? (
                        <span
                          className={[
                            'vn-status-delta',
                            delta > 0 ? 'vn-status-delta-up' : 'vn-status-delta-down',
                          ].join(' ')}
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
          </div>
        </aside>

        <section className="vn-panel vn-control-panel">
          {isLoading || error || currentLine ? (
            <button
              type="button"
              className="vn-dialogue-box"
              onClick={advanceScript}
              disabled={isLoading || isAdvancing || isShowingOptions}
            >
              {isLoading ? (
                <span>운명의 장면을 펼치는 중...</span>
              ) : error ? (
                <span className="text-[#ff9ab8]">{error}</span>
              ) : currentLine ? (
                <span>{currentLine}</span>
              ) : null}
              {!isShowingOptions && !error ? (
                <span className="vn-dialogue-cue">계속</span>
              ) : null}
            </button>
          ) : null}

          {isShowingOptions && !isLoading ? (
            <div className="vn-option-list">
              {isLoadingOptions ? (
                <p className="text-sm text-[var(--app-muted)]">선택지를 불러오는 중</p>
              ) : options.length > 0 ? (
                <>
                  {options.map((option) => (
                    <div key={option.id} className="vn-option-row">
                      <button
                        type="button"
                        className="vn-button vn-option-button px-5 py-3"
                        onClick={() => void chooseOption(option)}
                        disabled={isAdvancing}
                      >
                        {option.option_text}
                      </button>
                      <button
                        type="button"
                        className="vn-button vn-option-edit-button px-3 py-2"
                        onClick={() => openOptionEditor(option)}
                        disabled={isAdvancing}
                      >
                        편집
                      </button>
                    </div>
                  ))}
                  <div className="vn-option-add-row">
                    <button
                      type="button"
                      className="vn-button px-3 py-2 text-xs"
                      onClick={() => openOptionEditor(null)}
                      disabled={isAdvancing || !scene?.id}
                    >
                      새 옵션 추가
                    </button>
                  </div>
                </>
              ) : (
                <div className="vn-option-add-row">
                  <p className="text-sm text-[var(--app-muted)]">선택지가 없습니다.</p>
                  <button
                    type="button"
                    className="vn-button px-3 py-2 text-xs"
                    onClick={() => openOptionEditor(null)}
                    disabled={isAdvancing || !scene?.id}
                  >
                    새 옵션 추가
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </section>
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
