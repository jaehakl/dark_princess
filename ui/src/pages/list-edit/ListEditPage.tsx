import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom';
import type {
  GetListRequest,
  GetListResponse,
  UpsertResponse,
} from '../../api/type';
import { dbTables } from '../../api/api';
import { GearIcon } from '../../app/icons';
import type { LayoutOutletContext } from '../../app/layout';
import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import {
  DB_TABLE_LIST_PAGE_SIZES,
  DbTableListSelect,
  type DbTableListPageSize,
  type DbTableListSortState,
} from '../../components/db-table/list-select';
import { MasterDetailLayout } from '../../components/template/master-detail/MasterDetailLayout';
import { formatLocalDateTimeLabel } from '../../utils/datetime';

type DbTableName = keyof typeof dbTables;
type DbRow = Record<string, unknown>;

type DbColumn = {
  label: string;
  type: string;
  required?: boolean;
};

type ListEditTableConfig = {
  label: string;
  columns: Record<string, DbColumn>;
  listRows: (
    listRequest: GetListRequest
  ) => Promise<GetListResponse<Record<string, unknown>>>;
};

type ListEditTableDefaults = {
  listColumns?: string[];
  detailColumns?: string[];
  pageSize?: DbTableListPageSize;
};

type ListEditSettings = {
  listColumns: string[];
  detailColumns: string[];
  pageSize: DbTableListPageSize;
};

type DetailState = {
  row: DbRow | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
};

const LIST_EDIT_TABLE_DEFAULTS: Partial<
  Record<DbTableName, ListEditTableDefaults>
> = {};
const SESSION_STORAGE_PREFIX = 'list-edit:';
const DEFAULT_PAGE_SIZE: DbTableListPageSize = 20;

export function ListEditPage() {
  const { setPageChrome, setQuickAddAction } =
    useOutletContext<LayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsString = searchParams.toString();
  const rawTableName = searchParams.get('table');
  const tableName = isDbTableName(rawTableName) ? rawTableName : null;
  const tableConfig = useMemo(
    () =>
      tableName
        ? (dbTables[tableName] as ListEditTableConfig)
        : null,
    [tableName]
  );
  const rawListColumns = searchParams.get('list');
  const rawDetailColumns = searchParams.get('detail');
  const rawPageSize = searchParams.get('pageSize');
  const rawRowId = searchParams.get('rowId');
  const rawSortColumn = searchParams.get('sort');
  const rawSortDirection = searchParams.get('sortDir');
  const isCreateMode = searchParams.get('mode') === 'new';
  const rowId = parseRowId(rawRowId);
  const urlListColumns = tableConfig
    ? parseColumnsParam(rawListColumns, tableConfig, { excludeId: true })
    : null;
  const urlDetailColumns = tableConfig
    ? parseColumnsParam(rawDetailColumns, tableConfig, { excludeId: true })
    : null;
  const urlPageSize = parsePageSizeParam(rawPageSize);
  const urlSort = tableConfig
    ? parseSortParam(rawSortColumn, rawSortDirection, tableConfig)
    : null;
  const urlSortColumn = urlSort?.[0] ?? null;
  const urlSortDirection = urlSort?.[1] ?? null;
  const defaultSettings = useMemo(
    () =>
      tableName && tableConfig
        ? getDefaultSettings(tableName, tableConfig)
        : null,
    [tableName, tableConfig]
  );
  const sessionSettings =
    tableName && tableConfig ? readSessionSettings(tableName, tableConfig) : null;
  const resolvedListColumns =
    urlListColumns ??
    sessionSettings?.listColumns ??
    defaultSettings?.listColumns ??
    [];
  const resolvedDetailColumns =
    urlDetailColumns ??
    sessionSettings?.detailColumns ??
    defaultSettings?.detailColumns ??
    [];
  const resolvedPageSize =
    urlPageSize ??
    sessionSettings?.pageSize ??
    defaultSettings?.pageSize ??
    DEFAULT_PAGE_SIZE;
  const listColumnsKey = resolvedListColumns.join(',');
  const detailColumnsKey = resolvedDetailColumns.join(',');
  const [detailState, setDetailState] = useState<DetailState>({
    row: null,
    loading: false,
    error: null,
    notFound: false,
  });
  const [listResetKey, setListResetKey] = useState(0);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const updateUrl = useCallback(
    (
      mutate: (nextSearchParams: URLSearchParams) => void,
      options: { replace?: boolean } = {}
    ) => {
      const nextSearchParams = new URLSearchParams(searchParamsString);
      mutate(nextSearchParams);

      if (nextSearchParams.toString() === searchParamsString) {
        return;
      }

      setSearchParams(nextSearchParams, { replace: options.replace ?? false });
    },
    [searchParamsString, setSearchParams]
  );

  const closeDetailAndReloadList = useCallback(() => {
    setListResetKey((current) => current + 1);
    setSelectionResetKey((current) => current + 1);
    updateUrl((nextSearchParams) => {
      nextSearchParams.delete('rowId');
      nextSearchParams.delete('mode');
    });
  }, [updateUrl]);

  const reloadListAndKeepDetail = useCallback(
    (response: UpsertResponse[]) => {
      const savedId = response[0]?.id;

      setListResetKey((current) => current + 1);

      if (isCreateMode && typeof savedId === 'number') {
        updateUrl((nextSearchParams) => {
          nextSearchParams.set('rowId', String(savedId));
          nextSearchParams.delete('mode');
        });
      }
    },
    [isCreateMode, updateUrl]
  );

  const handleCreateRow = useCallback(() => {
    if (!tableName) {
      return;
    }

    updateUrl((nextSearchParams) => {
      nextSearchParams.set('table', tableName);
      nextSearchParams.set('mode', 'new');
      nextSearchParams.delete('rowId');
    });
  }, [tableName, updateUrl]);

  useEffect(() => {
    if (!tableName || !tableConfig) {
      setPageChrome(null);
      setQuickAddAction(null);
      return () => {
        setPageChrome(null);
        setQuickAddAction(null);
      };
    }

    setPageChrome({
      breadcrumbSuffix: tableConfig.label,
      pageTitleSuffix: tableConfig.label,
    });
    setQuickAddAction({
      label: `새 ${tableConfig.label} 추가`,
      onClick: handleCreateRow,
    });

    return () => {
      setPageChrome(null);
      setQuickAddAction(null);
    };
  }, [
    handleCreateRow,
    setPageChrome,
    setQuickAddAction,
    tableConfig,
    tableName,
  ]);

  useEffect(() => {
    if (!tableName || !tableConfig || !defaultSettings) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParamsString);
    let changed = false;

    if (nextSearchParams.get('list') !== listColumnsKey) {
      nextSearchParams.set('list', listColumnsKey);
      changed = true;
    }

    if (nextSearchParams.get('detail') !== detailColumnsKey) {
      nextSearchParams.set('detail', detailColumnsKey);
      changed = true;
    }

    if (nextSearchParams.get('pageSize') !== String(resolvedPageSize)) {
      nextSearchParams.set('pageSize', String(resolvedPageSize));
      changed = true;
    }

    if (rawSortColumn !== null || rawSortDirection !== null) {
      if (urlSortColumn && urlSortDirection) {
        if (nextSearchParams.get('sort') !== urlSortColumn) {
          nextSearchParams.set('sort', urlSortColumn);
          changed = true;
        }

        if (nextSearchParams.get('sortDir') !== urlSortDirection) {
          nextSearchParams.set('sortDir', urlSortDirection);
          changed = true;
        }
      } else {
        if (nextSearchParams.has('sort')) {
          nextSearchParams.delete('sort');
          changed = true;
        }

        if (nextSearchParams.has('sortDir')) {
          nextSearchParams.delete('sortDir');
          changed = true;
        }
      }
    }

    if (nextSearchParams.get('mode') && !isCreateMode) {
      nextSearchParams.delete('mode');
      changed = true;
    }

    if (isCreateMode && nextSearchParams.has('rowId')) {
      nextSearchParams.delete('rowId');
      changed = true;
    } else if (!isCreateMode && rawRowId !== null && rowId === null) {
      nextSearchParams.delete('rowId');
      changed = true;
    }

    if (changed) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [
    defaultSettings,
    detailColumnsKey,
    isCreateMode,
    listColumnsKey,
    rawRowId,
    resolvedPageSize,
    rowId,
    rawSortColumn,
    rawSortDirection,
    searchParamsString,
    setSearchParams,
    tableConfig,
    tableName,
    urlSortColumn,
    urlSortDirection,
  ]);

  useEffect(() => {
    if (!tableName || !tableConfig) {
      return;
    }

    writeSessionSettings(tableName, {
      listColumns: listColumnsKey ? listColumnsKey.split(',') : [],
      detailColumns: detailColumnsKey ? detailColumnsKey.split(',') : [],
      pageSize: resolvedPageSize,
    });
  }, [
    detailColumnsKey,
    listColumnsKey,
    resolvedPageSize,
    tableConfig,
    tableName,
  ]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;

    if (!tableName || !tableConfig) {
      setDetailState({
        row: null,
        loading: false,
        error: null,
        notFound: false,
      });
      return;
    }

    if (isCreateMode) {
      setDetailState({
        row: {},
        loading: false,
        error: null,
        notFound: false,
      });
      return;
    }

    if (rowId === null) {
      setDetailState({
        row: null,
        loading: false,
        error: null,
        notFound: false,
      });
      return;
    }

    const selectedTableConfig = tableConfig;
    const selectedRowId = rowId;

    setDetailState({
      row: null,
      loading: true,
      error: null,
      notFound: false,
    });

    async function loadSelectedRow() {
      try {
        const response = await selectedTableConfig.listRows({
          offset: 0,
          limit: null,
          selected_ids: [selectedRowId],
          search_text: null,
          text_filter: {},
          filter: {},
          sort: null,
        });

        if (cancelled) {
          return;
        }

        const nextRow = response.items[0] ?? null;
        setDetailState({
          row: nextRow,
          loading: false,
          error: null,
          notFound: nextRow === null,
        });
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setDetailState({
          row: null,
          loading: false,
          error:
            caughtError instanceof Error
              ? caughtError.message
              : '데이터를 불러오지 못했습니다.',
          notFound: false,
        });
      }
    }

    loadSelectedRow();

    return () => {
      cancelled = true;
    };
  }, [isCreateMode, rowId, tableConfig, tableName]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!tableName || !tableConfig || !defaultSettings) {
    return <Navigate to="/" replace />;
  }

  const isDetailOpen = isCreateMode || rowId !== null;
  const detailTitle = getDetailTitle({
    tableLabel: tableConfig.label,
    tableConfig,
    row: detailState.row,
    isCreateMode,
  });

  return (
    <>
      <MasterDetailLayout
        list={
          <DbTableListSelect
            key={`${tableName}-${listResetKey}`}
            tableName={tableName}
            columns={resolvedListColumns}
            selectedIds={rowId === null ? [] : [rowId]}
            onSelectedIdsChange={(nextSelectedIds) => {
              const nextRowId = nextSelectedIds[0] ?? null;

              if (nextRowId === rowId && !isCreateMode) {
                return;
              }

              updateUrl((nextSearchParams) => {
                nextSearchParams.delete('mode');

                if (nextRowId === null) {
                  nextSearchParams.delete('rowId');
                  return;
                }

                nextSearchParams.set('rowId', String(nextRowId));
              });
            }}
            pageSize={resolvedPageSize}
            onPageSizeChange={(nextPageSize) => {
              updateUrl((nextSearchParams) => {
                nextSearchParams.set('pageSize', String(nextPageSize));
              });
            }}
            initialSort={urlSort}
            onSortChange={(nextSort) => {
              updateUrl((nextSearchParams) => {
                if (!nextSort) {
                  nextSearchParams.delete('sort');
                  nextSearchParams.delete('sortDir');
                  return;
                }

                nextSearchParams.set('sort', nextSort[0]);
                nextSearchParams.set('sortDir', nextSort[1]);
              });
            }}
            selectionResetKey={selectionResetKey}
            preserveSelectionOnDataChange
            showPageSizeSelect={false}
            headerActions={
              <button
                type="button"
                aria-label="목록 설정"
                title="목록 설정"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md transition"
                onClick={() => setIsSettingsOpen(true)}
              >
                <GearIcon />
              </button>
            }
            emptyMessage={`${tableConfig.label} 데이터가 없습니다.`}
          />
        }
        detail={
          <ListEditDetail
            tableName={tableName}
            tableLabel={tableConfig.label}
            row={detailState.row}
            loading={detailState.loading}
            error={detailState.error}
            notFound={detailState.notFound}
            columns={resolvedDetailColumns}
            onSaved={reloadListAndKeepDetail}
            onDeleted={closeDetailAndReloadList}
          />
        }
        emptyDetail={<EmptyListEditDetail tableLabel={tableConfig.label} />}
        isDetailOpen={isDetailOpen}
        onDetailClose={() => {
          updateUrl((nextSearchParams) => {
            nextSearchParams.delete('rowId');
            nextSearchParams.delete('mode');
          });
          setSelectionResetKey((current) => current + 1);
        }}
        detailTitle={detailTitle}
      />

      {isSettingsOpen ? (
        <ListSettingsModal
          tableConfig={tableConfig}
          initialListColumns={resolvedListColumns}
          initialPageSize={resolvedPageSize}
          defaultListColumns={defaultSettings.listColumns}
          defaultPageSize={defaultSettings.pageSize}
          onClose={() => setIsSettingsOpen(false)}
          onApply={(nextListColumns, nextPageSize) => {
            writeSessionSettings(tableName, {
              listColumns: nextListColumns,
              detailColumns: resolvedDetailColumns,
              pageSize: nextPageSize,
            });
            updateUrl((nextSearchParams) => {
              nextSearchParams.set('list', nextListColumns.join(','));
              nextSearchParams.set('detail', resolvedDetailColumns.join(','));
              nextSearchParams.set('pageSize', String(nextPageSize));
            });
            setIsSettingsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function ListEditDetail({
  tableName,
  tableLabel,
  row,
  loading,
  error,
  notFound,
  columns,
  onSaved,
  onDeleted,
}: {
  tableName: DbTableName;
  tableLabel: string;
  row: DbRow | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  columns: string[];
  onSaved: (response: UpsertResponse[]) => void;
  onDeleted: () => void;
}) {
  if (loading) {
    return (
      <DetailMessage
        title="데이터를 불러오는 중입니다"
        description="잠시만 기다려 주세요."
      />
    );
  }

  if (error) {
    return <DetailMessage title="데이터를 불러오지 못했습니다" description={error} />;
  }

  if (notFound || !row) {
    return (
      <DetailMessage
        title="데이터가 없습니다"
        description={`${tableLabel} 행이 없거나 삭제되었습니다.`}
      />
    );
  }

  return (
    <DbTableDetailEdit
      tableName={tableName}
      row={row}
      columns={columns}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />
  );
}

function EmptyListEditDetail({ tableLabel }: { tableLabel: string }) {
  return (
    <div className="flex h-full min-h-[26rem] flex-col justify-center gap-3 p-5 text-center">
      <h2 className="text-xl font-semibold text-[var(--app-text)]">
        {tableLabel} 행을 선택해 주세요
      </h2>
    </div>
  );
}

function DetailMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[18rem] flex-col justify-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-5 text-center">
      <h3 className="text-base font-semibold text-[var(--app-text)]">{title}</h3>
      <p className="text-sm text-[var(--app-muted)]">{description}</p>
    </div>
  );
}

function ListSettingsModal({
  tableConfig,
  initialListColumns,
  initialPageSize,
  defaultListColumns,
  defaultPageSize,
  onClose,
  onApply,
}: {
  tableConfig: ListEditTableConfig;
  initialListColumns: string[];
  initialPageSize: DbTableListPageSize;
  defaultListColumns: string[];
  defaultPageSize: DbTableListPageSize;
  onClose: () => void;
  onApply: (
    nextListColumns: string[],
    nextPageSize: DbTableListPageSize
  ) => void;
}) {
  const allColumnKeys = Object.keys(tableConfig.columns).filter(
    (columnKey) => columnKey !== 'id'
  );
  const [draftListColumns, setDraftListColumns] =
    useState<string[]>(initialListColumns);
  const [draftPageSize, setDraftPageSize] =
    useState<DbTableListPageSize>(initialPageSize);
  const canApply = draftListColumns.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <button
        type="button"
        aria-label="목록 설정 닫기"
        className="modal-backdrop absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-settings-title"
        className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
              Settings
            </p>
            <h2
              id="list-settings-title"
              className="mt-1 text-base font-semibold text-[var(--app-text)]"
            >
              목록 설정
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex h-9 min-w-14 items-center justify-center rounded-md px-3 transition"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <label className="grid gap-1 text-xs font-semibold text-[var(--app-muted)] sm:max-w-44">
            <span className="uppercase tracking-[0.14em]">Page Size</span>
            <select
              value={draftPageSize}
              className="h-9 rounded-md border border-[var(--app-border)] bg-white px-2.5 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
              onChange={(event) =>
                setDraftPageSize(
                  Number(event.target.value) as DbTableListPageSize
                )
              }
            >
              {DB_TABLE_LIST_PAGE_SIZES.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-muted)]">
              Columns
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {allColumnKeys.map((columnKey) => {
                const columnConfig = tableConfig.columns[columnKey];
                const isChecked = draftListColumns.includes(columnKey);

                return (
                  <label
                    key={columnKey}
                    className="flex min-h-11 items-center gap-3 rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm text-[var(--app-text)]"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      className="h-4 w-4 accent-[var(--app-accent)]"
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setDraftListColumns((current) =>
                          checked
                            ? allColumnKeys.filter(
                                (key) => key === columnKey || current.includes(key)
                              )
                            : current.filter((key) => key !== columnKey)
                        );
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {columnConfig.label}
                      </span>
                      <span className="block truncate text-xs text-[var(--app-muted)]">
                        {columnKey}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--app-border)] px-4 py-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-md px-4 transition"
            onClick={() => {
              setDraftListColumns(defaultListColumns);
              setDraftPageSize(defaultPageSize);
            }}
          >
            기본값
          </button>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-md px-4 transition"
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="button"
              disabled={!canApply}
              className="inline-flex h-10 items-center justify-center rounded-md px-4 transition disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => onApply(draftListColumns, draftPageSize)}
            >
              적용
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function isDbTableName(value: string | null): value is DbTableName {
  return value !== null && value in dbTables;
}

function parseColumnsParam(
  rawValue: string | null,
  tableConfig: ListEditTableConfig,
  options: { excludeId?: boolean } = {}
) {
  if (rawValue === null) {
    return null;
  }

  return normalizeColumnKeys(rawValue.split(','), tableConfig, options);
}

function normalizeColumnKeys(
  columnKeys: unknown,
  tableConfig: ListEditTableConfig,
  options: { excludeId?: boolean } = {}
) {
  if (!Array.isArray(columnKeys)) {
    return null;
  }

  const normalizedColumns = columnKeys
    .filter((columnKey): columnKey is string => typeof columnKey === 'string')
    .map((columnKey) => columnKey.trim())
    .filter((columnKey, index, columns) => {
      return (
        (!options.excludeId || columnKey !== 'id') &&
        columnKey in tableConfig.columns &&
        columns.indexOf(columnKey) === index
      );
    });

  return normalizedColumns.length > 0 ? normalizedColumns : null;
}

function parsePageSizeParam(rawValue: string | null) {
  if (rawValue === null) {
    return null;
  }

  const nextPageSize = Number(rawValue);
  return isPageSize(nextPageSize) ? nextPageSize : null;
}

function parseSortParam(
  rawColumn: string | null,
  rawDirection: string | null,
  tableConfig: ListEditTableConfig
): DbTableListSortState {
  if (rawColumn === null) {
    return null;
  }

  const columnKey = rawColumn.trim();
  if (!columnKey || !(columnKey in tableConfig.columns)) {
    return null;
  }

  const direction =
    rawDirection?.trim().toLowerCase() === 'desc' ? 'desc' : 'asc';

  return [columnKey, direction];
}

function isPageSize(value: unknown): value is DbTableListPageSize {
  return (
    typeof value === 'number' &&
    DB_TABLE_LIST_PAGE_SIZES.includes(value as DbTableListPageSize)
  );
}

function parseRowId(rawValue: string | null) {
  if (rawValue === null || !rawValue.trim()) {
    return null;
  }

  const rowId = Number(rawValue);
  return Number.isSafeInteger(rowId) ? rowId : null;
}

function getDefaultSettings(
  tableName: DbTableName,
  tableConfig: ListEditTableConfig
): ListEditSettings {
  const tableDefaults = LIST_EDIT_TABLE_DEFAULTS[tableName];
  const defaultListColumns =
    normalizeColumnKeys(tableDefaults?.listColumns, tableConfig, {
      excludeId: true,
    }) ??
    getSchemaListColumns(tableConfig);
  const defaultDetailColumns =
    normalizeColumnKeys(tableDefaults?.detailColumns, tableConfig, {
      excludeId: true,
    }) ??
    Object.keys(tableConfig.columns).filter((columnKey) => columnKey !== 'id');
  const defaultPageSize = isPageSize(tableDefaults?.pageSize)
    ? tableDefaults.pageSize
    : DEFAULT_PAGE_SIZE;

  return {
    listColumns: defaultListColumns,
    detailColumns: defaultDetailColumns,
    pageSize: defaultPageSize,
  };
}

function getSchemaListColumns(tableConfig: ListEditTableConfig) {
  const columnKeys = Object.keys(tableConfig.columns).filter(
    (columnKey) => columnKey !== 'id'
  );
  const requiredColumns = columnKeys.filter(
    (columnKey) => tableConfig.columns[columnKey].required === true
  );

  if (requiredColumns.length > 0) {
    return requiredColumns;
  }

  return columnKeys.slice(0, 1);
}

function readSessionSettings(
  tableName: DbTableName,
  tableConfig: ListEditTableConfig
): Partial<ListEditSettings> | null {
  try {
    const rawValue = window.sessionStorage.getItem(
      `${SESSION_STORAGE_PREFIX}${tableName}`
    );
    if (!rawValue) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (
      !parsedValue ||
      typeof parsedValue !== 'object' ||
      Array.isArray(parsedValue)
    ) {
      return null;
    }

    const parsedSettings = parsedValue as Record<string, unknown>;
    const listColumns = normalizeColumnKeys(
      parsedSettings.listColumns,
      tableConfig,
      { excludeId: true }
    );
    const detailColumns = normalizeColumnKeys(
      parsedSettings.detailColumns,
      tableConfig,
      { excludeId: true }
    );
    const pageSize = isPageSize(parsedSettings.pageSize)
      ? parsedSettings.pageSize
      : null;

    return {
      ...(listColumns ? { listColumns } : {}),
      ...(detailColumns ? { detailColumns } : {}),
      ...(pageSize ? { pageSize } : {}),
    };
  } catch {
    return null;
  }
}

function writeSessionSettings(
  tableName: DbTableName,
  settings: ListEditSettings
) {
  try {
    window.sessionStorage.setItem(
      `${SESSION_STORAGE_PREFIX}${tableName}`,
      JSON.stringify(settings)
    );
  } catch {
    // sessionStorage can be unavailable in restricted browser contexts.
  }
}

function getDetailTitle({
  tableLabel,
  tableConfig,
  row,
  isCreateMode,
}: {
  tableLabel: string;
  tableConfig: ListEditTableConfig;
  row: DbRow | null;
  isCreateMode: boolean;
}) {
  if (isCreateMode) {
    return `새 ${tableLabel}`;
  }

  if (!row) {
    return `${tableLabel} 상세`;
  }

  const requiredDatetimeColumn = Object.entries(tableConfig.columns).find(
    ([, config]) => config.required === true && config.type === 'datetime'
  );
  const requiredDatetimeValue = requiredDatetimeColumn
    ? row[requiredDatetimeColumn[0]]
    : undefined;
  const normalizedRequiredDatetimeValue =
    requiredDatetimeValue === null || requiredDatetimeValue === ''
      ? undefined
      : requiredDatetimeValue;
  const requiredDatetimeTitleValue = formatDetailDatetimeValue(
    normalizedRequiredDatetimeValue
  );
  const requiredDatetimeTitle = requiredDatetimeTitleValue
    ? `${tableLabel} - ${requiredDatetimeTitleValue}`
    : null;
  const titleValue =
    row.name ?? row.title ?? requiredDatetimeTitle ?? row.id;
  return titleValue === null || titleValue === undefined || titleValue === ''
    ? `${tableLabel} 상세`
    : String(titleValue);
}

function formatDetailDatetimeValue(value: unknown) {
  const formattedValue = formatLocalDateTimeLabel(value, {
    year: 'numeric',
    fallback: '',
  });
  return formattedValue || null;
}

