import { useId, useLayoutEffect, useRef, useState } from 'react';

type DbTypeTextEditSurface = 'plain' | 'subtle';

type DbTypeTextEditProps = {
  label: string;
  value: unknown;
  editorBackgroundClassName: string;
  editorTextClassName?: string;
  onChange: (value: string | null) => void;
  onModalSave?: () => void | Promise<void>;
  isModalSaveEnabled?: boolean;
  isModalSaveBusy?: boolean;
  maxRows?: number;
  hideLabel?: boolean;
  required?: boolean;
  surface?: DbTypeTextEditSurface;
};

export function DbTypeTextEdit({
  label,
  value,
  editorBackgroundClassName,
  editorTextClassName = 'text-xs',
  onChange,
  onModalSave,
  isModalSaveEnabled = false,
  isModalSaveBusy = false,
  maxRows = 8,
  hideLabel = false,
  required = false,
  surface = 'plain',
}: DbTypeTextEditProps) {
  const textEditorId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const textValue = formatTextInputValue(value);
  const inputLabelId = `${textEditorId}-label`;
  const inlineTextareaId = `${textEditorId}-input`;
  const modalDialogId = `${textEditorId}-modal`;
  const modalTitleId = `${textEditorId}-modal-title`;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight);
    const fallbackLineHeight = Number.parseFloat(computedStyle.fontSize) * 1.5;
    const rowHeight = Number.isFinite(lineHeight) ? lineHeight : fallbackLineHeight;
    const maxHeight = rowHeight * maxRows;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${Math.max(rowHeight, nextHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [textValue, maxRows]);

  useLayoutEffect(() => {
    if (!isModalOpen) {
      return;
    }

    modalTextareaRef.current?.focus();
  }, [isModalOpen]);

  return (
    <>
      <div
        className={
          hideLabel
            ? 'block'
            : 'grid grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] gap-2 md:gap-3'
        }
      >
        {hideLabel ? null : (
          <button
            type="button"
            title={`${label} 편집`}
            aria-controls={isModalOpen ? modalDialogId : undefined}
            aria-expanded={isModalOpen}
            aria-haspopup="dialog"
            className={[
              'edit-label justify-self-start rounded text-left transition hover:text-[var(--app-text)]',
              required ? 'edit-label--required' : '',
              editorTextClassName,
            ].join(' ')}
            onClick={() => setIsModalOpen(true)}
          >
            <span id={inputLabelId} className="edit-label__text">
              {label}
            </span>
          </button>
        )}
        <span
          className={[
            'block w-full min-w-0 leading-5 text-[var(--app-text)]',
            surface === 'subtle'
              ? 'edit-control px-1.5 py-1'
              : '',
            editorTextClassName,
          ].join(' ')}
        >
          <textarea
            id={inlineTextareaId}
            ref={textareaRef}
            rows={1}
            value={textValue}
            aria-label={hideLabel ? label : undefined}
            aria-labelledby={hideLabel ? undefined : inputLabelId}
            aria-required={required || undefined}
            className={[
              'block w-full resize-none overflow-hidden border-0 p-0 text-[inherit] outline-none [font:inherit] [line-height:inherit] focus:outline-none',
              editorBackgroundClassName,
            ].join(' ')}
            onChange={(event) => onChange(event.target.value || null)}
          />
        </span>
      </div>

      {isModalOpen && !hideLabel ? (
        <div
          id={modalDialogId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center sm:px-3 sm:py-2"
        >
          <button
            type="button"
            aria-label="닫기"
            className="modal-backdrop absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]"
            onClick={() => setIsModalOpen(false)}
          />
          <section className="relative z-10 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col overflow-hidden border-0 bg-[var(--app-panel)] shadow-none sm:h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-1rem)] sm:w-full sm:max-w-[min(52rem,calc(100vw-1.5rem))] sm:rounded-md sm:border sm:border-[var(--app-border)] sm:shadow-xl">
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
              <p
                id={modalTitleId}
                className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]"
              >
                {label} 편집
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {onModalSave ? (
                  <button
                    type="button"
                    disabled={!isModalSaveEnabled || isModalSaveBusy}
                    className={[
                      'inline-flex h-7 items-center justify-center rounded px-2.5 transition disabled:cursor-not-allowed disabled:opacity-60',
                      editorTextClassName,
                    ].join(' ')}
                    onClick={() => {
                      void onModalSave();
                    }}
                  >
                    {isModalSaveBusy ? '저장 중' : '저장'}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="닫기"
                  className="inline-flex h-6 w-6 items-center justify-center rounded transition"
                  onClick={() => setIsModalOpen(false)}
                >
                  x
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 px-2 py-2">
              <textarea
                ref={modalTextareaRef}
                rows={20}
                value={textValue}
                aria-labelledby={modalTitleId}
                aria-required={required || undefined}
                className={[
                  'block h-full w-full resize-none border-0 px-1.5 py-1 leading-5 text-[var(--app-text)] outline-none [overflow-wrap:anywhere] focus:outline-none',
                  editorTextClassName,
                  editorBackgroundClassName,
                ].join(' ')}
                onChange={(event) => onChange(event.target.value || null)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function formatTextInputValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return typeof value === 'string' ? value : String(value);
}
