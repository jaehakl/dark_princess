import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { GetListRequest, SceneRecord } from '../api/type';

const PAGE_SIZE = 100;

type SceneExplorerModalProps = {
  currentScene: SceneRecord | null;
  onClose: () => void;
  onSelect: (scene: SceneRecord) => void;
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

export function SceneExplorerModal({
  currentScene,
  onClose,
  onSelect,
}: SceneExplorerModalProps) {
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
    <div className="vn-modal-backdrop" role="presentation">
      <section
        className="vn-panel vn-scene-explorer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-explorer-title"
      >
        <div className="vn-panel-header">
          <div className="min-w-0">
            <p className="vn-subtitle">Scene archive</p>
            <h2
              id="scene-explorer-title"
              className="truncate text-lg font-semibold text-[#fff7ef]"
            >
              Scene 탐색
            </h2>
          </div>
          <button
            type="button"
            className="vn-danger-button px-3 py-2 text-xs"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <div className="vn-section-body space-y-4">
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              void searchSimilarScenes();
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                className="edit-control h-11 min-w-0 px-3"
                placeholder="시멘틱 검색할 장면 텍스트"
              />
              {isSemanticSearch ? (
                <span className="text-xs font-semibold text-[var(--app-muted)]">
                  시멘틱 검색: {submittedSearchText}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="submit"
                className="vn-button vn-button-primary px-4 py-2 text-xs"
                disabled={isLoading || searchText.trim().length === 0}
              >
                시멘틱 검색
              </button>
              {isSemanticSearch ? (
                <button
                  type="button"
                  className="vn-button px-4 py-2 text-xs"
                  onClick={clearSemanticSearch}
                  disabled={isLoading}
                >
                  목록으로
                </button>
              ) : null}
            </div>
            <span className="shrink-0 text-xs font-semibold text-[var(--app-muted)]">
              {visibleScenes.length} / {totalRows}
            </span>
          </form>

          {isLoading ? (
            <div className="vn-scene-explorer-state">
              <span className="vn-spinner" aria-hidden="true" />
              <span>{isSemanticSearch ? '유사 Scene을 찾는 중' : 'Scene을 불러오는 중'}</span>
            </div>
          ) : error ? (
            <div className="vn-scene-explorer-state text-[#ff9ab8]">{error}</div>
          ) : visibleScenes.length === 0 ? (
            <div className="vn-scene-explorer-state">
              {isSemanticSearch ? '시멘틱 검색 결과 없음' : 'Scene 없음'}
            </div>
          ) : (
            <div className="vn-scene-grid">
              {visibleScenes.map((scene) => {
                const isCurrentScene = scene.id && scene.id === currentScene?.id;
                const scriptSummary = getScriptSummary(scene);
                const sceneLabel = `Scene #${scene.id ?? '-'}`;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    className={[
                      'vn-scene-card',
                      isCurrentScene ? 'vn-scene-card-current' : '',
                    ].join(' ')}
                    onClick={() => onSelect(scene)}
                    title={`${sceneLabel}\n${scriptSummary}`}
                    aria-label={`${sceneLabel}: ${scriptSummary}`}
                  >
                    <div className="vn-scene-thumb">
                      {scene.image_url ? (
                        <img
                          src={scene.image_url}
                          alt={sceneLabel}
                          className="dp-image-media"
                        />
                      ) : (
                        null
                      )}
                    </div>
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
              <button
                type="button"
                className="vn-button px-4 py-2 text-xs"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || isLoading}
              >
                이전
              </button>
              <button
                type="button"
                className="vn-button px-4 py-2 text-xs"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || isLoading}
              >
                다음
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
