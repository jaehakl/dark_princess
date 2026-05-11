import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { UpsertResponse } from '../../api/api';
import { dbTables } from '../../api/api';
import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import { EditModalShell } from './EditModalShell';
import type { DbRow, DbTableName, TableConfig } from './types';

export function RowEditModal({
  title,
  tableName,
  columns,
  listFilter = {},
  newRow,
  onClose,
  onSaved,
  renderAction,
}: {
  title: string;
  tableName: DbTableName;
  columns: string[];
  listFilter?: Record<string, unknown[]>;
  newRow: DbRow;
  onClose: () => void;
  onSaved: (response: UpsertResponse[]) => Promise<void>;
  renderAction?: (selectedRow: DbRow | null) => ReactNode;
}) {
  const tableConfig = dbTables[tableName] as TableConfig;
  const [rows, setRows] = useState<DbRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<DbRow | null>(newRow);
  const [loading, setLoading] = useState(false);
  const listFilterKey = JSON.stringify(listFilter);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await tableConfig.listRows({
        offset: 0,
        limit: 100,
        selected_ids: [],
        search_text: null,
        text_filter: {},
        filter: JSON.parse(listFilterKey) as Record<string, unknown[]>,
        sort: ['id', 'desc'],
      });
      setRows(response.items);
      return response.items;
    } finally {
      setLoading(false);
    }
  }, [listFilterKey, tableConfig]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadRows();
  }, [loadRows]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <EditModalShell title={title} onClose={onClose}>
      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(13rem,0.5fr)_minmax(0,1fr)]">
        <div className="min-h-0 rounded-md border border-[var(--app-border)] bg-white p-2">
          <button
            type="button"
            className="mb-2 h-9 w-full rounded-md bg-[var(--app-accent-soft)] px-3 text-left"
            onClick={() => setSelectedRow(newRow)}
          >
            새 {tableConfig.label}
          </button>
          <div className="grid max-h-[55vh] gap-1 overflow-y-auto">
            {loading ? (
              <p className="px-2 py-6 text-center text-sm text-[var(--app-muted)]">
                목록을 불러오는 중입니다.
              </p>
            ) : rows.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-[var(--app-muted)]">
                데이터가 없습니다.
              </p>
            ) : (
              rows.map((row) => (
                <button
                  key={String(row.id)}
                  type="button"
                  className={[
                    'rounded px-2 py-1.5 text-left text-sm transition',
                    row.id === selectedRow?.id
                      ? 'bg-[var(--app-accent-soft)]'
                      : 'hover:bg-[var(--app-panel-strong)]',
                  ].join(' ')}
                  onClick={() => setSelectedRow(row)}
                >
                  {String(row.name ?? row.label ?? row.option_key ?? row.id)}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="min-w-0">
          {renderAction ? renderAction(selectedRow) : null}
          {selectedRow ? (
            <DbTableDetailEdit
              tableName={tableName}
              row={selectedRow}
              columns={columns}
              onSaved={async (response) => {
                const savedId = response[0]?.id;
                await onSaved(response);
                const nextRows = await loadRows();
                if (typeof savedId === 'number') {
                  setSelectedRow(
                    nextRows.find((row) => row.id === savedId) ?? {
                      ...selectedRow,
                      id: savedId,
                    }
                  );
                }
              }}
              onDeleted={async () => {
                setSelectedRow(newRow);
                await loadRows();
              }}
            />
          ) : null}
        </div>
      </div>
    </EditModalShell>
  );
}
