import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../api/api';
import type { GetListRequest, CutRecord, SceneRecord } from '../api/type';
import {
  Button,
  FormControl,
  ImageFrame,
  SectionBody,
  Spinner,
  cx,
} from './ui';

const PAGE_SIZE = 100;

type CutExplorerComponentProps = {
  currentCutId: number | null;
  onSelect: (cut: CutRecord) => void;
};

const CUT_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: PAGE_SIZE,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
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

function getScriptSummary(cut: CutRecord) {
  const summary = cut.script.replace(/\s+/g, ' ').trim();
  return summary || 'script 없음';
}

export function CutExplorerComponent({
  currentCutId,
  onSelect,
}: CutExplorerComponentProps) {
  const [cuts, setCuts] = useState<CutRecord[]>([]);
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [submittedSearchText, setSubmittedSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSemanticSearch = submittedSearchText.length > 0;

  useEffect(() => {
    let isActive = true;

    async function loadScenes() {
      try {
        const response = await dbTables.Scene.listRows(SCENE_LIST_REQUEST);
        if (isActive) {
          setScenes(response.items);
        }
      } catch (sceneLoadError) {
        if (isActive) {
          setScenes([]);
        }
        console.error('Failed to load scenes for cut explorer.', sceneLoadError);
      }
    }

    void loadScenes();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (isSemanticSearch) {
      return;
    }

    let isActive = true;

    async function loadCuts() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await dbTables.Cut.listRows({
          ...CUT_LIST_REQUEST,
          offset: (page - 1) * PAGE_SIZE,
        });
        if (isActive) {
          setCuts(response.items);
          setTotalRows(response.total);
        }
      } catch (loadError) {
        if (isActive) {
          setCuts([]);
          setTotalRows(0);
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadCuts();

    return () => {
      isActive = false;
    };
  }, [isSemanticSearch, page]);

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const sceneTitleById = useMemo(() => {
    const sceneMap = new Map<number, string>();
    for (const scene of scenes) {
      if (typeof scene.id === 'number') {
        sceneMap.set(scene.id, scene.title.trim() || '제목 없음');
      }
    }
    return sceneMap;
  }, [scenes]);
  const visibleCuts = useMemo(() => {
    if (!isSemanticSearch) {
      return cuts;
    }

    return cuts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [isSemanticSearch, page, cuts]);

  useEffect(() => {
    if (page <= totalPages) {
      return;
    }
    setPage(totalPages);
  }, [page, totalPages]);

  async function searchSimilarCuts() {
    const trimmedSearchText = searchText.trim();
    if (!trimmedSearchText) {
      setError('검색할 컷 텍스트를 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPage(1);
    setSubmittedSearchText(trimmedSearchText);
    try {
      const results = await dbTables.Cut.similarCuts(trimmedSearchText);
      setCuts(results);
      setTotalRows(results.length);
    } catch (searchError) {
      setCuts([]);
      setTotalRows(0);
      setError(getErrorMessage(searchError));
    } finally {
      setIsLoading(false);
    }
  }

  function clearSemanticSearch() {
    setSearchText('');
    setSubmittedSearchText('');
    setCuts([]);
    setTotalRows(0);
    setPage(1);
    setError(null);
    setIsLoading(true);
  }

  return (
    <SectionBody className="space-y-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void searchSimilarCuts();
        }}
      >
        <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-1">
          <FormControl
            as="textarea"
            rows={5}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="min-h-[8.75rem] w-full min-w-0 resize-y rounded-none px-3 py-2 text-sm leading-5"
            placeholder="시멘틱 검색할 컷 텍스트"
          />
          {isSemanticSearch ? (
            <span className="text-xs font-semibold text-[var(--app-muted)]">
              시멘틱 검색: {submittedSearchText}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
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
          <span className="text-xs font-semibold text-[var(--app-muted)]">
            {visibleCuts.length} / {totalRows}
          </span>
        </div>
      </form>

      {isLoading ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-[0.95rem] font-bold text-[var(--app-muted)]">
          <Spinner aria-hidden="true" />
          <span>{isSemanticSearch ? '유사 Cut을 찾는 중' : 'Cut을 불러오는 중'}</span>
        </div>
      ) : error ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-[0.95rem] font-bold text-[#ff9ab8]">{error}</div>
      ) : visibleCuts.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-[0.95rem] font-bold text-[var(--app-muted)]">
          {isSemanticSearch ? '시멘틱 검색 결과 없음' : 'Cut 없음'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {visibleCuts.map((cut, index) => {
            const cutId = cut.id ?? null;
            const isSelectable = cutId !== null;
            const isCurrentCut = cutId !== null && cutId === currentCutId;
            const scriptSummary = getScriptSummary(cut);
            const cutLabel = `Cut #${cutId ?? '-'}`;
            const sceneTitle = typeof cut.scene_id === 'number'
              ? sceneTitleById.get(cut.scene_id) ?? `Scene #${cut.scene_id}`
              : null;
            const accessibleLabel = sceneTitle
              ? `${cutLabel}\n${sceneTitle}\n${scriptSummary}`
              : `${cutLabel}\n${scriptSummary}`;
            return (
              <button
                key={cutId ?? `cut-${index}`}
                type="button"
                className={cx(
                  'grid aspect-square min-w-0 place-items-stretch rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[linear-gradient(135deg,rgba(255,229,238,0.1),transparent_58%),rgba(12,5,18,0.58)] p-1 text-left transition-[transform,border-color,background] hover:-translate-y-px hover:border-[rgba(255,224,180,0.84)] hover:bg-[linear-gradient(135deg,rgba(255,225,191,0.16),transparent_58%),rgba(50,15,47,0.82)]',
                  isCurrentCut && 'border-[rgba(255,232,183,0.82)] shadow-[0_0_26px_rgba(240,179,95,0.16)]',
                  !isSelectable && 'cursor-not-allowed opacity-60 hover:translate-y-0',
                )}
                onClick={() => {
                  if (cutId !== null) {
                    onSelect(cut);
                  }
                }}
                disabled={!isSelectable}
                title={accessibleLabel}
                aria-label={accessibleLabel.replace(/\n/g, ': ')}
              >
                <ImageFrame className="relative h-full w-full rounded-[6px] border border-[rgba(255,218,228,0.22)] bg-[linear-gradient(135deg,rgba(255,224,235,0.12),transparent_46%),rgba(12,5,18,0.82)]">
                  {cut.image_url ? (
                    <img
                      src={cut.image_url}
                      alt={cutLabel}
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    null
                  )}
                  {sceneTitle ? (
                    <span className="pointer-events-none absolute bottom-1 left-1 right-1 min-w-0 truncate rounded-[6px] border border-[rgba(255,226,121,0.48)] bg-[rgba(18,8,18,0.82)] px-1.5 py-1 text-center text-[0.64rem] font-extrabold leading-none text-[#fff4c7] shadow-[0_8px_18px_rgba(0,0,0,0.34)] backdrop-blur-[8px]">
                      {sceneTitle}
                    </span>
                  ) : null}
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
