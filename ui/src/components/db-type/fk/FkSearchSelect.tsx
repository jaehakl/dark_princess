import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EMPTY_SEARCH_RESULT_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_RESULT_LIMIT,
} from './constants';
import type {
  DbColumn,
  DbRow,
  DbTableName,
  FkTableConfig,
  SearchDropdownPosition,
} from './types';
import {
  fetchFkSummaries,
  formatRowTooltip,
  formatValue,
  getRowDisplayValue,
  getRowId,
  getSearchDropdownPosition,
  getSearchResultDisplayValue,
} from './utils';

type FkSearchSelectProps = {
  inputId: string;
  targetTable?: DbTableName;
  tableConfig: FkTableConfig | null;
  fkSummaryColumns: [string, DbColumn][];
  value: string;
  disabled: boolean;
  required: boolean;
  placeholder: string;
  title: string;
  editorBackgroundClassName: string;
  editorTextClassName: string;
  onValueChange: (value: string) => void;
  onSelect: (id: number) => void;
};

export function FkSearchSelect({
  inputId,
  targetTable,
  tableConfig,
  fkSummaryColumns,
  value,
  disabled,
  required,
  placeholder,
  title,
  editorBackgroundClassName,
  editorTextClassName,
  onValueChange,
  onSelect,
}: FkSearchSelectProps) {
  const searchControlRef = useRef<HTMLDivElement>(null);
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<DbRow[]>([]);
  const [searchFkSummaries, setSearchFkSummaries] = useState<
    Record<string, Record<string, string>>
  >({});
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] =
    useState<SearchDropdownPosition | null>(null);
  const trimmedSearchText = debouncedSearchText.trim();
  const shouldShowDropdown =
    !disabled &&
    isSearchFocused &&
    (isSearching ||
      hasSearched ||
      Boolean(searchError) ||
      searchResults.length > 0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (disabled) {
      setDebouncedSearchText('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchText(value.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [disabled, value]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    let cancelled = false;

    async function searchRows() {
      if (disabled || !isSearchFocused || !targetTable || !tableConfig) {
        setSearchResults([]);
        setSearchFkSummaries({});
        setSearchError(null);
        setIsSearching(false);
        setHasSearched(false);
        return;
      }

      setIsSearching(true);
      setHasSearched(true);
      setSearchError(null);

      try {
        const response = await fetchSearchRows(tableConfig, trimmedSearchText);
        const nextSearchFkSummaries = await fetchFkSummaries(
          fkSummaryColumns,
          response.items
        ).catch(() => ({}));
        if (!cancelled) {
          setSearchResults(response.items);
          setSearchFkSummaries(nextSearchFkSummaries);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setSearchResults([]);
          setSearchFkSummaries({});
          setSearchError(
            caughtError instanceof Error
              ? caughtError.message
              : '검색하지 못했습니다.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }

    searchRows();

    return () => {
      cancelled = true;
    };
  }, [
    disabled,
    fkSummaryColumns,
    isSearchFocused,
    tableConfig,
    targetTable,
    trimmedSearchText,
  ]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!shouldShowDropdown) {
      setDropdownPosition(null);
      return;
    }

    function updateDropdownPosition() {
      if (!searchControlRef.current) {
        return;
      }

      setDropdownPosition(getSearchDropdownPosition(searchControlRef.current));
    }

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);

    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [shouldShowDropdown]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div
      ref={searchControlRef}
      className="relative min-w-0 max-w-[42%] flex-[1_1_42%]"
    >
      <input
        id={inputId}
        type="search"
        value={value}
        disabled={disabled}
        aria-required={required || undefined}
        placeholder={placeholder}
        title={title}
        className={[
          'edit-control h-6 w-full min-w-0 px-1.5 leading-none text-[var(--app-text)] placeholder:text-[var(--app-muted)] outline-none disabled:cursor-default disabled:border-transparent',
          editorTextClassName,
          editorBackgroundClassName,
        ].join(' ')}
        onBlur={() => {
          window.setTimeout(() => setIsSearchFocused(false), 120);
        }}
        onChange={(event) => {
          onValueChange(event.target.value);
          setIsSearchFocused(true);
        }}
        onFocus={() => setIsSearchFocused(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsSearchFocused(false);
            return;
          }

          if (event.key === 'Enter') {
            const firstResult = searchResults[0];
            const firstResultId = firstResult ? getRowId(firstResult) : null;
            if (firstResultId !== null) {
              event.preventDefault();
              handleSelect(firstResultId);
            }
          }
        }}
      />

      {shouldShowDropdown && dropdownPosition
        ? createPortal(
            <div
              className="[&_button]:!no-underline fixed z-[70] overflow-auto rounded-md border border-[var(--app-border)] bg-white py-1 shadow-lg"
              style={{
                left: dropdownPosition.left,
                top: dropdownPosition.top,
                width: dropdownPosition.width,
                maxHeight: dropdownPosition.maxHeight,
              }}
            >
              {isSearching ? (
                <p className="px-2 py-1 text-xs text-[var(--app-muted)]">
                  검색 중입니다.
                </p>
              ) : searchError ? (
                <p className="px-2 py-1 text-xs text-rose-600">
                  {searchError}
                </p>
              ) : searchResults.length > 0 ? (
                searchResults.map((row, index) => {
                  const rowId = getRowId(row);
                  return (
                    <button
                      key={rowId ?? `search-result-${index}`}
                      type="button"
                      title={
                        tableConfig ? formatRowTooltip(tableConfig.columns, row) : ''
                      }
                      disabled={rowId === null}
                      className="block w-full truncate px-2 py-1 text-left leading-tight !no-underline disabled:cursor-not-allowed"
                      onClick={() => {
                        if (rowId !== null) {
                          handleSelect(rowId);
                        }
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      {tableConfig && targetTable && rowId !== null
                        ? getRowDisplayValue(
                            targetTable,
                            row,
                            rowId,
                            searchFkSummaries
                          )
                        : tableConfig
                          ? getSearchResultDisplayValue(
                              tableConfig.columns,
                              row
                            )
                          : formatValue(row.id) ?? '-'}
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-1 text-xs text-[var(--app-muted)]">
                  검색 결과가 없습니다.
                </p>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );

  function handleSelect(id: number) {
    onSelect(id);
    setSearchResults([]);
    setSearchFkSummaries({});
    setSearchError(null);
    setIsSearchFocused(false);
    setHasSearched(false);
  }
}

function fetchSearchRows(tableConfig: FkTableConfig, searchText: string) {
  const trimmedSearchText = searchText.trim();

  return tableConfig.listRows({
    offset: 0,
    limit: trimmedSearchText ? SEARCH_RESULT_LIMIT : EMPTY_SEARCH_RESULT_LIMIT,
    selected_ids: [],
    search_text: trimmedSearchText || null,
    text_filter: {},
    filter: {},
    sort: trimmedSearchText ? null : (['id', 'desc'] as [string, 'desc']),
  });
}
