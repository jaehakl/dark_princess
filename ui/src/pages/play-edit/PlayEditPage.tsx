import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { GetListRequest, UpsertResponse } from '../../api/api';
import {
  choosePlayOption,
  dbTables,
  getPlaySnapshot,
  selectPlayTarget,
  type PlaySnapshot,
} from '../../api/api';
import type { LayoutOutletContext } from '../../app/layout';
import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import { DbTableListSelect } from '../../components/db-table/list-select';

type DbRow = Record<string, unknown>;
type DbTableName = keyof typeof dbTables;

type TableConfig = {
  label: string;
  listRows: (request: GetListRequest) => Promise<{ items: DbRow[]; total: number }>;
  upsertRow: (items: unknown) => Promise<UpsertResponse[]>;
};

const STATUS_COLUMNS = [
  'name',
  'turn',
  'sub_turn',
  'cash',
  'strength',
  'agility',
  'intelligence',
  'sense',
  'attractiveness',
  'toughness',
  'stress',
];
const TARGET_COLUMNS = ['type', 'name', 'description', 'properties', 'image'];
const SCENE_COLUMNS = [
  'name',
  'description',
  'prompt',
  'priority',
  'repeat_policy',
  'cooldown_turns',
  'image',
  'audio',
];
const OPTION_COLUMNS = [
  'scene_id',
  'option_key',
  'label',
  'description',
  'next_scene_id',
  'sort_order',
  'is_active',
  'conditions',
];
const TARGET_STATUS_COLUMNS = [
  'status_id',
  'target_id',
  'interactions',
  'visitable',
  'target_status_tags',
];
const HISTORY_COLUMNS = [
  'status_id',
  'scene_id',
  'target_status_id',
  'turn',
  'sub_turn',
  'scene_decisions',
  'applied_results',
];

export function PlayEditPage() {
  const { setPageChrome, setQuickAddAction } =
    useOutletContext<LayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusId = Number(searchParams.get('status_id'));
  const resolvedStatusId = Number.isSafeInteger(statusId) && statusId > 0 ? statusId : null;
  const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'target' | 'history'>('status');
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [sceneModalMode, setSceneModalMode] = useState<'new' | 'edit' | null>(null);
  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [newOptionKey, setNewOptionKey] = useState('option_new');

  const refresh = useCallback(async () => {
    if (resolvedStatusId === null) {
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getPlaySnapshot(resolvedStatusId));
    } catch (caughtError) {
      setSnapshot(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '플레이 정보를 불러오지 못했습니다.'
      );
    } finally {
      setLoading(false);
    }
  }, [resolvedStatusId]);

  useEffect(() => {
    setPageChrome({
      breadcrumbSuffix: 'Play+Edit',
      pageTitleSuffix: 'Play+Edit',
    });
    setQuickAddAction(null);

    return () => {
      setPageChrome(null);
      setQuickAddAction(null);
    };
  }, [setPageChrome, setQuickAddAction]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (resolvedStatusId === null) {
    return (
      <StatusStart
        onStatusSelected={(nextStatusId) => {
          const nextSearchParams = new URLSearchParams(searchParams);
          nextSearchParams.set('status_id', String(nextStatusId));
          setSearchParams(nextSearchParams);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-2 shadow-sm">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition"
          onClick={() => setTargetModalOpen(true)}
        >
          방문처 추가
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition"
          onClick={() => setSceneModalMode('new')}
        >
          새 장면 추가
        </button>
        <button
          type="button"
          disabled={!snapshot?.scene}
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => setSceneModalMode('edit')}
        >
          현재 장면 편집
        </button>
        <button
          type="button"
          disabled={!snapshot?.scene}
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => {
            setNewOptionKey(`option_${Date.now()}`);
            setOptionModalOpen(true);
          }}
        >
          선택지 추가
        </button>
        <button
          type="button"
          className="ml-auto inline-flex h-10 items-center justify-center rounded-md px-3 transition"
          onClick={() => void refresh()}
        >
          새로고침
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.85fr)]">
        <section className="min-h-[32rem] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm">
          <ScenePlayPanel
            snapshot={snapshot}
            loading={loading}
            busy={busy}
            onSelectTarget={async (targetStatusId) => {
              setBusy(true);
              setError(null);
              try {
                setSnapshot(await selectPlayTarget(resolvedStatusId, targetStatusId));
              } catch (caughtError) {
                setError(
                  caughtError instanceof Error
                    ? caughtError.message
                    : '방문처를 선택하지 못했습니다.'
                );
              } finally {
                setBusy(false);
              }
            }}
            onChooseOption={async (optionId) => {
              const historyId = snapshot?.scene_history?.id;
              if (typeof historyId !== 'number') {
                return;
              }

              setBusy(true);
              setError(null);
              try {
                setSnapshot(await choosePlayOption(resolvedStatusId, historyId, optionId));
              } catch (caughtError) {
                setError(
                  caughtError instanceof Error
                    ? caughtError.message
                    : '선택지를 적용하지 못했습니다.'
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </section>

        <section className="min-h-[32rem] rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm">
          <div className="flex border-b border-[var(--app-border)]">
            {[
              ['status', 'Status'],
              ['target', 'TargetStatus'],
              ['history', 'SceneHistory'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={[
                  'h-11 flex-1 border-b-2 px-3 transition',
                  activeTab === key
                    ? 'border-[var(--app-accent)] text-[var(--app-accent)]'
                    : 'border-transparent text-[var(--app-muted)]',
                ].join(' ')}
                onClick={() => setActiveTab(key as 'status' | 'target' | 'history')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-3">
            {activeTab === 'status' ? (
              <InlineEditor
                tableName="Status"
                row={snapshot?.status ?? null}
                columns={STATUS_COLUMNS}
                emptyText="Status를 불러오는 중입니다."
                onChanged={refresh}
              />
            ) : activeTab === 'target' ? (
              <TargetStatusPanel
                statusId={resolvedStatusId}
                snapshot={snapshot}
                onChanged={refresh}
              />
            ) : (
              <SceneHistoryPanel statusId={resolvedStatusId} onChanged={refresh} />
            )}
          </div>
        </section>
      </div>

      {targetModalOpen ? (
        <TargetEditModal
          statusId={resolvedStatusId}
          snapshot={snapshot}
          onClose={() => setTargetModalOpen(false)}
          onChanged={async () => {
            await refresh();
          }}
        />
      ) : null}

      {sceneModalMode ? (
        <SceneEditModal
          mode={sceneModalMode}
          snapshot={snapshot}
          onClose={() => setSceneModalMode(null)}
          onChanged={async () => {
            await refresh();
            setSceneModalMode(null);
          }}
        />
      ) : null}

      {optionModalOpen && snapshot?.scene ? (
        <RowEditModal
          title="선택지 편집"
          tableName="SceneOption"
          columns={OPTION_COLUMNS}
          listFilter={{ scene_id: [snapshot.scene.id, snapshot.scene.id] }}
          newRow={{
            scene_id: snapshot.scene.id,
            option_key: newOptionKey,
            label: '새 선택지',
            sort_order: 0,
            is_active: true,
          }}
          onClose={() => setOptionModalOpen(false)}
          onSaved={async () => {
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function StatusStart({ onStatusSelected }: { onStatusSelected: (statusId: number) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
      <section className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3 shadow-sm">
        <h1 className="mb-3 text-base font-semibold text-[var(--app-text)]">
          불러올 Status
        </h1>
        <DbTableListSelect
          tableName="Status"
          columns={['name', 'turn', 'sub_turn']}
          onSelectedIdsChange={(selectedIds) => {
            const nextStatusId = selectedIds[0];
            if (typeof nextStatusId === 'number') {
              onStatusSelected(nextStatusId);
            }
          }}
          showPageSizeSelect={false}
          emptyMessage="저장된 Status가 없습니다."
        />
      </section>

      <section className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-[var(--app-text)]">
          새 Status
        </h2>
        <DbTableDetailEdit
          tableName="Status"
          row={{ name: '새 게임', turn: 0, sub_turn: 0 }}
          columns={STATUS_COLUMNS}
          onSaved={(response) => {
            const savedId = response[0]?.id;
            if (typeof savedId === 'number') {
              onStatusSelected(savedId);
            }
          }}
        />
      </section>
    </div>
  );
}

function ScenePlayPanel({
  snapshot,
  loading,
  busy,
  onSelectTarget,
  onChooseOption,
}: {
  snapshot: PlaySnapshot | null;
  loading: boolean;
  busy: boolean;
  onSelectTarget: (targetStatusId: number) => Promise<void>;
  onChooseOption: (optionId: number) => Promise<void>;
}) {
  if (loading && !snapshot) {
    return (
      <div className="flex h-full min-h-[32rem] items-center justify-center text-[var(--app-muted)]">
        플레이 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex h-full min-h-[32rem] items-center justify-center text-[var(--app-muted)]">
        Status를 선택해 주세요.
      </div>
    );
  }

  if (!snapshot.scene) {
    return (
      <div className="flex h-full min-h-[32rem] flex-col">
        <div className="border-b border-[var(--app-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--app-text)]">
            방문처 선택
          </h2>
          <p className="mt-1 text-sm text-[var(--app-muted)]">
            Turn {String(snapshot.status.turn ?? 0)}
          </p>
        </div>
        <div className="grid flex-1 auto-rows-min gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {snapshot.target_statuses.length === 0 ? (
            <div className="col-span-full rounded-md border border-dashed border-[var(--app-border)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
              TargetStatus가 없습니다. 방문처 추가로 현재 Status에 대상을 연결하세요.
            </div>
          ) : (
            snapshot.target_statuses.map((targetStatus) => {
              const target = targetStatus.target ?? {};
              const name = typeof target.name === 'string' ? target.name : `Target #${targetStatus.target_id}`;
              const image = typeof target.image === 'string' ? target.image : null;
              const description = typeof target.description === 'string' ? target.description : '';
              const visitable = targetStatus.visitable === true;

              return (
                <button
                  key={String(targetStatus.id)}
                  type="button"
                  disabled={!visitable || busy || typeof targetStatus.id !== 'number'}
                  className={[
                    'overflow-hidden rounded-md border text-left transition disabled:cursor-not-allowed',
                    visitable
                      ? 'border-[var(--app-border)] bg-white hover:border-[var(--app-accent)]'
                      : 'border-[var(--app-border)] bg-[var(--app-panel-strong)] opacity-60',
                  ].join(' ')}
                  onClick={() => {
                    if (typeof targetStatus.id === 'number') {
                      void onSelectTarget(targetStatus.id);
                    }
                  }}
                >
                  {image ? (
                    <img src={image} alt="" className="h-36 w-full object-cover" />
                  ) : (
                    <div className="h-24 bg-[var(--app-panel-strong)]" />
                  )}
                  <div className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{name}</span>
                      <span className="shrink-0 text-xs text-[var(--app-muted)]">
                        {visitable ? '방문 가능' : '비활성'}
                      </span>
                    </div>
                    {description ? (
                      <p className="line-clamp-2 text-sm font-normal text-[var(--app-muted)]">
                        {description}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  const sceneImage = typeof snapshot.scene.image === 'string' ? snapshot.scene.image : null;
  const sceneDescription =
    typeof snapshot.scene.description === 'string' ? snapshot.scene.description : '';

  return (
    <div className="flex h-full min-h-[32rem] flex-col">
      <div className="relative min-h-[22rem] flex-1 overflow-hidden bg-slate-950">
        {sceneImage ? (
          <img src={sceneImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[var(--app-panel-strong)]" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 to-transparent p-5">
          <h2 className="text-xl font-semibold text-white">
            {String(snapshot.scene.name ?? '장면')}
          </h2>
          {sceneDescription ? (
            <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-white">
              {sceneDescription}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 border-t border-[var(--app-border)] bg-white p-3">
        {snapshot.scene_options.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--app-border)] px-3 py-4 text-center text-sm text-[var(--app-muted)]">
            선택지가 없습니다.
          </p>
        ) : (
          snapshot.scene_options.map((option) => (
            <button
              key={String(option.id)}
              type="button"
              disabled={busy || typeof option.id !== 'number'}
              className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-left transition hover:border-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (typeof option.id === 'number') {
                  void onChooseOption(option.id);
                }
              }}
            >
              <span className="block font-semibold">{String(option.label ?? option.option_key ?? '선택지')}</span>
              {typeof option.description === 'string' && option.description ? (
                <span className="mt-1 block text-sm font-normal text-[var(--app-muted)]">
                  {option.description}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function InlineEditor({
  tableName,
  row,
  columns,
  emptyText,
  onChanged,
}: {
  tableName: DbTableName;
  row: DbRow | null;
  columns: string[];
  emptyText: string;
  onChanged: () => Promise<void>;
}) {
  if (!row) {
    return <p className="py-10 text-center text-sm text-[var(--app-muted)]">{emptyText}</p>;
  }

  return (
    <DbTableDetailEdit
      tableName={tableName}
      row={row}
      columns={columns}
      onSaved={() => void onChanged()}
      onDeleted={() => void onChanged()}
    />
  );
}

function TargetStatusPanel({
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

function SceneHistoryPanel({
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

function TargetEditModal({
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

function SceneEditModal({
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

function RowEditModal({
  title,
  tableName,
  columns,
  listFilter = {},
  newRow,
  onClose,
  onSaved,
}: {
  title: string;
  tableName: DbTableName;
  columns: string[];
  listFilter?: Record<string, unknown[]>;
  newRow: DbRow;
  onClose: () => void;
  onSaved: (response: UpsertResponse[]) => Promise<void>;
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
          {selectedRow ? (
            <DbTableDetailEdit
              tableName={tableName}
              row={selectedRow}
              columns={columns}
              onSaved={async (response) => {
                await onSaved(response);
                await loadRows();
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

function EditModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <button
        type="button"
        aria-label="닫기"
        className="modal-backdrop absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <section className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
          <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md px-3 transition"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </section>
    </div>
  );
}
