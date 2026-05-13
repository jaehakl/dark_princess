import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GetListRequest, UpsertResponse } from '../../api/api';
import { dbTables } from '../../api/api';
import { DbTableDetailEdit } from '../../components/db-table/detail-edit';
import { openFocusedWindow } from '../../utils/openFocusedWindow';
import { EditModalShell } from '../play-edit/EditModalShell';
import type { ConditionTreeRoot } from './ConditionTreeView';
import { ConditionTreeView } from './ConditionTreeView';
import {
  ConditionKindSelect,
  SceneConditionEditor,
} from './SceneConditionEditor';
import {
  type ConditionKind,
  getConditionKind,
  getConditionKindLabel,
  getDefaultConditionOperator,
} from './sceneConditionConfig';

type DbRow = Record<string, unknown>;
type RootTableName = 'SceneTriggerBlock' | 'SceneOption';
type EditorKind = 'trigger' | 'option';
type OwnerKey = 'trigger_block_id' | 'option_id';

type TableConfig = {
  label: string;
  listRows: (request: GetListRequest) => Promise<{ items: DbRow[]; total: number }>;
  upsertRow: (items: unknown) => Promise<UpsertResponse[]>;
  deleteRows: (ids: number[]) => Promise<void>;
};

type RootConfig = {
  tableName: RootTableName;
  ownerKey: OwnerKey;
  title: string;
  rootLabel: string;
  emptyText: string;
  newRootButtonLabel: string;
  rootColumns: string[];
  buildNewRoot: (sceneId: number) => DbRow;
};

type Selection =
  | { type: 'root'; row: DbRow }
  | { type: 'condition'; row: DbRow; ownerId: number }
  | null;

const ROOT_CONFIGS: Record<EditorKind, RootConfig> = {
  trigger: {
    tableName: 'SceneTriggerBlock',
    ownerKey: 'trigger_block_id',
    title: '장면 트리거 편집',
    rootLabel: '트리거 블록',
    emptyText: '트리거 블록이 없습니다.',
    newRootButtonLabel: '새 트리거 블록',
    rootColumns: ['label', 'chance_percent', 'sort_order'],
    buildNewRoot: (sceneId) => ({
      scene_id: sceneId,
      label: '새 트리거 블록',
      chance_percent: 100,
      sort_order: 0,
    }),
  },
  option: {
    tableName: 'SceneOption',
    ownerKey: 'option_id',
    title: '장면 선택지 편집',
    rootLabel: '선택지',
    emptyText: '선택지가 없습니다.',
    newRootButtonLabel: '새 선택지',
    rootColumns: [
      'option_key',
      'label',
      'description',
      'next_scene_id',
      'sort_order',
      'is_active',
    ],
    buildNewRoot: (sceneId) => ({
      scene_id: sceneId,
      option_key: `option_${Date.now()}`,
      label: '새 선택지',
      sort_order: 0,
      is_active: true,
    }),
  },
};

export function SceneTriggerEditorModal({
  sceneId,
  onClose,
}: {
  sceneId: number;
  onClose: () => void;
}) {
  return (
    <SceneConditionTreeModal
      kind="trigger"
      sceneId={sceneId}
      onClose={onClose}
    />
  );
}

export function SceneOptionEditorModal({
  sceneId,
  onClose,
}: {
  sceneId: number;
  onClose: () => void;
}) {
  return (
    <SceneConditionTreeModal
      kind="option"
      sceneId={sceneId}
      onClose={onClose}
    />
  );
}

function SceneConditionTreeModal({
  kind,
  sceneId,
  onClose,
}: {
  kind: EditorKind;
  sceneId: number;
  onClose: () => void;
}) {
  const config = ROOT_CONFIGS[kind];
  const rootTable = dbTables[config.tableName] as TableConfig;
  const conditionTable = dbTables.SceneCondition as TableConfig;
  const [rootRows, setRootRows] = useState<DbRow[]>([]);
  const [conditionRows, setConditionRows] = useState<DbRow[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [conditionKind, setConditionKind] = useState<ConditionKind>('target');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rootResponse = await rootTable.listRows({
        offset: 0,
        limit: null,
        selected_ids: [],
        search_text: null,
        text_filter: {},
        filter: { scene_id: [sceneId, sceneId] },
        sort: ['sort_order', 'asc'],
      });
      const ownerIds = rootResponse.items
        .map((row) => getRowId(row))
        .filter((id): id is number => id !== null);
      const conditionResponses = await Promise.all(
        ownerIds.map((ownerId) =>
          conditionTable.listRows({
            offset: 0,
            limit: null,
            selected_ids: [],
            search_text: null,
            text_filter: {},
            filter: { [config.ownerKey]: [ownerId, ownerId] },
            sort: ['sort_order', 'asc'],
          })
        )
      );
      const nextConditionRows = conditionResponses.flatMap((response) => response.items);

      setRootRows(rootResponse.items);
      setConditionRows(nextConditionRows);

      return {
        rootRows: rootResponse.items,
        conditionRows: nextConditionRows,
      };
    } catch (caughtError) {
      setRootRows([]);
      setConditionRows([]);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '데이터를 불러오지 못했습니다.'
      );
      return { rootRows: [], conditionRows: [] };
    } finally {
      setLoading(false);
    }
  }, [conditionTable, config.ownerKey, rootTable, sceneId]);

  useEffect(() => {
    let cancelled = false;

    async function initializeRows() {
      const nextRows = await loadRows();
      if (cancelled) {
        return;
      }

      setSelection((current) => current ?? buildInitialSelection(nextRows.rootRows));
    }

    void initializeRows();

    return () => {
      cancelled = true;
    };
  }, [loadRows]);

  const treeRoots = useMemo<ConditionTreeRoot[]>(
    () =>
      rootRows.map((rootRow) => {
        const rootId = getRowId(rootRow);
        const children =
          rootId === null
            ? []
            : conditionRows
                .filter((conditionRow) => conditionRow[config.ownerKey] === rootId)
                .map((conditionRow) => ({
                  nodeId: `condition:${String(conditionRow.id)}`,
                  label: formatConditionLabel(conditionRow),
                  description: formatConditionDescription(conditionRow),
                }));

        return {
          nodeId: `root:${String(rootRow.id)}`,
          label: formatRootLabel(rootRow, config),
          description: formatRootDescription(rootRow, config),
          children,
        };
      }),
    [conditionRows, config, rootRows]
  );
  const selectedNodeId = getSelectedNodeId(selection);

  return (
    <EditModalShell title={config.title} onClose={onClose}>
      <div className="grid min-h-[32rem] gap-3 lg:grid-cols-[minmax(15rem,0.55fr)_minmax(0,1fr)]">
        <section className="min-h-0 rounded-md border border-[var(--app-border)] bg-white p-2">
          <button
            type="button"
            className="mb-2 h-9 w-full rounded-md bg-[var(--app-accent-soft)] px-3 text-left"
            onClick={() => setSelection({ type: 'root', row: config.buildNewRoot(sceneId) })}
          >
            {config.newRootButtonLabel}
          </button>

          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--app-muted)]">
              목록을 불러오는 중입니다.
            </p>
          ) : error ? (
            <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : (
            <ConditionTreeView
              roots={treeRoots}
              selectedNodeId={selectedNodeId}
              emptyText={config.emptyText}
              onSelectNode={selectNode}
            />
          )}
        </section>

        <section className="min-w-0">
          {selection?.type === 'root' ? (
            <RootEditor
              config={config}
              row={selection.row}
              conditionKind={conditionKind}
              onConditionKindChange={setConditionKind}
              onAddCondition={addCondition}
              onSaved={handleRootSaved}
              onDeleted={handleRootDeleted}
            />
          ) : selection?.type === 'condition' ? (
            <SceneConditionEditor
              row={selection.row}
              onSaved={handleConditionSaved}
              onDeleted={handleConditionDeleted}
            />
          ) : (
            <p className="rounded-md border border-dashed border-[var(--app-border)] px-4 py-10 text-center text-sm text-[var(--app-muted)]">
              왼쪽에서 항목을 선택해 주세요.
            </p>
          )}
        </section>
      </div>
    </EditModalShell>
  );

  function selectNode(nodeId: string) {
    const [nodeType, rawId] = nodeId.split(':');
    const rowId = Number(rawId);
    if (!Number.isSafeInteger(rowId)) {
      return;
    }

    if (nodeType === 'root') {
      const rootRow = rootRows.find((row) => getRowId(row) === rowId);
      if (rootRow) {
        setSelection({ type: 'root', row: rootRow });
      }
      return;
    }

    const conditionRow = conditionRows.find((row) => getRowId(row) === rowId);
    const ownerId = getOwnerId(conditionRow, config.ownerKey);
    if (conditionRow && ownerId !== null) {
      setSelection({ type: 'condition', row: conditionRow, ownerId });
    }
  }

  function addCondition() {
    if (selection?.type !== 'root') {
      return;
    }

    const ownerId = getRowId(selection.row);
    if (ownerId === null) {
      return;
    }

    const existingCount = conditionRows.filter(
      (conditionRow) => conditionRow[config.ownerKey] === ownerId
    ).length;
    setSelection({
      type: 'condition',
      ownerId,
      row: {
        [config.ownerKey]: ownerId,
        kind: conditionKind,
        operator: getDefaultConditionOperator(conditionKind),
        sort_order: existingCount,
      },
    });
  }

  async function handleRootSaved(response: UpsertResponse[]) {
    const savedId = response[0]?.id;
    const nextRows = await loadRows();
    if (typeof savedId === 'number') {
      const savedRow = nextRows.rootRows.find((row) => getRowId(row) === savedId);
      setSelection(savedRow ? { type: 'root', row: savedRow } : null);
    }
  }

  async function handleRootDeleted() {
    const nextRows = await loadRows();
    setSelection(buildInitialSelection(nextRows.rootRows));
  }

  async function handleConditionSaved(response: UpsertResponse[]) {
    const savedId = response[0]?.id;
    const nextRows = await loadRows();
    if (typeof savedId === 'number') {
      const savedRow = nextRows.conditionRows.find((row) => getRowId(row) === savedId);
      const ownerId = getOwnerId(savedRow, config.ownerKey);
      setSelection(
        savedRow && ownerId !== null
          ? { type: 'condition', row: savedRow, ownerId }
          : null
      );
    }
  }

  async function handleConditionDeleted() {
    const ownerId = selection?.type === 'condition' ? selection.ownerId : null;
    const nextRows = await loadRows();
    const ownerRow =
      ownerId === null
        ? null
        : nextRows.rootRows.find((row) => getRowId(row) === ownerId) ?? null;
    setSelection(ownerRow ? { type: 'root', row: ownerRow } : buildInitialSelection(nextRows.rootRows));
  }
}

function RootEditor({
  config,
  row,
  conditionKind,
  onConditionKindChange,
  onAddCondition,
  onSaved,
  onDeleted,
}: {
  config: RootConfig;
  row: DbRow;
  conditionKind: ConditionKind;
  onConditionKindChange: (kind: ConditionKind) => void;
  onAddCondition: () => void;
  onSaved: (response: UpsertResponse[]) => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}) {
  const rowId = getRowId(row);
  const isOptionEditor = config.tableName === 'SceneOption';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] p-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--app-muted)]">
            조건 추가
          </span>
          <ConditionKindSelect
            value={conditionKind}
            onChange={onConditionKindChange}
          />
          <button
            type="button"
            disabled={rowId === null}
            className="inline-flex h-9 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onAddCondition}
          >
            추가
          </button>
        </div>

        {isOptionEditor && rowId !== null ? (
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md px-3 transition"
            onClick={() => openNextSceneEditor(rowId)}
          >
            다음 장면 추가
          </button>
        ) : null}
      </div>

      <DbTableDetailEdit
        tableName={config.tableName}
        row={row}
        columns={config.rootColumns}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function buildInitialSelection(rootRows: DbRow[]): Selection {
  const firstRoot = rootRows[0] ?? null;
  return firstRoot ? { type: 'root', row: firstRoot } : null;
}

function getSelectedNodeId(selection: Selection) {
  if (!selection) {
    return null;
  }

  const rowId = getRowId(selection.row);
  if (rowId === null) {
    return null;
  }

  return `${selection.type}:${rowId}`;
}

function getRowId(row: DbRow | null | undefined) {
  const id = row?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

function getOwnerId(row: DbRow | null | undefined, ownerKey: OwnerKey) {
  const id = row?.[ownerKey];
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

function formatRootLabel(row: DbRow, config: RootConfig) {
  if (config.tableName === 'SceneOption') {
    return String(row.label ?? row.option_key ?? row.id ?? '새 선택지');
  }

  return String(row.label ?? row.id ?? '새 트리거 블록');
}

function formatRootDescription(row: DbRow, config: RootConfig) {
  const rowId = getRowId(row);
  if (config.tableName === 'SceneOption') {
    const optionKey = typeof row.option_key === 'string' ? row.option_key : null;
    return [rowId === null ? null : `#${rowId}`, optionKey]
      .filter(Boolean)
      .join(' · ');
  }

  const chance = typeof row.chance_percent === 'number' ? `${row.chance_percent}%` : null;
  return [rowId === null ? null : `#${rowId}`, chance].filter(Boolean).join(' · ');
}

function formatConditionLabel(row: DbRow) {
  return getConditionKindLabel(getConditionKind(row.kind));
}

function formatConditionDescription(row: DbRow) {
  const kind = getConditionKind(row.kind);
  const operator = typeof row.operator === 'string' ? row.operator : '-';
  const value =
    kind === 'target'
      ? row.target_id
      : kind === 'status_tag' || kind === 'target_tag'
        ? row.tag_id
        : kind === 'scene_seen'
          ? row.scene_ref_id
          : kind === 'status_stat' || kind === 'target_interaction'
            ? `${String(row.stat_field ?? '-')} ${String(row.numeric_value ?? '-')}`
            : null;

  return `${operator} ${String(value ?? '-')}`;
}

function openNextSceneEditor(optionId: number) {
  const url = new URL('/scene-edit', window.location.origin);
  url.searchParams.set('option_id', String(optionId));
  openFocusedWindow(url.toString());
}
