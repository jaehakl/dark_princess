import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GetListRequest,
  GetListResponse,
  UpsertResponse,
} from '../../../api/api';
import { dbTables } from '../../../api/api';
import { formatLocalDateTimeLabel } from '../../../utils/datetime';
import { DbTypeDatetimeEdit } from '../datetime';
import { DbTypeDictListEdit } from '../dict-list';
import { DbTypeFkEdit } from '../fk';
import { DbTypeImageFileEdit } from '../image-file';
import { DbTypeNumberEdit } from '../number';
import { DbTypeTextEdit } from '../text';
import { DbTypeUrlEdit } from '../url';
import { useChildrenImagePreviewUrl } from './useChildrenImagePreviewUrl';

type DbTableName = keyof typeof dbTables;
type DbRow = Record<string, unknown>;
type LinkType = 'children' | 'computed' | 'secondary';

type DbColumn = {
  label: string;
  type: string;
  targetTable?: DbTableName;
  required?: boolean;
  linkType?: LinkType;
};

type ChildrenImageTableConfig = {
  label: string;
  columns: Record<string, DbColumn>;
  listRows: (
    listRequest: GetListRequest
  ) => Promise<GetListResponse<Record<string, unknown>>>;
  upsertRow: (items: unknown) => Promise<UpsertResponse[]>;
  upsertFormRow?: (
    item: unknown,
    files?: Record<string, File | null | undefined>
  ) => Promise<UpsertResponse>;
  deleteRows: (ids: number[]) => Promise<void>;
};

type ChildrenImageCardState = {
  draftRow: DbRow;
  pendingFiles: Record<string, File | null>;
};

type ChildrenImageItem = {
  key: string;
  row: DbRow;
  rowId: number | null;
  clientId: number | null;
  state: ChildrenImageCardState;
  hasChanges: boolean;
};

type SaveRecord = {
  key: string;
  state: ChildrenImageCardState;
};

type SaveResult = {
  key: string;
  response: UpsertResponse;
};

type DetailColumn = {
  key: string;
  config: DbColumn;
};

type DbTypeChildrenImageEditProps = {
  label: string;
  targetTable?: DbTableName;
  value: unknown;
  required?: boolean;
  currentTableName: DbTableName;
  currentRowId: number | null;
  editorBackgroundClassName?: string;
  editorTextClassName?: string;
  onChange?: (value: number[]) => void;
};

const TEXT_MAX_ROWS = 8;
const DB_TYPE_EDITOR_BACKGROUND_CLASS = 'bg-transparent';
const SUPPORTED_DETAIL_COLUMN_TYPES = new Set([
  'datetime',
  'text',
  'dict-list',
  'int',
  'float',
  'url',
  'image',
  'file',
  'fk',
  'list-fk',
]);

export function DbTypeChildrenImageEdit({
  label,
  targetTable,
  value,
  required = false,
  currentTableName,
  currentRowId,
  editorBackgroundClassName = DB_TYPE_EDITOR_BACKGROUND_CLASS,
  editorTextClassName = 'text-xs',
  onChange,
}: DbTypeChildrenImageEditProps) {
  const tableConfig = targetTable
    ? (dbTables[targetTable] as ChildrenImageTableConfig)
    : null;
  const imageColumn = useMemo(
    () =>
      tableConfig
        ? (Object.entries(tableConfig.columns).find(
            ([, config]) => config.type === 'image'
          ) ?? null)
        : null,
    [tableConfig]
  );
  const ownerFkColumns = useMemo(
    () =>
      tableConfig
        ? Object.entries(tableConfig.columns).filter(
            ([, config]) =>
              config.type === 'fk' && config.targetTable === currentTableName
          )
        : [],
    [currentTableName, tableConfig]
  );
  const ownerFkColumn = ownerFkColumns.length === 1 ? ownerFkColumns[0] : null;
  const ownerFkColumnKey = ownerFkColumn?.[0] ?? null;
  const imageColumnKey = imageColumn?.[0] ?? null;
  const detailColumns = useMemo(
    () =>
      tableConfig
        ? Object.entries(tableConfig.columns)
            .filter(
              ([key, config]) =>
                key !== 'id' &&
                key !== ownerFkColumnKey &&
                SUPPORTED_DETAIL_COLUMN_TYPES.has(config.type)
            )
            .map(([key, config]) => ({ key, config }))
        : [],
    [ownerFkColumnKey, tableConfig]
  );
  const selectedIds = useMemo(() => getListIds(value), [value]);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const [items, setItems] = useState<DbRow[]>([]);
  const [newCardIds, setNewCardIds] = useState<number[]>([]);
  const [activeCardKey, setActiveCardKey] = useState<string | null>(null);
  const [editingCardKey, setEditingCardKey] = useState<string | null>(null);
  const [cardStates, setCardStates] = useState<
    Record<string, ChildrenImageCardState>
  >({});
  const [deletingCardKeys, setDeletingCardKeys] = useState<
    Record<string, boolean>
  >({});
  const [savingCardKeys, setSavingCardKeys] = useState<
    Record<string, boolean>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const configError = getConfigError({
    targetTable,
    tableConfig,
    imageColumnKey,
    ownerFkColumns,
    currentTableName,
  });
  const canLoad =
    !configError &&
    Boolean(targetTable && tableConfig && ownerFkColumnKey) &&
    currentRowId !== null;
  const isSavingAny = Object.values(savingCardKeys).some(Boolean);
  const isBusy = loading || isSavingAny;

  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  }, [onChange, value]);

  const syncParentValue = useCallback((nextItems: DbRow[]) => {
    const nextIds = nextItems
      .map((item) => getRowId(item))
      .filter((rowId): rowId is number => rowId !== null);
    if (!areNumberArraysEqual(getListIds(valueRef.current), nextIds)) {
      onChangeRef.current?.(nextIds);
    }
  }, []);

  const loadItems = useCallback(
    async (preferredActiveKey?: string | null) => {
      if (!canLoad || !targetTable || !tableConfig || !ownerFkColumnKey) {
        setItems([]);
        setNewCardIds([]);
        setCardStates({});
        setDeletingCardKeys({});
        setSavingCardKeys({});
        setActiveCardKey(null);
        setEditingCardKey(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setMessage(null);

      try {
        const response = await tableConfig.listRows({
          offset: 0,
          limit: null,
          selected_ids: [],
          search_text: null,
          text_filter: {},
          filter: { [ownerFkColumnKey]: [currentRowId, currentRowId] },
          sort: ['id', 'asc'],
        });

        setItems(response.items);
        setNewCardIds([]);
        setCardStates(buildLoadedCardStates(response.items));
        setDeletingCardKeys({});
        setSavingCardKeys({});
        setActiveCardKey(
          getPreferredActiveCardKey(response.items, [], preferredActiveKey)
        );
        syncParentValue(response.items);
      } catch (caughtError) {
        setItems([]);
        setNewCardIds([]);
        setCardStates({});
        setDeletingCardKeys({});
        setSavingCardKeys({});
        setActiveCardKey(null);
        setEditingCardKey(null);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : `${label} 데이터를 불러오지 못했습니다.`
        );
      } finally {
        setLoading(false);
      }
    },
    [
      canLoad,
      currentRowId,
      label,
      ownerFkColumnKey,
      syncParentValue,
      tableConfig,
      targetTable,
    ]
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadItems();
  }, [loadItems]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const childrenImageItems = useMemo<ChildrenImageItem[]>(() => {
    const existingItems = items.flatMap((item) => {
      const rowId = getRowId(item);
      if (rowId === null) {
        return [];
      }

      const cardKey = getExistingCardKey(rowId);
      const state = getCardState(cardStates, cardKey, item);
      return [
        {
          key: cardKey,
          row: item,
          rowId,
          clientId: null,
          state,
          hasChanges: isExistingCardDirty(item, state),
        },
      ];
    });

    const newItems = newCardIds.map((cardId) => {
      const cardKey = getNewCardKey(cardId);
      const row = buildNewChildRow(ownerFkColumnKey, currentRowId);
      return {
        key: cardKey,
        row,
        rowId: null,
        clientId: cardId,
        state: getCardState(cardStates, cardKey, row),
        hasChanges: true,
      };
    });

    return sortChildrenImageItems(
      [...existingItems, ...newItems],
      tableConfig?.columns ?? {}
    );
  }, [cardStates, currentRowId, items, newCardIds, ownerFkColumnKey, tableConfig]);

  const activeDisplayCardKey = childrenImageItems.some(
    (item) => item.key === activeCardKey
  )
    ? activeCardKey
    : childrenImageItems[0]?.key ?? null;
  const editingItem =
    childrenImageItems.find((item) => item.key === editingCardKey) ?? null;
  const panelTitle = tableConfig?.label ?? label;

  return (
    <div
      className="grid gap-2 md:grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] md:gap-3"
    >
      <p
        className={[
          'edit-label',
          required ? 'edit-label--required' : '',
          editorTextClassName,
        ].join(' ')}
      >
        <span className="edit-label__text">{label}</span>
      </p>

      <div className="min-w-0 space-y-2">
        {configError ? (
          <p
            className={[
              'rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700',
              editorTextClassName,
            ].join(' ')}
          >
            {configError}
          </p>
        ) : null}

        {currentRowId === null && !configError ? (
          <p
            className={[
              'rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)] px-3 py-2 text-[var(--app-muted)]',
              editorTextClassName,
            ].join(' ')}
          >
            현재 행을 저장하면 {panelTitle} 데이터를 추가할 수 있습니다.
            {selectedIds.length > 0 ? ` 현재 값: ${selectedIds.length}개` : ''}
          </p>
        ) : null}

        {error ? (
          <p
            className={[
              'rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700',
              editorTextClassName,
            ].join(' ')}
          >
            {error}
          </p>
        ) : null}

        {message ? (
          <p
            className={[
              'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700',
              editorTextClassName,
            ].join(' ')}
          >
            {message}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel-strong)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2">
            <p
              className={[
                'min-w-0 truncate font-semibold text-[var(--app-text)]',
                editorTextClassName,
              ].join(' ')}
            >
              {panelTitle}
            </p>
            <button
              type="button"
              className={[
                'inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-60',
                editorTextClassName,
              ].join(' ')}
              disabled={!canLoad || isBusy}
              onClick={addNewCard}
            >
              추가
            </button>
          </div>

          {loading ? (
            <p
              className={[
                'px-3 py-6 text-center text-[var(--app-muted)]',
                editorTextClassName,
              ].join(' ')}
            >
              불러오는 중
            </p>
          ) : childrenImageItems.length === 0 ? (
            <p
              className={[
                'px-3 py-6 text-center text-[var(--app-muted)]',
                editorTextClassName,
              ].join(' ')}
            >
              {panelTitle} 데이터가 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(9rem,100%),1fr))] gap-x-3 gap-y-4 p-3">
              {childrenImageItems.map((item) => (
                <ChildrenImageTile
                  key={item.key}
                  item={item}
                  columns={tableConfig?.columns ?? {}}
                  imageColumnKey={imageColumnKey}
                  isActive={item.key === activeDisplayCardKey}
                  isDeleting={Boolean(deletingCardKeys[item.key])}
                  textClassName={editorTextClassName}
                  onOpen={() => {
                    setActiveCardKey(item.key);
                    setEditingCardKey(item.key);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {editingItem && targetTable && tableConfig && imageColumnKey ? (
        <ChildrenImageDetailModal
          item={editingItem}
          tableName={targetTable}
          tableConfig={tableConfig}
          detailColumns={detailColumns}
          imageColumnKey={imageColumnKey}
          isBusy={isBusy}
          isDeleting={Boolean(deletingCardKeys[editingItem.key])}
          isSaving={Boolean(savingCardKeys[editingItem.key])}
          editorBackgroundClassName={editorBackgroundClassName}
          editorTextClassName={editorTextClassName}
          onClose={() => setEditingCardKey(null)}
          onDelete={() => {
            if (editingItem.rowId !== null) {
              void deleteExistingCard(editingItem.key, editingItem.rowId);
              return;
            }

            if (editingItem.clientId !== null) {
              removeNewCard(editingItem.clientId, editingItem.key);
            }
          }}
          onSave={() => {
            void handleSaveCard(editingItem);
          }}
          onDraftChange={(field, nextValue) =>
            updateDraftRow(editingItem.key, editingItem.row, field, nextValue)
          }
          onPendingFileChange={(field, file) =>
            updatePendingFile(editingItem.key, editingItem.row, field, file)
          }
          onReset={() => resetCardState(editingItem.key, editingItem.row)}
        />
      ) : null}
    </div>
  );

  function addNewCard() {
    if (!canLoad || !ownerFkColumnKey) {
      return;
    }

    const cardId = createNewCardId();
    const cardKey = getNewCardKey(cardId);
    const row = buildNewChildRow(ownerFkColumnKey, currentRowId);

    setNewCardIds((current) => [...current, cardId]);
    setCardStates((current) => ({
      ...current,
      [cardKey]: createCardState(row),
    }));
    setActiveCardKey(cardKey);
    setEditingCardKey(cardKey);
    setError(null);
    setMessage(null);
  }

  async function handleSaveCard(item: ChildrenImageItem) {
    if (!tableConfig || !ownerFkColumnKey) {
      return;
    }

    setError(null);
    setMessage(null);

    const record = getSaveRecord(item);
    if (!record) {
      setMessage('저장할 변경사항이 없습니다.');
      return;
    }

    const missingRequiredColumns = getMissingRequiredColumns(
      tableConfig.columns,
      record.state,
      ownerFkColumnKey
    );
    if (missingRequiredColumns.length > 0) {
      setError(`필수 항목을 입력하세요: ${missingRequiredColumns.join(', ')}`);
      return;
    }

    setSavingCardKeys((current) => ({ ...current, [item.key]: true }));
    try {
      const results = await saveRecords(tableConfig, [record]);
      const preferredCardKey =
        getActiveCardKeyAfterSave(item.key, results) ?? item.key;
      const fkWarnings = getFkWarnings(results);

      await loadItems(preferredCardKey);
      setActiveCardKey(preferredCardKey);
      setEditingCardKey(preferredCardKey);
      if (fkWarnings.length > 0) {
        setMessage(`저장되었지만 찾지 못한 참조가 있습니다. ${fkWarnings.join(' / ')}`);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : `${panelTitle} 데이터를 저장하지 못했습니다.`
      );
    } finally {
      setSavingCardKeys((current) => {
        const nextSavingCardKeys = { ...current };
        delete nextSavingCardKeys[item.key];
        return nextSavingCardKeys;
      });
    }
  }

  async function deleteExistingCard(cardKey: string, rowId: number) {
    if (!tableConfig) {
      return;
    }

    const confirmed = window.confirm(`이 ${panelTitle} 데이터를 삭제할까요?`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);
    setDeletingCardKeys((current) => ({ ...current, [cardKey]: true }));

    try {
      await tableConfig.deleteRows([rowId]);
      const nextActiveCardKey = getFallbackActiveCardKeyAfterRemoval(
        cardKey,
        childrenImageItems
      );

      await loadItems(nextActiveCardKey);
      setEditingCardKey((current) => (current === cardKey ? null : current));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : `${panelTitle} 데이터를 삭제하지 못했습니다.`
      );
    } finally {
      setDeletingCardKeys((current) => {
        const nextDeletingCardKeys = { ...current };
        delete nextDeletingCardKeys[cardKey];
        return nextDeletingCardKeys;
      });
    }
  }

  function removeNewCard(cardId: number, cardKey: string) {
    const nextActiveCardKey = getFallbackActiveCardKeyAfterRemoval(
      cardKey,
      childrenImageItems
    );

    setNewCardIds((current) => current.filter((item) => item !== cardId));
    removeCardState(cardKey);
    setActiveCardKey((current) =>
      current === cardKey ? nextActiveCardKey : current
    );
    setEditingCardKey((current) => (current === cardKey ? null : current));
    setError(null);
    setMessage(null);
  }

  function updateDraftRow(
    cardKey: string,
    baseRow: DbRow,
    field: string,
    nextValue: unknown
  ) {
    updateCardState(cardKey, baseRow, (current) => ({
      ...current,
      draftRow: { ...current.draftRow, [field]: nextValue },
    }));
    setError(null);
    setMessage(null);
  }

  function updatePendingFile(
    cardKey: string,
    baseRow: DbRow,
    field: string,
    file: File | null
  ) {
    updateCardState(cardKey, baseRow, (current) => ({
      ...current,
      pendingFiles: { ...current.pendingFiles, [field]: file },
    }));
    setError(null);
    setMessage(null);
  }

  function resetCardState(cardKey: string, baseRow: DbRow) {
    setCardStates((current) => ({
      ...current,
      [cardKey]: createCardState(baseRow),
    }));
    setError(null);
    setMessage(null);
  }

  function updateCardState(
    cardKey: string,
    baseRow: DbRow,
    updater: (current: ChildrenImageCardState) => ChildrenImageCardState
  ) {
    setCardStates((current) => {
      const previous = current[cardKey] ?? createCardState(baseRow);
      return { ...current, [cardKey]: updater(previous) };
    });
  }

  function removeCardState(cardKey: string) {
    setCardStates((current) => {
      const nextCardStates = { ...current };
      delete nextCardStates[cardKey];
      return nextCardStates;
    });
  }

  function getSaveRecord(item: ChildrenImageItem): SaveRecord | null {
    const state = cardStates[item.key] ?? item.state;
    if (item.rowId === null || isExistingCardDirty(item.row, state)) {
      return { key: item.key, state };
    }

    return null;
  }
}

function ChildrenImageTile({
  item,
  columns,
  imageColumnKey,
  isActive,
  isDeleting,
  textClassName,
  onOpen,
}: {
  item: ChildrenImageItem;
  columns: Record<string, DbColumn>;
  imageColumnKey: string | null;
  isActive: boolean;
  isDeleting: boolean;
  textClassName: string;
  onOpen: () => void;
}) {
  const label = getRowDisplayLabel(columns, item.state.draftRow, '새 데이터');
  const imagePreviewUrl = useChildrenImagePreviewUrl(
    imageColumnKey ? item.state.draftRow[imageColumnKey] : null,
    imageColumnKey ? item.state.pendingFiles[imageColumnKey] ?? null : null
  );

  return (
    <button
      type="button"
      title={label}
      disabled={isDeleting}
      className={[
        'group flex min-w-0 flex-col items-stretch gap-1 text-center text-[var(--app-text)] transition disabled:cursor-not-allowed disabled:opacity-50',
        textClassName,
      ].join(' ')}
      onClick={onOpen}
    >
      <span
        className={[
          'relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-white transition',
          isActive
            ? 'border-[var(--app-accent)] shadow-sm'
            : 'border-[var(--app-border)] group-hover:border-[var(--app-accent)]',
        ].join(' ')}
      >
        {imagePreviewUrl ? (
          <img
            src={imagePreviewUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="px-2 text-[0.68rem] leading-4 text-[var(--app-muted)]">
            이미지 없음
          </span>
        )}
        {item.hasChanges ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--app-accent)] ring-2 ring-white"
          />
        ) : null}
      </span>
      <span className="max-h-8 overflow-hidden break-words leading-4">
        {label}
      </span>
    </button>
  );
}

function ChildrenImageDetailModal({
  item,
  tableName,
  tableConfig,
  detailColumns,
  imageColumnKey,
  isBusy,
  isDeleting,
  isSaving,
  editorBackgroundClassName,
  editorTextClassName,
  onClose,
  onDelete,
  onSave,
  onDraftChange,
  onPendingFileChange,
  onReset,
}: {
  item: ChildrenImageItem;
  tableName: DbTableName;
  tableConfig: ChildrenImageTableConfig;
  detailColumns: DetailColumn[];
  imageColumnKey: string;
  isBusy: boolean;
  isDeleting: boolean;
  isSaving: boolean;
  editorBackgroundClassName: string;
  editorTextClassName: string;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
  onDraftChange: (field: string, value: unknown) => void;
  onPendingFileChange: (field: string, file: File | null) => void;
  onReset: () => void;
}) {
  const label = getRowDisplayLabel(
    tableConfig.columns,
    item.state.draftRow,
    `새 ${tableConfig.label}`
  );
  const busy = isBusy || isSaving || isDeleting;

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="children-image-detail-modal-title"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-slate-950/30" />
      <section
        className="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
          <h3
            id="children-image-detail-modal-title"
            className={[
              'min-w-0 truncate font-semibold text-[var(--app-text)]',
              editorTextClassName,
            ].join(' ')}
          >
            {label}
          </h3>
          <button
            type="button"
            className={[
              'inline-flex h-8 shrink-0 items-center justify-center rounded-md px-2.5 text-[var(--app-muted)] transition hover:bg-[var(--app-panel-strong)] hover:text-[var(--app-text)]',
              editorTextClassName,
            ].join(' ')}
            onClick={onClose}
          >
            닫기
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChildrenImageDetailEditor
            row={item.row}
            draftRow={item.state.draftRow}
            pendingFiles={item.state.pendingFiles}
            columns={detailColumns}
            tableName={tableName}
            imageColumnKey={imageColumnKey}
            hasDraftChanges={item.hasChanges}
            isSaving={isSaving}
            isDeleting={isDeleting}
            isBusy={busy}
            editorBackgroundClassName={editorBackgroundClassName}
            editorTextClassName={editorTextClassName}
            onSave={onSave}
            onDraftChange={onDraftChange}
            onPendingFileChange={onPendingFileChange}
            onReset={onReset}
          />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] px-4 py-3">
          <button
            type="button"
            className={[
              'inline-flex h-8 items-center justify-center rounded-md px-3 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40',
              editorTextClassName,
            ].join(' ')}
            disabled={busy}
            onClick={onDelete}
          >
            {isDeleting ? '삭제 중' : '삭제'}
          </button>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={[
                'inline-flex h-8 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-60',
                editorTextClassName,
              ].join(' ')}
              disabled={busy}
              onClick={onClose}
            >
              닫기
            </button>
            <button
              type="button"
              className={[
                'inline-flex h-8 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-60',
                editorTextClassName,
              ].join(' ')}
              disabled={!item.hasChanges || busy}
              onClick={onSave}
            >
              {isSaving ? '저장 중' : '저장'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ChildrenImageDetailEditor({
  row,
  draftRow,
  pendingFiles,
  columns,
  tableName,
  imageColumnKey,
  hasDraftChanges,
  isSaving,
  isDeleting,
  isBusy,
  editorBackgroundClassName,
  editorTextClassName,
  onSave,
  onDraftChange,
  onPendingFileChange,
  onReset,
}: {
  row: DbRow;
  draftRow: DbRow;
  pendingFiles: Record<string, File | null>;
  columns: DetailColumn[];
  tableName: DbTableName;
  imageColumnKey: string;
  hasDraftChanges: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  isBusy: boolean;
  editorBackgroundClassName: string;
  editorTextClassName: string;
  onSave: () => void;
  onDraftChange: (field: string, value: unknown) => void;
  onPendingFileChange: (field: string, file: File | null) => void;
  onReset: () => void;
}) {
  const rowId = getRowId(row);
  const imagePreviewUrl = useChildrenImagePreviewUrl(
    draftRow[imageColumnKey],
    pendingFiles[imageColumnKey] ?? null
  );
  const canReset = rowId === null || hasDraftChanges;

  return (
    <article className="space-y-3 bg-[var(--app-panel-strong)] p-3">
      {imagePreviewUrl ? (
        <div className="-mx-3 overflow-hidden border-y border-[var(--app-border)] bg-white">
          <img src={imagePreviewUrl} alt="" className="block h-auto w-full" />
        </div>
      ) : null}

      {columns.length === 0 ? (
        <p
          className={[
            'rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3 text-center text-[var(--app-muted)]',
            editorTextClassName,
          ].join(' ')}
        >
          편집할 필드가 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-y-2">
          {columns.map(({ key, config }) => (
            <div
              key={key}
              className={[
                config.type === 'datetime'
                  ? 'col-span-2 md:col-span-1'
                  : 'col-span-2',
              ].join(' ')}
            >
              {renderChildDetailEditor({
                keyName: key,
                config,
                draftRow,
                pendingFiles,
                tableName,
                rowId,
                editorBackgroundClassName,
                editorTextClassName,
                hasDraftChanges,
                isSaving,
                isBusy,
                onSave,
                onDraftChange,
                onPendingFileChange,
              })}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-row justify-end gap-2">
        <button
          type="button"
          disabled={!canReset || isBusy || isDeleting}
          className={[
            'inline-flex h-9 min-w-20 items-center justify-center whitespace-nowrap rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-50',
            editorTextClassName,
          ].join(' ')}
          onClick={onReset}
        >
          원본 복원
        </button>
      </div>
    </article>
  );
}

function renderChildDetailEditor({
  keyName,
  config,
  draftRow,
  pendingFiles,
  tableName,
  rowId,
  editorBackgroundClassName,
  editorTextClassName,
  hasDraftChanges,
  isSaving,
  isBusy,
  onSave,
  onDraftChange,
  onPendingFileChange,
}: {
  keyName: string;
  config: DbColumn;
  draftRow: DbRow;
  pendingFiles: Record<string, File | null>;
  tableName: DbTableName;
  rowId: number | null;
  editorBackgroundClassName: string;
  editorTextClassName: string;
  hasDraftChanges: boolean;
  isSaving: boolean;
  isBusy: boolean;
  onSave: () => void;
  onDraftChange: (field: string, value: unknown) => void;
  onPendingFileChange: (field: string, file: File | null) => void;
}) {
  if (config.type === 'datetime') {
    return (
      <DbTypeDatetimeEdit
        label={config.label}
        value={draftRow[keyName]}
        required={config.required}
        editorBackgroundClassName={editorBackgroundClassName}
        editorTextClassName={editorTextClassName}
        onChange={(value) => onDraftChange(keyName, value)}
      />
    );
  }

  if (config.type === 'text') {
    return (
      <DbTypeTextEdit
        label={config.label}
        value={draftRow[keyName]}
        maxRows={TEXT_MAX_ROWS}
        required={config.required}
        surface="subtle"
        editorBackgroundClassName={editorBackgroundClassName}
        editorTextClassName={editorTextClassName}
        onModalSave={onSave}
        isModalSaveEnabled={hasDraftChanges && !isBusy}
        isModalSaveBusy={isSaving}
        onChange={(value) => onDraftChange(keyName, value)}
      />
    );
  }

  if (config.type === 'dict-list') {
    return (
      <DbTypeDictListEdit
        label={config.label}
        value={draftRow[keyName]}
        required={config.required}
        editorBackgroundClassName={editorBackgroundClassName}
        editorTextClassName={editorTextClassName}
        onChange={(value) => onDraftChange(keyName, value)}
      />
    );
  }

  if (config.type === 'int' || config.type === 'float') {
    return (
      <DbTypeNumberEdit
        label={config.label}
        value={draftRow[keyName]}
        numberType={config.type}
        required={config.required}
        editorBackgroundClassName={editorBackgroundClassName}
        editorTextClassName={editorTextClassName}
        onChange={(value) => onDraftChange(keyName, value)}
      />
    );
  }

  if (config.type === 'url') {
    return (
      <DbTypeUrlEdit
        label={config.label}
        value={draftRow[keyName]}
        required={config.required}
        editorBackgroundClassName={editorBackgroundClassName}
        editorTextClassName={editorTextClassName}
        onChange={(value) => onDraftChange(keyName, value)}
      />
    );
  }

  if (config.type === 'image' || config.type === 'file') {
    return (
      <DbTypeImageFileEdit
        label={config.label}
        value={draftRow[keyName]}
        kind={config.type}
        pendingFile={pendingFiles[keyName] ?? null}
        required={config.required}
        editorBackgroundClassName={editorBackgroundClassName}
        editorTextClassName={editorTextClassName}
        onFileChange={(file) => onPendingFileChange(keyName, file)}
      />
    );
  }

  if (config.type === 'fk') {
    return (
      <DbTypeFkEdit
        label={config.label}
        targetTable={config.targetTable}
        value={draftRow[keyName]}
        mode="single"
        required={config.required}
        currentTableName={tableName}
        currentRowId={rowId}
        editorBackgroundClassName={editorBackgroundClassName}
        editorTextClassName={editorTextClassName}
        onChange={(value) => onDraftChange(keyName, value)}
      />
    );
  }

  return (
    <DbTypeFkEdit
      label={config.label}
      targetTable={config.targetTable}
      value={draftRow[keyName]}
      mode="list"
      linkType={config.linkType ?? 'secondary'}
      required={config.required}
      currentTableName={tableName}
      currentRowId={rowId}
      editorBackgroundClassName={editorBackgroundClassName}
      editorTextClassName={editorTextClassName}
      onChange={(value) => onDraftChange(keyName, value)}
    />
  );
}

async function saveRecords(
  tableConfig: ChildrenImageTableConfig,
  records: SaveRecord[]
) {
  const results: SaveResult[] = [];
  const recordsWithFiles = records.filter(({ state }) =>
    hasPendingUploadFiles(state.pendingFiles)
  );
  const recordsWithoutFiles = records.filter(
    ({ state }) => !hasPendingUploadFiles(state.pendingFiles)
  );

  if (recordsWithoutFiles.length > 0) {
    const responses = await tableConfig.upsertRow(
      recordsWithoutFiles.map(({ state }) => state.draftRow)
    );

    recordsWithoutFiles.forEach((record, index) => {
      const response = responses[index];
      if (response) {
        results.push({ key: record.key, response });
      }
    });
  }

  if (recordsWithFiles.length > 0) {
    const upsertFormRow = tableConfig.upsertFormRow;
    if (!upsertFormRow) {
      throw new Error('파일 업로드 저장을 지원하지 않는 테이블입니다.');
    }

    for (const record of recordsWithFiles) {
      results.push({
        key: record.key,
        response: await upsertFormRow(
          record.state.draftRow,
          getUploadFiles(record.state.pendingFiles)
        ),
      });
    }
  }

  return results;
}

function getConfigError({
  targetTable,
  tableConfig,
  imageColumnKey,
  ownerFkColumns,
  currentTableName,
}: {
  targetTable?: DbTableName;
  tableConfig: ChildrenImageTableConfig | null;
  imageColumnKey: string | null;
  ownerFkColumns: [string, DbColumn][];
  currentTableName: DbTableName;
}) {
  if (!targetTable || !tableConfig) {
    return '대상 테이블 설정이 없습니다.';
  }

  if (!imageColumnKey) {
    return `${tableConfig.label} 테이블에 image 컬럼이 없습니다.`;
  }

  if (ownerFkColumns.length !== 1) {
    return `${tableConfig.label} 테이블에서 ${currentTableName} 부모 FK를 하나만 찾을 수 있어야 합니다.`;
  }

  return null;
}

function getFkWarnings(results: SaveResult[]) {
  return results
    .flatMap(({ response }) => Object.entries(response.fk_not_found ?? {}))
    .map(([field, ids]) => `${field}: ${ids.join(', ')}`);
}

function buildLoadedCardStates(items: DbRow[]) {
  return Object.fromEntries(
    items.flatMap((item) => {
      const rowId = getRowId(item);
      return rowId === null
        ? []
        : [[getExistingCardKey(rowId), createCardState(item)]];
    })
  );
}

function buildNewChildRow(ownerFkColumnKey: string | null, currentRowId: number | null) {
  return ownerFkColumnKey && currentRowId !== null
    ? { [ownerFkColumnKey]: currentRowId }
    : {};
}

function createCardState(row: DbRow): ChildrenImageCardState {
  return {
    draftRow: row,
    pendingFiles: {},
  };
}

function getCardState(
  cardStates: Record<string, ChildrenImageCardState>,
  cardKey: string,
  row: DbRow
) {
  return cardStates[cardKey] ?? createCardState(row);
}

function isExistingCardDirty(row: DbRow, state: ChildrenImageCardState) {
  const keys = new Set([...Object.keys(row), ...Object.keys(state.draftRow)]);
  return (
    hasPendingUploadFiles(state.pendingFiles) ||
    [...keys].some((key) => !Object.is(row[key], state.draftRow[key]))
  );
}

function hasPendingUploadFiles(pendingFiles: Record<string, File | null>) {
  return Object.values(pendingFiles).some(Boolean);
}

function getUploadFiles(pendingFiles: Record<string, File | null>) {
  return Object.fromEntries(
    Object.entries(pendingFiles).filter(([, file]) => Boolean(file))
  );
}

function getMissingRequiredColumns(
  columns: Record<string, DbColumn>,
  state: ChildrenImageCardState,
  ownerFkColumnKey: string
) {
  return Object.entries(columns)
    .filter(
      ([key, config]) =>
        key !== 'id' &&
        config.required &&
        !hasRequiredValue(
          state.draftRow[key],
          config.type,
          state.pendingFiles[key] ?? null
        )
    )
    .map(([key, config]) =>
      key === ownerFkColumnKey ? `${config.label}(${key})` : config.label
    );
}

function hasRequiredValue(
  value: unknown,
  columnType: string,
  pendingFile: File | null
) {
  if ((columnType === 'image' || columnType === 'file') && pendingFile) {
    return true;
  }

  if (columnType === 'text' || columnType === 'datetime' || columnType === 'url') {
    return typeof value === 'string' && Boolean(value.trim());
  }

  if (columnType === 'fk' || columnType === 'int' || columnType === 'float') {
    return typeof value === 'number' && Number.isFinite(value);
  }

  if (columnType === 'list-fk') {
    return Array.isArray(value) && value.length > 0;
  }

  if (columnType === 'dict-list') {
    return value !== null && value !== undefined && value !== '';
  }

  return value !== null && value !== undefined && value !== '';
}

function sortChildrenImageItems(
  items: ChildrenImageItem[],
  columns: Record<string, DbColumn>
) {
  return [...items].sort((left, right) => {
    const leftName = getRowDisplayLabel(columns, left.state.draftRow, '');
    const rightName = getRowDisplayLabel(columns, right.state.draftRow, '');

    if (!leftName && !rightName) {
      return 0;
    }

    if (!leftName) {
      return 1;
    }

    if (!rightName) {
      return -1;
    }

    return leftName.localeCompare(rightName, 'ko-KR', {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function getRowDisplayLabel(
  columns: Record<string, DbColumn>,
  row: DbRow,
  fallback: string
) {
  const requiredTextColumn = Object.entries(columns).find(
    ([, config]) => config.required && config.type === 'text'
  );
  const preferredTextColumn =
    requiredTextColumn ??
    Object.entries(columns).find(
      ([key, config]) =>
        config.type === 'text' && (key === 'name' || key === 'title')
    ) ??
    Object.entries(columns).find(([, config]) => config.type === 'text');
  const textValue = preferredTextColumn
    ? formatValue(row[preferredTextColumn[0]])
    : null;
  if (textValue) {
    return textValue;
  }

  const datetimeColumn = Object.entries(columns).find(
    ([, config]) => config.type === 'datetime'
  );
  const datetimeValue = datetimeColumn
    ? formatDatetimeValue(row[datetimeColumn[0]])
    : null;
  return datetimeValue ?? formatValue(row.id) ?? fallback;
}

function getPreferredActiveCardKey(
  items: DbRow[],
  newCardIds: number[],
  preferredActiveKey?: string | null
) {
  const cardKeys = getCardKeys(items, newCardIds);
  if (preferredActiveKey && cardKeys.includes(preferredActiveKey)) {
    return preferredActiveKey;
  }

  return cardKeys[0] ?? null;
}

function getCardKeys(items: DbRow[], newCardIds: number[]) {
  return [
    ...items.flatMap((item) => {
      const rowId = getRowId(item);
      return rowId === null ? [] : [getExistingCardKey(rowId)];
    }),
    ...newCardIds.map((cardId) => getNewCardKey(cardId)),
  ];
}

function getActiveCardKeyAfterSave(
  activeCardKey: string | null,
  results: SaveResult[]
) {
  if (!activeCardKey) {
    return null;
  }

  if (activeCardKey.startsWith('existing:')) {
    return activeCardKey;
  }

  const savedId = results.find((result) => result.key === activeCardKey)
    ?.response.id;
  return typeof savedId === 'number' ? getExistingCardKey(savedId) : null;
}

function getFallbackActiveCardKeyAfterRemoval(
  removedCardKey: string,
  items: ChildrenImageItem[]
) {
  const remainingItems = items.filter((item) => item.key !== removedCardKey);
  if (remainingItems.length === 0) {
    return null;
  }

  const removedIndex = items.findIndex((item) => item.key === removedCardKey);
  if (removedIndex === -1) {
    return remainingItems[0].key;
  }

  return remainingItems[Math.min(removedIndex, remainingItems.length - 1)].key;
}

function getExistingCardKey(rowId: number) {
  return `existing:${rowId}`;
}

function getNewCardKey(clientId: number) {
  return `new:${clientId}`;
}

function getListIds(value: unknown) {
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

function areNumberArraysEqual(left: number[], right: number[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function getRowId(row: DbRow) {
  return typeof row.id === 'number' ? row.id : null;
}

function createNewCardId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value).trim() || null;
}

function formatDatetimeValue(value: unknown) {
  const formattedValue = formatLocalDateTimeLabel(value, { fallback: '' });
  return formattedValue || null;
}
