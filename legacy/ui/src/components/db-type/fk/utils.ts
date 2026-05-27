import { dbTables } from '../../../api/api';
import {
  formatLocalDateTimeLabel,
  getCurrentDateTimeIsoFloor30,
} from '../../../utils/datetime';
import { SEARCH_DROPDOWN_MAX_HEIGHT } from './constants';
import type {
  DbColumn,
  DbRow,
  DbTableName,
  DbTypeFkEditMode,
  FkTableConfig,
} from './types';

export function buildInitialDraftRow(
  requiredColumns: [string, DbColumn][],
  initialTextValue: string,
  ownerFkColumns: [string, DbColumn][] = [],
  currentRowId: number | null = null
) {
  const trimmedTextValue = initialTextValue.trim();
  const ownerValues =
    typeof currentRowId === 'number'
      ? ownerFkColumns.map(([key]) => [key, currentRowId])
      : [];
  const optionValues = requiredColumns
    .filter(([, config]) => config.type === 'text' && config.options?.[0])
    .map(([key, config]) => [key, config.options?.[0]?.key]);
  const textValues = trimmedTextValue
    ? requiredColumns
        .filter(([, config]) => config.type === 'text' && !config.options)
        .map(([key]) => [key, trimmedTextValue])
    : [];
  const requiredDatetimeDefault = getCurrentDateTimeIsoFloor30();
  const datetimeValues = requiredColumns
    .filter(([, config]) => config.type === 'datetime')
    .map(([key]) => [key, requiredDatetimeDefault]);

  return Object.fromEntries([...ownerValues, ...optionValues, ...textValues, ...datetimeValues]);
}

export function isOwnerFkColumn(
  config: DbColumn,
  currentTableName: DbTableName | undefined
) {
  return (
    config.type === 'fk' &&
    Boolean(currentTableName) &&
    config.targetTable === currentTableName
  );
}

export function findOwnerFkColumns(
  columns: Record<string, DbColumn>,
  currentTableName: DbTableName | undefined
) {
  return Object.entries(columns).filter(([, config]) =>
    isOwnerFkColumn(config, currentTableName)
  );
}

export function getRowDisplayValue(
  tableName: DbTableName,
  row: DbRow,
  fallbackId: number,
  fkSummaries: Record<string, Record<string, string>>
) {
  const tableConfig = dbTables[tableName] as FkTableConfig;

  return (
    findRequiredTextValue(tableConfig.columns, row) ??
    findForeignSummaryValue(tableConfig.columns, row, fkSummaries) ??
    findDatetimeValue(tableConfig.columns, row) ??
    formatValue(row.id) ??
    String(fallbackId)
  );
}

function findForeignSummaryValue(
  columns: Record<string, DbColumn>,
  row: DbRow,
  fkSummaries: Record<string, Record<string, string>>
) {
  const fkColumns = Object.entries(columns)
    .map(([key, config], index) => ({ key, config, index }))
    .filter(
      (
        column
      ): column is {
        key: string;
        config: DbColumn & { targetTable: DbTableName };
        index: number;
      } => column.config.type === 'fk' && Boolean(column.config.targetTable)
    )
    .sort(
      (left, right) =>
        Number(Boolean(right.config.required)) -
          Number(Boolean(left.config.required)) ||
        left.index - right.index
    );

  for (const { key } of fkColumns) {
    const relatedId = row[key];
    if (typeof relatedId !== 'number') {
      continue;
    }

    const relatedSummary = fkSummaries[key]?.[String(relatedId)];
    if (relatedSummary) {
      return relatedSummary;
    }
  }

  return null;
}

export async function fetchRows(tableName: DbTableName, ids: number[]) {
  const tableConfig = dbTables[tableName] as FkTableConfig;
  const response = await tableConfig.listRows({
    offset: 0,
    limit: null,
    selected_ids: ids,
    search_text: null,
    text_filter: {},
    filter: {},
    sort: null,
  });
  const rowsById = Object.fromEntries(
    response.items.flatMap((item) => {
      const itemId = getRowId(item);
      return itemId === null ? [] : [[String(itemId), item]];
    })
  );

  return ids.map((id) => rowsById[String(id)] ?? { id });
}

export async function fetchFkSummaries(
  fkColumns: [string, DbColumn][],
  rows: DbRow[]
) {
  const summaryEntries = await Promise.all(
    fkColumns.flatMap(([key, config]) => {
      if (config.type !== 'fk' || !config.targetTable) {
        return [];
      }

      const ids = rows
        .map((row) => row[key])
        .filter((id): id is number => typeof id === 'number');
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return [];
      }

      return [
        fetchRows(config.targetTable, uniqueIds).then((summaryRows) => {
          const targetTable = dbTables[
            config.targetTable as DbTableName
          ] as FkTableConfig;
          return [
            key,
            Object.fromEntries(
              uniqueIds.map((id, index) => [
                String(id),
                getSearchResultDisplayValue(
                  targetTable.columns,
                  summaryRows[index] ?? { id }
                ),
              ])
            ),
          ] as const;
        }),
      ];
    })
  );

  return Object.fromEntries(summaryEntries);
}

export function getSearchResultDisplayValue(
  columns: Record<string, DbColumn>,
  row: DbRow
) {
  return (
    findRequiredTextValue(columns, row) ??
    findDatetimeValue(columns, row) ??
    formatValue(row.id) ??
    '-'
  );
}

export function formatRowTooltip(
  columns: Record<string, DbColumn>,
  row: DbRow
) {
  return Object.entries(columns)
    .filter(([, config]) => config.required && config.type === 'text')
    .map(([key, config]) => formatColumnValue(config, row[key]) ?? '')
    .filter(Boolean)
    .join('\n');
}

export function getSearchDropdownPosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(8, Math.min(rect.left, viewportWidth - 8));
  const width = Math.min(Math.max(160, rect.width), viewportWidth - left - 8);
  const topBelow = rect.bottom + 2;
  const availableBelow = viewportHeight - topBelow - 8;
  const availableAbove = rect.top - 8;

  if (availableBelow < 96 && availableAbove > availableBelow) {
    const maxHeight = Math.min(SEARCH_DROPDOWN_MAX_HEIGHT, availableAbove);
    return {
      left,
      top: Math.max(8, rect.top - maxHeight - 2),
      width,
      maxHeight,
    };
  }

  return {
    left,
    top: topBelow,
    width,
    maxHeight: Math.min(
      SEARCH_DROPDOWN_MAX_HEIGHT,
      Math.max(80, availableBelow)
    ),
  };
}

export function formatSelectedDisplayValue({
  mode,
  selectedIds,
  selectedLabels,
  isLoading,
}: {
  mode: DbTypeFkEditMode;
  selectedIds: number[];
  selectedLabels: string[];
  isLoading: boolean;
}) {
  if (selectedIds.length === 0) {
    return '-';
  }

  if (isLoading && selectedLabels.length === 0) {
    return '불러오는 중';
  }

  const labels =
    selectedLabels.length > 0
      ? selectedLabels
      : selectedIds.map((id) => String(id));

  if (mode === 'single' || labels.length === 1) {
    return labels[0] ?? '-';
  }

  return `${labels[0]} 외 ${labels.length - 1} 개`;
}

export function formatExpandedCellValue(
  config: DbColumn,
  value: unknown,
  fkSummaries?: Record<string, string>
) {
  if (config.type === 'fk' && typeof value === 'number') {
    return fkSummaries?.[String(value)] ?? String(value);
  }

  if (config.type === 'text' && config.options) {
    return formatColumnValue(config, value) ?? '-';
  }

  if (config.type === 'datetime') {
    return formatDatetimeValue(value) ?? '-';
  }

  if (Array.isArray(value)) {
    return `${value.length}개`;
  }

  return formatValue(value) ?? '-';
}

function findRequiredTextValue(columns: Record<string, DbColumn>, row: DbRow) {
  const textColumn = Object.entries(columns).find(
    ([, config]) => config.required && config.type === 'text'
  );

  return textColumn ? formatColumnValue(textColumn[1], row[textColumn[0]]) : null;
}

function findDatetimeValue(columns: Record<string, DbColumn>, row: DbRow) {
  const datetimeColumn = Object.entries(columns).find(
    ([, config]) => config.type === 'datetime'
  );

  return datetimeColumn ? formatDatetimeValue(row[datetimeColumn[0]]) : null;
}

export function hasRequiredValue(value: unknown, columnType: string) {
  if (columnType === 'text' || columnType === 'datetime' || columnType === 'url') {
    return typeof value === 'string' && Boolean(value.trim());
  }

  if (columnType === 'fk' || columnType === 'int' || columnType === 'float') {
    return typeof value === 'number' && Number.isFinite(value);
  }

  return value !== null && value !== undefined && value !== '';
}

export function isSupportedRequiredColumn(column: DbColumn) {
  return ['text', 'datetime', 'fk', 'int', 'float', 'url'].includes(column.type);
}

export function getSingleIds(value: unknown) {
  return typeof value === 'number' ? [value] : [];
}

export function getListIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<number>();
  return value.filter((item): item is number => {
    if (typeof item !== 'number' || seenIds.has(item)) {
      return false;
    }

    seenIds.add(item);
    return true;
  });
}

export function getRowId(row: DbRow) {
  return typeof row.id === 'number' ? row.id : null;
}

function formatDatetimeValue(value: unknown) {
  const formattedValue = formatLocalDateTimeLabel(value, { fallback: '' });
  return formattedValue || null;
}

export function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value).trim() || null;
}

function formatColumnValue(config: DbColumn, value: unknown) {
  if (typeof value === 'string' && config.options) {
    return config.options.find((option) => option.key === value)?.label ?? value;
  }

  return formatValue(value);
}
