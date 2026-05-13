import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { DiskIcon, LinkIcon, SearchIcon } from '../../../app/icons';
import type { GetListRequest, GetListResponse } from '../../../api/api';
import { dbTables } from '../../../api/api';
import {
  formatLocalDateTimeLabel,
  localDateTimeInputToUtcIso,
} from '../../../utils/datetime';
import { DB_TABLE_LIST_PAGE_SIZES } from './constants';

type DbTableName = keyof typeof dbTables;
type DbRow = Record<string, unknown>;
export type DbTableListPageSize = 20 | 50 | 100;
export type DbTableListSortState = [string, 'asc' | 'desc'] | null;
type RangeFilterState = Record<string, { min: string; max: string }>;
type ForeignNameMap = Record<string, Record<string, string>>;

type DbColumn = {
  label: string;
  type: string;
  targetTable?: DbTableName;
  options?: { key: string; label: string }[];
};

type ListTableConfig = {
  label: string;
  columns: Record<string, DbColumn>;
  listRows: (
    listRequest: GetListRequest
  ) => Promise<GetListResponse<Record<string, unknown>>>;
};

type DbTableListSelectProps = {
  tableName: DbTableName;
  columns: string[];
  multiSelect?: boolean;
  onSelect?: (selectedRows: DbRow[]) => void;
  selectedIds?: number[];
  onSelectedIdsChange?: (selectedIds: number[]) => void;
  emptyMessage?: string;
  initialPageSize?: DbTableListPageSize;
  pageSize?: DbTableListPageSize;
  onPageSizeChange?: (pageSize: DbTableListPageSize) => void;
  initialSort?: DbTableListSortState;
  onSortChange?: (sort: DbTableListSortState) => void;
  selectionResetKey?: number;
  preserveSelectionOnDataChange?: boolean;
  showPageSizeSelect?: boolean;
  headerActions?: ReactNode;
};

const DEFAULT_EMPTY_MESSAGE = '표시할 데이터가 없습니다.';

export function DbTableListSelect({
  tableName,
  columns,
  multiSelect = false,
  onSelect,
  selectedIds: controlledSelectedIds,
  onSelectedIdsChange,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  initialPageSize = 20,
  pageSize: controlledPageSize,
  onPageSizeChange,
  initialSort = ['id', 'desc'],
  onSortChange,
  selectionResetKey = 0,
  preserveSelectionOnDataChange = false,
  showPageSizeSelect = true,
  headerActions,
}: DbTableListSelectProps) {
  const tableConfig = dbTables[tableName] as ListTableConfig;
  const visibleColumns = columns
    .map((column) => ({
      key: column,
      config: tableConfig.columns[column],
    }))
    .filter(
      (
        column
      ): column is {
        key: string;
        config: DbColumn;
      } => Boolean(column.config)
    );
  const columnsKey = columns.join('|');
  const searchInputId = `db-table-list-select-search-${tableName}`;
  const [items, setItems] = useState<DbRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [uncontrolledPageSize, setUncontrolledPageSize] =
    useState<DbTableListPageSize>(initialPageSize);
  const pageSize = controlledPageSize ?? uncontrolledPageSize;
  const [searchText, setSearchText] = useState('');
  const [draftSearchText, setDraftSearchText] = useState('');
  const [rangeFilters, setRangeFilters] = useState<RangeFilterState>({});
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [sort, setSort] = useState<DbTableListSortState>(
    initialSort ?? ['id', 'desc']
  );
  const [uncontrolledSelectedIds, setUncontrolledSelectedIds] = useState<
    number[]
  >([]);
  const selectedIds = controlledSelectedIds ?? uncontrolledSelectedIds;
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [foreignNames, setForeignNames] = useState<ForeignNameMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didMountSelectionReset = useRef(false);
  const hasImageColumn = visibleColumns.some(
    ({ config }) => config.type === 'image'
  );
  const filterColumns = visibleColumns.filter(
    ({ config }) =>
      config.type === 'datetime' ||
      config.type === 'int' ||
      config.type === 'float'
  );
  const mobilePrimaryTextColumn =
    visibleColumns.find(({ config }) => config.type === 'text') ?? null;
  const mobilePrimaryCountColumn =
    visibleColumns.find(
      ({ config }) =>
        config.type === 'int' ||
        config.type === 'list-fk'
    ) ?? null;
  const mobileImageColumn =
    visibleColumns.find(({ config }) => config.type === 'image') ?? null;
  const mobileSecondaryColumns = visibleColumns
    .filter(
      ({ key }) =>
        key !== mobilePrimaryTextColumn?.key &&
        key !== mobilePrimaryCountColumn?.key &&
        key !== mobileImageColumn?.key
    )
    .slice(0, 5);
  const rangeFiltersKey = JSON.stringify(rangeFilters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPage(0);
  }, [tableName, columnsKey, searchText, rangeFiltersKey, pageSize]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (preserveSelectionOnDataChange) {
      return;
    }

    clearSelection();
  }, [
    tableName,
    columnsKey,
    searchText,
    rangeFiltersKey,
    page,
    pageSize,
    sort,
    preserveSelectionOnDataChange,
  ]);

  useEffect(() => {
    if (!didMountSelectionReset.current) {
      didMountSelectionReset.current = true;
      return;
    }

    clearSelection();
  }, [selectionResetKey]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      setLoading(true);
      setError(null);

      try {
        const trimmedSearchText = searchText.trim();
        const request: GetListRequest = {
          offset: page * pageSize,
          limit: pageSize,
          selected_ids: [],
          search_text: trimmedSearchText || null,
          text_filter: {},
          filter: buildFilterPayload(rangeFilters, visibleColumns),
          sort,
        };
        const response = await tableConfig.listRows(request);
        const resolvedForeignNames = await resolveForeignNames(
          response.items,
          visibleColumns
        );

        if (cancelled) {
          return;
        }

        setItems(response.items);
        setTotal(response.total);
        setForeignNames(resolvedForeignNames);
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setItems([]);
        setTotal(0);
        setForeignNames({});
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : '목록을 불러오지 못했습니다.'
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRows();

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, rangeFiltersKey, searchText, sort, tableName, columnsKey]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!onSelect) {
      return;
    }

    onSelect(
      items.filter((item) => {
        const rowId = getRowId(item);
        return rowId !== null && selectedIds.includes(rowId);
      })
    );
  }, [items, onSelect, selectedIds]);

  return (
    <div
      className="space-y-3 p-0 sm:space-y-4 sm:rounded-lg sm:border sm:border-[var(--app-border)] sm:bg-[var(--app-panel)] sm:p-4 sm:shadow-sm"
      onClick={handleContainerClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <label className="relative flex min-w-0 flex-1 text-xs font-semibold text-[var(--app-muted)] sm:min-w-[16rem]">
            <input
              id={searchInputId}
              type="search"
              value={draftSearchText}
              aria-label="전체 검색"
              placeholder="전체 검색"
              className="h-8 w-full rounded-md border border-[var(--app-border)] bg-white px-2.5 pr-8 text-xs text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
              onChange={(event) => {
                const nextSearchText = event.target.value;
                setDraftSearchText(nextSearchText);

                if (!nextSearchText.trim() && searchText) {
                  setSearchText('');
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitSearch();
                }
              }}
            />
            <button
              type="button"
              aria-label="검색"
              className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm transition"
              onClick={submitSearch}
            >
              <SearchIcon />
            </button>
          </label>

          {showPageSizeSelect ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--app-muted)]">
              <span className="uppercase tracking-[0.14em]">Page Size</span>
              <select
                value={pageSize}
                className="h-8 rounded-md border border-[var(--app-border)] bg-white px-2.5 text-xs text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                onChange={(event) =>
                  updatePageSize(
                    Number(event.target.value) as DbTableListPageSize
                  )
                }
              >
                {DB_TABLE_LIST_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {headerActions ? (
          <div className="flex shrink-0 items-start justify-end">
            {headerActions}
          </div>
        ) : null}
      </div>

      {filterColumns.length > 0 ? (
        <div className="sm:rounded-md sm:border sm:border-[var(--app-border)] sm:bg-[var(--app-panel-strong)]">
          <button
            type="button"
            className="flex w-full items-center justify-between px-0 py-2 text-left sm:px-3"
            onClick={() => setIsFilterPanelOpen((current) => !current)}
          >
            <span>
              Filters
            </span>
            <span>
              {isFilterPanelOpen ? '▲' : '▼'}
            </span>
          </button>

          {isFilterPanelOpen ? (
            <div className="grid gap-2 border-t border-[var(--app-border)] px-0 py-3 sm:grid-cols-2 sm:px-3 xl:grid-cols-3">
              {filterColumns.map(({ key, config }) => (
                <div
                  key={`${key}-filter-panel`}
                  className="px-0 py-2 sm:rounded-md sm:border sm:border-[var(--app-border)] sm:bg-white sm:px-2.5"
                >
                  <p className="mb-1.5 text-[0.72rem] font-semibold text-[var(--app-text)]">
                    {config.label}
                  </p>
                  {config.type === 'datetime' ? (
                    <div className="grid gap-1.5">
                      <input
                        type="datetime-local"
                        step={60}
                        value={rangeFilters[key]?.min ?? ''}
                        className="h-7 rounded-md border border-[var(--app-border)] bg-white px-2 text-[0.72rem] text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                        onChange={(event) =>
                          setRangeFilters((current) => ({
                            ...current,
                            [key]: {
                              min: event.target.value,
                              max: current[key]?.max ?? '',
                            },
                          }))
                        }
                      />
                      <input
                        type="datetime-local"
                        step={60}
                        value={rangeFilters[key]?.max ?? ''}
                        className="h-7 rounded-md border border-[var(--app-border)] bg-white px-2 text-[0.72rem] text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                        onChange={(event) =>
                          setRangeFilters((current) => ({
                            ...current,
                            [key]: {
                              min: current[key]?.min ?? '',
                              max: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  ) : (
                    <div className="grid gap-1.5">
                      <input
                        type="number"
                        step={config.type === 'float' ? 'any' : '1'}
                        value={rangeFilters[key]?.min ?? ''}
                        placeholder="min"
                        className="h-7 rounded-md border border-[var(--app-border)] bg-white px-2 text-[0.72rem] text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                        onChange={(event) =>
                          setRangeFilters((current) => ({
                            ...current,
                            [key]: {
                              min: event.target.value,
                              max: current[key]?.max ?? '',
                            },
                          }))
                        }
                      />
                      <input
                        type="number"
                        step={config.type === 'float' ? 'any' : '1'}
                        value={rangeFilters[key]?.max ?? ''}
                        placeholder="max"
                        className="h-7 rounded-md border border-[var(--app-border)] bg-white px-2 text-[0.72rem] text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                        onChange={(event) =>
                          setRangeFilters((current) => ({
                            ...current,
                            [key]: {
                              min: current[key]?.min ?? '',
                              max: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="md:overflow-hidden md:rounded-md md:border md:border-[var(--app-border)]">
        <div className="md:hidden">
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-[var(--app-muted)]">
              데이터를 불러오는 중입니다.
            </div>
          ) : error ? (
            <div className="px-4 py-12 text-center text-sm text-rose-600">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-[var(--app-muted)]">
              {emptyMessage}
            </div>
          ) : (
            items.map((item, rowIndex) => {
              const rowId = getRowId(item);
              const primaryText = mobilePrimaryTextColumn
                ? formatMobileCellValue({
                    item,
                    columnKey: mobilePrimaryTextColumn.key,
                    columnConfig: mobilePrimaryTextColumn.config,
                    foreignNames,
                  })
                : '';
              const primaryCount = mobilePrimaryCountColumn
                ? formatMobileCellValue({
                    item,
                    columnKey: mobilePrimaryCountColumn.key,
                    columnConfig: mobilePrimaryCountColumn.config,
                    foreignNames,
                  })
                : '';
              const primaryLineValue = primaryText || primaryCount || '-';
              const showSeparateCount = Boolean(primaryText && primaryCount);
              const mobileImageUrl =
                mobileImageColumn && hasDisplayValue(item[mobileImageColumn.key])
                  ? String(item[mobileImageColumn.key])
                  : null;

              return (
                <button
                  key={buildRowKey(item, rowIndex)}
                  type="button"
                  data-select-row="true"
                  className={[
                    'block w-full !border-b !border-[var(--app-border)] px-0 py-2 text-left !font-normal !no-underline last:!border-b-0',
                    rowId !== null ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                  onClick={(event) => handleRowClick(event, rowId, rowIndex)}
                >
                  <div className="flex min-w-0 gap-3">
                    {mobileImageUrl ? (
                      <div className="dp-image-frame w-16 shrink-0 overflow-hidden rounded-md border border-[var(--app-border)] bg-white">
                        <img
                          src={mobileImageUrl}
                          alt=""
                          className="dp-image-media"
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 font-medium leading-tight">
                        <span className="min-w-0 truncate">
                          {primaryLineValue}
                        </span>
                        {showSeparateCount ? (
                          <span className="shrink-0">
                            {primaryCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[0.72rem] leading-tight text-[var(--app-muted)]">
                        {mobileSecondaryColumns.map(({ key, config }) => (
                          <span key={`${buildRowKey(item, rowIndex)}-mobile-${key}`}>
                            {formatMobileCellValue({
                              item,
                              columnKey: key,
                              columnConfig: config,
                              foreignNames,
                            })}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full border-collapse">
            <thead className="bg-[var(--app-panel-strong)]">
              <tr>
                {visibleColumns.map(({ key, config }) => {
                  const sortState =
                    sort?.[0] === key ? (sort[1] === 'asc' ? 'asc' : 'desc') : null;

                  return (
                    <th
                      key={key}
                      scope="col"
                      className="border-b border-[var(--app-border)] px-3 py-1.5 text-left text-xs leading-tight font-semibold text-[var(--app-text)]"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 text-left"
                        onClick={() => {
                          const nextSort: DbTableListSortState =
                            !sort || sort[0] !== key
                              ? [key, 'asc']
                              : sort[1] === 'asc'
                                ? [key, 'desc']
                                : null;

                          setSort(nextSort);
                          onSortChange?.(nextSort);
                        }}
                      >
                        <span className="truncate">{config.label}</span>
                        <span>
                          {sortState === 'asc'
                            ? '▲'
                            : sortState === 'desc'
                              ? '▼'
                              : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length || 1}
                    className="px-4 py-12 text-center text-sm text-[var(--app-muted)]"
                  >
                    데이터를 불러오는 중입니다.
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length || 1}
                    className="px-4 py-12 text-center text-sm text-rose-600"
                  >
                    {error}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length || 1}
                    className="px-4 py-12 text-center text-sm text-[var(--app-muted)]"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                items.map((item, rowIndex) => {
                  const rowId = getRowId(item);
                  const isSelected =
                    rowId !== null ? selectedIds.includes(rowId) : false;
                  const rowHasImage =
                    hasImageColumn &&
                    visibleColumns.some(
                      ({ key, config }) =>
                        config.type === 'image' && hasDisplayValue(item[key])
                    );

                  return (
                    <tr
                      key={buildRowKey(item, rowIndex)}
                      data-select-row="true"
                      className={[
                        'border-b border-[var(--app-border)] transition last:border-b-0',
                        isSelected
                          ? 'bg-[var(--app-accent-soft)]'
                          : 'hover:bg-[var(--app-panel-strong)]',
                        rowId !== null ? 'cursor-pointer' : '',
                      ].join(' ')}
                      onClick={(event) => handleRowClick(event, rowId, rowIndex)}
                    >
                      {visibleColumns.map(({ key, config }) => (
                        <td
                          key={`${buildRowKey(item, rowIndex)}-${key}`}
                          className={[
                            'max-w-[18rem] px-3 py-1.5 text-[0.8125rem] leading-tight text-[var(--app-text)]',
                            rowHasImage ? 'h-[92px]' : '',
                            ['id', 'int', 'float'].includes(config.type)
                              ? 'text-right'
                              : 'text-left',
                          ].join(' ')}
                        >
                          {renderCell({
                            item,
                            columnKey: key,
                            columnConfig: config,
                            foreignNames,
                          })}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--app-muted)]">
          총 {total.toLocaleString('ko-KR')}건 · {page + 1} / {totalPages} 페이지
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page === 0}
            className="inline-flex h-10 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            이전
          </button>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            className="inline-flex h-10 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() =>
              setPage((current) => Math.min(totalPages - 1, current + 1))
            }
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );

  function handleRowClick(
    event: ReactMouseEvent<HTMLElement>,
    rowId: number | null,
    rowIndex: number
  ) {
    if (rowId === null) {
      return;
    }

    if (!multiSelect) {
      updateSelectedIds([rowId]);
      setLastSelectedIndex(rowIndex);
      return;
    }

    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, rowIndex);
      const end = Math.max(lastSelectedIndex, rowIndex);
      const rangeIds = items
        .slice(start, end + 1)
        .map((currentItem) => getRowId(currentItem))
        .filter((id): id is number => id !== null);

      updateSelectedIds(rangeIds);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      updateSelectedIds((current) =>
        current.includes(rowId)
          ? current.filter((id) => id !== rowId)
          : [...current, rowId]
      );
      setLastSelectedIndex(rowIndex);
      return;
    }

    updateSelectedIds([rowId]);
    setLastSelectedIndex(rowIndex);
  }

  function handleContainerClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (
      target.closest('[data-select-row="true"]') ||
      target.closest('button, input, select, a, label, textarea')
    ) {
      return;
    }

    clearSelection();
  }

  function clearSelection() {
    updateSelectedIds((current) => (current.length > 0 ? [] : current));
    setLastSelectedIndex((current) => (current === null ? current : null));
  }

  function updateSelectedIds(
    nextSelectedIds:
      | number[]
      | ((currentSelectedIds: number[]) => number[])
  ) {
    const resolvedSelectedIds =
      typeof nextSelectedIds === 'function'
        ? nextSelectedIds(selectedIds)
        : nextSelectedIds;

    if (controlledSelectedIds === undefined) {
      setUncontrolledSelectedIds(resolvedSelectedIds);
    }

    onSelectedIdsChange?.(resolvedSelectedIds);
  }

  function updatePageSize(nextPageSize: DbTableListPageSize) {
    if (controlledPageSize === undefined) {
      setUncontrolledPageSize(nextPageSize);
    }

    onPageSizeChange?.(nextPageSize);
  }

  function submitSearch() {
    setSearchText(draftSearchText.trim());
  }

  async function resolveForeignNames(
    nextItems: DbRow[],
    nextVisibleColumns: { key: string; config: DbColumn }[]
  ) {
    const idsByTargetTable: Partial<Record<DbTableName, Set<number>>> = {};

    nextVisibleColumns.forEach(({ key, config }) => {
      const targetTableName = config.targetTable;

      if (config.type !== 'fk' || !targetTableName) {
        return;
      }

      const targetTable = dbTables[targetTableName] as ListTableConfig;
      if (!targetTable.columns.name && !targetTable.columns.title) {
        return;
      }

      nextItems.forEach((item) => {
        const rawValue = item[key];
        if (typeof rawValue !== 'number') {
          return;
        }

        if (!idsByTargetTable[targetTableName]) {
          idsByTargetTable[targetTableName] = new Set<number>();
        }

        idsByTargetTable[targetTableName]?.add(rawValue);
      });
    });

    const targetTables = Object.entries(idsByTargetTable).filter(
      (entry): entry is [DbTableName, Set<number>] => Boolean(entry[1]?.size)
    );

    if (targetTables.length === 0) {
      return {};
    }

    const results = await Promise.all(
      targetTables.map(async ([targetTableName, idSet]) => {
        const targetTable = dbTables[targetTableName] as ListTableConfig;
        const response = await targetTable.listRows({
          offset: 0,
          limit: null,
          selected_ids: [...idSet],
          search_text: null,
          text_filter: {},
          filter: {},
          sort: null,
        });

        return [
          targetTableName,
          Object.fromEntries(
            response.items.flatMap((item) => {
              const id = getRowId(item);
              const name =
                typeof item.name === 'string' && item.name.trim()
                  ? item.name
                  : typeof item.title === 'string' && item.title.trim()
                    ? item.title
                  : null;
              return id !== null && name !== null ? [[String(id), name]] : [];
            })
          ),
        ] as const;
      })
    );

    return Object.fromEntries(results);
  }
}

function buildFilterPayload(
  rangeFilters: RangeFilterState,
  visibleColumns: { key: string; config: DbColumn }[]
) {
  const filterPayload: Record<string, unknown[]> = {};

  visibleColumns.forEach(({ key, config }) => {
    if (!['datetime', 'int', 'float'].includes(config.type)) {
      return;
    }

    const currentFilter = rangeFilters[key];
    if (!currentFilter) {
      return;
    }

    const minValue = normalizeFilterValue(config.type, currentFilter.min, false);
    const maxValue = normalizeFilterValue(config.type, currentFilter.max, true);

    if (minValue === null && maxValue === null) {
      return;
    }

    filterPayload[key] = [minValue, maxValue];
  });

  return filterPayload;
}

function normalizeFilterValue(
  columnType: string,
  rawValue: string,
  isMax: boolean
) {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  if (columnType === 'datetime') {
    return localDateTimeInputToUtcIso(trimmedValue, { endOfMinute: isMax }) ?? trimmedValue;
  }

  return trimmedValue;
}

function renderCell({
  item,
  columnKey,
  columnConfig,
  foreignNames,
}: {
  item: DbRow;
  columnKey: string;
  columnConfig: DbColumn;
  foreignNames: ForeignNameMap;
}) {
  const value = item[columnKey];

  switch (columnConfig.type) {
    case 'id':
    case 'int':
    case 'float':
      return (
        <span className="block truncate">{formatSimpleValue(value)}</span>
      );
    case 'datetime':
      return (
        <span className="block truncate">{formatDatetimeValue(value)}</span>
      );
    case 'text':
      return (
        <span className="block truncate">{formatOptionValue(columnConfig, value)}</span>
      );
    case 'boolean':
      return (
        <span className="block truncate">{formatBooleanValue(value)}</span>
      );
    case 'fk': {
      const targetTable = columnConfig.targetTable;
      if (!targetTable || typeof value !== 'number') {
        return <span className="block truncate">{formatSimpleValue(value)}</span>;
      }

      return (
        <span className="block truncate">
          {foreignNames[targetTable]?.[String(value)] ?? String(value)}
        </span>
      );
    }
    case 'list-fk':
      return (
        <span className="block truncate">
          {Array.isArray(value) ? `${value.length}개` : '0개'}
        </span>
      );
    case 'dict-list':
      return <span className="block truncate">{formatDictListSummary(value)}</span>;
    case 'url':
      return typeof value === 'string' && value.trim() ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          aria-label="링크 열기"
          className="inline-flex h-4 w-4 items-center justify-center text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
          onClick={(event) => event.stopPropagation()}
        >
          <LinkIcon />
        </a>
      ) : (
        <span className="block truncate text-[var(--app-muted)]">-</span>
      );
    case 'image':
      return hasDisplayValue(value) ? (
        <div className="flex h-[88px] items-center">
          <div className="dp-image-frame w-14 overflow-hidden rounded-md border border-[var(--app-border)] bg-white">
            <img
              src={String(value)}
              alt=""
              className="dp-image-media"
            />
          </div>
        </div>
      ) : (
        <span className="block truncate text-[var(--app-muted)]">-</span>
      );
    case 'file':
      return typeof value === 'string' && value.trim() ? (
        <a
          href={value}
          download
          className="inline-flex h-4 w-4 items-center justify-center text-[var(--app-muted)] transition hover:text-[var(--app-text)]"
          onClick={(event) => event.stopPropagation()}
        >
          <DiskIcon />
        </a>
      ) : (
        <span className="block truncate text-[var(--app-muted)]">-</span>
      );
    default:
      return (
        <span className="block truncate">{formatSimpleValue(value)}</span>
      );
  }
}

function formatMobileCellValue({
  item,
  columnKey,
  columnConfig,
  foreignNames,
}: {
  item: DbRow;
  columnKey: string;
  columnConfig: DbColumn;
  foreignNames: ForeignNameMap;
}) {
  const value = item[columnKey];

  switch (columnConfig.type) {
    case 'datetime':
      return formatDatetimeValue(value);
    case 'fk':
      return columnConfig.targetTable && typeof value === 'number'
        ? foreignNames[columnConfig.targetTable]?.[String(value)] ?? String(value)
        : formatSimpleValue(value);
    case 'list-fk':
      return Array.isArray(value) ? `${value.length}개` : '0개';
    case 'dict-list':
      return formatDictListSummary(value);
    case 'boolean':
      return formatBooleanValue(value);
    case 'url':
      return typeof value === 'string' && value.trim() ? '링크' : '-';
    case 'image':
      return hasDisplayValue(value) ? '이미지' : '-';
    case 'file':
      return typeof value === 'string' && value.trim() ? '파일' : '-';
    default:
      return formatOptionValue(columnConfig, value);
  }
}

function formatOptionValue(config: DbColumn, value: unknown) {
  if (typeof value === 'string' && config.options) {
    return config.options.find((option) => option.key === value)?.label ?? value;
  }

  return formatSimpleValue(value);
}

function formatSimpleValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

function formatBooleanValue(value: unknown) {
  if (value === true) {
    return '예';
  }
  if (value === false) {
    return '아니오';
  }
  return '-';
}

function formatDatetimeValue(value: unknown) {
  return formatLocalDateTimeLabel(value);
}

function formatDictListSummary(value: unknown) {
  if (Array.isArray(value)) {
    return `${value.length}개`;
  }

  if (value && typeof value === 'object') {
    return `${Object.keys(value).length}개`;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsedValue = JSON.parse(value);
      if (Array.isArray(parsedValue)) {
        return `${parsedValue.length}개`;
      }
      if (parsedValue && typeof parsedValue === 'object') {
        return `${Object.keys(parsedValue).length}개`;
      }
      return '1개';
    } catch {
      return '1개';
    }
  }

  return '-';
}

function hasDisplayValue(value: unknown) {
  return typeof value === 'string' ? Boolean(value.trim()) : Boolean(value);
}

function getRowId(item: DbRow) {
  return typeof item.id === 'number' ? item.id : null;
}

function buildRowKey(item: DbRow, rowIndex: number) {
  return getRowId(item) ?? `row-${rowIndex}`;
}

