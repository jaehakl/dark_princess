import { useState } from 'react';
import type {
  FkTableConfig,
  LinkType,
  LinkTypeCapabilities,
} from './types';

export function RelationRemoveModal({
  tableConfig,
  linkType,
  linkTypeCapabilities,
  rowId,
  onClose,
  onCompleted,
}: {
  tableConfig: FkTableConfig;
  linkType: LinkType;
  linkTypeCapabilities: LinkTypeCapabilities;
  rowId: number;
  onClose: () => void;
  onCompleted: (rowId: number) => void;
}) {
  const [savingAction, setSavingAction] = useState<'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkTypeTitle = `linkType: ${linkType}`;
  const canDelete = linkTypeCapabilities.canDeleteTarget;

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
        onClick={savingAction ? undefined : onClose}
      />
      <section className="relative z-10 w-full max-w-[28rem] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
          <p
            title={linkTypeTitle}
            className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]"
          >
            관계 제거
          </p>
          <button
            type="button"
            aria-label="닫기"
            disabled={Boolean(savingAction)}
            className="inline-flex h-6 w-6 items-center justify-center rounded !no-underline transition disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div className="space-y-2 px-3 py-3">
          <p className="leading-5 text-[var(--app-text)] edit-text">
            이 관계를 제거하면 대상 행이 삭제됩니다.
          </p>
          <p className="text-[var(--app-muted)] edit-text">
            {linkTypeTitle} / ID: {rowId}
          </p>
          {error ? (
            <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-700 edit-text">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-3 py-2">
          <button
            type="button"
            disabled={Boolean(savingAction)}
            className="inline-flex h-7 items-center justify-center rounded px-2.5 !no-underline transition disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canDelete || Boolean(savingAction)}
            title={canDelete ? `${linkTypeTitle} / 삭제` : '삭제 불가'}
            className="inline-flex h-7 items-center justify-center rounded px-2.5 !no-underline transition disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleDelete}
          >
            {savingAction === 'delete' ? '삭제 중' : '삭제'}
          </button>
        </div>
      </section>
    </div>
  );

  async function handleDelete() {
    if (!canDelete) {
      return;
    }

    setSavingAction('delete');
    setError(null);

    let completed = false;
    try {
      await tableConfig.deleteRows([rowId]);
      onCompleted(rowId);
      completed = true;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '삭제하지 못했습니다.'
      );
    } finally {
      if (!completed) {
        setSavingAction(null);
      }
    }
  }
}
