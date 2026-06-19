import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { dbTables } from '../../api/api';
import type { GenerateImageRequest, ImageGenerationSettings } from '../../api/type';
import {
  Button,
  FieldLabel,
  FormControl,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
} from '../ui';
import {
  canvasToPngBlob,
  cloneCanvas,
  copyCanvasRegion,
  createCanvasFromBlob,
  get2dContext,
} from './canvas';
import type { Point, Rect } from './types';

type RgbColor = {
  red: number;
  green: number;
  blue: number;
};

type ImageObjectGenerateModalProps = {
  parameters: ImageGenerationSettings;
  initialRect: Rect | null;
  onClose: () => void;
  onConfirm: (blob: Blob, placementRect: Rect | null) => Promise<void> | void;
};

const DEFAULT_POSITIVE_PROMPT = 'no background, single shot, full shot, centered';
const DEFAULT_IMAGE_WIDTH = 832;
const DEFAULT_IMAGE_HEIGHT = 1216;
const IMAGE_SIZE_OPTIONS = [512, 768, 832, 1024, 1216] as const;
const DEFAULT_TOLERANCE = 24;
const DEFAULT_TRANSPARENT_COLOR: RgbColor = { red: 255, green: 255, blue: 255 };
const MIN_CROP_SIZE = 8;
const CHECKERBOARD_STYLE = {
  backgroundColor: 'rgba(20,12,26,0.92)',
  backgroundImage:
    'linear-gradient(45deg, rgba(255,255,255,0.16) 25%, transparent 25%), ' +
    'linear-gradient(-45deg, rgba(255,255,255,0.16) 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.16) 75%), ' +
    'linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.16) 75%)',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
  backgroundSize: '20px 20px',
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '이미지 object 생성에 실패했습니다.';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readNumber(value: string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function clampColorChannel(value: number) {
  return clamp(Math.round(value), 0, 255);
}

function resolutionButtonClass(isSelected: boolean) {
  return [
    'h-8 px-0 py-0 text-xs',
    isSelected ? 'ring-2 ring-[#fff1c7] ring-offset-1 ring-offset-[rgba(16,7,22,0.9)]' : '',
  ].filter(Boolean).join(' ');
}

function getRectFromPoints(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function getCanvasEventPoint(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }): Point {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width),
    y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height),
  };
}

function isValidCropRect(rect: Rect | null): rect is Rect {
  return !!rect && rect.width >= MIN_CROP_SIZE && rect.height >= MIN_CROP_SIZE;
}

export function ImageObjectGenerateModal({
  parameters,
  initialRect,
  onClose,
  onConfirm,
}: ImageObjectGenerateModalProps) {
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragStartRef = useRef<Point | null>(null);
  const eraseDragStartRef = useRef<Point | null>(null);
  const [positivePrompt, setPositivePrompt] = useState(DEFAULT_POSITIVE_PROMPT);
  const [negativePrompt, setNegativePrompt] = useState(parameters.prompt_default_negative);
  const [imageWidth, setImageWidth] = useState(DEFAULT_IMAGE_WIDTH);
  const [imageHeight, setImageHeight] = useState(DEFAULT_IMAGE_HEIGHT);
  const [hasGeneratedImage, setHasGeneratedImage] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [generatedSeed, setGeneratedSeed] = useState<number | null>(null);
  const [transparentColor, setTransparentColor] = useState<RgbColor>(DEFAULT_TRANSPARENT_COLOR);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);
  const [transparencyEnabled, setTransparencyEnabled] = useState(false);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [draftCropRect, setDraftCropRect] = useState<Rect | null>(null);
  const [eraseRects, setEraseRects] = useState<Rect[]>([]);
  const [draftEraseRect, setDraftEraseRect] = useState<Rect | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);

  const isBusy = isGenerating || isConfirming;
  const previewMaxHeightRem = 34;
  const previewMaxWidthRem = Math.min(previewMaxHeightRem, previewMaxHeightRem * (imageWidth / imageHeight));
  const previewFrameStyle: CSSProperties = {
    ...CHECKERBOARD_STYLE,
    aspectRatio: `${imageWidth} / ${imageHeight}`,
    maxHeight: 'min(34rem, calc(100dvh - 9rem))',
    width: `min(100%, ${previewMaxWidthRem}rem)`,
  };
  const activeCropRect = draftCropRect ?? cropRect;
  const activeEraseRect = draftEraseRect;
  const cropOverlayStyle = activeCropRect
    ? {
      left: `${(activeCropRect.x / previewSize.width) * 100}%`,
      top: `${(activeCropRect.y / previewSize.height) * 100}%`,
      width: `${(activeCropRect.width / previewSize.width) * 100}%`,
      height: `${(activeCropRect.height / previewSize.height) * 100}%`,
    }
    : null;
  const eraseOverlayStyle = activeEraseRect
    ? {
      left: `${(activeEraseRect.x / previewSize.width) * 100}%`,
      top: `${(activeEraseRect.y / previewSize.height) * 100}%`,
      width: `${(activeEraseRect.width / previewSize.width) * 100}%`,
      height: `${(activeEraseRect.height / previewSize.height) * 100}%`,
    }
    : null;
  const previewCursor = isPickingColor || isCropMode || isEraseMode ? 'crosshair' : 'default';

  function clearGeneratedPreview(nextWidth = imageWidth, nextHeight = imageHeight) {
    sourceCanvasRef.current = null;
    setHasGeneratedImage(false);
    setPreviewSize({ width: nextWidth, height: nextHeight });
    setGeneratedSeed(null);
    setTransparencyEnabled(false);
    setIsPickingColor(false);
    setIsCropMode(false);
    setIsEraseMode(false);
    setCropRect(null);
    setDraftCropRect(null);
    setEraseRects([]);
    setDraftEraseRect(null);
    cropDragStartRef.current = null;
    eraseDragStartRef.current = null;
    setRenderVersion((version) => version + 1);
  }

  function changeImageWidth(nextWidth: number) {
    if (nextWidth === imageWidth) {
      return;
    }
    setImageWidth(nextWidth);
    clearGeneratedPreview(nextWidth, imageHeight);
  }

  function changeImageHeight(nextHeight: number) {
    if (nextHeight === imageHeight) {
      return;
    }
    setImageHeight(nextHeight);
    clearGeneratedPreview(imageWidth, nextHeight);
  }

  const redrawPreview = useCallback(() => {
    const sourceCanvas = sourceCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!sourceCanvas || !previewCanvas) {
      return;
    }
    void renderVersion;
    previewCanvas.width = sourceCanvas.width;
    previewCanvas.height = sourceCanvas.height;
    const previewContext = get2dContext(previewCanvas);
    previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    if (!transparencyEnabled) {
      previewContext.drawImage(sourceCanvas, 0, 0);
      for (const eraseRect of eraseRects) {
        previewContext.clearRect(eraseRect.x, eraseRect.y, eraseRect.width, eraseRect.height);
      }
      return;
    }

    const sourceContext = get2dContext(sourceCanvas);
    const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const data = imageData.data;
    const red = clampColorChannel(transparentColor.red);
    const green = clampColorChannel(transparentColor.green);
    const blue = clampColorChannel(transparentColor.blue);
    const threshold = clampColorChannel(tolerance);
    for (let index = 0; index < data.length; index += 4) {
      if (
        Math.abs(data[index] - red) <= threshold
        && Math.abs(data[index + 1] - green) <= threshold
        && Math.abs(data[index + 2] - blue) <= threshold
      ) {
        data[index + 3] = 0;
      }
    }
    previewContext.putImageData(imageData, 0, 0);
    for (const eraseRect of eraseRects) {
      previewContext.clearRect(eraseRect.x, eraseRect.y, eraseRect.width, eraseRect.height);
    }
  }, [eraseRects, renderVersion, tolerance, transparencyEnabled, transparentColor.blue, transparentColor.green, transparentColor.red]);

  useEffect(() => {
    redrawPreview();
  }, [redrawPreview]);

  async function generateImage() {
    if (isBusy) {
      return;
    }
    const trimmedPositivePrompt = positivePrompt.trim();
    if (!trimmedPositivePrompt) {
      setError('positive prompt를 입력해 주세요.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const request: GenerateImageRequest = {
        positive_prompt: trimmedPositivePrompt,
        negative_prompt: negativePrompt.trim() || null,
        model_parameters: {
          ...parameters,
          width: imageWidth,
          height: imageHeight,
        },
      };
      const result = await dbTables.ImageUtil.generateImageBlob(request);
      const sourceCanvas = await createCanvasFromBlob(result.blob);
      sourceCanvasRef.current = sourceCanvas;
      setPreviewSize({ width: sourceCanvas.width, height: sourceCanvas.height });
      setHasGeneratedImage(true);
      setGeneratedSeed(result.seed);
      setTransparencyEnabled(false);
      setIsPickingColor(false);
      setIsCropMode(false);
      setIsEraseMode(false);
      setCropRect(null);
      setDraftCropRect(null);
      setEraseRects([]);
      setDraftEraseRect(null);
      cropDragStartRef.current = null;
      eraseDragStartRef.current = null;
      setRenderVersion((version) => version + 1);
    } catch (generateError) {
      setError(getErrorMessage(generateError));
    } finally {
      setIsGenerating(false);
    }
  }

  function pickColor(event: ReactPointerEvent<HTMLCanvasElement>) {
    const sourceCanvas = sourceCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!isPickingColor || !sourceCanvas || !previewCanvas) {
      return;
    }

    try {
      const point = getCanvasEventPoint(previewCanvas, event);
      const x = clamp(Math.floor(point.x), 0, sourceCanvas.width - 1);
      const y = clamp(Math.floor(point.y), 0, sourceCanvas.height - 1);
      const pixel = get2dContext(sourceCanvas).getImageData(x, y, 1, 1).data;
      setTransparentColor({
        red: pixel[0],
        green: pixel[1],
        blue: pixel[2],
      });
      setTransparencyEnabled(true);
      setIsPickingColor(false);
      setError(null);
    } catch (pickError) {
      setError(getErrorMessage(pickError));
    }
  }

  function handlePreviewPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!hasGeneratedImage || isBusy || event.button !== 0) {
      return;
    }
    if (isPickingColor) {
      pickColor(event);
      return;
    }
    if (!isCropMode) {
      if (!isEraseMode) {
        return;
      }
      const previewCanvas = previewCanvasRef.current;
      if (!previewCanvas) {
        return;
      }
      const start = getCanvasEventPoint(previewCanvas, event);
      eraseDragStartRef.current = start;
      setDraftEraseRect(getRectFromPoints(start, start));
      setError(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) {
      return;
    }
    const start = getCanvasEventPoint(previewCanvas, event);
    cropDragStartRef.current = start;
    setDraftCropRect(getRectFromPoints(start, start));
    setError(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePreviewPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) {
      return;
    }
    const cropStart = cropDragStartRef.current;
    if (cropStart) {
      setDraftCropRect(getRectFromPoints(cropStart, getCanvasEventPoint(previewCanvas, event)));
      return;
    }
    const eraseStart = eraseDragStartRef.current;
    if (eraseStart) {
      setDraftEraseRect(getRectFromPoints(eraseStart, getCanvasEventPoint(previewCanvas, event)));
    }
  }

  function handlePreviewPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) {
      return;
    }
    const cropStart = cropDragStartRef.current;
    if (cropStart) {
      const nextRect = getRectFromPoints(cropStart, getCanvasEventPoint(previewCanvas, event));
      setCropRect(isValidCropRect(nextRect) ? nextRect : null);
      setDraftCropRect(null);
      cropDragStartRef.current = null;
    }
    const eraseStart = eraseDragStartRef.current;
    if (eraseStart) {
      const nextRect = getRectFromPoints(eraseStart, getCanvasEventPoint(previewCanvas, event));
      if (isValidCropRect(nextRect)) {
        setEraseRects((current) => [...current, nextRect]);
      }
      setDraftEraseRect(null);
      eraseDragStartRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resetCrop() {
    setCropRect(null);
    setDraftCropRect(null);
    cropDragStartRef.current = null;
  }

  function resetErase() {
    setEraseRects([]);
    setDraftEraseRect(null);
    eraseDragStartRef.current = null;
  }

  async function confirm() {
    const previewCanvas = previewCanvasRef.current;
    const sourceCanvas = sourceCanvasRef.current;
    if (!previewCanvas || !sourceCanvas || isBusy) {
      return;
    }
    setIsConfirming(true);
    setError(null);
    try {
      const croppedCanvas = isValidCropRect(cropRect)
        ? copyCanvasRegion(previewCanvas, cropRect)
        : null;
      await onConfirm(await canvasToPngBlob(croppedCanvas ?? cloneCanvas(previewCanvas)), initialRect);
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
        aria-labelledby="image-object-generate-title"
        className="w-[min(68rem,calc(100vw-2rem))] overflow-visible"
      >
        <PanelHeader>
          <div className="min-w-0">
            <h2 id="image-object-generate-title" className="text-base font-extrabold text-[#fff5eb]">
              object 생성
            </h2>
          </div>
          <Button className="h-8 px-3 py-0 text-xs" onClick={onClose} disabled={isBusy}>
            닫기
          </Button>
        </PanelHeader>

        <SectionBody className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div
            className="mx-auto grid min-h-0 max-w-full place-items-center overflow-hidden rounded-[8px] border border-[rgba(255,196,214,0.2)]"
            style={previewFrameStyle}
          >
            {isGenerating ? <Spinner aria-hidden="true" className="h-6 w-6" /> : null}
            <div className={hasGeneratedImage ? 'relative inline-block max-h-full max-w-full overflow-hidden' : 'hidden'}>
              <canvas
                ref={previewCanvasRef}
                width={hasGeneratedImage ? previewSize.width : imageWidth}
                height={hasGeneratedImage ? previewSize.height : imageHeight}
                aria-label="Generated object preview"
                className="block max-h-full max-w-full object-contain"
                style={{ cursor: previewCursor }}
                onPointerDown={handlePreviewPointerDown}
                onPointerMove={handlePreviewPointerMove}
                onPointerUp={handlePreviewPointerUp}
                onPointerCancel={handlePreviewPointerUp}
              />
              {cropOverlayStyle ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-[#fff1c7] bg-[rgba(255,241,199,0.12)] shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]"
                  style={cropOverlayStyle}
                />
              ) : null}
              {eraseOverlayStyle ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-[#ff9ab8] bg-[rgba(255,154,184,0.18)]"
                  style={eraseOverlayStyle}
                />
              ) : null}
            </div>
            {!isGenerating && !hasGeneratedImage ? (
              <span className="px-4 text-center text-sm font-semibold text-[var(--app-muted)]">
                생성된 object preview
              </span>
            ) : null}
          </div>

          <div className="flex min-h-[26rem] flex-col gap-3">
            <label className="block space-y-1">
              <FieldLabel required>positive prompt</FieldLabel>
              <FormControl
                as="textarea"
                value={positivePrompt}
                onChange={(event) => setPositivePrompt(event.target.value)}
                className="min-h-28 w-full resize-y px-3 py-2 text-sm leading-5"
                disabled={isBusy}
              />
            </label>

            <label className="block space-y-1">
              <FieldLabel>negative prompt</FieldLabel>
              <FormControl
                as="textarea"
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                className="min-h-20 w-full resize-y px-3 py-2 text-sm leading-5"
                disabled={isBusy}
              />
            </label>

            <div className="grid gap-2">
              <div className="rounded-[8px] border border-[rgba(255,226,186,0.22)] bg-[rgba(8,2,13,0.42)] px-3 py-2 text-center text-sm font-extrabold text-[#fff5eb]">
                {imageWidth} x {imageHeight}
              </div>
              <div className="space-y-1">
                <FieldLabel>width</FieldLabel>
                <div className="grid grid-cols-5 gap-1">
                  {IMAGE_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={`width-${size}`}
                      className={resolutionButtonClass(imageWidth === size)}
                      variant={imageWidth === size ? 'primary' : 'default'}
                      onClick={() => changeImageWidth(size)}
                      disabled={isBusy}
                      aria-pressed={imageWidth === size}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <FieldLabel>height</FieldLabel>
                <div className="grid grid-cols-5 gap-1">
                  {IMAGE_SIZE_OPTIONS.map((size) => (
                    <Button
                      key={`height-${size}`}
                      className={resolutionButtonClass(imageHeight === size)}
                      variant={imageHeight === size ? 'primary' : 'default'}
                      onClick={() => changeImageHeight(size)}
                      disabled={isBusy}
                      aria-pressed={imageHeight === size}
                    >
                      {size}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-w-0 text-xs font-semibold text-[#fff5eb]">
              transparent rgb({transparentColor.red}, {transparentColor.green}, {transparentColor.blue})
            </div>
            {isValidCropRect(cropRect) ? (
              <div className="min-w-0 text-xs font-semibold text-[#fff5eb]">
                crop {Math.round(cropRect.x)}, {Math.round(cropRect.y)} / {Math.round(cropRect.width)} x {Math.round(cropRect.height)}
              </div>
            ) : null}
            {eraseRects.length > 0 ? (
              <div className="min-w-0 text-xs font-semibold text-[#fff5eb]">
                cutout {eraseRects.length}
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              tolerance
              <input
                type="range"
                min={0}
                max={255}
                step={1}
                value={tolerance}
                onChange={(event) => {
                  setTolerance(clampColorChannel(Number(event.target.value)));
                  setTransparencyEnabled(true);
                }}
                className="min-w-0 flex-1 accent-[#ffe2ba]"
                disabled={isBusy || !hasGeneratedImage}
              />
              <FormControl
                type="number"
                min={0}
                max={255}
                step={1}
                value={tolerance}
                onChange={(event) => {
                  const nextValue = readNumber(event.target.value);
                  if (nextValue !== null) {
                    setTolerance(clampColorChannel(nextValue));
                    setTransparencyEnabled(true);
                  }
                }}
                className="h-8 w-16 px-2 text-right text-xs"
                disabled={isBusy || !hasGeneratedImage}
              />
            </label>

            {generatedSeed !== null ? (
              <p className="text-xs font-semibold text-[var(--app-muted)]">seed #{generatedSeed}</p>
            ) : null}
            {error ? <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p> : null}

            <div className="mt-auto flex flex-wrap gap-2">
              <Button
                className="h-8 px-3 py-0 text-xs"
                variant={isPickingColor ? 'primary' : 'default'}
                onClick={() => {
                  setIsPickingColor((current) => !current);
                  setIsCropMode(false);
                  setIsEraseMode(false);
                }}
                disabled={isBusy || !hasGeneratedImage}
                title="스포이드"
              >
                pick
              </Button>
              <Button
                className="h-8 px-3 py-0 text-xs"
                variant={isCropMode ? 'primary' : 'default'}
                onClick={() => {
                  setIsCropMode((current) => !current);
                  setIsPickingColor(false);
                  setIsEraseMode(false);
                }}
                disabled={isBusy || !hasGeneratedImage}
                title="crop 영역 지정"
              >
                crop
              </Button>
              <Button
                className="h-8 px-3 py-0 text-xs"
                onClick={resetCrop}
                disabled={isBusy || !hasGeneratedImage || !cropRect}
                title="crop 영역 해제"
              >
                reset crop
              </Button>
              <Button
                className="h-8 px-3 py-0 text-xs"
                variant={isEraseMode ? 'primary' : 'default'}
                onClick={() => {
                  setIsEraseMode((current) => !current);
                  setIsPickingColor(false);
                  setIsCropMode(false);
                }}
                disabled={isBusy || !hasGeneratedImage}
                title="영역 투명 삭제"
              >
                cutout
              </Button>
              <Button
                className="h-8 px-3 py-0 text-xs"
                onClick={resetErase}
                disabled={isBusy || !hasGeneratedImage || eraseRects.length === 0}
                title="투명 삭제 영역 해제"
              >
                reset cutout
              </Button>
              <Button
                className="h-8 px-3 py-0 text-xs"
                variant={transparencyEnabled ? 'primary' : 'default'}
                onClick={() => setTransparencyEnabled((current) => !current)}
                disabled={isBusy || !hasGeneratedImage}
                title="투명화 preview"
              >
                alpha
              </Button>
              <Button className="inline-flex h-8 items-center gap-2 px-3 py-0 text-xs" onClick={() => void generateImage()} disabled={isBusy}>
                {isGenerating ? <Spinner aria-hidden="true" /> : null}
                생성
              </Button>
              <Button variant="primary" className="ml-auto inline-flex h-8 items-center gap-2 px-3 py-0 text-xs" onClick={() => void confirm()} disabled={isBusy || !hasGeneratedImage}>
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
