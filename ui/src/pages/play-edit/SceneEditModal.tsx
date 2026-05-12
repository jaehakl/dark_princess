import { dbTables } from '../../api/api';
import type { PlaySnapshot } from '../../engine';
import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import { SCENE_COLUMNS } from './columns';
import { EditModalShell } from './EditModalShell';
import type { TableConfig } from './types';

export function SceneEditModal({
  mode,
  snapshot,
  onClose,
  onChanged,
}: {
  mode: 'new' | 'edit';
  snapshot: PlaySnapshot | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const row =
    mode === 'edit'
      ? snapshot?.scene ?? null
      : {
          name: '새 장면',
          priority: 0,
          repeat_policy: 'once_per_status',
          cooldown_turns: 0,
        };
  const currentTargetId = snapshot?.target_status?.target_id;

  return (
    <EditModalShell title={mode === 'edit' ? '현재 장면 편집' : '새 장면 추가'} onClose={onClose}>
      {row ? (
        <DbTableDetailEdit
          tableName="Scene"
          row={row}
          columns={SCENE_COLUMNS}
          onSaved={async (response) => {
            const sceneId = response[0]?.id;
            if (mode === 'new' && typeof sceneId === 'number' && typeof currentTargetId === 'number') {
              const blockResponse = await (dbTables.SceneTriggerBlock as TableConfig).upsertRow([
                { scene_id: sceneId, label: '현재 방문처', sort_order: 0 },
              ]);
              const blockId = blockResponse[0]?.id;
              if (typeof blockId === 'number') {
                await (dbTables.SceneCondition as TableConfig).upsertRow([
                  {
                    trigger_block_id: blockId,
                    kind: 'target',
                    operator: 'eq',
                    target_id: currentTargetId,
                    sort_order: 0,
                  },
                ]);
              }
            }
            await onChanged();
          }}
          onDeleted={onChanged}
        />
      ) : (
        <p className="py-10 text-center text-sm text-[var(--app-muted)]">
          현재 장면이 없습니다.
        </p>
      )}
    </EditModalShell>
  );
}
