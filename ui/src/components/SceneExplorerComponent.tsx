import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { GetListRequest, SceneRecord } from '../api/type';
import {
  Button,
  FormControl,
  ImageFrame,
  SectionBody,
  Spinner,
  cx,
} from './ui';

const PAGE_SIZE = 100;

type SceneExplorerComponentProps = {
  currentSceneId: number | null;
  onSelect: (sceneId: number) => void;
};

const SCENE_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: PAGE_SIZE,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function getScriptSummary(scene: SceneRecord) {
  const summary = scene.script.replace(/\s+/g, ' ').trim();
  return summary || 'script 없음';
}

export function SceneExplorerComponent({
  currentSceneId,
  onSelect,
}: SceneExplorerComponentProps) {
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [submittedSearchText, setSubmittedSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSemanticSearch = submittedSearchText.length > 0;

  useEffect(() => {
    if (isSemanticSearch) {
      return;
    }

    let isActive = true;

    async function loadScenes() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await dbTables.Scene.listRows({
          ...SCENE_LIST_REQUEST,
          offset: (page - 1) * PAGE_SIZE,
        });
        if (isActive) {
          setScenes(response.items);
          setTotalRows(response.total);
        }
      } catch (loadError) {
        if (isActive) {
          setScenes([]);
          setTotalRows(0);
          setError(getErrorMessage(loadError));
        }
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
  }, [isSemanticSearch, page]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const visibleScenes = useMemo(() => {
    if (!isSemanticSearch) {
      return scenes;
    }

    return scenes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [isSemanticSearch, page, scenes]);

  useEffect(() => {
    if (page <= totalPages) {
      return;
    }
    setPage(totalPages);
  }, [page, totalPages]);

  async function searchSimilarScenes() {
    const trimmedSearchText = searchText.trim();
    if (!trimmedSearchText) {
      setError('검색할 장면 텍스트를 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPage(1);
    setSubmittedSearchText(trimmedSearchText);
    try {
      const results = await dbTables.Scene.similarScenes(trimmedSearchText);
      setScenes(results);
      setTotalRows(results.length);
    } catch (searchError) {
      setScenes([]);
      setTotalRows(0);
      setError(getErrorMessage(searchError));
    } finally {
      setIsLoading(false);
    }
  }

  function clearSemanticSearch() {
    setSearchText('');
    setSubmittedSearchText('');
    setScenes([]);
    setTotalRows(0);
    setPage(1);
    setError(null);
    setIsLoading(true);
  }

  return (
    <SectionBody className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          void searchSimilarScenes();
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <FormControl
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="h-11 min-w-0 px-3"
            placeholder="시멘틱 검색할 장면 텍스트"
          />
          {isSemanticSearch ? (
            <span className="text-xs font-semibold text-[var(--app-muted)]">
              시멘틱 검색: {submittedSearchText}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            className="px-4 py-2 text-xs"
            disabled={isLoading || searchText.trim().length === 0}
          >
            시멘틱 검색
          </Button>
          {isSemanticSearch ? (
            <Button
              className="px-4 py-2 text-xs"
              onClick={clearSemanticSearch}
              disabled={isLoading}
            >
              목록으로
            </Button>
          ) : null}
        </div>
        <span className="shrink-0 text-xs font-semibold text-[var(--app-muted)]">
          {visibleScenes.length} / {totalRows}
        </span>
      </form>

      {isLoading ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-[0.95rem] font-bold text-[var(--app-muted)]">
          <Spinner aria-hidden="true" />
          <span>{isSemanticSearch ? '유사 Scene을 찾는 중' : 'Scene을 불러오는 중'}</span>
        </div>
      ) : error ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-[0.95rem] font-bold text-[#ff9ab8]">{error}</div>
      ) : visibleScenes.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-[0.95rem] font-bold text-[var(--app-muted)]">
          {isSemanticSearch ? '시멘틱 검색 결과 없음' : 'Scene 없음'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {visibleScenes.map((scene) => {
            const sceneId = scene.id ?? null;
            const isSelectable = sceneId !== null;
            const isCurrentScene = sceneId !== null && sceneId === currentSceneId;
            const scriptSummary = getScriptSummary(scene);
            const sceneLabel = `Scene #${sceneId ?? '-'}`;
            return (
              <button
                key={sceneId ?? scene.prompt}
                type="button"
                className={cx(
                  'grid aspect-square min-w-0 place-items-stretch rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[linear-gradient(135deg,rgba(255,229,238,0.1),transparent_58%),rgba(12,5,18,0.58)] p-1 text-left transition-[transform,border-color,background] hover:-translate-y-px hover:border-[rgba(255,224,180,0.84)] hover:bg-[linear-gradient(135deg,rgba(255,225,191,0.16),transparent_58%),rgba(50,15,47,0.82)]',
                  isCurrentScene && 'border-[rgba(255,232,183,0.82)] shadow-[0_0_26px_rgba(240,179,95,0.16)]',
                  !isSelectable && 'cursor-not-allowed opacity-60 hover:translate-y-0',
                )}
                onClick={() => {
                  if (sceneId !== null) {
                    onSelect(sceneId);
                  }
                }}
                disabled={!isSelectable}
                title={`${sceneLabel}\n${scriptSummary}`}
                aria-label={`${sceneLabel}: ${scriptSummary}`}
              >
                <ImageFrame className="h-full w-full rounded-[6px] border border-[rgba(255,218,228,0.22)] bg-[linear-gradient(135deg,rgba(255,224,235,0.12),transparent_46%),rgba(12,5,18,0.82)]">
                  {scene.image_url ? (
                    <img
                      src={scene.image_url}
                      alt={sceneLabel}
                      className="block h-full w-full object-cover"
                    />
                  ) : (
                    null
                  )}
                </ImageFrame>
              </button>
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
  );
}
