import { FkEditLink } from './FkEditLink';
import type {
  DbColumn,
  DbRow,
  DbTableName,
  EditingCell,
  FkTableConfig,
  LinkTypeCapabilities,
} from './types';
import {
  formatExpandedCellValue,
  getRowId,
  isSupportedRequiredColumn,
} from './utils';

export function SelectedRowsTable({
  targetTable,
  tableConfig,
  requiredColumns,
  selectedIds,
  selectedRows,
  fkSummaries,
  isLoading,
  error,
  linkTypeCapabilities,
  linkTypeTitle,
  canRemoveSelectedRow,
  canEditTargetRequiredFields,
  textClassName,
  onEdit,
  onRemove,
}: {
  targetTable: DbTableName;
  tableConfig: FkTableConfig;
  requiredColumns: [string, DbColumn][];
  selectedIds: number[];
  selectedRows: DbRow[];
  fkSummaries: Record<string, Record<string, string>>;
  isLoading: boolean;
  error: string | null;
  linkTypeCapabilities: LinkTypeCapabilities;
  linkTypeTitle: string;
  canRemoveSelectedRow: boolean;
  canEditTargetRequiredFields: boolean;
  textClassName: string;
  onEdit: (editingCell: Exclude<EditingCell, null>) => void;
  onRemove: (row: DbRow, id: number) => void;
}) {
  const relationDisabledTitle = `${linkTypeTitle} / 관계 편집 불가`;
  const rowsById = Object.fromEntries(
    selectedRows.flatMap((row) => {
      const rowId = getRowId(row);
      return rowId === null ? [] : [[String(rowId), row]];
    })
  );
  const rows = selectedIds.map((id) => rowsById[String(id)] ?? { id });

  if (selectedIds.length === 0) {
    return (
      <p
        className={[
          'rounded border border-[var(--app-border)] px-2 py-1.5 text-[var(--app-muted)]',
          linkTypeCapabilities.usesLinkedSurface
            ? 'bg-transparent'
            : 'bg-[var(--app-panel)]',
          textClassName,
        ].join(' ')}
      >
        선택된 항목이 없습니다.
      </p>
    );
  }

  if (isLoading && selectedRows.length === 0) {
    return (
      <p
        className={[
          'rounded border border-[var(--app-border)] px-2 py-1.5 text-[var(--app-muted)]',
          linkTypeCapabilities.usesLinkedSurface
            ? 'bg-transparent'
            : 'bg-[var(--app-panel)]',
          textClassName,
        ].join(' ')}
      >
        선택된 항목을 불러오는 중입니다.
      </p>
    );
  }

  if (error) {
    return (
      <p
        className={[
          'rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-700',
          textClassName,
        ].join(' ')}
      >
        {error}
      </p>
    );
  }

  return (
    <div
      className={[
        'max-w-full overflow-x-auto rounded border border-[var(--app-border)]',
        linkTypeCapabilities.usesLinkedSurface
          ? 'bg-transparent'
          : 'bg-[var(--app-panel)]',
      ].join(' ')}
    >
      <table className="min-w-full border-collapse">
        <thead
          className={
            linkTypeCapabilities.usesLinkedSurface
              ? 'bg-transparent'
              : 'bg-[var(--app-panel-strong)]'
          }
        >
          <tr>
            <th
              scope="col"
              className={[
                'w-7 border-b border-[var(--app-border)] px-1 py-1 text-left font-semibold leading-tight text-[var(--app-muted)]',
                textClassName,
              ].join(' ')}
            />
            {requiredColumns.length > 0 ? (
              requiredColumns.map(([, config]) => (
                <th
                  key={`${tableConfig.label}-${config.label}`}
                  scope="col"
                  className={[
                    'border-b border-[var(--app-border)] px-2 py-1 text-left font-semibold leading-tight text-[var(--app-muted)]',
                    textClassName,
                  ].join(' ')}
                >
                  {config.label}
                </th>
              ))
            ) : (
              <th
                className={[
                  'border-b border-[var(--app-border)] px-2 py-1 text-left font-semibold leading-tight text-[var(--app-muted)]',
                  textClassName,
                ].join(' ')}
              >
                ID
              </th>
            )}
            <th
              scope="col"
              className={[
                'w-8 border-b border-[var(--app-border)] px-1 py-1 text-right font-semibold leading-tight text-[var(--app-muted)]',
                textClassName,
              ].join(' ')}
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowId = getRowId(row) ?? selectedIds[rowIndex];
            return (
              <tr
                key={`selected-${rowId}-${rowIndex}`}
                className="border-b border-[var(--app-border)] last:border-b-0"
              >
                <td className="px-1 py-1 text-left">
                  <FkEditLink tableName={targetTable} rowId={rowId} />
                </td>
                {requiredColumns.length > 0 ? (
                  requiredColumns.map(([key, config]) => (
                    <td
                      key={`selected-${rowId}-${key}`}
                      className={[
                        'max-w-[14rem] px-2 py-1 leading-tight text-[var(--app-text)]',
                        textClassName,
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        disabled={
                          !canEditTargetRequiredFields ||
                          !isSupportedRequiredColumn(config)
                        }
                        title={
                          isSupportedRequiredColumn(config)
                            ? `${config.label} 수정`
                            : '지원하지 않는 타입'
                        }
                        className="block w-full truncate rounded px-1 py-0.5 text-left !no-underline transition disabled:cursor-default"
                        onClick={() =>
                          onEdit({
                            row,
                            columnKey: key,
                            config,
                          })
                        }
                      >
                        {formatExpandedCellValue(
                          config,
                          row[key],
                          fkSummaries[key]
                        )}
                      </button>
                    </td>
                  ))
                ) : (
                  <td
                    className={[
                      'px-2 py-1 leading-tight text-[var(--app-text)]',
                      textClassName,
                    ].join(' ')}
                  >
                    {rowId}
                  </td>
                )}
                <td className="px-1 py-1 text-right">
                  <button
                    type="button"
                    disabled={!canRemoveSelectedRow}
                    aria-label={`${rowId} 제거`}
                    title={
                      canRemoveSelectedRow
                        ? `${linkTypeTitle} / 제거`
                        : relationDisabledTitle
                    }
                    className="inline-flex h-5 w-5 items-center justify-center rounded !no-underline transition disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => onRemove(row, rowId)}
                  >
                    x
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
