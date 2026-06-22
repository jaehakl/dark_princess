import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type {
  CutRecord,
  GetListRequest,
  SceneRecord,
} from '../../api/type';
import { CutEditComponent } from '../../components/cut-editor';
import {
  Button,
  FieldLabel,
  FormControl,
  ImageFrame,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
  cx,
} from '../../components/ui';

const SCENE_CUT_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: null,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
};

const IMPORT_CUT_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: null,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
};

const SCENE_BY_ID_REQUEST: GetListRequest = {
  offset: 0,
  limit: 1,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: null,
};

const SCENE_STAT_FIELDS = [
  { key: 'cash', label: '현금' },
  { key: 'strength', label: '힘' },
  { key: 'agility', label: '민첩' },
  { key: 'intelligence', label: '지력' },
  { key: 'sense', label: '센스' },
  { key: 'attractiveness', label: '매력' },
  { key: 'toughness', label: '근성' },
  { key: 'stress', label: '스트레스' },
] as const;

type SceneDraft = Pick<
  SceneRecord,
  | 'title'
  | 'context'
  | 'turn'
  | 'cash'
  | 'strength'
  | 'agility'
  | 'intelligence'
  | 'sense'
  | 'attractiveness'
  | 'toughness'
  | 'stress'
>;

function createEmptySceneCut(sceneId: number): CutRecord {
  return {
    id: null,
    image_id: null,
    scene_id: sceneId,
    prev_cut_id: null,
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
}

function createNextCutDraft(sceneId: number, sourceCut: CutRecord): CutRecord {
  return {
    ...sourceCut,
    id: null,
    scene_id: sceneId,
    prev_cut_id: sourceCut.id ?? null,
    script: '',
    status_change: { turn: 1 },
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function getScriptSummary(cut: CutRecord) {
  const summary = cut.script.replace(/\s+/g, ' ').trim();
  return summary || 'script 없음';
}

function toSceneDraft(scene: SceneRecord): SceneDraft {
  return {
    title: scene.title,
    context: scene.context,
    turn: scene.turn,
    cash: scene.cash,
    strength: scene.strength,
    agility: scene.agility,
    intelligence: scene.intelligence,
    sense: scene.sense,
    attractiveness: scene.attractiveness,
    toughness: scene.toughness,
    stress: scene.stress,
  };
}

function orderCuts(cuts: CutRecord[], selectedCutId: number | null) {
  const sortedCuts = [...cuts].sort((left, right) => (right.id ?? 0) - (left.id ?? 0));
  if (selectedCutId === null) {
    return sortedCuts;
  }

  const cutById = new Map(
    sortedCuts
      .filter((cut): cut is CutRecord & { id: number } => typeof cut.id === 'number')
      .map((cut) => [cut.id, cut]),
  );
  const selectedCut = cutById.get(selectedCutId);
  if (!selectedCut) {
    return sortedCuts;
  }

  const childrenByPrevId = new Map<number, CutRecord[]>();
  for (const cut of sortedCuts) {
    if (typeof cut.id !== 'number' || cut.prev_cut_id === null || cut.prev_cut_id === undefined) {
      continue;
    }
    childrenByPrevId.set(cut.prev_cut_id, [...(childrenByPrevId.get(cut.prev_cut_id) ?? []), cut]);
  }

  const ancestorCuts: CutRecord[] = [];
  const priorityIds = new Set<number>([selectedCutId]);
  let nextParentId = selectedCut.prev_cut_id ?? null;
  while (nextParentId !== null && !priorityIds.has(nextParentId)) {
    const parentCut = cutById.get(nextParentId);
    if (!parentCut) {
      break;
    }
    ancestorCuts.push(parentCut);
    priorityIds.add(nextParentId);
    nextParentId = parentCut.prev_cut_id ?? null;
  }

  const descendantCuts: CutRecord[] = [];
  const descendantStack = [...(childrenByPrevId.get(selectedCutId) ?? [])].reverse();
  while (descendantStack.length > 0) {
    const descendantCut = descendantStack.pop();
    const descendantCutId = descendantCut?.id;
    if (!descendantCut || typeof descendantCutId !== 'number' || priorityIds.has(descendantCutId)) {
      continue;
    }

    descendantCuts.push(descendantCut);
    priorityIds.add(descendantCutId);
    descendantStack.push(...[...(childrenByPrevId.get(descendantCutId) ?? [])].reverse());
  }

  const priorityCuts = [...ancestorCuts.reverse(), selectedCut, ...descendantCuts];
  return [
    ...priorityCuts,
    ...sortedCuts.filter((cut) => typeof cut.id !== 'number' || !priorityIds.has(cut.id)),
  ];
}

export function SceneEditPage() {
  const { scene_id: rawSceneId } = useParams();
  const sceneId = Number(rawSceneId);
  const isValidSceneId = Number.isInteger(sceneId) && sceneId > 0;

  const [scene, setScene] = useState<SceneRecord | null>(null);
  const [cuts, setCuts] = useState<CutRecord[]>([]);
  const [selectedCutId, setSelectedCutId] = useState<number | null>(null);
  const [editorInitialCut, setEditorInitialCut] = useState<CutRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingScene, setIsSavingScene] = useState(false);
  const [isUpdatingLinks, setIsUpdatingLinks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);
  const [sceneDraft, setSceneDraft] = useState<SceneDraft | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [unassignedCuts, setUnassignedCuts] = useState<CutRecord[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<number>>(new Set());
  const [isLoadingImportCuts, setIsLoadingImportCuts] = useState(false);
  const [isImportingCuts, setIsImportingCuts] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const selectedCut = useMemo(
    () => cuts.find((cut) => cut.id === selectedCutId) ?? null,
    [cuts, selectedCutId],
  );
  const draftParentCutId = selectedCutId === null && typeof editorInitialCut?.prev_cut_id === 'number'
    ? editorInitialCut.prev_cut_id
    : null;
  const genealogyFocusCutId = selectedCutId ?? draftParentCutId;
  const visibleCuts = useMemo(
    () => orderCuts(cuts, genealogyFocusCutId),
    [cuts, genealogyFocusCutId],
  );

  async function loadSceneData(preferredCutId?: number | null) {
    if (!isValidSceneId) {
      setError('올바르지 않은 Scene ID입니다.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [sceneResponse, cutResponse] = await Promise.all([
        dbTables.Scene.listRows({
          ...SCENE_BY_ID_REQUEST,
          selected_ids: [sceneId],
        }),
        dbTables.Cut.listRows({
          ...SCENE_CUT_LIST_REQUEST,
          filter: { scene_id: [sceneId, sceneId] },
        }),
      ]);
      const loadedScene = sceneResponse.items[0] ?? null;
      if (!loadedScene) {
        throw new Error('Scene을 찾을 수 없습니다.');
      }

      const loadedCuts = cutResponse.items;
      const loadedCutIds = new Set(
        loadedCuts.map((cut) => cut.id).filter((id): id is number => typeof id === 'number'),
      );
      const nextSelectedCutId =
        preferredCutId !== undefined && preferredCutId !== null && loadedCutIds.has(preferredCutId)
          ? preferredCutId
          : selectedCutId !== null && loadedCutIds.has(selectedCutId)
            ? selectedCutId
            : loadedScene.first_cut_id && loadedCutIds.has(loadedScene.first_cut_id)
              ? loadedScene.first_cut_id
              : loadedCuts.find((cut) => typeof cut.id === 'number')?.id ?? null;

      setScene(loadedScene);
      setCuts(loadedCuts);
      setSelectedCutId(nextSelectedCutId);
      setEditorInitialCut(nextSelectedCutId === null ? null : createEmptySceneCut(sceneId));
    } catch (loadError) {
      setScene(null);
      setCuts([]);
      setSelectedCutId(null);
      setEditorInitialCut(null);
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSceneData(null);
  }, [rawSceneId]);

  function selectCut(cut: CutRecord) {
    if (typeof cut.id !== 'number') {
      return;
    }
    setSelectedCutId(cut.id);
    setEditorInitialCut(createEmptySceneCut(sceneId));
    setError(null);
  }

  function openSceneModal() {
    if (!scene) {
      return;
    }
    setSceneDraft(toSceneDraft(scene));
    setIsSceneModalOpen(true);
  }

  async function saveScene() {
    if (!scene || !sceneDraft) {
      return;
    }

    setIsSavingScene(true);
    setError(null);
    try {
      await dbTables.Scene.upsertRow([
        {
          ...scene,
          ...sceneDraft,
          title: sceneDraft.title.trim() || 'Scene',
          context: sceneDraft.context,
        },
      ]);
      setIsSceneModalOpen(false);
      await loadSceneData(selectedCutId);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingScene(false);
    }
  }

  async function setCurrentAsFirstCut() {
    if (!scene || selectedCutId === null || isUpdatingLinks) {
      return;
    }

    setIsUpdatingLinks(true);
    setError(null);
    try {
      const updatedScene = await dbTables.Scene.updateFirstCut({
        scene_id: scene.id ?? sceneId,
        cut_id: selectedCutId,
      });
      setScene(updatedScene);
      await loadSceneData(selectedCutId);
    } catch (linkError) {
      setError(getErrorMessage(linkError));
    } finally {
      setIsUpdatingLinks(false);
    }
  }

  async function setPrevCut(prevCutId: number) {
    if (selectedCutId === null || prevCutId === selectedCutId || isUpdatingLinks) {
      return;
    }

    setIsUpdatingLinks(true);
    setError(null);
    try {
      await dbTables.Cut.updateLinks({
        cut_id: selectedCutId,
        prev_cut_id: prevCutId,
      });
      await loadSceneData(selectedCutId);
    } catch (linkError) {
      setError(getErrorMessage(linkError));
    } finally {
      setIsUpdatingLinks(false);
    }
  }

  async function setNextCut(nextCutId: number) {
    if (selectedCutId === null || nextCutId === selectedCutId || isUpdatingLinks) {
      return;
    }

    setIsUpdatingLinks(true);
    setError(null);
    try {
      await dbTables.Cut.updateLinks({
        cut_id: nextCutId,
        prev_cut_id: selectedCutId,
      });
      await loadSceneData(selectedCutId);
    } catch (linkError) {
      setError(getErrorMessage(linkError));
    } finally {
      setIsUpdatingLinks(false);
    }
  }

  async function clearPrevCut() {
    if (selectedCutId === null || isUpdatingLinks) {
      return;
    }

    setIsUpdatingLinks(true);
    setError(null);
    try {
      await dbTables.Cut.updateLinks({
        cut_id: selectedCutId,
        prev_cut_id: null,
      });
      await loadSceneData(selectedCutId);
    } catch (linkError) {
      setError(getErrorMessage(linkError));
    } finally {
      setIsUpdatingLinks(false);
    }
  }

  function createNextCut() {
    if (!selectedCut || !isValidSceneId) {
      return;
    }
    setSelectedCutId(null);
    setEditorInitialCut(createNextCutDraft(sceneId, selectedCut));
    setError(null);
  }

  async function openImportModal() {
    setIsImportModalOpen(true);
    setSelectedImportIds(new Set());
    setImportError(null);
    setIsLoadingImportCuts(true);
    try {
      const response = await dbTables.Cut.listRows(IMPORT_CUT_LIST_REQUEST);
      setUnassignedCuts(response.items.filter((cut) => cut.scene_id == null && typeof cut.id === 'number'));
    } catch (importLoadError) {
      setUnassignedCuts([]);
      setImportError(getErrorMessage(importLoadError));
    } finally {
      setIsLoadingImportCuts(false);
    }
  }

  function toggleImportCut(cutId: number) {
    setSelectedImportIds((current) => {
      const next = new Set(current);
      if (next.has(cutId)) {
        next.delete(cutId);
      } else {
        next.add(cutId);
      }
      return next;
    });
  }

  async function importSelectedCuts() {
    const importIds = [...selectedImportIds];
    if (importIds.length === 0 || isImportingCuts) {
      return;
    }

    const importedIds: number[] = [];
    setIsImportingCuts(true);
    setImportError(null);
    try {
      for (const cutId of importIds) {
        await dbTables.Cut.updateLinks({
          cut_id: cutId,
          scene_id: sceneId,
          prev_cut_id: null,
        });
        importedIds.push(cutId);
      }
      setIsImportModalOpen(false);
      setUnassignedCuts([]);
      setSelectedImportIds(new Set());
      await loadSceneData(importIds[0] ?? selectedCutId);
    } catch (importCutsError) {
      setImportError(getErrorMessage(importCutsError));
      setUnassignedCuts((current) =>
        current.filter((cut) => typeof cut.id !== 'number' || !importedIds.includes(cut.id)),
      );
      setSelectedImportIds((current) => {
        const next = new Set(current);
        importedIds.forEach((cutId) => next.delete(cutId));
        return next;
      });
      await loadSceneData(importedIds[0] ?? selectedCutId);
    } finally {
      setIsImportingCuts(false);
    }
  }

  function handleSaved(cutId: number) {
    void loadSceneData(cutId);
  }

  function handleDeleted(deletedCutId: number) {
    const nextCutId = cuts.find((cut) => cut.id !== deletedCutId && typeof cut.id === 'number')?.id ?? null;
    void loadSceneData(nextCutId);
  }

  function duplicateCut(cut: CutRecord) {
    setSelectedCutId(null);
    setEditorInitialCut({
      ...cut,
      scene_id: sceneId,
      prev_cut_id: selectedCutId,
      script: '',
      status_change: { turn: 1 },
    });
  }

  if (!isValidSceneId) {
    return (
      <div className="grid min-h-[calc(100vh-10rem)] place-items-center text-sm font-semibold text-[#ff9ab8]">
        올바르지 않은 Scene ID입니다.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center gap-3 text-sm font-semibold text-[var(--app-muted)]">
        <Spinner aria-hidden="true" />
        <span>Scene을 불러오는 중</span>
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Panel>
          <SectionBody className="space-y-4">
            <p className="text-sm font-semibold text-[#ff9ab8]">
              {error ?? 'Scene을 찾을 수 없습니다.'}
            </p>
            <Link
              to="/scenes"
              className="inline-flex rounded-[8px] border border-[rgba(255,216,176,0.54)] bg-[rgba(38,12,40,0.82)] px-4 py-2 text-xs font-extrabold text-[#fff5eb]"
            >
              Scene 목록
            </Link>
          </SectionBody>
        </Panel>
      </div>
    );
  }

  return (
    <div className="relative left-1/2 w-[min(1840px,calc(100vw-36px))] -translate-x-1/2 space-y-5">
      <div className="flex flex-col gap-2 px-1">
        <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">
          Scene edit
        </p>
        <h1 className="text-[clamp(1.25rem,2vw,2.2rem)] leading-[1.05] font-extrabold tracking-[0.02em] text-[#fff7ef] [text-shadow:0_0_22px_rgba(255,194,211,0.42),0_2px_12px_rgba(0,0,0,0.58)]">
          {scene.title || `Scene #${scene.id ?? sceneId}`}
        </h1>
      </div>

      <div className="grid min-h-[calc(100vh-10rem)] gap-5 2xl:grid-cols-[minmax(22rem,0.36fr)_minmax(42rem,0.64fr)]">
        <Panel className="min-h-0">
          <PanelHeader className="flex-col items-stretch">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[#fff7ef]">
                  {scene.title || 'Scene'}
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--app-muted)]">
                  #{scene.id ?? sceneId} · Cut {cuts.length} · First #{scene.first_cut_id ?? '-'}
                </p>
              </div>
              <Link
                to="/scenes"
                className="shrink-0 rounded-[8px] border border-[rgba(255,216,176,0.54)] bg-[rgba(38,12,40,0.78)] px-3 py-2 text-xs font-extrabold text-[#fff5eb]"
              >
                목록
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-1 text-xs font-semibold text-[var(--app-muted)] sm:grid-cols-5">
              <span>턴 {scene.turn}</span>
              <span>현금 {scene.cash}</span>
              <span>힘 {scene.strength}</span>
              <span>민첩 {scene.agility}</span>
              <span>스트레스 {scene.stress}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="px-3 py-2 text-xs" onClick={openSceneModal}>
                Scene 정보 편집
              </Button>
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => void openImportModal()}
                disabled={isLoadingImportCuts || isImportingCuts}
              >
                Cut import
              </Button>
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => void setCurrentAsFirstCut()}
                disabled={selectedCutId === null || isUpdatingLinks}
              >
                first_cut 지정
              </Button>
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => void clearPrevCut()}
                disabled={selectedCutId === null || !selectedCut?.prev_cut_id || isUpdatingLinks}
              >
                prev 해제
              </Button>
              <Button
                variant="primary"
                className="px-3 py-2 text-xs"
                onClick={createNextCut}
                disabled={!selectedCut}
              >
                next_cut 생성
              </Button>
            </div>
            {error ? (
              <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
            ) : null}
          </PanelHeader>

          <SectionBody className="space-y-3">
            {visibleCuts.length === 0 ? (
              <div className="grid min-h-56 place-items-center text-sm font-semibold text-[var(--app-muted)]">
                Scene에 연결된 Cut 없음
              </div>
            ) : (
              <div className="max-h-[calc(100vh-20rem)] space-y-2 overflow-y-auto pr-1">
                {visibleCuts.map((cut, index) => {
                  const cutId = cut.id ?? null;
                  const isSelected = cutId !== null && cutId === selectedCutId;
                  const isFirst = cutId !== null && cutId === scene.first_cut_id;
                  return (
                    <div
                      key={cutId ?? `cut-${index}`}
                      role="button"
                      tabIndex={0}
                      className={cx(
                        'grid w-full grid-cols-[4.75rem_minmax(0,1fr)] gap-3 rounded-[8px] border bg-[linear-gradient(135deg,rgba(255,229,238,0.1),transparent_58%),rgba(12,5,18,0.58)] p-2 text-left transition-[transform,border-color,background]',
                        'hover:-translate-y-px hover:border-[rgba(255,224,180,0.84)] hover:bg-[linear-gradient(135deg,rgba(255,225,191,0.16),transparent_58%),rgba(50,15,47,0.82)]',
                        isSelected
                          ? 'border-[rgba(255,232,183,0.86)] shadow-[0_0_26px_rgba(240,179,95,0.16)]'
                          : 'border-[rgba(255,208,222,0.24)]',
                      )}
                      onClick={() => selectCut(cut)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectCut(cut);
                        }
                      }}
                    >
                      <ImageFrame className="relative aspect-square rounded-[6px] border border-[rgba(255,218,228,0.22)]">
                        {cut.image_url ? (
                          <img
                            src={cut.image_url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-contain"
                            draggable={false}
                          />
                        ) : null}
                      </ImageFrame>
                      <span className="min-w-0 space-y-2">
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate text-sm font-extrabold text-[#fff7ef]">
                            Cut #{cutId ?? '-'}
                          </span>
                          <span className="flex shrink-0 gap-1">
                            {isFirst ? (
                              <span className="rounded-full border border-[rgba(255,226,121,0.62)] bg-[rgba(128,91,18,0.72)] px-1.5 py-0.5 text-[0.62rem] font-extrabold leading-none text-[#fff4c7]">
                                first
                              </span>
                            ) : null}
                            {cut.prev_cut_id ? (
                              <span className="rounded-full border border-[rgba(190,220,255,0.42)] bg-[rgba(28,55,96,0.64)] px-1.5 py-0.5 text-[0.62rem] font-extrabold leading-none text-[#dceaff]">
                                prev #{cut.prev_cut_id}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">
                          {getScriptSummary(cut)}
                        </span>
                        <span className="flex justify-end gap-1">
                          <Button
                            className="px-2 py-1 text-[0.68rem]"
                            disabled={selectedCutId === null || cutId === null || cutId === selectedCutId || isUpdatingLinks}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (cutId !== null) {
                                void setPrevCut(cutId);
                              }
                            }}
                          >
                            Prev
                          </Button>
                          <Button
                            className="px-2 py-1 text-[0.68rem]"
                            disabled={
                              selectedCutId === null ||
                              cutId === null ||
                              cutId === selectedCutId ||
                              cut.prev_cut_id === selectedCutId ||
                              isUpdatingLinks
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (cutId !== null) {
                                void setNextCut(cutId);
                              }
                            }}
                          >
                            Next
                          </Button>
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionBody>
        </Panel>

        <div className="min-w-0">
          {editorInitialCut ? (
            <CutEditComponent
              cutId={selectedCutId}
              initialCut={editorInitialCut}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onDuplicate={duplicateCut}
            />
          ) : (
            <Panel className="min-h-[calc(100vh-10rem)]">
              <SectionBody className="grid min-h-80 place-items-center text-sm font-semibold text-[var(--app-muted)]">
                편집할 Cut을 선택해 주세요.
              </SectionBody>
            </Panel>
          )}
        </div>
      </div>

      {isSceneModalOpen && sceneDraft ? (
        <ModalBackdrop role="presentation" topAligned>
          <Panel
            role="dialog"
            aria-modal="true"
            className="max-h-[calc(100dvh-3rem)] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto"
          >
            <PanelHeader>
              <h2 className="text-base font-semibold text-[#fff7ef]">Scene 정보 편집</h2>
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => setIsSceneModalOpen(false)}
                disabled={isSavingScene}
              >
                닫기
              </Button>
            </PanelHeader>
            <SectionBody className="space-y-4">
              <div className="space-y-1">
                <FieldLabel htmlFor="scene-title">제목</FieldLabel>
                <FormControl
                  id="scene-title"
                  value={sceneDraft.title}
                  onChange={(event) => setSceneDraft((current) => current ? { ...current, title: event.target.value } : current)}
                  className="h-11 w-full px-3"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="scene-context">context</FieldLabel>
                <FormControl
                  as="textarea"
                  id="scene-context"
                  value={sceneDraft.context}
                  onChange={(event) => setSceneDraft((current) => current ? { ...current, context: event.target.value } : current)}
                  className="min-h-48 w-full resize-y px-3 py-2 text-sm leading-6"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <SceneNumberField
                  label="턴"
                  value={sceneDraft.turn}
                  onChange={(value) => setSceneDraft((current) => current ? { ...current, turn: value } : current)}
                />
                {SCENE_STAT_FIELDS.map((field) => (
                  <SceneNumberField
                    key={field.key}
                    label={field.label}
                    value={sceneDraft[field.key]}
                    onChange={(value) => setSceneDraft((current) => current ? { ...current, [field.key]: value } : current)}
                  />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  className="px-4 py-2 text-xs"
                  onClick={() => setIsSceneModalOpen(false)}
                  disabled={isSavingScene}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  className="px-4 py-2 text-xs"
                  onClick={() => void saveScene()}
                  disabled={isSavingScene}
                >
                  {isSavingScene ? '저장 중' : '저장'}
                </Button>
              </div>
            </SectionBody>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isImportModalOpen ? (
        <ModalBackdrop role="presentation" topAligned>
          <Panel
            role="dialog"
            aria-modal="true"
            className="max-h-[calc(100dvh-3rem)] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto"
          >
            <PanelHeader>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[#fff7ef]">Cut import</h2>
                <p className="mt-1 text-xs font-semibold text-[var(--app-muted)]">
                  Scene이 없는 Cut만 표시됩니다.
                </p>
              </div>
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImportingCuts}
              >
                닫기
              </Button>
            </PanelHeader>
            <SectionBody className="space-y-4">
              {isLoadingImportCuts ? (
                <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-semibold text-[var(--app-muted)]">
                  <Spinner aria-hidden="true" />
                  <span>Cut을 불러오는 중</span>
                </div>
              ) : unassignedCuts.length === 0 ? (
                <div className="grid min-h-64 place-items-center text-sm font-semibold text-[var(--app-muted)]">
                  import할 미할당 Cut 없음
                </div>
              ) : (
                <div className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1">
                  {unassignedCuts.map((cut, index) => {
                    const cutId = cut.id;
                    if (typeof cutId !== 'number') {
                      return null;
                    }

                    return (
                      <label
                        key={cutId}
                        className={cx(
                          'grid cursor-pointer grid-cols-[1.25rem_4.5rem_minmax(0,1fr)] items-center gap-3 rounded-[8px] border bg-[rgba(12,5,18,0.58)] p-2 transition-[border-color,background]',
                          selectedImportIds.has(cutId)
                            ? 'border-[rgba(255,232,183,0.86)] bg-[rgba(64,31,52,0.78)]'
                            : 'border-[rgba(255,208,222,0.24)] hover:border-[rgba(255,224,180,0.84)]',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedImportIds.has(cutId)}
                          onChange={() => toggleImportCut(cutId)}
                          disabled={isImportingCuts}
                          className="h-4 w-4 accent-[#f4b35e]"
                        />
                        <ImageFrame className="relative aspect-square rounded-[6px] border border-[rgba(255,218,228,0.22)]">
                          {cut.image_url ? (
                            <img
                              src={cut.image_url}
                              alt=""
                              className="absolute inset-0 h-full w-full object-contain"
                              draggable={false}
                            />
                          ) : null}
                        </ImageFrame>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold text-[#fff7ef]">
                            Cut #{cut.id ?? index + 1}
                          </span>
                          <span className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">
                            {getScriptSummary(cut)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {importError ? (
                <p className="text-sm font-semibold text-[#ff9ab8]">{importError}</p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-4">
                <span className="text-xs font-semibold text-[var(--app-muted)]">
                  선택 {selectedImportIds.size}
                </span>
                <div className="flex gap-2">
                  <Button
                    className="px-4 py-2 text-xs"
                    onClick={() => setIsImportModalOpen(false)}
                    disabled={isImportingCuts}
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    className="px-4 py-2 text-xs"
                    onClick={() => void importSelectedCuts()}
                    disabled={selectedImportIds.size === 0 || isLoadingImportCuts || isImportingCuts}
                  >
                    {isImportingCuts ? 'import 중' : 'import'}
                  </Button>
                </div>
              </div>
            </SectionBody>
          </Panel>
        </ModalBackdrop>
      ) : null}

    </div>
  );
}

function SceneNumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <FormControl
        type="number"
        value={value}
        onChange={(event) => {
          const parsedValue = Number(event.target.value);
          onChange(Number.isFinite(parsedValue) ? parsedValue : 0);
        }}
        className="h-11 w-full px-3"
      />
    </div>
  );
}
