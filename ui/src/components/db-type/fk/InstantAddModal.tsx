import { useMemo, useState } from 'react';
import { RequiredFieldEditor, type RenderFkEditor } from './RequiredFieldEditor';
import type { DbColumn, DbRow, DbTableName, FkTableConfig } from './types';
import {
  buildInitialDraftRow,
  hasRequiredValue,
  isOwnerFkColumn,
  isSupportedRequiredColumn,
} from './utils';

export function InstantAddModal({
  tableName,
  tableConfig,
  currentTableName,
  currentRowId,
  ownerFkColumns,
  initialTextValue,
  renderFkEditor,
  onClose,
  onCreated,
}: {
  tableName: DbTableName;
  tableConfig: FkTableConfig;
  currentTableName?: DbTableName;
  currentRowId: number | null;
  ownerFkColumns: [string, DbColumn][];
  initialTextValue: string;
  renderFkEditor: RenderFkEditor;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const allRequiredColumns = useMemo(
    () =>
      Object.entries(tableConfig.columns).filter(
        ([key, config]) => key !== 'id' && config.required
      ),
    [tableConfig.columns]
  );
  const requiredColumns = useMemo(
    () =>
      allRequiredColumns.filter(
        ([, config]) => !isOwnerFkColumn(config, currentTableName)
      ),
    [allRequiredColumns, currentTableName]
  );
  const [draftRow, setDraftRow] = useState<DbRow>(() =>
    buildInitialDraftRow(
      requiredColumns,
      initialTextValue,
      ownerFkColumns,
      currentRowId
    )
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
    >
      <button
        type="button"
        aria-label="닫기"
        className="modal-backdrop absolute inset-0 bg-slate-950/30"
        onClick={onClose}
      />
      <section className="relative z-10 max-h-[min(34rem,calc(100vh-2rem))] w-full max-w-[30rem] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
          <p className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">
            {tableConfig.label} 추가
          </p>
          <button
            type="button"
            aria-label="닫기"
            className="inline-flex h-6 w-6 items-center justify-center rounded !no-underline transition"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-3 py-3">
          {requiredColumns.length > 0 ? (
            <div className="space-y-2">
              {requiredColumns.map(([key, config]) => (
                <RequiredFieldEditor
                  key={`${tableName}-${key}`}
                  columnKey={key}
                  config={config}
                  value={draftRow[key]}
                  currentTableName={currentTableName}
                  currentRowId={currentRowId}
                  renderFkEditor={renderFkEditor}
                  onChange={(nextValue) =>
                    setDraftRow((current) => ({ ...current, [key]: nextValue }))
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--app-muted)]">
              입력할 필수 칼럼이 없습니다.
            </p>
          )}

          {error ? (
            <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-3 py-2">
          <button
            type="button"
            disabled={isSaving}
            className="inline-flex h-7 items-center justify-center rounded px-2.5 !no-underline transition disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            disabled={isSaving}
            className="inline-flex h-7 items-center justify-center rounded px-2.5 !no-underline transition disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleCreate}
          >
            {isSaving ? '추가 중' : '추가'}
          </button>
        </div>
      </section>
    </div>
  );

  async function handleCreate() {
    const missingLabels = requiredColumns
      .filter(([, config]) => isSupportedRequiredColumn(config))
      .filter(([key, config]) => !hasRequiredValue(draftRow[key], config.type))
      .map(([, config]) => config.label);
    const unsupportedLabels = requiredColumns
      .filter(([, config]) => !isSupportedRequiredColumn(config))
      .map(([, config]) => config.label);

    if (unsupportedLabels.length > 0) {
      setError(
        `지원하지 않는 필수 칼럼이 있습니다. ${unsupportedLabels.join(', ')}`
      );
      return;
    }

    if (missingLabels.length > 0) {
      setError(`필수값을 입력하세요. ${missingLabels.join(', ')}`);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await tableConfig.upsertRow([draftRow]);
      const createdItem = response[0];
      if (!createdItem || typeof createdItem.id !== 'number') {
        setError('추가된 행의 ID를 확인하지 못했습니다.');
        return;
      }

      const fkWarnings = Object.entries(createdItem.fk_not_found ?? {}).map(
        ([field, ids]) => `${field}: ${ids.join(', ')}`
      );
      if (fkWarnings.length > 0) {
        setError(`찾지 못한 참조가 있습니다. ${fkWarnings.join(' / ')}`);
        return;
      }

      onCreated(createdItem.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '추가하지 못했습니다.'
      );
    } finally {
      setIsSaving(false);
    }
  }
}
