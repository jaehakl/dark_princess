import { useCallback, useEffect, useState } from 'react';
import { dbTables } from '../../api/api';
import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import type { PlaySnapshot } from '../../engine';
import { SCENE_COLUMNS, TARGET_COLUMNS } from './columns';
import { EditModalShell } from './EditModalShell';
import { RowEditModal } from './RowEditModal';
import type { DbRow, TableConfig } from './types';

export function TargetEditModal({
  statusId,
  snapshot,
  onClose,
  onChanged,
}: {
  statusId: number;
  snapshot: PlaySnapshot | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <RowEditModal
      title="방문처 편집"
      tableName="Target"
      columns={TARGET_COLUMNS}
      newRow={{ type: 'place', name: '새 방문처' }}
      onClose={onClose}
      renderAction={(selectedRow) => (
        <TargetScenePanel
          targetRow={selectedRow}
          onChanged={async () => {
            await onChanged();
          }}
        />
      )}
      onSaved={async (response) => {
        const targetId = response[0]?.id;
        if (typeof targetId !== 'number') {
          return;
        }

        const existing =
          snapshot?.target_statuses.find((item) => item.target_id === targetId) ??
          (
            await (dbTables.TargetStatus as TableConfig).listRows({
              offset: 0,
              limit: 1,
              selected_ids: [],
              search_text: null,
              text_filter: {},
              filter: {
                status_id: [statusId, statusId],
                target_id: [targetId, targetId],
              },
              sort: null,
            })
          ).items[0];

        await (dbTables.TargetStatus as TableConfig).upsertRow([
          {
            ...(existing ?? {
              status_id: statusId,
              target_id: targetId,
              interactions: {},
            }),
            visitable: true,
          },
        ]);
        await onChanged();
      }}
    />
  );
}

function TargetScenePanel({
  targetRow,
  onChanged,
}: {
  targetRow: DbRow | null;
  onChanged: () => Promise<void>;
}) {
  const targetId = typeof targetRow?.id === 'number' ? targetRow.id : null;
  const targetName = typeof targetRow?.name === 'string' ? targetRow.name : '';
  const [scenes, setScenes] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<DbRow | null>(null);
  const [sceneMode, setSceneMode] = useState<'new' | 'edit' | null>(null);

  const loadScenes = useCallback(async () => {
    if (targetId === null) {
      setScenes([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const conditionResponse = await (dbTables.SceneCondition as TableConfig).listRows({
        offset: 0,
        limit: 200,
        selected_ids: [],
        search_text: null,
        text_filter: { kind: ['target'] },
        filter: { target_id: [targetId, targetId] },
        sort: ['id', 'desc'],
      });
      const blockIds = [
        ...new Set(
          conditionResponse.items
            .filter((item) => item.kind === 'target' && typeof item.trigger_block_id === 'number')
            .map((item) => item.trigger_block_id as number)
        ),
      ];
      if (blockIds.length === 0) {
        setScenes([]);
        return;
      }

      const blockResponse = await (dbTables.SceneTriggerBlock as TableConfig).listRows({
        offset: 0,
        limit: null,
        selected_ids: blockIds,
        search_text: null,
        text_filter: {},
        filter: {},
        sort: null,
      });
      const sceneIds = [
        ...new Set(
          blockResponse.items
            .map((item) => item.scene_id)
            .filter((id): id is number => typeof id === 'number')
        ),
      ];
      if (sceneIds.length === 0) {
        setScenes([]);
        return;
      }

      const sceneResponse = await (dbTables.Scene as TableConfig).listRows({
        offset: 0,
        limit: null,
        selected_ids: sceneIds,
        search_text: null,
        text_filter: {},
        filter: {},
        sort: ['priority', 'desc'],
      });
      setScenes(sceneResponse.items);
    } catch (caughtError) {
      setScenes([]);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '방문처 장면을 불러오지 못했습니다.'
      );
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadScenes();
  }, [loadScenes]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <section className="mb-3 rounded-md border border-[var(--app-border)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--app-text)]">
          방문처 장면
        </h3>
        <button
          type="button"
          disabled={targetId === null}
          className="inline-flex h-8 items-center justify-center rounded px-2.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            setEditingScene({
              name: targetName ? `${targetName} 장면` : '새 장면',
              priority: 0,
              repeat_policy: 'once_per_status',
              cooldown_turns: 0,
            });
            setSceneMode('new');
          }}
        >
          새 장면 추가
        </button>
      </div>

      {targetId === null ? (
        <p className="rounded border border-dashed border-[var(--app-border)] px-3 py-4 text-center text-sm text-[var(--app-muted)]">
          Target 저장 후 장면을 추가할 수 있습니다.
        </p>
      ) : error ? (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : loading ? (
        <p className="px-3 py-4 text-center text-sm text-[var(--app-muted)]">
          장면을 불러오는 중입니다.
        </p>
      ) : scenes.length === 0 ? (
        <p className="rounded border border-dashed border-[var(--app-border)] px-3 py-4 text-center text-sm text-[var(--app-muted)]">
          이 Target을 조건으로 하는 장면이 없습니다.
        </p>
      ) : (
        <div className="grid gap-1">
          {scenes.map((scene) => {
            const repeatPolicy =
              typeof scene.repeat_policy === 'string'
                ? dbTables.Scene.columns.repeat_policy.options.find(
                    (option) => option.key === scene.repeat_policy
                  )?.label ?? scene.repeat_policy
                : '-';

            return (
              <button
                key={String(scene.id)}
                type="button"
                className="rounded px-2 py-1.5 text-left text-sm transition hover:bg-[var(--app-panel-strong)]"
                onClick={() => {
                  setEditingScene(scene);
                  setSceneMode('edit');
                }}
              >
                <span className="block truncate font-semibold">
                  {String(scene.name ?? scene.id)}
                </span>
                <span className="block truncate text-xs text-[var(--app-muted)]">
                  priority {String(scene.priority ?? 0)} · {repeatPolicy}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {sceneMode && editingScene && targetId !== null ? (
        <TargetSceneEditModal
          mode={sceneMode}
          targetId={targetId}
          targetName={targetName}
          row={editingScene}
          onClose={() => {
            setSceneMode(null);
            setEditingScene(null);
          }}
          onChanged={async () => {
            await loadScenes();
            await onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

function TargetSceneEditModal({
  mode,
  targetId,
  targetName,
  row,
  onClose,
  onChanged,
}: {
  mode: 'new' | 'edit';
  targetId: number;
  targetName: string;
  row: DbRow;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <EditModalShell title={mode === 'new' ? '방문처 장면 추가' : '방문처 장면 편집'} onClose={onClose}>
      <DbTableDetailEdit
        tableName="Scene"
        row={row}
        columns={SCENE_COLUMNS}
        onSaved={async (response) => {
          const sceneId = response[0]?.id;
          if (mode === 'new' && typeof sceneId === 'number') {
            const blockResponse = await (dbTables.SceneTriggerBlock as TableConfig).upsertRow([
              {
                scene_id: sceneId,
                label: targetName ? `방문처: ${targetName}` : '방문처',
                chance_percent: 100,
                sort_order: 0,
              },
            ]);
            const blockId = blockResponse[0]?.id;
            if (typeof blockId === 'number') {
              await (dbTables.SceneCondition as TableConfig).upsertRow([
                {
                  trigger_block_id: blockId,
                  kind: 'target',
                  operator: 'eq',
                  target_id: targetId,
                  sort_order: 0,
                },
              ]);
            }
          }
          await onChanged();
        }}
        onDeleted={onChanged}
      />
    </EditModalShell>
  );
}
