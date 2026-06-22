import {
  useLayoutEffect,
  useRef,
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
  const isInputDisabled = isLoadingCut || Boolean(savingMode) || isGeneratingScript || isGeneratingPromptItems;

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
          value={script}
          onChange={(event) => setScript(event.target.value)}
          className="min-h-44 w-full resize-y px-3 py-2 text-sm leading-6"
          disabled={isInputDisabled}
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[#fff7ef]">프롬프트 항목</span>
          <div className="flex flex-wrap items-center gap-2">
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
        <div className="overflow-hidden rounded-[8px] border border-[rgba(255,208,222,0.24)] bg-[rgba(12,5,18,0.46)]">
          {PROMPT_EDITOR_COLUMNS.map((column) => {
            const value = column.kind === 'stored'
              ? promptDraft[column.key]
              : column.kind === 'negative'
                ? promptNegativeDraft
                : instantPromptDraft[column.key];
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
