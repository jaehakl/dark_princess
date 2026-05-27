import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dbTables } from '../../api/api';
import type { PlaySnapshot } from '../../engine';
import { openFocusedWindow } from '../../utils/openFocusedWindow';
import { TARGET_COLUMNS } from './columns';
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
      renderAction={(selectedRow) => <TargetScenePanel targetRow={selectedRow} />}
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
}: {
  targetRow: DbRow | null;
}) {
  const targetId = typeof targetRow?.id === 'number' ? targetRow.id : null;
  const [scenes, setScenes] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetSceneCreatePath =
    targetId === null
      ? null
      : `/scene-edit?target_id=${encodeURIComponent(String(targetId))}`;

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
        {targetId === null ? (
          <button
            type="button"
            disabled
            className="inline-flex h-8 items-center justify-center rounded px-2.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            새 장면 추가
          </button>
        ) : (
          <Link
            to={targetSceneCreatePath ?? '/scene-edit'}
            className="inline-flex h-8 items-center justify-center rounded px-2.5 text-xs font-semibold transition"
            onClick={(event) => {
              event.preventDefault();
              if (targetSceneCreatePath) {
                openFocusedWindow(targetSceneCreatePath);
              }
            }}
          >
            새 장면 추가
          </Link>
        )}
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
            const sceneEditPath = `/scene-edit?scene_id=${encodeURIComponent(String(scene.id))}`;
            const repeatPolicy =
              typeof scene.repeat_policy === 'string'
                ? dbTables.Scene.columns.repeat_policy.options.find(
                    (option) => option.key === scene.repeat_policy
                  )?.label ?? scene.repeat_policy
                : '-';

            return (
              <Link
                key={String(scene.id)}
                className="rounded px-2 py-1.5 text-left text-sm transition hover:bg-[var(--app-panel-strong)]"
                to={sceneEditPath}
                onClick={(event) => {
                  event.preventDefault();
                  openFocusedWindow(sceneEditPath);
                }}
              >
                <span className="block truncate font-semibold">
                  {String(scene.name ?? scene.id)}
                </span>
                <span className="block truncate text-xs text-[var(--app-muted)]">
                  priority {String(scene.priority ?? 0)} · {repeatPolicy}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
