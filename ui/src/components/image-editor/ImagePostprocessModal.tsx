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
  { value: 'cleanup', label: 'cleanup' },
  { value: 'enhance', label: 'enhance' },
  { value: 'line_art', label: 'line_art' },
  { value: 'upscale_cleanup', label: 'upscale_cleanup' },
  { value: 'auto_contrast', label: 'auto contrast' },
  { value: 'saturation', label: 'saturation' },
  { value: 'contrast', label: 'contrast' },
  { value: 'sharpness', label: 'sharpness' },
  { value: 'gamma', label: 'gamma' },
  { value: 'clahe', label: 'CLAHE' },
  { value: 'denoise', label: 'denoise' },
  { value: 'resize', label: 'resize' },
  { value: 'line_boost', label: 'line boost' },
  { value: 'edges', label: 'edges' },
] as const;

type OperationValue = typeof OPERATIONS[number]['value'];

const PARAM_FIELDS: Record<string, NumberField[]> = {
  cleanup: [
    { name: 'denoise_h', label: 'denoise', min: 0, max: 30, step: 0.5, defaultValue: 2.5 },
    { name: 'saturation_factor', label: 'saturation', min: 0, max: 5, step: 0.05, defaultValue: 1.08 },
    { name: 'gamma', label: 'gamma', min: 0.1, max: 5, step: 0.05, defaultValue: 0.95 },
    { name: 'sharpness_factor', label: 'sharpness', min: 0, max: 5, step: 0.05, defaultValue: 1.15 },
  ],
  enhance: [
    { name: 'saturation_factor', label: 'saturation', min: 0, max: 5, step: 0.05, defaultValue: 1.2 },
    { name: 'contrast_factor', label: 'contrast', min: 0, max: 5, step: 0.05, defaultValue: 1.15 },
    { name: 'sharpness_factor', label: 'sharpness', min: 0, max: 5, step: 0.05, defaultValue: 1.25 },
  ],
  line_art: [
    { name: 'line_amount', label: 'line', min: 0, max: 1, step: 0.05, defaultValue: 0.55 },
    { name: 'sharpness_factor', label: 'sharpness', min: 0, max: 5, step: 0.05, defaultValue: 1.4 },
  ],
  upscale_cleanup: [
    { name: 'scale', label: 'scale', min: 0.1, max: 8, step: 0.1, defaultValue: 2 },
    { name: 'denoise_h', label: 'denoise', min: 0, max: 30, step: 0.5, defaultValue: 2 },
    { name: 'sharpness_factor', label: 'sharpness', min: 0, max: 5, step: 0.05, defaultValue: 1.2 },
  ],
  auto_contrast: [
    { name: 'cutoff', label: 'cutoff', min: 0, max: 50, step: 1, defaultValue: 0 },
  ],
  saturation: [
    { name: 'factor', label: 'factor', min: 0, max: 5, step: 0.05, defaultValue: 1.2 },
  ],
  contrast: [
    { name: 'factor', label: 'factor', min: 0, max: 5, step: 0.05, defaultValue: 1.15 },
  ],
  sharpness: [
    { name: 'factor', label: 'factor', min: 0, max: 5, step: 0.05, defaultValue: 1.4 },
  ],
  gamma: [
    { name: 'gamma', label: 'gamma', min: 0.1, max: 5, step: 0.05, defaultValue: 0.95 },
  ],
  clahe: [
    { name: 'clip_limit', label: 'clip', min: 0.1, max: 10, step: 0.1, defaultValue: 2 },
    { name: 'tile_grid_size', label: 'tile', min: 2, max: 32, step: 1, defaultValue: 8 },
  ],
  denoise: [
    { name: 'h', label: 'h', min: 0, max: 30, step: 0.5, defaultValue: 3 },
  ],
  resize: [
    { name: 'scale', label: 'scale', min: 0.1, max: 8, step: 0.1, defaultValue: 2 },
  ],
  line_boost: [
    { name: 'amount', label: 'amount', min: 0, max: 1, step: 0.05, defaultValue: 0.45 },
  ],
  edges: [
    { name: 'amount', label: 'amount', min: 0, max: 1, step: 0.05, defaultValue: 0.65 },
    { name: 'low_threshold', label: 'low', min: 0, max: 255, step: 1, defaultValue: 80 },
    { name: 'high_threshold', label: 'high', min: 0, max: 255, step: 1, defaultValue: 160 },
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
  const [isApplying, setIsApplying] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = useMemo(() => PARAM_FIELDS[operation] ?? [], [operation]);
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

          <div className="space-y-3">
            <label className="block space-y-1">
              <FieldLabel>operation</FieldLabel>
              <FormControl
                as="select"
                value={operation}
                onChange={(event) => {
                  setOperation(event.target.value as OperationValue);
                  setParameterDraft({});
                  setError(null);
                }}
                disabled={isBusy}
                className="h-9 w-full px-3 text-sm"
              >
                {OPERATIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </FormControl>
            </label>

            <div className="grid grid-cols-2 gap-2">
              {fields.map((field) => (
                <label key={field.name} className="min-w-0 space-y-1">
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
          </div>
        </SectionBody>
      </Panel>
    </ModalBackdrop>
  );
}
