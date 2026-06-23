import {
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  SetStateAction,
} from 'react';
import type { CameraSamples, PromptColumnName } from '../../api/type';
import { Button, FieldLabel, FormControl, Spinner } from '../ui';
import { PROMPT_EDITOR_COLUMNS } from './constants';
import type {
  InstantPromptName,
  PromptEditorColumnName,
  SaveMode,
} from './types';

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function formatPromptKeyword(keyword: string, weight: number) {
  if (weight === 1) {
    return keyword;
  }
  return `(${keyword}:${weight.toFixed(1)})`;
}

function adjustPromptKeywordWeight(value: string, cursorPosition: number, direction: 1 | -1) {
  const previousCommaIndex = value.lastIndexOf(',', Math.max(0, cursorPosition - 1));
  const nextCommaIndex = value.indexOf(',', cursorPosition);
  const segmentStart = previousCommaIndex === -1 ? 0 : previousCommaIndex + 1;
  const segmentEnd = nextCommaIndex === -1 ? value.length : nextCommaIndex;
  const segment = value.slice(segmentStart, segmentEnd);
  const leadingWhitespace = segment.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = segment.match(/\s*$/)?.[0] ?? '';
  const contentStart = leadingWhitespace.length;
  const contentEnd = segment.length - trailingWhitespace.length;
  const content = segment.slice(contentStart, contentEnd);

  if (!content.trim()) {
    return null;
  }

  const weightedMatch = content.match(/^\((.*):\s*([0-9]+(?:\.[0-9]+)?)\)$/);
  const keyword = weightedMatch?.[1]?.trim() || content.trim();
  const currentWeight = weightedMatch ? Number(weightedMatch[2]) : 1;

  if (!keyword || !Number.isFinite(currentWeight)) {
    return null;
  }

  const nextWeight = Math.max(0.1, Math.round((currentWeight + direction * 0.1) * 10) / 10);
  const nextContent = formatPromptKeyword(keyword, nextWeight);
  const nextSegment = `${leadingWhitespace}${nextContent}${trailingWhitespace}`;
  const nextValue = `${value.slice(0, segmentStart)}${nextSegment}${value.slice(segmentEnd)}`;
  const nextCursorPosition = segmentStart + leadingWhitespace.length + nextContent.length;

  return {
    nextValue,
    nextCursorPosition,
  };
}

function parsePromptClipboardText(text: string) {
  const values = new Map<PromptEditorColumnName, string>();
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let currentColumnIndex = -1;
  let currentLines: string[] = [];

  function commitCurrentSection() {
    if (currentColumnIndex < 0) {
      return;
    }
    const currentColumn = PROMPT_EDITOR_COLUMNS[currentColumnIndex];
    values.set(currentColumn.key, currentLines.join('\n').trim());
  }

  for (const line of lines) {
    const headerMatch = line.match(/^\[([^\]]+)\]\s*$/);
    if (headerMatch) {
      const label = headerMatch[1].trim();
      const nextColumnIndex = PROMPT_EDITOR_COLUMNS.findIndex((column) => column.label === label);
      if (nextColumnIndex !== currentColumnIndex + 1) {
        return null;
      }

      commitCurrentSection();
      currentColumnIndex = nextColumnIndex;
      currentLines = [];
      continue;
    }

    if (currentColumnIndex < 0) {
      if (line.trim()) {
        return null;
      }
      continue;
    }

    currentLines.push(line);
  }

  commitCurrentSection();
  if (values.size !== PROMPT_EDITOR_COLUMNS.length) {
    return null;
  }

  return PROMPT_EDITOR_COLUMNS.reduce(
    (draft, column) => {
      draft[column.key] = values.get(column.key) ?? '';
      return draft;
    },
    {} as Record<PromptEditorColumnName, string>,
  );
}

type CutPromptPanelProps = {
  script: string;
  promptDraft: Record<PromptColumnName, string>;
  instantPromptDraft: Record<InstantPromptName, string>;
  promptNegativeDraft: string;
  translationDraft: Record<PromptEditorColumnName, string>;
  cameraSamples: CameraSamples;
  isLoadingCut: boolean;
  savingMode: SaveMode | null;
  isGeneratingScript: boolean;
  isTranslatingPromptColumns: boolean;
  isGeneratingPromptItems: boolean;
  canGenerateScript: boolean;
  canTranslatePromptColumns: boolean;
  canGeneratePromptItems: boolean;
  setScript: (script: string) => void;
  setPromptDraft: Dispatch<SetStateAction<Record<PromptColumnName, string>>>;
  setInstantPromptDraft: Dispatch<SetStateAction<Record<InstantPromptName, string>>>;
  setPromptNegativeDraft: Dispatch<SetStateAction<string>>;
  setTranslationDraft: Dispatch<SetStateAction<Record<PromptEditorColumnName, string>>>;
  onGenerateScript: () => void;
  onGeneratePromptItems: () => void;
  onTranslatePromptColumns: () => void;
};

export function CutPromptPanel({
  script,
  promptDraft,
  instantPromptDraft,
  promptNegativeDraft,
  translationDraft,
  cameraSamples,
  isLoadingCut,
  savingMode,
  isGeneratingScript,
  isTranslatingPromptColumns,
  isGeneratingPromptItems,
  canGenerateScript,
  canTranslatePromptColumns,
  canGeneratePromptItems,
  setScript,
  setPromptDraft,
  setInstantPromptDraft,
  setPromptNegativeDraft,
  setTranslationDraft,
  onGenerateScript,
  onGeneratePromptItems,
  onTranslatePromptColumns,
}: CutPromptPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [clipboardStatus, setClipboardStatus] = useState<string | null>(null);
  const isInputDisabled = isLoadingCut || Boolean(savingMode) || isGeneratingScript || isGeneratingPromptItems;

  function getPromptValue(column: (typeof PROMPT_EDITOR_COLUMNS)[number]) {
    if (column.kind === 'stored') {
      return promptDraft[column.key];
    }
    if (column.kind === 'negative') {
      return promptNegativeDraft;
    }
    return instantPromptDraft[column.key];
  }

  const canCopyPromptClipboard = PROMPT_EDITOR_COLUMNS.some(
    (column) => getPromptValue(column).trim().length > 0,
  );

  useLayoutEffect(() => {
    const textareas = panelRef.current?.querySelectorAll<HTMLTextAreaElement>(
      '[data-auto-resize-prompt-textarea]',
    );
    textareas?.forEach(resizeTextarea);
  }, [instantPromptDraft, promptDraft, promptNegativeDraft, translationDraft]);

  function updatePromptValue(column: (typeof PROMPT_EDITOR_COLUMNS)[number], nextValue: string) {
    if (column.kind === 'stored') {
      setPromptDraft((current) => ({
        ...current,
        [column.key]: nextValue,
      }));
      return;
    }
    if (column.kind === 'negative') {
      setPromptNegativeDraft(nextValue);
      return;
    }
    setInstantPromptDraft((current) => ({
      ...current,
      [column.key]: nextValue,
    }));
  }

  function appendCameraSample(sample: string) {
    const trimmedSample = sample.trim();
    if (!trimmedSample) {
      return;
    }

    setPromptDraft((current) => {
      const currentText = current.prompt_camera.trim();
      return {
        ...current,
        prompt_camera: currentText ? `${currentText}, ${trimmedSample}` : trimmedSample,
      };
    });
  }

  async function copyPromptClipboard() {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      setClipboardStatus('클립보드를 사용할 수 없습니다.');
      return;
    }

    const clipboardText = PROMPT_EDITOR_COLUMNS
      .map((column) => `[${column.label}]\n${getPromptValue(column)}`)
      .join('\n\n');

    try {
      await clipboard.writeText(clipboardText);
      setClipboardStatus('전체 프롬프트 복사 완료');
    } catch {
      setClipboardStatus('클립보드 복사에 실패했습니다.');
    }
  }

  async function pastePromptClipboard() {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      setClipboardStatus('클립보드를 사용할 수 없습니다.');
      return;
    }

    try {
      const clipboardText = await clipboard.readText();
      if (!clipboardText.trim()) {
        setClipboardStatus('클립보드가 비어 있습니다.');
        return;
      }

      const parsedPrompt = parsePromptClipboardText(clipboardText);
      if (!parsedPrompt) {
        setClipboardStatus('프롬프트 형식이 올바르지 않습니다.');
        return;
      }

      setPromptDraft({
        prompt_situation: parsedPrompt.prompt_situation,
        prompt_hero: parsedPrompt.prompt_hero,
        prompt_detail: parsedPrompt.prompt_detail,
        prompt_camera: parsedPrompt.prompt_camera,
      });
      setInstantPromptDraft({
        prompt_instant_positive: parsedPrompt.prompt_instant_positive,
        prompt_instant_negative: parsedPrompt.prompt_instant_negative,
      });
      setPromptNegativeDraft(parsedPrompt.prompt_negative);
      setClipboardStatus('전체 프롬프트 붙여넣기 완료');
    } catch {
      setClipboardStatus('클립보드 붙여넣기에 실패했습니다.');
    }
  }

  function handlePromptValueKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    column: (typeof PROMPT_EDITOR_COLUMNS)[number],
  ) {
    if (!event.ctrlKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
      return;
    }

    const textarea = event.currentTarget;
    const adjustment = adjustPromptKeywordWeight(
      textarea.value,
      textarea.selectionStart,
      event.key === 'ArrowUp' ? 1 : -1,
    );
    if (!adjustment) {
      return;
    }

    event.preventDefault();
    updatePromptValue(column, adjustment.nextValue);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(adjustment.nextCursorPosition, adjustment.nextCursorPosition);
      resizeTextarea(textarea);
    });
  }

  return (
    <div ref={panelRef} className="min-w-0 space-y-4">
      <div className="block space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel>컷 스크립트</FieldLabel>
          <Button
            className="inline-flex items-center gap-2 px-3 py-2 text-xs"
            onClick={onGenerateScript}
            disabled={!canGenerateScript}
          >
            {isGeneratingScript ? <Spinner aria-hidden="true" /> : null}
            {isGeneratingScript ? '생성 중' : '스크립트 생성'}
          </Button>
        </div>
        <FormControl
          as="textarea"
          rows={12}
          value={script}
          onChange={(event) => setScript(event.target.value)}
          className="min-h-44 w-full resize-y px-3 py-2 leading-6"
          style={{ fontSize: '14.5px' }}
          disabled={isInputDisabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#fff7ef]">프롬프트 항목</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={() => void copyPromptClipboard()}
              disabled={!canCopyPromptClipboard}
            >
              전체 복사
            </Button>
            <Button
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={() => void pastePromptClipboard()}
              disabled={isInputDisabled}
            >
              전체 붙여넣기
            </Button>
            <Button
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={onGeneratePromptItems}
              disabled={!canGeneratePromptItems}
            >
              {isGeneratingPromptItems ? <Spinner aria-hidden="true" /> : null}
              {isGeneratingPromptItems ? '생성 중' : '스크립트로 채우기'}
            </Button>
            <Button
              className="inline-flex items-center gap-2 px-3 py-2 text-xs"
              onClick={onTranslatePromptColumns}
              disabled={!canTranslatePromptColumns}
            >
              {isTranslatingPromptColumns ? <Spinner aria-hidden="true" /> : null}
              {isTranslatingPromptColumns ? '번역 중' : '번역하여 추가'}
            </Button>
          </div>
        </div>
        {clipboardStatus ? (
          <p aria-live="polite" className="text-xs font-semibold text-[#ffd8b0]">
            {clipboardStatus}
          </p>
        ) : null}
        <div className="overflow-hidden rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[rgba(12,5,18,0.46)]">
          {PROMPT_EDITOR_COLUMNS.map((column) => {
            const value = getPromptValue(column);
            const isCameraColumn = column.key === 'prompt_camera';
            const cameraSampleGroups = Object.entries(cameraSamples)
              .map(([groupName, samplesByTag]) => ({
                groupName,
                samples: Object.entries(samplesByTag)
                  .map(([tag, description]) => ({
                    tag: tag.trim(),
                    description: description.trim(),
                  }))
                  .filter((sample) => sample.tag.length > 0),
              }))
              .filter((group) => group.samples.length > 0);

            return (
              <div
                key={column.key}
                className="grid gap-2 border-b border-[rgba(255,208,222,0.16)] p-2 last:border-b-0 md:grid-cols-[5.5rem_minmax(0,1fr)] md:items-start"
              >
                <div className="pt-2">
                  <FieldLabel>{column.label}</FieldLabel>
                </div>
                <div
                  className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
                >
                  <label className="block min-w-0">
                    <span className="sr-only">{column.label}</span>
                    <FormControl
                      as="textarea"
                      rows={1}
                      data-auto-resize-prompt-textarea
                      value={value}
                      onChange={(event) => {
                        updatePromptValue(column, event.target.value);
                      }}
                      onKeyDown={(event) => handlePromptValueKeyDown(event, column)}
                      onInput={(event) => resizeTextarea(event.currentTarget)}
                      className="min-h-10 w-full resize-none overflow-hidden px-3 py-2 text-sm"
                      disabled={isInputDisabled}
                    />
                  </label>
                  {isCameraColumn ? (
                    <label className="block min-w-0">
                      <span className="sr-only">{column.label} 샘플 선택</span>
                      <FormControl
                        as="select"
                        value=""
                        onChange={(event) => appendCameraSample(event.target.value)}
                        className="h-10 w-full px-3 text-sm"
                        disabled={isInputDisabled || cameraSampleGroups.length === 0}
                      >
                        <option value="">카메라 샘플 선택</option>
                        {cameraSampleGroups.map((group) => (
                          <optgroup key={group.groupName} label={group.groupName}>
                            {group.samples.map((sample) => (
                              <option
                                key={`${group.groupName}:${sample.tag}`}
                                value={sample.tag}
                                title={sample.description || sample.tag}
                              >
                                {sample.tag}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </FormControl>
                    </label>
                  ) : (
                    <label className="block min-w-0">
                      <span className="sr-only">{column.label} 한국어 번역 입력</span>
                      <FormControl
                        as="textarea"
                        rows={1}
                        data-auto-resize-prompt-textarea
                        value={translationDraft[column.key]}
                        onChange={(event) =>
                          setTranslationDraft((current) => ({
                            ...current,
                            [column.key]: event.target.value,
                          }))
                        }
                        onInput={(event) => resizeTextarea(event.currentTarget)}
                        className="min-h-10 w-full resize-none overflow-hidden px-3 py-2 text-sm"
                        placeholder="한국어, 콤마 구분"
                        disabled={isInputDisabled || isTranslatingPromptColumns}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
