import { useEffect, useMemo, useRef, useState } from 'react';
import { dbTables } from '../../api/api';
import {
  Button,
  FieldLabel,
  FormControl,
  ImageFrame,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
} from '../ui';
import { createHistory, pushHistory, redoHistory, undoHistory } from './history';

type NumberField = {
  name: string;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
};

type ImagePostprocessModalProps = {
  sourceBlob: Blob;
  onClose: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
};

const OPERATIONS = [
  { value: 'cleanup', label: 'cleanup', description: '뿌연 느낌을 줄이고 대비, 선명도, 약한 노이즈 제거를 한 번에 적용합니다.' },
  { value: 'enhance', label: 'enhance', description: '밋밋한 색감, 대비, 선명도를 자연스럽게 올리는 기본 보정입니다.' },
  { value: 'line_art', label: 'line_art', description: '선화를 더 진하게 만들어 캐릭터 윤곽과 펜선을 강조합니다.' },
  { value: 'upscale_cleanup', label: 'upscale_cleanup', description: '이미지를 확대한 뒤 약한 노이즈 제거와 샤픈을 적용합니다.' },
  { value: 'auto_contrast', label: 'auto contrast', description: '가장 어두운 톤과 밝은 톤을 재분배해 전체 대비를 자동으로 맞춥니다.' },
  { value: 'saturation', label: 'saturation', description: '색의 선명함을 올려 흐릿하거나 칙칙한 색감을 개선합니다.' },
  { value: 'contrast', label: 'contrast', description: '밝고 어두운 영역의 차이를 키워 이미지가 더 또렷해 보이게 합니다.' },
  { value: 'sharpness', label: 'sharpness', description: '경계와 디테일을 강조해 흐린 이미지를 선명하게 만듭니다.' },
  { value: 'gamma', label: 'gamma', description: '중간 밝기 톤을 조절해 어둡거나 탁한 이미지를 밝고 맑게 보정합니다.' },
  { value: 'clahe', label: 'CLAHE', description: '밝기 채널의 지역 대비를 올려 흐릿한 이미지를 또렷하게 보정합니다.' },
  { value: 'denoise', label: 'denoise', description: '작은 색 노이즈를 줄여 표면을 부드럽게 정리합니다.' },
  { value: 'resize', label: 'resize', description: '이미지를 지정 배율로 확대하거나 축소합니다.' },
  { value: 'line_boost', label: 'line boost', description: '어두운 선과 윤곽을 감지해 더 진하게 덧입힙니다.' },
  { value: 'edges', label: 'edges', description: 'Canny edge를 이용해 감지된 윤곽선을 어둡게 덧입힙니다.' },
] as const;

type OperationValue = typeof OPERATIONS[number]['value'];

const PARAM_FIELDS: Record<string, NumberField[]> = {
  cleanup: [
    { name: 'denoise_h', label: 'denoise', description: '노이즈 제거 강도입니다. 높을수록 부드러워지지만 디테일이 줄 수 있습니다.', min: 0, max: 30, step: 0.5, defaultValue: 2.5 },
    { name: 'saturation_factor', label: 'saturation', description: '색감 강화 배율입니다. 1보다 크면 색이 더 선명해집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.08 },
    { name: 'gamma', label: 'gamma', description: '중간 톤 밝기입니다. 1보다 작으면 밝고 선명하게, 1보다 크면 어둡게 보정합니다.', min: 0.1, max: 5, step: 0.05, defaultValue: 0.95 },
    { name: 'sharpness_factor', label: 'sharpness', description: '샤픈 강도입니다. 1보다 크면 경계와 디테일이 더 또렷해집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.15 },
  ],
  enhance: [
    { name: 'saturation_factor', label: 'saturation', description: '색감 강화 배율입니다. 1보다 크면 색이 더 선명해집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.2 },
    { name: 'contrast_factor', label: 'contrast', description: '대비 강화 배율입니다. 1보다 크면 밝고 어두운 차이가 커집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.15 },
    { name: 'sharpness_factor', label: 'sharpness', description: '샤픈 강도입니다. 1보다 크면 경계와 디테일이 더 또렷해집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.25 },
  ],
  line_art: [
    { name: 'line_amount', label: 'line', description: '선화를 얼마나 진하게 반영할지 정합니다. 높을수록 윤곽이 강해집니다.', min: 0, max: 1, step: 0.05, defaultValue: 0.55 },
    { name: 'sharpness_factor', label: 'sharpness', description: '샤픈 강도입니다. 1보다 크면 경계와 디테일이 더 또렷해집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.4 },
  ],
  upscale_cleanup: [
    { name: 'scale', label: 'scale', description: '이미지 확대 배율입니다. 2는 가로와 세로를 각각 2배로 키웁니다.', min: 0.1, max: 8, step: 0.1, defaultValue: 2 },
    { name: 'denoise_h', label: 'denoise', description: '노이즈 제거 강도입니다. 높을수록 부드러워지지만 디테일이 줄 수 있습니다.', min: 0, max: 30, step: 0.5, defaultValue: 2 },
    { name: 'sharpness_factor', label: 'sharpness', description: '샤픈 강도입니다. 1보다 크면 확대 후 흐려진 경계가 또렷해집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.2 },
  ],
  auto_contrast: [
    { name: 'cutoff', label: 'cutoff', description: '자동 대비에서 양끝 톤을 얼마나 잘라낼지 정합니다. 높을수록 대비가 강해집니다.', min: 0, max: 50, step: 1, defaultValue: 0 },
  ],
  saturation: [
    { name: 'factor', label: 'factor', description: '채도 배율입니다. 1은 원본 수준이고, 1보다 크면 색이 더 진해집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.2 },
  ],
  contrast: [
    { name: 'factor', label: 'factor', description: '대비 배율입니다. 1은 원본 수준이고, 1보다 크면 명암 차이가 커집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.15 },
  ],
  sharpness: [
    { name: 'factor', label: 'factor', description: '샤픈 배율입니다. 1은 원본 수준이고, 1보다 크면 경계가 선명해집니다.', min: 0, max: 5, step: 0.05, defaultValue: 1.4 },
  ],
  gamma: [
    { name: 'gamma', label: 'gamma', description: '중간 톤 밝기입니다. 1보다 작으면 밝고 선명하게, 1보다 크면 어둡게 보정합니다.', min: 0.1, max: 5, step: 0.05, defaultValue: 0.95 },
  ],
  clahe: [
    { name: 'clip_limit', label: 'clip', description: 'CLAHE 대비 강화 강도입니다. 높을수록 지역 대비가 강해집니다.', min: 0.1, max: 10, step: 0.1, defaultValue: 2 },
    { name: 'tile_grid_size', label: 'tile', description: 'CLAHE가 이미지를 나누어 분석하는 블록 크기입니다.', min: 2, max: 32, step: 1, defaultValue: 8 },
  ],
  denoise: [
    { name: 'h', label: 'h', description: '노이즈 제거 강도입니다. 높을수록 부드러워지지만 세부 질감이 줄 수 있습니다.', min: 0, max: 30, step: 0.5, defaultValue: 3 },
  ],
  resize: [
    { name: 'scale', label: 'scale', description: '크기 변경 배율입니다. 2는 2배 확대, 0.5는 절반 축소입니다.', min: 0.1, max: 8, step: 0.1, defaultValue: 2 },
  ],
  line_boost: [
    { name: 'amount', label: 'amount', description: '선화를 얼마나 진하게 반영할지 정합니다. 높을수록 어두운 선이 강해집니다.', min: 0, max: 1, step: 0.05, defaultValue: 0.45 },
  ],
  edges: [
    { name: 'amount', label: 'amount', description: '감지된 edge를 얼마나 진하게 덧입힐지 정합니다.', min: 0, max: 1, step: 0.05, defaultValue: 0.65 },
    { name: 'low_threshold', label: 'low', description: 'edge 감지의 낮은 민감도 기준입니다. 낮을수록 더 많은 약한 선을 잡습니다.', min: 0, max: 255, step: 1, defaultValue: 80 },
    { name: 'high_threshold', label: 'high', description: 'edge 감지의 높은 민감도 기준입니다. 높을수록 강한 윤곽만 남기기 쉽습니다.', min: 0, max: 255, step: 1, defaultValue: 160 },
  ],
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '이미지 후처리에 실패했습니다.';
}

function readNumber(value: string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function OperationDropdown({
  value,
  disabled,
  onChange,
  onHelpChange,
}: {
  value: OperationValue;
  disabled: boolean;
  onChange: (value: OperationValue) => void;
  onHelpChange: (text: string | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOperation = OPERATIONS.find((item) => item.value === value) ?? OPERATIONS[0];

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      onMouseLeave={() => onHelpChange(null)}
    >
      <div>
        <button
          type="button"
          className="h-9 w-full rounded-[8px] border border-[rgba(255,196,214,0.34)] bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035)),rgba(13,5,19,0.72)] px-3 text-left text-sm font-semibold text-[var(--app-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_24px_rgba(0,0,0,0.18)] transition-[border-color,background] hover:border-[rgba(255,226,186,0.7)] focus:border-[rgba(255,226,186,0.95)] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => setIsOpen((current) => !current)}
          onFocus={() => onHelpChange(selectedOperation.description)}
          onMouseEnter={() => onHelpChange(selectedOperation.description)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate">{selectedOperation.label}</span>
            <span aria-hidden="true" className="text-xs text-[#f1c4d0]">▾</span>
          </span>
        </button>
      </div>

      {isOpen ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-[80] mt-1 space-y-1 rounded-[8px] border border-[rgba(255,196,214,0.3)] bg-[rgba(12,4,18,0.98)] p-1 shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
        >
          {OPERATIONS.map((item) => (
            <div key={item.value}>
              <button
                type="button"
                role="option"
                aria-selected={item.value === value}
                className="flex h-8 w-full items-center justify-between gap-2 rounded-[6px] px-2 text-left text-xs font-bold text-[#fff5eb] hover:bg-[rgba(255,226,186,0.14)] focus:bg-[rgba(255,226,186,0.18)] focus:outline-none"
                onFocus={() => onHelpChange(item.description)}
                onMouseEnter={() => onHelpChange(item.description)}
                onClick={() => {
                  onChange(item.value);
                  onHelpChange(item.description);
                  setIsOpen(false);
                }}
              >
                <span className="truncate">{item.label}</span>
                {item.value === value ? <span aria-hidden="true">●</span> : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ImagePostprocessModal({
  sourceBlob,
  onClose,
  onConfirm,
}: ImagePostprocessModalProps) {
  const historyRef = useRef(createHistory<Blob>());
  const [currentBlob, setCurrentBlob] = useState(sourceBlob);
  const [previewUrl, setPreviewUrl] = useState(() => URL.createObjectURL(sourceBlob));
  const previewUrlRef = useRef(previewUrl);
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });
  const [operation, setOperation] = useState<OperationValue>(OPERATIONS[0].value);
  const [parameterDraft, setParameterDraft] = useState<Record<string, number>>({});
  const [activeHelpText, setActiveHelpText] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => PARAM_FIELDS[operation] ?? [], [operation]);
  const selectedOperation = OPERATIONS.find((item) => item.value === operation) ?? OPERATIONS[0];
  const helpText = activeHelpText ?? selectedOperation.description;
  const isBusy = isApplying || isConfirming;
  const canUndo = historyCounts.past > 0;
  const canRedo = historyCounts.future > 0;

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function syncHistoryCounts() {
    setHistoryCounts({
      past: historyRef.current.past.length,
      future: historyRef.current.future.length,
    });
  }

  function replaceCurrentBlob(blob: Blob) {
    const nextUrl = URL.createObjectURL(blob);
    const previousUrl = previewUrlRef.current;
    previewUrlRef.current = nextUrl;
    setCurrentBlob(blob);
    setPreviewUrl(nextUrl);
    URL.revokeObjectURL(previousUrl);
  }

  function getParameters() {
    return fields.reduce<Record<string, number>>((parameters, field) => {
      parameters[field.name] = parameterDraft[field.name] ?? field.defaultValue;
      return parameters;
    }, {});
  }

  function updateParameter(field: NumberField, value: number) {
    setParameterDraft((current) => ({
      ...current,
      [field.name]: clamp(value, field.min, field.max),
    }));
  }

  async function applyOperation() {
    if (isBusy) {
      return;
    }
    setIsApplying(true);
    setError(null);
    try {
      const nextBlob = await dbTables.ImageUtil.postprocessImage(currentBlob, operation, getParameters());
      pushHistory(historyRef.current, currentBlob);
      syncHistoryCounts();
      replaceCurrentBlob(nextBlob);
    } catch (applyError) {
      setError(getErrorMessage(applyError));
    } finally {
      setIsApplying(false);
    }
  }

  function undo() {
    const previous = undoHistory(historyRef.current, currentBlob);
    if (!previous) {
      return;
    }
    syncHistoryCounts();
    replaceCurrentBlob(previous);
    setError(null);
  }

  function redo() {
    const next = redoHistory(historyRef.current, currentBlob);
    if (!next) {
      return;
    }
    syncHistoryCounts();
    replaceCurrentBlob(next);
    setError(null);
  }

  async function confirm() {
    if (isBusy) {
      return;
    }
    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm(currentBlob);
    } catch (confirmError) {
      setError(getErrorMessage(confirmError));
      setIsConfirming(false);
    }
  }

  return (
    <ModalBackdrop nested topAligned>
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-postprocess-title"
        className="w-[min(62rem,calc(100vw-2rem))] overflow-visible"
      >
        <PanelHeader>
          <div className="min-w-0">
            <h2 id="image-postprocess-title" className="text-base font-extrabold text-[#fff5eb]">
              이미지 후처리
            </h2>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button className="h-8 px-3 py-0 text-xs" onClick={onClose} disabled={isBusy}>
              닫기
            </Button>
          </div>
        </PanelHeader>

        <SectionBody className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <ImageFrame className="min-h-[24rem] rounded-[8px] border border-[rgba(255,196,214,0.2)]">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            ) : null}
          </ImageFrame>

          <div className="flex min-h-[24rem] flex-col gap-3">
            <label className="block space-y-1">
              <FieldLabel>operation</FieldLabel>
              <OperationDropdown
                value={operation}
                disabled={isBusy}
                onHelpChange={setActiveHelpText}
                onChange={(nextOperation) => {
                  setOperation(nextOperation);
                  setParameterDraft({});
                  setError(null);
                }}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              {fields.map((field) => (
                <label
                  key={field.name}
                  className="min-w-0 space-y-1"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setActiveHelpText(null);
                    }
                  }}
                  onFocus={() => setActiveHelpText(field.description)}
                  onMouseEnter={() => setActiveHelpText(field.description)}
                  onMouseLeave={() => setActiveHelpText(null)}
                >
                  <FieldLabel>{field.label}</FieldLabel>
                  <FormControl
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={parameterDraft[field.name] ?? field.defaultValue}
                    onChange={(event) => {
                      const nextValue = readNumber(event.target.value);
                      if (nextValue !== null) {
                        updateParameter(field, nextValue);
                      }
                    }}
                    disabled={isBusy}
                    className="h-9 w-full px-2 text-right text-sm"
                  />
                </label>
              ))}
            </div>

            {error ? <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button className="h-8 px-3 py-0 text-xs" onClick={undo} disabled={isBusy || !canUndo} title="undo">
                ↩
              </Button>
              <Button className="h-8 px-3 py-0 text-xs" onClick={redo} disabled={isBusy || !canRedo} title="redo">
                ↪
              </Button>
              <Button className="inline-flex h-8 items-center gap-2 px-3 py-0 text-xs" onClick={() => void applyOperation()} disabled={isBusy}>
                {isApplying ? <Spinner aria-hidden="true" /> : null}
                적용
              </Button>
              <Button variant="primary" className="ml-auto inline-flex h-8 items-center gap-2 px-3 py-0 text-xs" onClick={() => void confirm()} disabled={isBusy}>
                {isConfirming ? <Spinner aria-hidden="true" /> : null}
                확인
              </Button>
            </div>

            <div className="mt-auto rounded-[8px] border border-[rgba(255,226,186,0.22)] bg-[rgba(8,2,13,0.42)] px-3 py-2 text-xs font-semibold leading-5 text-[#fff5eb]">
              {helpText}
            </div>
          </div>
        </SectionBody>
      </Panel>
    </ModalBackdrop>
  );
}
