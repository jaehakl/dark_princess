import { useLayoutEffect, useRef, useState } from 'react';

type DbTypeUrlEditProps = {
  label: string;
  value: unknown;
  editorBackgroundClassName: string;
  editorTextClassName?: string;
  onChange: (value: string | null) => void;
  hideLabel?: boolean;
  required?: boolean;
};

export function DbTypeUrlEdit({
  label,
  value,
  editorBackgroundClassName,
  editorTextClassName = 'text-xs',
  onChange,
  hideLabel = false,
  required = false,
}: DbTypeUrlEditProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const urlValue = value === null || value === undefined ? '' : String(value);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(urlValue);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!isModalOpen || !textarea) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(
      Math.max(textarea.scrollHeight, 224),
      Math.max(window.innerHeight - 192, 224)
    )}px`;
  }, [draftUrl, isModalOpen]);

  return (
    <>
      <div
        className={
          hideLabel
            ? 'grid grid-cols-1 items-center gap-2'
            : 'grid grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] items-center gap-2 md:gap-3'
        }
      >
        {hideLabel ? null : (
          <p
            className={[
              'edit-label',
              required ? 'edit-label--required' : '',
              editorTextClassName,
            ].join(' ')}
          >
            <span className="edit-label__text">{label}</span>
          </p>
        )}
        <div className="flex h-6 min-w-0 items-center gap-1">
          {urlValue ? (
            <a
              href={urlValue}
              target="_blank"
              rel="noreferrer"
              title={urlValue}
              className={[
                'flex h-6 min-w-0 flex-1 items-center truncate rounded border border-transparent px-1.5 leading-none text-[var(--app-accent)] transition hover:border-[var(--app-border)] hover:bg-[var(--app-panel)]',
                editorTextClassName,
              ].join(' ')}
            >
              <span className="min-w-0 truncate">{urlValue}</span>
            </a>
          ) : (
            <span
              className={[
                'flex h-6 min-w-0 flex-1 items-center rounded border border-transparent px-1.5 leading-none text-[var(--app-muted)]',
                editorTextClassName,
              ].join(' ')}
            >
              -
            </span>
          )}
          <button
            type="button"
            aria-label={`${label} 편집`}
            title="편집"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition"
            onClick={() => {
              setDraftUrl(urlValue);
              setClipboardError(null);
              setIsModalOpen(true);
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-3.5 w-3.5"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        </div>
      </div>

      {isModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
        >
          <button
            type="button"
            aria-label="닫기"
            className="modal-backdrop absolute inset-0 bg-slate-950/30"
            onClick={() => setIsModalOpen(false)}
          />
          <section className="relative z-10 w-full max-w-[min(52rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
            <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
              <p className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">
                {label} 편집
              </p>
              <button
                type="button"
                aria-label="닫기"
                className="inline-flex h-6 w-6 items-center justify-center rounded transition"
                onClick={() => setIsModalOpen(false)}
              >
                x
              </button>
            </div>

            <div className="px-3 py-3">
              <textarea
                ref={textareaRef}
                rows={8}
                value={draftUrl}
                aria-required={required || undefined}
                className={[
                  'block max-h-[calc(100vh-12rem)] min-h-56 w-full resize-y rounded border border-[var(--app-border)] px-2.5 py-2 leading-5 text-[var(--app-text)] outline-none transition [overflow-wrap:anywhere] focus:border-[var(--app-accent)]',
                  editorTextClassName,
                  editorBackgroundClassName,
                ].join(' ')}
                onChange={(event) => setDraftUrl(event.target.value)}
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
                  onClick={async () => {
                    setClipboardError(null);
                    try {
                      setDraftUrl(await navigator.clipboard.readText());
                    } catch {
                      setClipboardError('클립보드에서 읽지 못했습니다.');
                    }
                  }}
                >
                  클립보드에서 붙여넣기
                </button>
                {clipboardError ? (
                  <p className="text-xs text-rose-600">{clipboardError}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-3 py-2">
              <button
                type="button"
                className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
                onClick={() => setIsModalOpen(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
                onClick={() => {
                  onChange(draftUrl || null);
                  setIsModalOpen(false);
                }}
              >
                적용
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
