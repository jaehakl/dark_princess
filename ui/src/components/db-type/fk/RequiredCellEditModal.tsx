import { useState } from 'react';
import { RequiredFieldEditor, type RenderFkEditor } from './RequiredFieldEditor';
import type { DbColumn, DbRow, DbTableName, FkTableConfig } from './types';
import { hasRequiredValue, isSupportedRequiredColumn } from './utils';

export function RequiredCellEditModal({
  tableConfig,
  row,
  columnKey,
  config,
  currentTableName,
  currentRowId,
  renderFkEditor,
  onClose,
  onSaved,
}: {
  tableConfig: FkTableConfig;
  row: DbRow;
  columnKey: string;
  config: DbColumn;
  currentTableName?: DbTableName;
  currentRowId: number | null;
  renderFkEditor: RenderFkEditor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draftValue, setDraftValue] = useState(row[columnKey]);
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
      <section className="relative z-10 w-full max-w-[28rem] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
          <p className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">
            값 수정
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

        <div className="px-3 py-3">
          <RequiredFieldEditor
            columnKey={columnKey}
            config={config}
            value={draftValue}
            hideLabel
            currentTableName={currentTableName}
            currentRowId={currentRowId}
            renderFkEditor={renderFkEditor}
            onChange={setDraftValue}
          />

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
            className="inline-flex h-7 items-center justify-center rounded px-2.5 transition disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            disabled={isSaving}
            className="inline-flex h-7 items-center justify-center rounded px-2.5 transition disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSave}
          >
            {isSaving ? '저장 중' : '저장'}
          </button>
        </div>
      </section>
    </div>
  );

  async function handleSave() {
    if (!isSupportedRequiredColumn(config)) {
      setError(`${columnKey} 타입은 지원하지 않습니다.`);
      return;
    }

    if (!hasRequiredValue(draftValue, config.type)) {
      setError('필수값을 입력하세요.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await tableConfig.upsertRow([
        {
          ...row,
          [columnKey]: draftValue,
        },
      ]);
      const savedItem = response[0];
      if (!savedItem || typeof savedItem.id !== 'number') {
        setError('저장된 행의 ID를 확인하지 못했습니다.');
        return;
      }

      const fkWarnings = Object.entries(savedItem.fk_not_found ?? {}).map(
        ([field, ids]) => `${field}: ${ids.join(', ')}`
      );
      if (fkWarnings.length > 0) {
        setError(`찾지 못한 참조가 있습니다. ${fkWarnings.join(' / ')}`);
        return;
      }

      onSaved();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '저장하지 못했습니다.'
      );
    } finally {
      setIsSaving(false);
    }
  }
}
