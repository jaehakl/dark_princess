import { useCallback, useEffect, useState } from 'react';
import { dbTables } from '../../api/api';
import type { PlaySnapshot } from '../../engine';
import { HISTORY_COLUMNS, TARGET_STATUS_COLUMNS } from './columns';
import { InlineEditor } from './InlineEditor';
import type { DbRow, TableConfig } from './types';

export function TargetStatusPanel({
  statusId,
  snapshot,
  onChanged,
}: {
  statusId: number;
  snapshot: PlaySnapshot | null;
  onChanged: () => Promise<void>;
}) {
  const [targets, setTargets] = useState<DbRow[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTargets() {
      const response = await (dbTables.Target as TableConfig).listRows({
        offset: 0,
        limit: 200,
        selected_ids: [],
        search_text: null,
        text_filter: {},
        filter: {},
        sort: ['id', 'asc'],
      });
      if (!cancelled) {
        setTargets(response.items);
      }
    }

    void loadTargets();
    return () => {
      cancelled = true;
    };
  }, []);

  const row =
    snapshot?.target_statuses.find((item) => item.target_id === selectedTargetId) ??
    (selectedTargetId
      ? { status_id: statusId, target_id: selectedTargetId, interactions: {}, visitable: true }
      : null);

  return (
    <div className="space-y-3">
      <label className="grid gap-1 text-sm font-semibold text-[var(--app-muted)]">
        Target
        <select
          value={selectedTargetId ?? ''}
          className="h-10 rounded-md border border-[var(--app-border)] bg-white px-2 text-[var(--app-text)]"
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            setSelectedTargetId(Number.isSafeInteger(nextValue) ? nextValue : null);
          }}
        >
          <option value="">선택</option>
          {targets.map((target) => (
            <option key={String(target.id)} value={String(target.id)}>
              {String(target.name ?? target.id)}
            </option>
          ))}
        </select>
      </label>

      <InlineEditor
        tableName="TargetStatus"
        row={row}
        columns={TARGET_STATUS_COLUMNS}
        emptyText="Target을 선택해 주세요."
        onChanged={onChanged}
      />
    </div>
  );
}

export function SceneHistoryPanel({
  statusId,
  onChanged,
}: {
  statusId: number;
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<DbRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedRow = rows.find((row) => row.id === selectedId) ?? null;

  const loadRows = useCallback(async () => {
    const response = await (dbTables.SceneHistory as TableConfig).listRows({
      offset: 0,
      limit: 200,
      selected_ids: [],
      search_text: null,
      text_filter: {},
      filter: { status_id: [statusId, statusId] },
      sort: ['id', 'desc'],
    });
    setRows(response.items);
  }, [statusId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadRows();
  }, [loadRows]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="space-y-3">
      <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-[var(--app-border)] bg-white p-1">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-[var(--app-muted)]">
            SceneHistory가 없습니다.
          </p>
        ) : (
          rows.map((row) => (
            <button
              key={String(row.id)}
              type="button"
              className={[
                'rounded px-2 py-1.5 text-left text-sm transition',
                row.id === selectedId ? 'bg-[var(--app-accent-soft)]' : 'hover:bg-[var(--app-panel-strong)]',
              ].join(' ')}
              onClick={() => {
                setSelectedId(typeof row.id === 'number' ? row.id : null);
              }}
            >
              #{String(row.id)} · Turn {String(row.turn)} / {String(row.sub_turn)}
            </button>
          ))
        )}
      </div>

      <InlineEditor
        tableName="SceneHistory"
        row={selectedRow}
        columns={HISTORY_COLUMNS}
        emptyText="SceneHistory를 선택해 주세요."
        onChanged={async () => {
          await loadRows();
          await onChanged();
        }}
      />
    </div>
  );
}
