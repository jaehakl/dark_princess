import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { GetListRequest, SceneRecord } from '../api/type';

const PAGE_SIZE = 12;

type SceneExplorerModalProps = {
  currentScene: SceneRecord | null;
  onClose: () => void;
  onSelect: (scene: SceneRecord) => void;
};

const SCENE_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: null,
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

function getSearchText(scene: SceneRecord) {
  return `${scene.prompt} ${getScriptSummary(scene)}`.toLocaleLowerCase();
}

export function SceneExplorerModal({
  currentScene,
  onClose,
  onSelect,
}: SceneExplorerModalProps) {
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadScenes() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await dbTables.Scene.listRows(SCENE_LIST_REQUEST);
        if (isActive) {
          setScenes(response.items);
        }
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

    void loadScenes();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredScenes = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase();
    if (!normalizedSearch) {
      return scenes;
    }
    return scenes.filter((scene) => getSearchText(scene).includes(normalizedSearch));
  }, [scenes, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredScenes.length / PAGE_SIZE));
  const visibleScenes = filteredScenes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchText]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="edit-control h-11 min-w-0 flex-1 px-3"
              placeholder="prompt 또는 script 검색"
            />
            <span className="shrink-0 text-xs font-semibold text-[var(--app-muted)]">
              {filteredScenes.length} / {scenes.length}
            </span>
          </div>

          {isLoading ? (
            <div className="vn-scene-explorer-state">
              <span className="vn-spinner" aria-hidden="true" />
              <span>Scene을 불러오는 중</span>
            </div>
          ) : error ? (
            <div className="vn-scene-explorer-state text-[#ff9ab8]">{error}</div>
          ) : visibleScenes.length === 0 ? (
            <div className="vn-scene-explorer-state">검색 결과 없음</div>
          ) : (
            <div className="vn-scene-grid">
              {visibleScenes.map((scene) => {
                const isCurrentScene = scene.id && scene.id === currentScene?.id;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    className={[
                      'vn-scene-card',
                      isCurrentScene ? 'vn-scene-card-current' : '',
                    ].join(' ')}
                    onClick={() => onSelect(scene)}
                  >
                    <div className="vn-scene-thumb">
                      {scene.image_url ? (
                        <img
                          src={scene.image_url}
                          alt=""
                          className="dp-image-media"
                        />
                      ) : (
                        <span>이미지 없음</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--app-accent)]">
                          Scene #{scene.id ?? '-'}
                        </span>
                        {isCurrentScene ? (
                          <span className="text-xs font-semibold text-[#fff7ef]">
                            현재
                          </span>
                        ) : null}
                      </div>
                      <p className="vn-scene-script-summary">{getScriptSummary(scene)}</p>
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
