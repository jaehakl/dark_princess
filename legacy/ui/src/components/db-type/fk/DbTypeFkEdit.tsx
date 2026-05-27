import { useEffect, useId, useMemo, useState } from 'react';
import { dbTables } from '../../../api/api';
import { FkEditLink } from './FkEditLink';
import { FkSearchSelect } from './FkSearchSelect';
import { InstantAddModal } from './InstantAddModal';
import { RelationRemoveModal } from './RelationRemoveModal';
import { RequiredCellEditModal } from './RequiredCellEditModal';
import { SelectedRowsTable } from './SelectedRowsTable';
import { LINK_TYPE_CAPABILITY_MATRIX } from './constants';
import type {
  DbRow,
  DbTypeFkEditProps,
  EditingCell,
  FkTableConfig,
  PendingRemoval,
  RequiredFieldFkEditorProps,
} from './types';
import {
  fetchFkSummaries,
  fetchRows,
  findOwnerFkColumns,
  formatSelectedDisplayValue,
  getListIds,
  getRowDisplayValue,
  getSingleIds,
  isOwnerFkColumn,
} from './utils';

export function DbTypeFkEdit({
  label,
  targetTable,
  value,
  mode = 'single',
  linkType = 'secondary',
  hideLabel = false,
  required = false,
  currentTableName,
  currentRowId = null,
  editorBackgroundClassName = 'bg-transparent',
  editorTextClassName = 'text-xs',
  onChange,
}: DbTypeFkEditProps) {
  const searchInputId = useId();
  const selectedIds = useMemo(
    () => (mode === 'list' ? getListIds(value) : getSingleIds(value)),
    [mode, value]
  );
  const [selectedRows, setSelectedRows] = useState<DbRow[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [fkSummaries, setFkSummaries] = useState<
    Record<string, Record<string, string>>
  >({});
  const [isLoadingSelectedRows, setIsLoadingSelectedRows] = useState(false);
  const [selectedRowsError, setSelectedRowsError] = useState<string | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [searchText, setSearchText] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval>(null);
  const tableConfig = targetTable
    ? (dbTables[targetTable] as FkTableConfig)
    : null;
  const ownerContextRowId = mode === 'list' ? currentRowId : null;
  const ownerFkColumns = useMemo(
    () =>
      tableConfig
        ? findOwnerFkColumns(tableConfig.columns, currentTableName)
        : [],
    [currentTableName, tableConfig]
  );
  const requiredColumns = useMemo(
    () =>
      tableConfig
        ? Object.entries(tableConfig.columns).filter(
            ([key, config]) =>
              key !== 'id' &&
              config.required &&
              !isOwnerFkColumn(config, currentTableName)
          )
        : [],
    [currentTableName, tableConfig]
  );
  const fkSummaryColumns = useMemo(
    () =>
      tableConfig
        ? Object.entries(tableConfig.columns).filter(
            ([, config]) =>
              config.type === 'fk' &&
              Boolean(config.targetTable) &&
              !isOwnerFkColumn(config, currentTableName)
          )
        : [],
    [currentTableName, tableConfig]
  );
  const linkTypeCapabilities = LINK_TYPE_CAPABILITY_MATRIX[linkType];
  const linkTypeTitle = `linkType: ${linkType}`;
  const hasTargetTable = Boolean(targetTable && tableConfig);
  const hasRelationChangeHandler = Boolean(hasTargetTable && onChange);
  const hasOwnerContext =
    typeof ownerContextRowId === 'number' && ownerFkColumns.length === 1;
  const canSearchSelect = Boolean(
    hasRelationChangeHandler &&
      linkTypeCapabilities.canSearchSelect
  );
  const canCreateTarget = Boolean(
    hasRelationChangeHandler &&
      linkTypeCapabilities.canCreateTarget &&
      (linkType === 'secondary' || (mode === 'list' && hasOwnerContext))
  );
  const canRemoveSelectedRow = Boolean(
    mode === 'list' &&
      hasRelationChangeHandler &&
      (linkTypeCapabilities.canRemoveSecondaryRelation ||
        linkTypeCapabilities.canDeleteTarget)
  );
  const canEditTargetRequiredFields = Boolean(
    hasTargetTable && linkTypeCapabilities.canEditTargetRequiredFields
  );
  const relationDisabledTitle = `${linkTypeTitle} / 관계 편집 불가`;
  const searchDisabledTitle = `${linkTypeTitle} / 검색 불가`;
  const createDisabledTitle =
    linkType !== 'secondary' &&
    linkTypeCapabilities.canCreateTarget &&
    !hasOwnerContext
      ? `${linkTypeTitle} / 현재 행을 먼저 저장해야 추가할 수 있습니다.`
      : relationDisabledTitle;
  const displayValue = formatSelectedDisplayValue({
    mode,
    selectedIds,
    selectedLabels,
    isLoading: isLoadingSelectedRows,
  });
  const singleEditRowId =
    mode === 'single' && selectedIds.length === 1
      ? selectedIds[0] ?? null
      : null;

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedRows() {
      if (!targetTable || selectedIds.length === 0) {
        setSelectedRows([]);
        setSelectedLabels([]);
        setFkSummaries({});
        setSelectedRowsError(null);
        setIsLoadingSelectedRows(false);
        return;
      }

      setIsLoadingSelectedRows(true);
      setSelectedRowsError(null);

      try {
        const rows = await fetchRows(targetTable, selectedIds);
        const nextFkSummaries = await fetchFkSummaries(fkSummaryColumns, rows);
        const labels = selectedIds.map((id, index) =>
          getRowDisplayValue(targetTable, rows[index], id, nextFkSummaries)
        );

        if (!cancelled) {
          setSelectedRows(rows);
          setSelectedLabels(labels);
          setFkSummaries(nextFkSummaries);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setSelectedRows([]);
          setSelectedLabels(selectedIds.map((id) => String(id)));
          setFkSummaries({});
          setSelectedRowsError(
            caughtError instanceof Error
              ? caughtError.message
              : '선택된 항목을 불러오지 못했습니다.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSelectedRows(false);
        }
      }
    }

    loadSelectedRows();

    return () => {
      cancelled = true;
    };
  }, [targetTable, selectedIds, fkSummaryColumns, refreshKey]);

  return (
    <div className="contents">
      <div
        className={
          hideLabel
            ? 'grid grid-cols-1 items-center gap-2'
            : 'grid grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] items-center gap-2 md:gap-3'
        }
      >
        {hideLabel ? null : mode === 'single' ? (
          <label
            htmlFor={searchInputId}
            title={linkTypeTitle}
            className={[
              'edit-label',
              required ? 'edit-label--required' : '',
              editorTextClassName,
            ].join(' ')}
          >
            <span className="edit-label__text">{label}</span>
          </label>
        ) : (
          <p
            title={linkTypeTitle}
            className={[
              'edit-label',
              required ? 'edit-label--required' : '',
              editorTextClassName,
            ].join(' ')}
          >
            <span className="edit-label__text">{label}</span>
          </p>
        )}
        <div className="relative flex min-w-0 items-center gap-1">
          {mode === 'list' ? (
            <button
              type="button"
              title={`${displayValue} / ${linkTypeTitle}`}
              className={[
                'flex h-6 min-w-0 max-w-[58%] flex-[1_1_58%] items-center truncate rounded px-1.5 text-left leading-none !no-underline transition',
              ].join(' ')}
              onClick={() => setIsExpanded((current) => !current)}
            >
              <span className="min-w-0 truncate">{displayValue}</span>
            </button>
          ) : (
            <div
              title={`${displayValue} / ${linkTypeTitle}`}
              className={[
                'flex h-6 min-w-0 max-w-[58%] flex-[1_1_58%] items-center gap-1 rounded border border-transparent px-1.5 leading-none text-[var(--app-text)]',
                editorTextClassName,
              ].join(' ')}
            >
              {targetTable && singleEditRowId !== null ? (
                <FkEditLink tableName={targetTable} rowId={singleEditRowId} />
              ) : null}
              <span className="min-w-0 truncate">{displayValue}</span>
            </div>
          )}
          {mode === 'single' || canSearchSelect ? (
            <FkSearchSelect
              inputId={searchInputId}
              targetTable={targetTable}
              tableConfig={tableConfig}
              fkSummaryColumns={fkSummaryColumns}
              value={searchText}
              disabled={!canSearchSelect}
              placeholder={canSearchSelect ? '검색' : searchDisabledTitle}
              title={canSearchSelect ? linkTypeTitle : searchDisabledTitle}
              required={required}
              editorTextClassName={editorTextClassName}
              editorBackgroundClassName={editorBackgroundClassName}
              onValueChange={setSearchText}
              onSelect={selectRow}
            />
          ) : null}
          {mode === 'single' || linkTypeCapabilities.canCreateTarget ? (
            <button
              type="button"
              disabled={!canCreateTarget}
              aria-label={`${label} 추가`}
              title={
                canCreateTarget
                  ? `${linkTypeTitle} / 추가`
                  : createDisabledTitle
              }
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded leading-none !no-underline transition disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setIsCreateModalOpen(true)}
            >
              +
            </button>
          ) : null}
        </div>
      </div>

      {mode === 'list' && isExpanded && targetTable && tableConfig ? (
        <div className="mt-2 w-full min-w-0">
          <SelectedRowsTable
            targetTable={targetTable}
            tableConfig={tableConfig}
            requiredColumns={requiredColumns}
            selectedIds={selectedIds}
            selectedRows={selectedRows}
            fkSummaries={fkSummaries}
            isLoading={isLoadingSelectedRows}
            error={selectedRowsError}
            linkTypeCapabilities={linkTypeCapabilities}
            linkTypeTitle={linkTypeTitle}
            canRemoveSelectedRow={canRemoveSelectedRow}
            canEditTargetRequiredFields={canEditTargetRequiredFields}
            textClassName={editorTextClassName}
            onEdit={(nextEditingCell) => setEditingCell(nextEditingCell)}
            onRemove={removeRow}
          />
        </div>
      ) : null}

      {targetTable && tableConfig && isCreateModalOpen ? (
        <InstantAddModal
          tableName={targetTable}
          tableConfig={tableConfig}
          currentTableName={currentTableName}
          currentRowId={ownerContextRowId}
          ownerFkColumns={ownerFkColumns}
          initialTextValue={canSearchSelect ? searchText.trim() : ''}
          renderFkEditor={renderRequiredFkEditor}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={(id) => {
            addCreatedRow(id);
            setIsCreateModalOpen(false);
          }}
        />
      ) : null}

      {tableConfig && editingCell ? (
        <RequiredCellEditModal
          tableConfig={tableConfig}
          row={editingCell.row}
          columnKey={editingCell.columnKey}
          config={editingCell.config}
          currentTableName={currentTableName}
          currentRowId={ownerContextRowId}
          renderFkEditor={renderRequiredFkEditor}
          onClose={() => setEditingCell(null)}
          onSaved={() => {
            setRefreshKey((current) => current + 1);
          }}
        />
      ) : null}

      {tableConfig && pendingRemoval ? (
        <RelationRemoveModal
          tableConfig={tableConfig}
          linkType={linkType}
          linkTypeCapabilities={linkTypeCapabilities}
          rowId={pendingRemoval.rowId}
          onClose={() => setPendingRemoval(null)}
          onCompleted={(removedRowId) => {
            onChange?.(
              selectedIds.filter((selectedId) => selectedId !== removedRowId)
            );
            setPendingRemoval(null);
            setRefreshKey((current) => current + 1);
          }}
        />
      ) : null}
    </div>
  );

  function selectRow(id: number) {
    if (!canSearchSelect) {
      return;
    }

    updateSelectedValue(id);
    setSearchText('');
  }

  function addCreatedRow(id: number) {
    if (!canCreateTarget) {
      return;
    }

    updateSelectedValue(id);
    setSearchText('');
  }

  function updateSelectedValue(id: number) {
    if (mode === 'list') {
      if (!selectedIds.includes(id)) {
        onChange?.([...selectedIds, id]);
      }
    } else {
      onChange?.(id);
    }
  }

  function removeRow(_row: DbRow, id: number) {
    if (mode !== 'list' || !canRemoveSelectedRow) {
      return;
    }

    if (linkTypeCapabilities.canRemoveSecondaryRelation) {
      onChange?.(selectedIds.filter((selectedId) => selectedId !== id));
      return;
    }

    setPendingRemoval({ rowId: id });
  }
}

function renderRequiredFkEditor({
  onChange,
  ...props
}: RequiredFieldFkEditorProps) {
  return (
    <DbTypeFkEdit
      {...props}
      onChange={(nextValue) => onChange(nextValue)}
    />
  );
}
