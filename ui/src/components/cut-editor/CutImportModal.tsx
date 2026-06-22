import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../../api/api';
import type { CutRecord, GetListRequest } from '../../api/type';
import {
  Button,
  FormControl,
  ImageFrame,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
  cx,
} from '../ui';

const PAGE_SIZE = 80;

const CUT_IMPORT_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: PAGE_SIZE + 1,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
};

export type CutImportFields = {
  script: boolean;
  prompt: boolean;
  status_change: boolean;
  image: boolean;
};

const DEFAULT_IMPORT_FIELDS: CutImportFields = {
  script: false,
  prompt: true,
  status_change: false,
  image: false,
};

const IMPORT_FIELD_OPTIONS: Array<{ key: keyof CutImportFields; label: string }> = [
  { key: 'script', label: 'script' },
  { key: 'prompt', label: 'prompt' },
  { key: 'status_change', label: 'status_change' },
  { key: 'image', label: 'image' },
];

type CutImportModalProps = {
  currentCutId: number | null;
  onClose: () => void;
  onSelect: (cut: CutRecord, fields: CutImportFields) => Promise<void> | void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Cut import에 실패했습니다.';
}

function getScriptSummary(cut: CutRecord) {
  const summary = cut.script.replace(/\s+/g, ' ').trim();
  return summary || 'script 없음';
}

function hasImportField(fields: CutImportFields) {
  return Object.values(fields).some(Boolean);
}

export function CutImportModal({
  currentCutId,
  onClose,
  onSelect,
}: CutImportModalProps) {
  const [cuts, setCuts] = useState<CutRecord[]>([]);
  const [favoritedOnly, setFavoritedOnly] = useState(true);
  const [importFields, setImportFields] = useState<CutImportFields>(DEFAULT_IMPORT_FIELDS);
  const [searchText, setSearchText] = useState('');
  const [submittedSearchText, setSubmittedSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canImport = hasImportField(importFields) && !isLoading && !isImporting;
  const visibleCuts = useMemo(
    () => cuts.filter((cut) => cut.id !== currentCutId).slice(0, PAGE_SIZE),
    [currentCutId, cuts],
  );
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  useEffect(() => {
    let isActive = true;

    async function loadCuts() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await dbTables.Cut.listRows({
          ...CUT_IMPORT_LIST_REQUEST,
          offset: (page - 1) * PAGE_SIZE,
          search_text: submittedSearchText || null,
          filter: favoritedOnly ? { favorited: [true] } : {},
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
  }, [favoritedOnly, page, submittedSearchText]);

  useEffect(() => {
    if (page <= totalPages) {
      return;
    }
    setPage(totalPages);
  }, [page, totalPages]);

  function toggleField(field: keyof CutImportFields) {
    setImportFields((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  async function importCut(cut: CutRecord) {
    if (!canImport) {
      setError('가져올 항목을 하나 이상 선택해 주세요.');
      return;
    }

    setIsImporting(true);
    setError(null);
    try {
      await onSelect(cut, importFields);
      onClose();
    } catch (importError) {
      setError(getErrorMessage(importError));
      setIsImporting(false);
    }
  }

  return (
    <ModalBackdrop role="presentation" topAligned>
      <Panel
        className="flex max-h-[calc(100dvh-3rem)] w-[min(80rem,calc(100vw-2rem))] flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cut-import-title"
      >
        <PanelHeader>
          <div className="min-w-0">
            <h2 id="cut-import-title" className="text-base font-semibold text-[#fff7ef]">
              다른 Cut 에서 Import
            </h2>
            <p className="mt-1 text-xs font-semibold text-[var(--app-muted)]">
              기본값은 favorited Cut과 prompt import입니다.
            </p>
          </div>
          <Button className="px-3 py-2 text-xs" onClick={onClose} disabled={isImporting}>
            닫기
          </Button>
        </PanelHeader>

        <SectionBody className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <form
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedSearchText(searchText.trim());
              setPage(1);
            }}
          >
            <FormControl
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="h-10 w-full px-3 text-sm"
              placeholder="script 검색"
              disabled={isImporting}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" className="h-10 px-4 py-0 text-xs" disabled={isImporting}>
                검색
              </Button>
              <Button
                className="h-10 px-4 py-0 text-xs"
                onClick={() => {
                  setSearchText('');
                  setSubmittedSearchText('');
                  setPage(1);
                }}
                disabled={isImporting || (!searchText && !submittedSearchText)}
              >
                초기화
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="h-9 px-3 py-0 text-xs"
                variant={favoritedOnly ? 'primary' : 'default'}
                onClick={() => {
                  setFavoritedOnly((current) => !current);
                  setPage(1);
                }}
                disabled={isImporting}
                aria-pressed={favoritedOnly}
              >
                {favoritedOnly ? 'favorited only' : 'all Cuts'}
              </Button>
              {IMPORT_FIELD_OPTIONS.map((field) => (
                <label
                  key={field.key}
                  className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[rgba(12,5,18,0.58)] px-3 text-xs font-extrabold text-[#fff5eb]"
                >
                  <input
                    type="checkbox"
                    checked={importFields[field.key]}
                    onChange={() => toggleField(field.key)}
                    disabled={isImporting}
                    className="h-4 w-4 accent-[#f4b35e]"
                  />
                  {field.label}
                </label>
              ))}
            </div>
            <span className="text-xs font-semibold text-[var(--app-muted)]">
              {visibleCuts.length} / {totalRows} · {page} / {totalPages}
            </span>
          </div>

          {submittedSearchText ? (
            <p className="text-xs font-semibold text-[var(--app-muted)]">
              검색: {submittedSearchText}
            </p>
          ) : null}

          {error ? (
            <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
          ) : null}

          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center gap-3 text-sm font-semibold text-[var(--app-muted)]">
              <Spinner aria-hidden="true" />
              <span>Cut을 불러오는 중</span>
            </div>
          ) : visibleCuts.length === 0 ? (
            <div className="grid min-h-72 place-items-center text-sm font-semibold text-[var(--app-muted)]">
              {error ? 'Cut을 불러오지 못했습니다.' : '가져올 Cut 없음'}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {visibleCuts.map((cut, index) => {
                const cutId = cut.id ?? null;
                const cutLabel = `Cut #${cutId ?? '-'}`;
                const scriptSummary = getScriptSummary(cut);
                return (
                  <button
                    key={cutId ?? `cut-import-${index}`}
                    type="button"
                    className={cx(
                      'grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[rgba(12,5,18,0.58)] p-2 text-left transition-[transform,border-color,background] hover:-translate-y-px hover:border-[rgba(255,224,180,0.84)] hover:bg-[rgba(50,15,47,0.82)]',
                      !canImport && 'cursor-not-allowed opacity-60 hover:translate-y-0',
                    )}
                    onClick={() => void importCut(cut)}
                    disabled={!canImport}
                    title={`${cutLabel}\n${scriptSummary}`}
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
                    <span className="min-w-0 space-y-1">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold text-[#fff7ef]">
                        <span className="truncate">{cutLabel}</span>
                        {cut.favorited ? <span aria-label="favorited">★</span> : null}
                      </span>
                      <span className="block text-xs font-semibold text-[var(--app-muted)]">
                        Scene #{cut.scene_id ?? '-'} · Image #{cut.image_id ?? '-'}
                      </span>
                      <span className="line-clamp-3 block text-xs leading-5 text-[#ffe8ee]">
                        {scriptSummary}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-4">
            <span className="text-xs font-semibold text-[var(--app-muted)]">
              {hasImportField(importFields) ? '선택한 Cut을 클릭하면 바로 draft에 적용됩니다.' : '가져올 항목을 선택해 주세요.'}
            </span>
            <div className="flex gap-2">
              <Button
                className="px-4 py-2 text-xs"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || isLoading || isImporting}
              >
                이전
              </Button>
              <Button
                className="px-4 py-2 text-xs"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || isLoading || isImporting}
              >
                다음
              </Button>
            </div>
          </div>
        </SectionBody>
      </Panel>
    </ModalBackdrop>
  );
}
