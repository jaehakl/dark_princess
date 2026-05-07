import { useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

type DictListSection = {
  key: string;
  text: string;
};

type DictListDisplayItem = {
  itemIndex: number;
  value: string;
  start: number;
  end: number;
  segmentStart: number;
  segmentEnd: number;
};

type DictListVisualPart =
  | {
      kind: 'text';
      value: string;
      start: number;
      end: number;
    }
  | {
      kind: 'item';
      item: DictListDisplayItem;
    };

type DictListValue = Record<string, string[]>;

type KeyModalState =
  | { mode: 'add' }
  | { mode: 'rename'; sectionKey: string };

type ItemEditState = {
  sectionKey: string;
  itemIndex: number;
};

type DragState = {
  sectionKey: string;
  itemIndex: number;
  itemValue: string;
  pointerId: number;
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  itemWidth: number;
  itemHeight: number;
  hasMoved: boolean;
  dropIndex: number;
};

type SelectionState = {
  sectionKey: string;
  start: number;
  end: number;
};

const CARD_MOUSE_DRAG_START_DISTANCE = 6;
const CARD_TOUCH_DRAG_START_DISTANCE = 12;
const DICT_LIST_DROP_INDICATOR_CLASS_NAME =
  'pointer-events-none inline-flex h-5 w-2 shrink-0 items-center justify-center';
const ITEM_MODAL_BACKDROP_CLICK_GUARD_MS = 750;
const ITEM_MODAL_BACKDROP_CLICK_GUARD_DISTANCE = 20;

type DbTypeDictListEditProps = {
  label: string;
  value: unknown;
  editorBackgroundClassName: string;
  editorTextClassName?: string;
  hideLabel?: boolean;
  required?: boolean;
  onChange: (value: DictListValue) => void;
};

export function DbTypeDictListEdit({
  label,
  value,
  editorBackgroundClassName,
  editorTextClassName = 'text-xs',
  hideLabel = false,
  required = false,
  onChange,
}: DbTypeDictListEditProps) {
  const [sections, setSections] = useState<DictListSection[]>(() =>
    normalizeDictListSections(value)
  );
  const [isEditing, setIsEditing] = useState(false);
  const [keyModal, setKeyModal] = useState<KeyModalState | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<ItemEditState | null>(null);
  const [itemDraft, setItemDraft] = useState('');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const didMountValueRef = useRef(false);
  const skipNextEmitRef = useRef(true);
  const lastEmittedValueRef = useRef<DictListValue | null>(null);
  const onChangeRef = useRef(onChange);
  const recentTouchItemOpenRef = useRef<{
    x: number;
    y: number;
    openedAt: number;
  } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!didMountValueRef.current) {
      didMountValueRef.current = true;
      return;
    }

    if (value === lastEmittedValueRef.current) {
      return;
    }

    skipNextEmitRef.current = true;
    setSections(normalizeDictListSections(value));
  }, [value]);

  useEffect(() => {
    if (skipNextEmitRef.current) {
      skipNextEmitRef.current = false;
      return;
    }

    const nextValue = sections.reduce<DictListValue>((result, section) => {
      const items = splitDictListText(section.text);
      if (items.length > 0) {
        result[section.key] = items;
      }
      return result;
    }, {});

    lastEmittedValueRef.current = nextValue;
    onChangeRef.current(nextValue);
  }, [sections]);

  const displayText = sections
    .map(
      (section) => `${section.key}:${splitDictListText(section.text).join(',')}/`
    )
    .join('');

  if (!isEditing) {
    return (
      <div
        className={
          hideLabel
            ? 'grid grid-cols-1 items-start gap-2'
            : 'grid grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] items-start gap-2 md:gap-3'
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

        <div className="flex min-w-0 items-start gap-1">
          <p
            title={displayText || '-'}
            className={[
              'line-clamp-3 min-h-6 min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 leading-5 text-[var(--app-text)] [overflow-wrap:anywhere]',
              displayText ? '' : 'text-[var(--app-muted)]',
              editorTextClassName,
            ].join(' ')}
          >
            {displayText || '-'}
          </p>
          <button
            type="button"
            aria-label={`${label} 편집`}
            className="inline-flex h-6 shrink-0 items-center justify-center rounded px-2 transition"
            onClick={() => setIsEditing(true)}
          >
            편집
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={
          hideLabel
            ? 'block'
            : 'grid gap-1 md:grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] md:gap-3'
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

        <div className="min-w-0 space-y-1.5">
          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex h-6 items-center justify-center rounded px-2 transition"
              onClick={() => {
                setDragState(null);
                setSelection(null);
                setIsEditing(false);
              }}
            >
              닫기
            </button>
          </div>

          {sections.length > 0 ? (
            sections.map((section) => {
              const items = parseDictListDisplayItems(section.text);
              const visualParts = buildDictListVisualParts(section.text, items);
              const sectionSelection =
                selection?.sectionKey === section.key ? selection : null;
              const collapsedSelection =
                sectionSelection?.start === sectionSelection?.end
                  ? sectionSelection
                  : null;
              const selectionStart = sectionSelection
                ? Math.min(sectionSelection.start, sectionSelection.end)
                : null;
              const selectionEnd = sectionSelection
                ? Math.max(sectionSelection.start, sectionSelection.end)
                : null;
              const activeItem = sectionSelection
                ? (items.find((item) =>
                    collapsedSelection
                      ? collapsedSelection.start >= item.start &&
                        collapsedSelection.start <= item.end
                      : selectionStart !== null &&
                        selectionEnd !== null &&
                        selectionStart < item.end &&
                        selectionEnd > item.start
                  ) ?? null)
                : null;
              const shouldShowEmptyCaret = Boolean(
                collapsedSelection &&
                  !activeItem &&
                  section.text.length === 0
              );
              const hasVisualCaret = Boolean(collapsedSelection);
              const sectionDropIndex =
                dragState?.sectionKey === section.key && dragState.hasMoved
                  ? dragState.dropIndex
                  : null;

              return (
                <section
                  key={section.key}
                  className="rounded border border-[var(--app-border)] bg-white/55"
                >
                  <div className="flex min-h-7 items-center gap-1 border-b border-[var(--app-border)] px-1.5 py-1">
                    <button
                      type="button"
                      className={[
                        'min-w-0 flex-1 truncate rounded text-left font-semibold text-[var(--app-text)] transition',
                        editorTextClassName,
                      ].join(' ')}
                      onClick={() => openRenameKeyModal(section.key)}
                    >
                      {section.key}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-5 shrink-0 items-center justify-center rounded px-1.5 transition"
                      onClick={() => deleteKeySection(section.key)}
                    >
                      삭제
                    </button>
                  </div>

                  <div className="relative min-h-8 rounded-b bg-white">
                    <textarea
                      rows={1}
                      aria-label={`${section.key} 값 편집`}
                      aria-required={required || undefined}
                      value={section.text}
                      className={[
                        'absolute inset-0 z-0 block h-full w-full resize-none overflow-hidden rounded-b border-0 px-1 py-1 text-[0.66rem] leading-5 text-transparent outline-none [font:inherit] selection:bg-transparent selection:text-transparent focus:outline-none',
                        hasVisualCaret
                          ? 'caret-transparent'
                          : 'caret-[var(--app-accent)]',
                        editorBackgroundClassName,
                      ].join(' ')}
                      onChange={(event) => {
                        setSections((current) =>
                          current.map((currentSection) =>
                            currentSection.key === section.key
                              ? {
                                  ...currentSection,
                                  text: event.target.value,
                                }
                              : currentSection
                          )
                        );
                        updateSectionSelection(section.key, event.currentTarget);
                      }}
                      onClick={(event) =>
                        updateSectionSelection(section.key, event.currentTarget)
                      }
                      onFocus={(event) =>
                        updateSectionSelection(section.key, event.currentTarget)
                      }
                      onKeyDown={(event) =>
                        handleTextareaKeyDown(section.key, event)
                      }
                      onKeyUp={(event) =>
                        updateSectionSelection(section.key, event.currentTarget)
                      }
                      onSelect={(event) =>
                        updateSectionSelection(section.key, event.currentTarget)
                      }
                      onBlur={() =>
                        setSelection((current) =>
                          current?.sectionKey === section.key ? null : current
                        )
                      }
                    />

                    <div
                      className="pointer-events-none relative z-10 flex min-h-8 flex-wrap content-start items-center gap-x-0 gap-y-1 px-1 py-1"
                    >
                      {visualParts.length > 0 || shouldShowEmptyCaret ? (
                        <>
                        {visualParts.map((part, partIndex) => {
                          if (part.kind === 'text') {
                            const caretOffset =
                              collapsedSelection &&
                              !activeItem &&
                              collapsedSelection.start >= part.start &&
                              collapsedSelection.start <= part.end
                                ? collapsedSelection.start - part.start
                                : null;
                            const highlightStart =
                              selectionStart !== null && selectionEnd !== null
                                ? Math.max(selectionStart, part.start)
                                : null;
                            const highlightEnd =
                              selectionStart !== null && selectionEnd !== null
                                ? Math.min(selectionEnd, part.end)
                                : null;
                            const hasHighlight =
                              caretOffset === null &&
                              highlightStart !== null &&
                              highlightEnd !== null &&
                              highlightStart < highlightEnd;
                            const highlightStartOffset = hasHighlight
                              ? highlightStart - part.start
                              : 0;
                            const highlightEndOffset = hasHighlight
                              ? highlightEnd - part.start
                              : 0;

                            return (
                              <span
                                key={`${section.key}-text-${partIndex}`}
                                className="pointer-events-none inline-flex min-h-5 items-center text-[0.66rem] leading-5 text-[var(--app-text)]"
                              >
                                <span className="whitespace-pre-wrap">
                                  {caretOffset !== null ? (
                                    <>
                                      {part.value.slice(0, caretOffset)}
                                      <span className="mx-[-0.5px] inline-block h-4 w-px translate-y-[3px] bg-[var(--app-accent)] align-text-bottom" />
                                      {part.value.slice(caretOffset)}
                                    </>
                                  ) : hasHighlight ? (
                                    <>
                                      {part.value.slice(
                                        0,
                                        highlightStartOffset
                                      )}
                                      <span className="rounded-sm bg-[color-mix(in_srgb,var(--app-accent)_24%,transparent)]">
                                        {part.value.slice(
                                          highlightStartOffset,
                                          highlightEndOffset
                                        )}
                                      </span>
                                      {part.value.slice(highlightEndOffset)}
                                    </>
                                  ) : (
                                    part.value
                                  )}
                                </span>
                              </span>
                            );
                          }

                          const item = part.item;
                          const isDragging =
                            dragState?.sectionKey === section.key &&
                            dragState.itemIndex === item.itemIndex &&
                            dragState.hasMoved;
                          const isActiveItem =
                            collapsedSelection
                              ? activeItem?.itemIndex === item.itemIndex
                              : selectionStart !== null &&
                                selectionEnd !== null &&
                                selectionStart < item.end &&
                                selectionEnd > item.start;

                          if (isActiveItem) {
                            const caretOffset = collapsedSelection
                              ? Math.min(
                                  Math.max(
                                    collapsedSelection.start - item.start,
                                    0
                                  ),
                                  item.value.length
                                )
                              : null;
                            const highlightStart =
                              selectionStart !== null && selectionEnd !== null
                                ? Math.max(selectionStart, item.start)
                                : null;
                            const highlightEnd =
                              selectionStart !== null && selectionEnd !== null
                                ? Math.min(selectionEnd, item.end)
                                : null;
                            const hasHighlight =
                              caretOffset === null &&
                              highlightStart !== null &&
                              highlightEnd !== null &&
                              highlightStart < highlightEnd;
                            const highlightStartOffset = hasHighlight
                              ? highlightStart - item.start
                              : 0;
                            const highlightEndOffset = hasHighlight
                              ? highlightEnd - item.start
                              : 0;

                            return (
                              <span
                                key={`${section.key}-${item.itemIndex}-${item.value}`}
                                className="pointer-events-none inline-flex min-h-6 max-w-full items-center px-1.5 text-[0.72rem] leading-none text-[var(--app-text)] [overflow-wrap:anywhere] [word-break:break-word]"
                              >
                                <span className="min-w-0 whitespace-pre-wrap">
                                  {caretOffset !== null ? (
                                    <>
                                      {item.value.slice(0, caretOffset)}
                                      <span className="mx-[-0.5px] inline-block h-4 w-px translate-y-[3px] bg-[var(--app-accent)] align-text-bottom" />
                                      {item.value.slice(caretOffset)}
                                    </>
                                  ) : hasHighlight ? (
                                    <>
                                      {item.value.slice(
                                        0,
                                        highlightStartOffset
                                      )}
                                      <span className="rounded-sm bg-[color-mix(in_srgb,var(--app-accent)_24%,transparent)]">
                                        {item.value.slice(
                                          highlightStartOffset,
                                          highlightEndOffset
                                        )}
                                      </span>
                                      {item.value.slice(highlightEndOffset)}
                                    </>
                                  ) : (
                                    item.value
                                  )}
                                </span>
                              </span>
                            );
                          }

                          const shouldShowDropIndicator =
                            sectionDropIndex === item.itemIndex;

                          return (
                            [
                              shouldShowDropIndicator ? (
                                <span
                                  key={`${section.key}-${item.itemIndex}-drop-before`}
                                  className={DICT_LIST_DROP_INDICATOR_CLASS_NAME}
                                >
                                  <span className="h-5 w-0.5 rounded-full bg-[var(--app-accent)]" />
                                </span>
                              ) : null,
                              <div
                                key={`${section.key}-${item.itemIndex}-${item.value}`}
                                role="button"
                                tabIndex={0}
                                data-dict-list-section={section.key}
                                data-dict-list-index={item.itemIndex}
                                className={[
                                  'pointer-events-auto inline-flex min-h-6 max-w-full touch-none cursor-grab select-none items-center gap-0.5 rounded border border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] px-1.5 text-[0.72rem] leading-none text-[var(--app-text)] shadow-[0_1px_1px_rgba(15,23,42,0.04)] transition active:cursor-grabbing',
                                  isDragging ? 'opacity-35' : '',
                                ].join(' ')}
                                onPointerDown={(event) =>
                                  handleCardPointerDown(
                                    event,
                                    section.key,
                                    item.itemIndex,
                                    item.value
                                  )
                                }
                                onPointerMove={handleCardPointerMove}
                                onPointerUp={(event) =>
                                  handleCardPointerUp(
                                    event,
                                    section.key,
                                    item.itemIndex,
                                    item.value
                                  )
                                }
                                onPointerCancel={handleCardPointerCancel}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onKeyDown={(event) =>
                                  handleCardKeyDown(
                                    event,
                                    section.key,
                                    item.itemIndex,
                                    item.value
                                  )
                                }
                              >
                                <span className="min-w-0 truncate">
                                  {item.value}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`${item.value} 삭제`}
                                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded transition"
                                  onPointerDown={(event) =>
                                    event.stopPropagation()
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteItem(section.key, item.itemIndex);
                                  }}
                                >
                                  x
                                </button>
                              </div>,
                            ]
                          );
                        })}
                        {sectionDropIndex === items.length ? (
                          <span
                            className={DICT_LIST_DROP_INDICATOR_CLASS_NAME}
                          >
                            <span className="h-5 w-0.5 rounded-full bg-[var(--app-accent)]" />
                          </span>
                        ) : null}
                        {shouldShowEmptyCaret ? (
                          <span className="pointer-events-none inline-flex h-5 items-center px-1">
                            <span className="inline-block h-4 w-px bg-[var(--app-accent)]" />
                          </span>
                        ) : null}
                        </>
                      ) : (
                        <span className="text-[0.66rem] leading-5 text-[var(--app-muted)]">
                          -
                        </span>
                      )}
                    </div>
                  </div>
                </section>
              );
            })
          ) : (
            <div className="rounded border border-dashed border-[var(--app-border)] bg-white/55 px-2 py-2 text-[0.66rem] text-[var(--app-muted)]">
              -
            </div>
          )}

          <button
            type="button"
            className="inline-flex h-6 items-center justify-center rounded px-2 transition"
            onClick={openAddKeyModal}
          >
            키 추가
          </button>
        </div>
      </div>

      {dragState?.hasMoved ? (
        <div
          className="pointer-events-none fixed z-[60] inline-flex max-w-[min(20rem,calc(100vw-1rem))] items-center gap-0.5 rounded border border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] px-1.5 text-[0.72rem] leading-none text-[var(--app-text)] opacity-95 shadow-lg"
          style={{
            left: dragState.pointerX - dragState.pointerOffsetX,
            minHeight: dragState.itemHeight,
            top: dragState.pointerY - dragState.pointerOffsetY,
            width: dragState.itemWidth,
          }}
        >
          <span className="min-w-0 truncate">{dragState.itemValue}</span>
          <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-[var(--app-muted)]">
            x
          </span>
        </div>
      ) : null}

      {keyModal ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
        >
          <button
            type="button"
            aria-label="닫기"
            className="modal-backdrop absolute inset-0 bg-slate-950/30"
            onClick={closeKeyModal}
          />
          <section className="relative z-10 w-full max-w-[22rem] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
            <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
              <p className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">
                {keyModal.mode === 'add' ? '키 추가' : '키 이름 변경'}
              </p>
              <button
                type="button"
                aria-label="닫기"
                className="inline-flex h-6 w-6 items-center justify-center rounded transition"
                onClick={closeKeyModal}
              >
                x
              </button>
            </div>

            <div className="px-3 py-3">
              <input
                autoFocus
                value={keyDraft}
                className="h-8 w-full rounded border border-[var(--app-border)] bg-white px-2 text-xs text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                onChange={(event) => {
                  setKeyDraft(event.target.value);
                  setKeyError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    applyKeyModal();
                  }
                }}
              />

              {keyError ? (
                <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
                  {keyError}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-3 py-2">
              <button
                type="button"
                className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
                onClick={closeKeyModal}
              >
                취소
              </button>
              <button
                type="button"
                className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
                onClick={applyKeyModal}
              >
                적용
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {itemEdit ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4"
        >
          <button
            type="button"
            aria-label="닫기"
            className="modal-backdrop absolute inset-0 bg-slate-950/30"
            onClick={handleItemBackdropClick}
          />
          <section className="relative z-10 w-full max-w-[24rem] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl">
            <div className="flex h-10 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
              <p className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">
                값 편집
              </p>
              <button
                type="button"
                aria-label="닫기"
                className="inline-flex h-6 w-6 items-center justify-center rounded transition"
                onClick={closeItemEdit}
              >
                x
              </button>
            </div>

            <div className="px-3 py-3">
              <textarea
                autoFocus
                rows={3}
                value={itemDraft}
                className="block max-h-[40vh] min-h-20 w-full resize-y rounded border border-[var(--app-border)] bg-white px-2 py-1.5 text-xs leading-5 text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)]"
                onChange={(event) => setItemDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    applyItemEdit();
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] px-3 py-2">
              <button
                type="button"
                className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
                onClick={closeItemEdit}
              >
                취소
              </button>
              <button
                type="button"
                className="inline-flex h-7 items-center justify-center rounded px-2.5 transition"
                onClick={applyItemEdit}
              >
                적용
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );

  function updateSectionSelection(
    sectionKey: string,
    textarea: HTMLTextAreaElement
  ) {
    setSelection({
      sectionKey,
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
  }

  function handleTextareaKeyDown(
    sectionKey: string,
    event: ReactKeyboardEvent<HTMLTextAreaElement>
  ) {
    if (event.key !== 'Tab') {
      return;
    }

    event.preventDefault();

    const textarea = event.currentTarget;
    const nextCursorPosition = getCommaUnitCursorPosition(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      event.shiftKey
    );

    textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    updateSectionSelection(sectionKey, textarea);
  }

  function openAddKeyModal() {
    setKeyModal({ mode: 'add' });
    setKeyDraft('');
    setKeyError(null);
  }

  function openRenameKeyModal(sectionKey: string) {
    setKeyModal({ mode: 'rename', sectionKey });
    setKeyDraft(sectionKey);
    setKeyError(null);
  }

  function closeKeyModal() {
    setKeyModal(null);
    setKeyDraft('');
    setKeyError(null);
  }

  function applyKeyModal() {
    if (!keyModal) {
      return;
    }

    const nextKey = keyDraft.trim();
    if (!nextKey) {
      setKeyError('키를 입력하세요.');
      return;
    }

    const currentKey = keyModal.mode === 'rename' ? keyModal.sectionKey : null;
    if (
      sections.some(
        (section) => section.key !== currentKey && section.key === nextKey
      )
    ) {
      setKeyError('이미 있는 키입니다.');
      return;
    }

    if (keyModal.mode === 'add') {
      setSections((current) => [...current, { key: nextKey, text: '' }]);
    } else if (nextKey !== keyModal.sectionKey) {
      setSections((current) =>
        current.map((section) =>
          section.key === keyModal.sectionKey
            ? { ...section, key: nextKey }
            : section
        )
      );
    }

    closeKeyModal();
  }

  function deleteKeySection(sectionKey: string) {
    const confirmed = window.confirm(`${sectionKey} 영역을 삭제할까요?`);
    if (!confirmed) {
      return;
    }

    setSections((current) =>
      current.filter((section) => section.key !== sectionKey)
    );
  }

  function openItemEdit(
    sectionKey: string,
    itemIndex: number,
    itemValue: string
  ) {
    setItemEdit({ sectionKey, itemIndex });
    setItemDraft(itemValue);
  }

  function closeItemEdit() {
    recentTouchItemOpenRef.current = null;
    setItemEdit(null);
    setItemDraft('');
  }

  function handleItemBackdropClick(
    event: ReactMouseEvent<HTMLButtonElement>
  ) {
    const recentTouchItemOpen = recentTouchItemOpenRef.current;
    if (recentTouchItemOpen) {
      const elapsed = Date.now() - recentTouchItemOpen.openedAt;
      const distance = Math.hypot(
        event.clientX - recentTouchItemOpen.x,
        event.clientY - recentTouchItemOpen.y
      );

      if (
        elapsed < ITEM_MODAL_BACKDROP_CLICK_GUARD_MS &&
        distance < ITEM_MODAL_BACKDROP_CLICK_GUARD_DISTANCE
      ) {
        recentTouchItemOpenRef.current = null;
        return;
      }
    }

    closeItemEdit();
  }

  function applyItemEdit() {
    if (!itemEdit) {
      return;
    }

    setSections((current) =>
      current.map((section) => {
        if (section.key !== itemEdit.sectionKey) {
          return section;
        }

        const items = splitDictListText(section.text);
        if (itemEdit.itemIndex < 0 || itemEdit.itemIndex >= items.length) {
          return section;
        }

        const nextItem = itemDraft.trim();
        if (nextItem) {
          items[itemEdit.itemIndex] = nextItem;
        } else {
          items.splice(itemEdit.itemIndex, 1);
        }

        return { ...section, text: items.join(', ') };
      })
    );
    closeItemEdit();
  }

  function deleteItem(sectionKey: string, itemIndex: number) {
    setSections((current) =>
      current.map((section) => {
        if (section.key !== sectionKey) {
          return section;
        }

        const items = splitDictListText(section.text);
        items.splice(itemIndex, 1);
        return { ...section, text: items.join(', ') };
      })
    );
  }

  function handleCardPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    sectionKey: string,
    itemIndex: number,
    itemValue: string
  ) {
    if (!event.isPrimary) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    if (event.pointerType !== 'mouse') {
      event.preventDefault();
    }

    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      sectionKey,
      itemIndex,
      itemValue,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      pointerOffsetX: event.clientX - rect.left,
      pointerOffsetY: event.clientY - rect.top,
      itemWidth: rect.width,
      itemHeight: rect.height,
      hasMoved: false,
      dropIndex: itemIndex,
    });
  }

  function handleCardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.pointerType !== 'mouse') {
      event.preventDefault();
    }

    const distance = Math.hypot(
      event.clientX - dragState.startX,
      event.clientY - dragState.startY
    );
    const dragStartDistance =
      event.pointerType === 'mouse'
        ? CARD_MOUSE_DRAG_START_DISTANCE
        : CARD_TOUCH_DRAG_START_DISTANCE;
    if (!dragState.hasMoved && distance < dragStartDistance) {
      return;
    }

    const dropIndex =
      getDictListDropIndex(
        dragState.sectionKey,
        event.clientX,
        event.clientY
      ) ?? dragState.dropIndex;

    setDragState({
      ...dragState,
      pointerX: event.clientX,
      pointerY: event.clientY,
      hasMoved: true,
      dropIndex,
    });
  }

  function handleCardPointerUp(
    event: ReactPointerEvent<HTMLDivElement>,
    sectionKey: string,
    itemIndex: number,
    itemValue: string
  ) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.pointerType !== 'mouse') {
      event.preventDefault();
      event.stopPropagation();
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const wasDragging = dragState.hasMoved;
    const dropIndex =
      getDictListDropIndex(
        dragState.sectionKey,
        event.clientX,
        event.clientY
      ) ?? dragState.dropIndex;

    setDragState(null);
    if (wasDragging) {
      setSections((current) =>
        current.map((section) => {
          if (section.key !== dragState.sectionKey) {
            return section;
          }

          const items = splitDictListText(section.text);
          if (
            dragState.itemIndex < 0 ||
            dragState.itemIndex >= items.length ||
            dropIndex < 0 ||
            dropIndex > items.length ||
            dropIndex === dragState.itemIndex ||
            dropIndex === dragState.itemIndex + 1
          ) {
            return section;
          }

          const [movedItem] = items.splice(dragState.itemIndex, 1);
          const insertionIndex =
            dropIndex > dragState.itemIndex ? dropIndex - 1 : dropIndex;
          items.splice(
            Math.min(Math.max(insertionIndex, 0), items.length),
            0,
            movedItem
          );
          return { ...section, text: items.join(', ') };
        })
      );
      return;
    }

    if (!wasDragging) {
      if (event.pointerType !== 'mouse') {
        recentTouchItemOpenRef.current = {
          x: event.clientX,
          y: event.clientY,
          openedAt: Date.now(),
        };
      }

      openItemEdit(sectionKey, itemIndex, itemValue);
    }
  }

  function handleCardPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragState(null);
  }

  function handleCardKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
    sectionKey: string,
    itemIndex: number,
    itemValue: string
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openItemEdit(sectionKey, itemIndex, itemValue);
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      deleteItem(sectionKey, itemIndex);
    }
  }
}

function normalizeDictListSections(value: unknown) {
  let sourceValue = value;
  if (typeof value === 'string' && value.trim()) {
    try {
      sourceValue = JSON.parse(value) as unknown;
    } catch {
      sourceValue = null;
    }
  }

  if (
    !sourceValue ||
    typeof sourceValue !== 'object' ||
    Array.isArray(sourceValue)
  ) {
    return [];
  }

  return Object.entries(sourceValue).map(([key, item]) => ({
    key,
    text: Array.isArray(item)
      ? item.map((entry) => String(entry)).join(', ')
      : item === null || item === undefined
        ? ''
      : String(item),
  }));
}

function parseDictListDisplayItems(text: string) {
  const items: DictListDisplayItem[] = [];
  let segmentStart = 0;
  let itemIndex = 0;

  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && text[index] !== ',') {
      continue;
    }

    const segmentEnd = index;
    let itemStart = segmentStart;
    while (itemStart < segmentEnd && /\s/.test(text[itemStart] ?? '')) {
      itemStart += 1;
    }

    let itemEnd = segmentEnd;
    while (itemEnd > itemStart && /\s/.test(text[itemEnd - 1] ?? '')) {
      itemEnd -= 1;
    }

    if (itemStart < itemEnd) {
      items.push({
        itemIndex,
        value: text.slice(itemStart, itemEnd),
        start: itemStart,
        end: itemEnd,
        segmentStart,
        segmentEnd,
      });
      itemIndex += 1;
    }

    segmentStart = index + 1;
  }

  return items;
}

function buildDictListVisualParts(
  text: string,
  items: DictListDisplayItem[]
) {
  const parts: DictListVisualPart[] = [];
  let cursor = 0;

  items.forEach((item) => {
    if (cursor < item.start) {
      parts.push({
        kind: 'text',
        value: text.slice(cursor, item.start),
        start: cursor,
        end: item.start,
      });
    }

    parts.push({ kind: 'item', item });
    cursor = item.end;
  });

  if (cursor < text.length) {
    parts.push({
      kind: 'text',
      value: text.slice(cursor),
      start: cursor,
      end: text.length,
    });
  }

  return parts;
}

function getDictListDropIndex(
  sectionKey: string,
  pointerX: number,
  pointerY: number
) {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-dict-list-section][data-dict-list-index]'
    ),
  ]
    .filter((element) => element.dataset.dictListSection === sectionKey)
    .flatMap((element) => {
      const itemIndex = Number(element.dataset.dictListIndex);
      if (!Number.isInteger(itemIndex)) {
        return [];
      }

      const rect = element.getBoundingClientRect();
      return [
        {
          itemIndex,
          rect,
        },
      ];
    })
    .sort(
      (first, second) =>
        first.rect.top - second.rect.top || first.rect.left - second.rect.left
    );

  if (candidates.length === 0) {
    return null;
  }

  const rows: {
    top: number;
    bottom: number;
    entries: typeof candidates;
  }[] = [];

  candidates.forEach((candidate) => {
    const candidateCenterY =
      candidate.rect.top + candidate.rect.height / 2;
    const row = rows.find(
      (currentRow) =>
        candidateCenterY >= currentRow.top - 4 &&
        candidateCenterY <= currentRow.bottom + 4
    );

    if (!row) {
      rows.push({
        top: candidate.rect.top,
        bottom: candidate.rect.bottom,
        entries: [candidate],
      });
      return;
    }

    row.top = Math.min(row.top, candidate.rect.top);
    row.bottom = Math.max(row.bottom, candidate.rect.bottom);
    row.entries.push(candidate);
  });

  const selectedRow = rows.reduce((bestRow, row) => {
    if (pointerY >= row.top && pointerY <= row.bottom) {
      return row;
    }

    if (pointerY >= bestRow.top && pointerY <= bestRow.bottom) {
      return bestRow;
    }

    const rowDistance = Math.min(
      Math.abs(pointerY - row.top),
      Math.abs(pointerY - row.bottom)
    );
    const bestRowDistance = Math.min(
      Math.abs(pointerY - bestRow.top),
      Math.abs(pointerY - bestRow.bottom)
    );
    return rowDistance < bestRowDistance ? row : bestRow;
  }, rows[0]);

  const rowEntries = [...selectedRow.entries].sort(
    (first, second) => first.rect.left - second.rect.left
  );

  for (const entry of rowEntries) {
    if (pointerX < entry.rect.left + entry.rect.width / 2) {
      return entry.itemIndex;
    }
  }

  return rowEntries[rowEntries.length - 1].itemIndex + 1;
}

function getCommaUnitCursorPosition(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  isBackward: boolean
) {
  const items = parseDictListDisplayItems(text);
  if (items.length === 0) {
    return isBackward ? 0 : text.length;
  }

  const cursorPosition = isBackward ? selectionStart : selectionEnd;

  if (isBackward) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.start < cursorPosition) {
        return item.start;
      }
    }

    return 0;
  }

  const nextItem = items.find((item) => item.start > cursorPosition);
  return nextItem?.start ?? text.length;
}

function splitDictListText(text: string) {
  return parseDictListDisplayItems(text).map((item) => item.value);
}
