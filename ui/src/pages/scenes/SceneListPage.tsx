import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type { GetListRequest, SceneRecord } from '../../api/type';
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

const PAGE_SIZE = 100;

const SCENE_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: PAGE_SIZE,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
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

const EMPTY_SCENE_DRAFT: SceneDraft = {
  title: '',
  context: '',
  turn: 0,
  cash: 0,
  strength: 0,
  agility: 0,
  intelligence: 0,
  sense: 0,
  attractiveness: 0,
  toughness: 0,
  stress: 0,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

export function SceneListPage() {
  const navigate = useNavigate();
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sceneDraft, setSceneDraft] = useState<SceneDraft>({ ...EMPTY_SCENE_DRAFT });
  const [isCreatingScene, setIsCreatingScene] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalRows / PAGE_SIZE)),
    [totalRows],
  );
  const canCreateScene = sceneDraft.title.trim().length > 0 && !isCreatingScene;

  useEffect(() => {
    let isActive = true;

    async function loadScenes() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await dbTables.Scene.listRows({
          ...SCENE_LIST_REQUEST,
          offset: (page - 1) * PAGE_SIZE,
        });
        if (!isActive) {
          return;
        }
        setScenes(response.items);
        setTotalRows(response.total);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setScenes([]);
        setTotalRows(0);
        setError(loadError instanceof Error ? loadError.message : '요청에 실패했습니다.');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadScenes();
    return () => {
      isActive = false;
    };
  }, [page]);

  useEffect(() => {
    if (page <= totalPages) {
      return;
    }
    setPage(totalPages);
  }, [page, totalPages]);

  function openCreateModal() {
    setSceneDraft({ ...EMPTY_SCENE_DRAFT });
    setCreateError(null);
    setIsCreateModalOpen(true);
  }

  async function createScene() {
    if (!canCreateScene) {
      return;
    }

    setIsCreatingScene(true);
    setCreateError(null);
    try {
      const response = await dbTables.Scene.upsertRow([
        {
          ...sceneDraft,
          title: sceneDraft.title.trim(),
          context: sceneDraft.context,
          first_cut_id: null,
        },
      ]);
      const createdId = response[0]?.id;
      if (typeof createdId !== 'number') {
        throw new Error('생성된 Scene ID를 확인할 수 없습니다.');
      }
      setIsCreateModalOpen(false);
      navigate(`/scene-edit/${createdId}`);
    } catch (createSceneError) {
      setCreateError(getErrorMessage(createSceneError));
    } finally {
      setIsCreatingScene(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">
            Scene archive
          </p>
          <h1 className="text-[clamp(1.25rem,2vw,2.2rem)] leading-[1.05] font-extrabold tracking-[0.02em] text-[#fff7ef] [text-shadow:0_0_22px_rgba(255,194,211,0.42),0_2px_12px_rgba(0,0,0,0.58)]">
            Scene
          </h1>
        </div>
        <Button variant="primary" className="w-fit px-4 py-2 text-xs" onClick={openCreateModal}>
          새 Scene
        </Button>
      </div>

      <Panel>
        <PanelHeader>
          <span className="text-xs font-semibold text-[var(--app-muted)]">
            {scenes.length} / {totalRows}
          </span>
          <span className="text-xs font-semibold text-[var(--app-muted)]">
            {page} / {totalPages}
          </span>
        </PanelHeader>

        <SectionBody className="space-y-4">
          {isLoading ? (
            <div className="flex min-h-80 items-center justify-center gap-3 text-sm font-semibold text-[var(--app-muted)]">
              <Spinner aria-hidden="true" />
              <span>Scene을 불러오는 중</span>
            </div>
          ) : error ? (
            <div className="grid min-h-80 place-items-center text-sm font-semibold text-[#ff9ab8]">
              {error}
            </div>
          ) : scenes.length === 0 ? (
            <div className="grid min-h-80 place-items-center text-sm font-semibold text-[var(--app-muted)]">
              Scene 없음
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {scenes.map((scene, index) => {
                const sceneId = typeof scene.id === 'number' ? scene.id : null;
                const title = scene.title.trim() || '제목 없음';
                const cutCount = scene.cut_count ?? 0;
                const cardContent = (
                  <>
                    <ImageFrame className="relative h-full w-full rounded-[6px] border border-[rgba(255,218,228,0.18)] bg-[linear-gradient(135deg,rgba(255,224,235,0.12),transparent_46%),rgba(12,5,18,0.82)]">
                      {scene.first_cut_image_url ? (
                        <img
                          src={scene.first_cut_image_url}
                          alt={title}
                          className="absolute inset-0 h-full w-full object-contain"
                          draggable={false}
                        />
                      ) : null}
                    </ImageFrame>
                    <span className="pointer-events-none absolute bottom-2 left-2 right-2 min-w-0 rounded-[7px] border border-[rgba(255,218,228,0.26)] bg-[rgba(8,2,13,0.78)] px-2 py-1 shadow-[0_10px_22px_rgba(0,0,0,0.32)] backdrop-blur-[8px]">
                      <span className="block truncate text-sm font-extrabold text-[#fff7ef]">
                        {title}
                      </span>
                      <span className="mt-0.5 inline-flex rounded-full border border-[rgba(255,226,121,0.62)] bg-[rgba(128,91,18,0.72)] px-1.5 py-0.5 text-[0.62rem] font-extrabold leading-none text-[#fff4c7]">
                        Cut {cutCount}
                      </span>
                    </span>
                  </>
                );

                if (sceneId === null) {
                  return (
                    <div
                      key={`scene-${index}`}
                      className="relative aspect-square min-w-0 rounded-[8px] border border-[rgba(255,218,228,0.18)] bg-[rgba(11,4,16,0.62)] p-1 opacity-60"
                    >
                      {cardContent}
                    </div>
                  );
                }

                return (
                  <Link
                    key={sceneId}
                    to={`/scene-edit/${sceneId}`}
                    className={cx(
                      'group relative aspect-square min-w-0 rounded-[8px] border bg-[rgba(11,4,16,0.72)] p-1 text-left transition-[border-color,filter,transform,box-shadow]',
                      'hover:-translate-y-px hover:border-[rgba(255,226,186,0.82)] hover:brightness-[1.06]',
                      'border-[rgba(255,218,228,0.22)]',
                    )}
                    title={`Scene #${sceneId}\n${title}`}
                    aria-label={`Scene #${sceneId}: ${title}`}
                  >
                    {cardContent}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-4">
            <span className="text-xs font-semibold text-[var(--app-muted)]">
              {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                className="px-4 py-2 text-xs"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || isLoading}
              >
                이전
              </Button>
              <Button
                className="px-4 py-2 text-xs"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || isLoading}
              >
                다음
              </Button>
            </div>
          </div>
        </SectionBody>
      </Panel>

      {isCreateModalOpen ? (
        <ModalBackdrop role="presentation" topAligned>
          <Panel
            role="dialog"
            aria-modal="true"
            className="max-h-[calc(100dvh-3rem)] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto"
          >
            <PanelHeader>
              <h2 className="text-base font-semibold text-[#fff7ef]">새 Scene</h2>
              <Button
                className="px-3 py-2 text-xs"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isCreatingScene}
              >
                닫기
              </Button>
            </PanelHeader>
            <SectionBody className="space-y-4">
              <div className="space-y-1">
                <FieldLabel htmlFor="new-scene-title">제목</FieldLabel>
                <FormControl
                  id="new-scene-title"
                  value={sceneDraft.title}
                  onChange={(event) => setSceneDraft((current) => ({ ...current, title: event.target.value }))}
                  className="h-11 w-full px-3"
                />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="new-scene-context">context</FieldLabel>
                <FormControl
                  as="textarea"
                  id="new-scene-context"
                  value={sceneDraft.context}
                  onChange={(event) => setSceneDraft((current) => ({ ...current, context: event.target.value }))}
                  className="min-h-48 w-full resize-y px-3 py-2 text-sm leading-6"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <SceneNumberField
                  label="턴"
                  value={sceneDraft.turn}
                  onChange={(value) => setSceneDraft((current) => ({ ...current, turn: value }))}
                />
                {SCENE_STAT_FIELDS.map((field) => (
                  <SceneNumberField
                    key={field.key}
                    label={field.label}
                    value={sceneDraft[field.key]}
                    onChange={(value) => setSceneDraft((current) => ({ ...current, [field.key]: value }))}
                  />
                ))}
              </div>
              {createError ? (
                <p className="text-sm font-semibold text-[#ff9ab8]">{createError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  className="px-4 py-2 text-xs"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isCreatingScene}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  className="px-4 py-2 text-xs"
                  onClick={() => void createScene()}
                  disabled={!canCreateScene}
                >
                  {isCreatingScene ? '생성 중' : '생성'}
                </Button>
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
