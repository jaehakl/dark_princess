import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { API_URL } from '../api/api';
import { Button, FieldLabel, ImageFrame, Spinner } from './ui';

type Point = {
  x: number;
  y: number;
};

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type EditorMode = 'select' | 'feather' | 'scribble';
type SelectionTool = 'move' | 'rect' | 'lasso';
type MaskPaintValue = 'white' | 'black';

type RectSelection = {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
};

type LassoSelection = {
  kind: 'lasso';
  points: Point[];
};

type SelectionRegion = RectSelection | LassoSelection;

type CanvasObject = {
  id: string;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  dirty: boolean;
  maskPath: Point[];
};

type CanvasObjectSnapshot = Pick<CanvasObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

export type SceneImageInpaintEditorState = {
  imageDataUrl: string | null;
  maskDataUrl: string | null;
  scribbleDataUrl: string | null;
  isMaskVisualizationEnabled: boolean | null;
  featherBrushSize: number | null;
  scribbleBrushSize: number | null;
  scribblePreviewOpacity: number | null;
  controlnetConditioningScale: number | null;
  controlGuidanceStart: number | null;
  controlGuidanceEnd: number | null;
};

type ControlNetEditorSettings = {
  controlnet_conditioning_scale: number;
  control_guidance_start: number;
  control_guidance_end: number;
};

type DragState =
  | {
    kind: 'move';
    start: Point;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'resize';
    handle: ResizeHandle;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'rotate';
    startAngle: number;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'select-rect';
    start: Point;
  }
  | {
    kind: 'select-lasso';
  }
  | {
    kind: 'feather';
    lastPoint: Point;
  }
  | {
    kind: 'scribble';
    lastPoint: Point;
  };

export type SceneImageInpaintEditorHandle = {
  renderImageAndMask: () => Promise<{
    image: Blob;
    mask: Blob;
    scribble: Blob;
    hasScribble: boolean;
    controlSettings: ControlNetEditorSettings;
  }>;
};

type SceneImageInpaintEditorProps = {
  width: number;
  height: number;
  sourceImageUrl?: string | null;
  disabled?: boolean;
  isGenerating?: boolean;
  altText?: string;
  controlnetConditioningScale?: number;
  controlGuidanceStart?: number;
  controlGuidanceEnd?: number;
  initialEditorState?: SceneImageInpaintEditorState;
  onEditorStateChange?: (state: SceneImageInpaintEditorState) => void;
  onError?: (message: string | null) => void;
  onReadyChange?: (isReady: boolean) => void;
};

const HANDLE_DEFS: Array<{ key: ResizeHandle; x: number; y: number }> = [
  { key: 'nw', x: -0.5, y: -0.5 },
  { key: 'n', x: 0, y: -0.5 },
  { key: 'ne', x: 0.5, y: -0.5 },
  { key: 'e', x: 0.5, y: 0 },
  { key: 'se', x: 0.5, y: 0.5 },
  { key: 's', x: 0, y: 0.5 },
  { key: 'sw', x: -0.5, y: 0.5 },
  { key: 'w', x: -0.5, y: 0 },
];
const HISTORY_LIMIT = 10;
const MIN_OBJECT_SIZE = 24;
const ROTATE_HANDLE_OFFSET = 42;
const MIN_SELECTION_SIZE = 3;
const LASSO_MIN_POINTS = 3;
const MASK_MIN_POINTS = 3;
const DEFAULT_FEATHER_BRUSH_SIZE = 64;
const DEFAULT_SCRIBBLE_BRUSH_SIZE = 80;
const DEFAULT_SCRIBBLE_PREVIEW_OPACITY = 0.5;
const DEFAULT_CONTROLNET_CONDITIONING_SCALE = 1;
const DEFAULT_CONTROL_GUIDANCE_START = 0;
const DEFAULT_CONTROL_GUIDANCE_END = 1;
const TOOL_BUTTON_CLASS = 'grid h-8 w-8 place-items-center px-0 py-0 text-base leading-none';

function createObjectId() {
  return `image-object-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '이미지 편집 요청에 실패했습니다.';
}

function createRenderCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function get2dContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas를 사용할 수 없습니다.');
  }
  return context;
}

function createFilledCanvas(width: number, height: number, color: string) {
  const canvas = createRenderCanvas(width, height);
  const context = get2dContext(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function createBlankImageCanvas(width: number, height: number) {
  return createFilledCanvas(width, height, '#ffffff');
}

function createDefaultMaskCanvas(width: number, height: number) {
  return createFilledCanvas(width, height, '#ffffff');
}

function createBlankScribbleCanvas(width: number, height: number) {
  return createFilledCanvas(width, height, '#ffffff');
}

function cloneCanvas(canvas: HTMLCanvasElement) {
  const nextCanvas = createRenderCanvas(canvas.width, canvas.height);
  get2dContext(nextCanvas).drawImage(canvas, 0, 0);
  return nextCanvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('이미지를 생성하지 못했습니다.'));
      }
    }, 'image/png');
  });
}

function canvasToDataUrl(canvas: HTMLCanvasElement | null) {
  return canvas ? canvas.toDataURL('image/png') : null;
}

function resolveImageFetchUrl(imageUrl: string) {
  try {
    const parsedImageUrl = new URL(imageUrl, window.location.href);
    const parsedApiUrl = new URL(API_URL, window.location.href);
    if (parsedImageUrl.origin === parsedApiUrl.origin && parsedImageUrl.pathname.startsWith('/uploads/')) {
      return `${parsedImageUrl.pathname}${parsedImageUrl.search}`;
    }
  } catch {
    return imageUrl;
  }
  return imageUrl;
}

async function createBitmapFromUrl(imageUrl: string) {
  const response = await fetch(resolveImageFetchUrl(imageUrl), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('기존 이미지를 불러오지 못했습니다.');
  }
  return await createImageBitmap(await response.blob());
}

async function createBitmapFromDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error('편집 레이어를 불러오지 못했습니다.');
  }
  return await createImageBitmap(await response.blob());
}

async function drawDataUrlToCanvas(dataUrl: string | null | undefined, canvas: HTMLCanvasElement) {
  if (!dataUrl) {
    return;
  }
  const bitmap = await createBitmapFromDataUrl(dataUrl);
  try {
    get2dContext(canvas).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    try {
      bitmap.close();
    } catch {
      // Bitmap cleanup is best-effort.
    }
  }
}

function hasEditorStateData(state: SceneImageInpaintEditorState | undefined) {
  return Boolean(state?.imageDataUrl || state?.maskDataUrl || state?.scribbleDataUrl);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function coerceNullableNumber(
  value: number | null | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  return Number.isFinite(value) ? clampNumber(Number(value), min, max) : fallback;
}

function rotatePoint(point: Point, rotation: number): Point {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function toObjectLocal(point: Point, object: CanvasObject | CanvasObjectSnapshot): Point {
  return rotatePoint(
    {
      x: point.x - object.x,
      y: point.y - object.y,
    },
    -object.rotation,
  );
}

function objectLocalToCanvas(object: CanvasObject | CanvasObjectSnapshot, localX: number, localY: number): Point {
  const rotated = rotatePoint({ x: localX, y: localY }, object.rotation);
  return {
    x: object.x + rotated.x,
    y: object.y + rotated.y,
  };
}

function isPointInObject(point: Point, object: CanvasObject) {
  const local = toObjectLocal(point, object);
  return Math.abs(local.x) <= object.width / 2 && Math.abs(local.y) <= object.height / 2;
}

function getHandlePosition(object: CanvasObject | CanvasObjectSnapshot, handle: ResizeHandle) {
  const definition = HANDLE_DEFS.find((item) => item.key === handle);
  if (!definition) {
    return { x: object.x, y: object.y };
  }
  return objectLocalToCanvas(
    object,
    object.width * definition.x,
    object.height * definition.y,
  );
}

function getRotateHandlePosition(object: CanvasObject | CanvasObjectSnapshot) {
  return objectLocalToCanvas(object, 0, -object.height / 2 - ROTATE_HANDLE_OFFSET);
}

function getResizeCursor(handle: ResizeHandle) {
  if (handle === 'n' || handle === 's') {
    return 'ns-resize';
  }
  if (handle === 'e' || handle === 'w') {
    return 'ew-resize';
  }
  if (handle === 'ne' || handle === 'sw') {
    return 'nesw-resize';
  }
  return 'nwse-resize';
}

function fitObjectSize(canvas: HTMLCanvasElement, width: number, height: number) {
  const scale = Math.min(1, width / canvas.width, height / canvas.height);
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}

function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>,
  width: number,
  height: number,
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
  };
}

function getViewScale(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return rect.width > 0 ? canvas.width / rect.width : 1;
}

function drawObject(context: CanvasRenderingContext2D, object: CanvasObject) {
  context.save();
  context.translate(object.x, object.y);
  context.rotate(object.rotation);
  if (object.flipX) {
    context.scale(-1, 1);
  }
  context.drawImage(
    object.canvas,
    -object.width / 2,
    -object.height / 2,
    object.width,
    object.height,
  );
  context.restore();
}

function getObjectMaskPath(object: CanvasObject) {
  const bounds = getBoundsFromPoints(object.maskPath);
  const pathWidth = Math.max(1, bounds.right - bounds.left);
  const pathHeight = Math.max(1, bounds.bottom - bounds.top);
  const scaleX = object.width / pathWidth;
  const scaleY = object.height / pathHeight;
  return object.maskPath.map((point) => objectLocalToCanvas(
    object,
    (object.flipX ? -point.x : point.x) * scaleX,
    point.y * scaleY,
  ));
}

function drawPointPath(context: CanvasRenderingContext2D, points: Point[], closePath: boolean) {
  if (points.length === 0) {
    return;
  }
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  if (closePath) {
    context.closePath();
  }
}

function drawSelectionPath(context: CanvasRenderingContext2D, selection: SelectionRegion) {
  if (selection.kind === 'rect') {
    context.beginPath();
    context.rect(selection.x, selection.y, selection.width, selection.height);
    return;
  }
  drawPointPath(context, selection.points, true);
}

function drawOpenPathPreview(context: CanvasRenderingContext2D, points: Point[], scale: number) {
  if (points.length === 0) {
    return;
  }
  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, Math.max(3 * scale, 2), 0, Math.PI * 2);
    context.fill();
    context.stroke();
    return;
  }
  drawPointPath(context, points, false);
  context.stroke();
}

function getRectFromPoints(start: Point, end: Point): RectSelection {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    kind: 'rect',
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function getBoundsFromPoints(points: Point[]) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }

  return { left, top, right, bottom };
}

function getSelectionBounds(selection: SelectionRegion) {
  if (selection.kind === 'rect') {
    return {
      left: selection.x,
      top: selection.y,
      right: selection.x + selection.width,
      bottom: selection.y + selection.height,
    };
  }
  return getBoundsFromPoints(selection.points);
}

function createObjectFromCanvas(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  dirty: boolean,
  maskPath: Point[],
): CanvasObject {
  return {
    id: createObjectId(),
    canvas,
    x,
    y,
    width,
    height,
    rotation: 0,
    flipX: false,
    dirty,
    maskPath,
  };
}

function createObjectFromBitmap(bitmap: ImageBitmap, width: number, height: number) {
  const objectCanvas = createRenderCanvas(bitmap.width, bitmap.height);
  get2dContext(objectCanvas).drawImage(bitmap, 0, 0);
  const fittedSize = fitObjectSize(objectCanvas, width, height);
  const maskPath = [
    { x: -fittedSize.width / 2, y: -fittedSize.height / 2 },
    { x: fittedSize.width / 2, y: -fittedSize.height / 2 },
    { x: fittedSize.width / 2, y: fittedSize.height / 2 },
    { x: -fittedSize.width / 2, y: fittedSize.height / 2 },
  ];
  return createObjectFromCanvas(
    objectCanvas,
    width / 2,
    height / 2,
    fittedSize.width,
    fittedSize.height,
    true,
    maskPath,
  );
}

function createObjectFromSelection(sourceCanvas: HTMLCanvasElement, selection: SelectionRegion) {
  const bounds = getSelectionBounds(selection);
  const left = Math.max(0, Math.floor(bounds.left));
  const top = Math.max(0, Math.floor(bounds.top));
  const right = Math.min(sourceCanvas.width, Math.ceil(bounds.right));
  const bottom = Math.min(sourceCanvas.height, Math.ceil(bounds.bottom));
  const selectionWidth = right - left;
  const selectionHeight = bottom - top;

  if (selectionWidth < MIN_SELECTION_SIZE || selectionHeight < MIN_SELECTION_SIZE) {
    return null;
  }

  const selectionCanvas = createRenderCanvas(selectionWidth, selectionHeight);
  const selectionContext = get2dContext(selectionCanvas);

  if (selection.kind === 'lasso') {
    selectionContext.save();
    selectionContext.beginPath();
    selectionContext.moveTo(selection.points[0].x - left, selection.points[0].y - top);
    for (const point of selection.points.slice(1)) {
      selectionContext.lineTo(point.x - left, point.y - top);
    }
    selectionContext.closePath();
    selectionContext.clip();
    selectionContext.drawImage(sourceCanvas, -left, -top);
    selectionContext.restore();
  } else {
    selectionContext.drawImage(
      sourceCanvas,
      left,
      top,
      selectionWidth,
      selectionHeight,
      0,
      0,
      selectionWidth,
      selectionHeight,
    );
  }

  const centerX = left + selectionWidth / 2;
  const centerY = top + selectionHeight / 2;
  const maskPath = selection.kind === 'lasso'
    ? selection.points.map((point) => ({ x: point.x - centerX, y: point.y - centerY }))
    : [
      { x: -selectionWidth / 2, y: -selectionHeight / 2 },
      { x: selectionWidth / 2, y: -selectionHeight / 2 },
      { x: selectionWidth / 2, y: selectionHeight / 2 },
      { x: -selectionWidth / 2, y: selectionHeight / 2 },
    ];

  return createObjectFromCanvas(
    selectionCanvas,
    centerX,
    centerY,
    selectionWidth,
    selectionHeight,
    false,
    maskPath,
  );
}

function objectSnapshot(object: CanvasObject): CanvasObjectSnapshot {
  return {
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
  };
}

function findResizeHandle(point: Point, object: CanvasObject, threshold: number) {
  for (const handle of HANDLE_DEFS) {
    const handlePoint = getHandlePosition(object, handle.key);
    if (Math.abs(point.x - handlePoint.x) <= threshold && Math.abs(point.y - handlePoint.y) <= threshold) {
      return handle.key;
    }
  }
  return null;
}

function drawSelectionPreview(
  context: CanvasRenderingContext2D,
  selectionRect: RectSelection | null,
  selectionLasso: Point[],
  scale: number,
) {
  if (selectionRect) {
    context.save();
    context.strokeStyle = 'rgba(255, 244, 220, 0.98)';
    context.fillStyle = 'rgba(255, 226, 186, 0.14)';
    context.lineWidth = 2 * scale;
    context.setLineDash([8 * scale, 5 * scale]);
    drawSelectionPath(context, selectionRect);
    context.fill();
    context.stroke();
    context.restore();
  }
  if (selectionLasso.length > 0) {
    context.save();
    context.strokeStyle = 'rgba(255, 244, 220, 0.98)';
    context.fillStyle = 'rgba(255, 226, 186, 0.22)';
    context.lineWidth = 2 * scale;
    context.setLineDash([8 * scale, 5 * scale]);
    drawOpenPathPreview(context, selectionLasso, scale);
    context.restore();
  }
}

function drawWhiteMaskVisualization(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  maskCanvas: HTMLCanvasElement | null,
) {
  if (!maskCanvas) {
    return;
  }

  const sampleCanvas = createRenderCanvas(width, height);
  get2dContext(sampleCanvas).drawImage(maskCanvas, 0, 0, width, height);
  const sampleData = get2dContext(sampleCanvas).getImageData(0, 0, width, height);
  const overlayCanvas = createRenderCanvas(width, height);
  const overlayContext = get2dContext(overlayCanvas);
  const overlayData = overlayContext.createImageData(width, height);

  for (let index = 0; index < sampleData.data.length; index += 4) {
    const brightness = (
      sampleData.data[index]
      + sampleData.data[index + 1]
      + sampleData.data[index + 2]
    ) / 3;
    overlayData.data[index] = 255;
    overlayData.data[index + 1] = 255;
    overlayData.data[index + 2] = 255;
    overlayData.data[index + 3] = Math.round((brightness / 255) * 184);
  }
  overlayContext.putImageData(overlayData, 0, 0);

  context.save();
  context.drawImage(overlayCanvas, 0, 0, width, height);
  context.restore();
}

function drawScribblePreview(
  context: CanvasRenderingContext2D,
  scribbleCanvas: HTMLCanvasElement | null,
  opacity: number,
) {
  if (!scribbleCanvas) {
    return;
  }
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, opacity));
  context.globalCompositeOperation = 'multiply';
  context.drawImage(scribbleCanvas, 0, 0);
  context.restore();
}

function drawObjectHandles(
  context: CanvasRenderingContext2D,
  object: CanvasObject,
  scale: number,
) {
  context.save();
  context.strokeStyle = 'rgba(255, 244, 220, 0.96)';
  context.lineWidth = 2 * scale;
  context.setLineDash([7 * scale, 4 * scale]);
  const corners = [
    getHandlePosition(object, 'nw'),
    getHandlePosition(object, 'ne'),
    getHandlePosition(object, 'se'),
    getHandlePosition(object, 'sw'),
  ];
  context.beginPath();
  context.moveTo(corners[0].x, corners[0].y);
  for (const corner of corners.slice(1)) {
    context.lineTo(corner.x, corner.y);
  }
  context.closePath();
  context.stroke();
  context.setLineDash([]);

  const rotateHandle = getRotateHandlePosition(object);
  const topHandle = getHandlePosition(object, 'n');
  context.beginPath();
  context.moveTo(topHandle.x, topHandle.y);
  context.lineTo(rotateHandle.x, rotateHandle.y);
  context.stroke();

  context.fillStyle = 'rgba(255, 245, 232, 0.94)';
  context.strokeStyle = 'rgba(74, 18, 54, 0.92)';
  context.lineWidth = 1.5 * scale;
  const handleSize = 9 * scale;
  for (const handle of HANDLE_DEFS) {
    const point = getHandlePosition(object, handle.key);
    context.beginPath();
    context.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
    context.fill();
    context.stroke();
  }
  context.beginPath();
  context.arc(rotateHandle.x, rotateHandle.y, 6 * scale, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
}

function fillMaskPath(
  maskCanvas: HTMLCanvasElement,
  points: Point[],
  value: MaskPaintValue,
) {
  if (points.length < MASK_MIN_POINTS) {
    return;
  }
  const context = get2dContext(maskCanvas);
  context.save();
  context.fillStyle = value === 'white' ? '#ffffff' : '#000000';
  drawPointPath(context, points, true);
  context.fill();
  context.restore();
}

function fillWholeMask(maskCanvas: HTMLCanvasElement, value: MaskPaintValue) {
  const context = get2dContext(maskCanvas);
  context.fillStyle = value === 'white' ? '#ffffff' : '#000000';
  context.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
}

function drawRoundStroke(
  canvas: HTMLCanvasElement,
  startPoint: Point | null,
  endPoint: Point,
  brushSize: number,
  color: string,
) {
  const context = get2dContext(canvas);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = brushSize;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (!startPoint) {
    context.beginPath();
    context.arc(endPoint.x, endPoint.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(startPoint.x, startPoint.y);
    context.lineTo(endPoint.x, endPoint.y);
    context.stroke();
  }
  context.restore();
}

function shuffleAdjacentPixels(canvas: HTMLCanvasElement, point: Point, radius: number) {
  const context = get2dContext(canvas);
  const left = Math.max(0, Math.floor(point.x - radius));
  const top = Math.max(0, Math.floor(point.y - radius));
  const right = Math.min(canvas.width, Math.ceil(point.x + radius));
  const bottom = Math.min(canvas.height, Math.ceil(point.y + radius));
  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0) {
    return;
  }

  const imageData = context.getImageData(left, top, width, height);
  const pixelOffsets: number[] = [];
  const includedPixels = new Set<number>();
  const radiusSquared = radius * radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = left + x - point.x;
      const dy = top + y - point.y;
      if (dx * dx + dy * dy <= radiusSquared) {
        const pixelIndex = y * width + x;
        includedPixels.add(pixelIndex);
        pixelOffsets.push(pixelIndex * 4);
      }
    }
  }

  for (let index = pixelOffsets.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pixelOffsets[index], pixelOffsets[swapIndex]] = [pixelOffsets[swapIndex], pixelOffsets[index]];
  }

  const neighborDeltas = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (const pixelOffset of pixelOffsets) {
    const pixelIndex = pixelOffset / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const neighborOffsets: number[] = [];

    for (const [deltaX, deltaY] of neighborDeltas) {
      const neighborX = x + deltaX;
      const neighborY = y + deltaY;
      if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) {
        continue;
      }

      const neighborIndex = neighborY * width + neighborX;
      if (includedPixels.has(neighborIndex)) {
        neighborOffsets.push(neighborIndex * 4);
      }
    }

    if (neighborOffsets.length === 0) {
      continue;
    }

    const neighborOffset = neighborOffsets[Math.floor(Math.random() * neighborOffsets.length)];
    for (let channel = 0; channel < 4; channel += 1) {
      const currentValue = imageData.data[pixelOffset + channel];
      imageData.data[pixelOffset + channel] = imageData.data[neighborOffset + channel];
      imageData.data[neighborOffset + channel] = currentValue;
    }
  }

  context.putImageData(imageData, left, top);
}

function applyFeatherStrokeToImage(
  imageCanvas: HTMLCanvasElement,
  startPoint: Point | null,
  endPoint: Point,
  brushSize: number,
) {
  const distance = startPoint ? Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) : 0;
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, brushSize / 4)));

  for (let step = 0; step <= steps; step += 1) {
    const progress = steps === 0 ? 1 : step / steps;
    const point = startPoint
      ? {
        x: startPoint.x + (endPoint.x - startPoint.x) * progress,
        y: startPoint.y + (endPoint.y - startPoint.y) * progress,
      }
      : endPoint;
    shuffleAdjacentPixels(imageCanvas, point, Math.max(1, brushSize / 2));
  }
}

function pushCapped<T>(items: T[], item: T) {
  return [...items.slice(-(HISTORY_LIMIT - 1)), item];
}

function isCanvasSolidColor(canvas: HTMLCanvasElement, red: number, green: number, blue: number) {
  const { data } = get2dContext(canvas).getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] !== red || data[index + 1] !== green || data[index + 2] !== blue) {
      return false;
    }
  }
  return true;
}

export const SceneImageInpaintEditor = forwardRef<
  SceneImageInpaintEditorHandle,
  SceneImageInpaintEditorProps
>(function SceneImageInpaintEditor({
  width,
  height,
  sourceImageUrl,
  disabled = false,
  isGenerating = false,
  altText,
  controlnetConditioningScale: initialControlnetConditioningScale = DEFAULT_CONTROLNET_CONDITIONING_SCALE,
  controlGuidanceStart: initialControlGuidanceStart = DEFAULT_CONTROL_GUIDANCE_START,
  controlGuidanceEnd: initialControlGuidanceEnd = DEFAULT_CONTROL_GUIDANCE_END,
  initialEditorState,
  onEditorStateChange,
  onError,
  onReadyChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scribbleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeObjectRef = useRef<CanvasObject | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const imageHistoryRef = useRef<HTMLCanvasElement[]>([]);
  const maskHistoryRef = useRef<HTMLCanvasElement[]>([]);
  const scribbleHistoryRef = useRef<HTMLCanvasElement[]>([]);
  const draftSelectionRectRef = useRef<RectSelection | null>(null);
  const draftSelectionLassoRef = useRef<Point[]>([]);
  const initialEditorStateRef = useRef<SceneImageInpaintEditorState | undefined>(initialEditorState);
  const hasLoadedOnceRef = useRef(false);

  const [layersReady, setLayersReady] = useState(false);
  const [renderVersion, setRenderVersion] = useState(0);
  const [activeObject, setActiveObject] = useState<CanvasObject | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [mode, setMode] = useState<EditorMode>('select');
  const [selectionTool, setSelectionTool] = useState<SelectionTool>('rect');
  const [isMaskVisualizationEnabled, setIsMaskVisualizationEnabled] = useState(false);
  const [draftSelectionRect, setDraftSelectionRect] = useState<RectSelection | null>(null);
  const [draftSelectionLasso, setDraftSelectionLasso] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [hoverResizeHandle, setHoverResizeHandle] = useState<ResizeHandle | null>(null);
  const [imageHistoryCount, setImageHistoryCount] = useState(0);
  const [maskHistoryCount, setMaskHistoryCount] = useState(0);
  const [scribbleHistoryCount, setScribbleHistoryCount] = useState(0);
  const [hasScribbleEdits, setHasScribbleEdits] = useState(false);
  const [featherBrushSize, setFeatherBrushSize] = useState(DEFAULT_FEATHER_BRUSH_SIZE);
  const [scribbleBrushSize, setScribbleBrushSize] = useState(DEFAULT_SCRIBBLE_BRUSH_SIZE);
  const [scribblePreviewOpacity, setScribblePreviewOpacity] = useState(DEFAULT_SCRIBBLE_PREVIEW_OPACITY);
  const [controlnetConditioningScale, setControlnetConditioningScale] = useState(
    initialControlnetConditioningScale,
  );
  const [controlGuidanceStart, setControlGuidanceStart] = useState(initialControlGuidanceStart);
  const [controlGuidanceEnd, setControlGuidanceEnd] = useState(initialControlGuidanceEnd);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isAddingImage, setIsAddingImage] = useState(false);
  const editorSettingsRef = useRef({
    isMaskVisualizationEnabled: false,
    featherBrushSize: DEFAULT_FEATHER_BRUSH_SIZE,
    scribbleBrushSize: DEFAULT_SCRIBBLE_BRUSH_SIZE,
    scribblePreviewOpacity: DEFAULT_SCRIBBLE_PREVIEW_OPACITY,
    controlnetConditioningScale: initialControlnetConditioningScale,
    controlGuidanceStart: initialControlGuidanceStart,
    controlGuidanceEnd: initialControlGuidanceEnd,
  });

  const isWorking = isLoadingSource || isAddingImage;
  const isReady = !isWorking && layersReady && width > 0 && height > 0;
  const canvasCursor = mode === 'feather' || mode === 'scribble'
    ? 'none'
    : mode === 'select' && selectionTool !== 'move' && !activeObject
      ? 'crosshair'
      : dragState?.kind === 'resize'
        ? getResizeCursor(dragState.handle)
        : dragState?.kind === 'rotate'
          ? 'grabbing'
          : dragState?.kind === 'move'
            ? 'move'
            : hoverResizeHandle
              ? getResizeCursor(hoverResizeHandle)
              : activeObject
                ? 'move'
                : 'default';

  const publishEditorState = useCallback(() => {
    const editorSettings = editorSettingsRef.current;
    onEditorStateChange?.({
      imageDataUrl: canvasToDataUrl(imageCanvasRef.current),
      maskDataUrl: canvasToDataUrl(maskCanvasRef.current),
      scribbleDataUrl: canvasToDataUrl(scribbleCanvasRef.current),
      isMaskVisualizationEnabled: editorSettings.isMaskVisualizationEnabled,
      featherBrushSize: editorSettings.featherBrushSize,
      scribbleBrushSize: editorSettings.scribbleBrushSize,
      scribblePreviewOpacity: editorSettings.scribblePreviewOpacity,
      controlnetConditioningScale: editorSettings.controlnetConditioningScale,
      controlGuidanceStart: editorSettings.controlGuidanceStart,
      controlGuidanceEnd: editorSettings.controlGuidanceEnd,
    });
  }, [onEditorStateChange]);

  function requestRedraw() {
    setRenderVersion((version) => version + 1);
  }

  function replaceActiveObject(nextObject: CanvasObject | null) {
    activeObjectRef.current = nextObject;
    setActiveObject(nextObject);
  }

  function replaceDragState(nextDragState: DragState | null) {
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }

  function replaceDraftSelectionRect(nextRect: RectSelection | null) {
    draftSelectionRectRef.current = nextRect;
    setDraftSelectionRect(nextRect);
  }

  function replaceDraftSelectionLasso(nextPoints: Point[]) {
    draftSelectionLassoRef.current = nextPoints;
    setDraftSelectionLasso(nextPoints);
  }

  function pushImageHistory(canvas = imageCanvasRef.current) {
    if (!canvas) {
      return;
    }
    imageHistoryRef.current = pushCapped(imageHistoryRef.current, cloneCanvas(canvas));
    setImageHistoryCount(imageHistoryRef.current.length);
  }

  function pushMaskHistory(canvas = maskCanvasRef.current) {
    if (!canvas) {
      return;
    }
    maskHistoryRef.current = pushCapped(maskHistoryRef.current, cloneCanvas(canvas));
    setMaskHistoryCount(maskHistoryRef.current.length);
  }

  function pushScribbleHistory(canvas = scribbleCanvasRef.current) {
    if (!canvas) {
      return;
    }
    scribbleHistoryRef.current = pushCapped(scribbleHistoryRef.current, cloneCanvas(canvas));
    setScribbleHistoryCount(scribbleHistoryRef.current.length);
  }

  function refreshLayerFlags() {
    if (scribbleCanvasRef.current) {
      setHasScribbleEdits(!isCanvasSolidColor(scribbleCanvasRef.current, 255, 255, 255));
    }
  }

  function mergeActiveObject() {
    const object = activeObjectRef.current;
    const imageCanvas = imageCanvasRef.current;
    if (!object || !imageCanvas) {
      replaceActiveObject(null);
      return;
    }

    if (object.dirty) {
      pushImageHistory(imageCanvas);
      drawObject(get2dContext(imageCanvas), object);
      publishEditorState();
    }
    replaceActiveObject(null);
  }

  function clearDrafts() {
    replaceDraftSelectionRect(null);
    replaceDraftSelectionLasso([]);
  }

  function switchMode(nextMode: EditorMode) {
    if (nextMode !== mode) {
      mergeActiveObject();
      clearDrafts();
      replaceDragState(null);
      setHoverResizeHandle(null);
    }
    setMode(nextMode);
  }

  function changeSelectionTool(nextTool: SelectionTool) {
    if (nextTool !== selectionTool) {
      mergeActiveObject();
      replaceDraftSelectionRect(null);
      replaceDraftSelectionLasso([]);
      replaceDragState(null);
      setHoverResizeHandle(null);
    }
    setSelectionTool(nextTool);
  }

  useEffect(() => {
    initialEditorStateRef.current = initialEditorState;
  }, [initialEditorState]);

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  useEffect(() => {
    editorSettingsRef.current = {
      isMaskVisualizationEnabled,
      featherBrushSize,
      scribbleBrushSize,
      scribblePreviewOpacity,
      controlnetConditioningScale,
      controlGuidanceStart,
      controlGuidanceEnd,
    };
    if (layersReady) {
      publishEditorState();
    }
  }, [
    controlGuidanceEnd,
    controlGuidanceStart,
    controlnetConditioningScale,
    featherBrushSize,
    isMaskVisualizationEnabled,
    layersReady,
    publishEditorState,
    scribbleBrushSize,
    scribblePreviewOpacity,
  ]);

  useEffect(() => {
    setControlnetConditioningScale(Math.max(0, Math.min(2, initialControlnetConditioningScale)));
  }, [initialControlnetConditioningScale]);

  useEffect(() => {
    const nextStart = Math.max(0, Math.min(1, initialControlGuidanceStart));
    const nextEnd = Math.max(nextStart, Math.min(1, initialControlGuidanceEnd));
    setControlGuidanceStart(nextStart);
    setControlGuidanceEnd(nextEnd);
  }, [initialControlGuidanceEnd, initialControlGuidanceStart]);

  useEffect(() => {
    let isCancelled = false;

    async function loadSourceImage() {
      setIsLoadingSource(true);
      setLayersReady(false);
      replaceActiveObject(null);
      replaceDragState(null);
      clearDrafts();
      setHoverPoint(null);
      setHoverResizeHandle(null);
      imageHistoryRef.current = [];
      maskHistoryRef.current = [];
      scribbleHistoryRef.current = [];
      setImageHistoryCount(0);
      setMaskHistoryCount(0);
      setScribbleHistoryCount(0);
      onError?.(null);

      try {
        const nextImageCanvas = createBlankImageCanvas(width, height);
        const nextMaskCanvas = createDefaultMaskCanvas(width, height);
        const nextScribbleCanvas = createBlankScribbleCanvas(width, height);
        const state = initialEditorStateRef.current;
        const shouldRestoreImageLayer = !hasLoadedOnceRef.current && hasEditorStateData(state);
        const restoredIsMaskVisualizationEnabled = state?.isMaskVisualizationEnabled ?? false;
        const restoredFeatherBrushSize = coerceNullableNumber(
          state?.featherBrushSize,
          DEFAULT_FEATHER_BRUSH_SIZE,
          12,
          180,
        );
        const restoredScribbleBrushSize = coerceNullableNumber(
          state?.scribbleBrushSize,
          DEFAULT_SCRIBBLE_BRUSH_SIZE,
          2,
          96,
        );
        const restoredScribblePreviewOpacity = coerceNullableNumber(
          state?.scribblePreviewOpacity,
          DEFAULT_SCRIBBLE_PREVIEW_OPACITY,
          0.1,
          1,
        );
        const restoredControlnetConditioningScale = coerceNullableNumber(
          state?.controlnetConditioningScale,
          initialControlnetConditioningScale,
          0,
          2,
        );
        const restoredControlGuidanceStart = coerceNullableNumber(
          state?.controlGuidanceStart,
          initialControlGuidanceStart,
          0,
          1,
        );
        const restoredControlGuidanceEnd = Math.max(
          restoredControlGuidanceStart,
          coerceNullableNumber(state?.controlGuidanceEnd, initialControlGuidanceEnd, 0, 1),
        );

        editorSettingsRef.current = {
          isMaskVisualizationEnabled: restoredIsMaskVisualizationEnabled,
          featherBrushSize: restoredFeatherBrushSize,
          scribbleBrushSize: restoredScribbleBrushSize,
          scribblePreviewOpacity: restoredScribblePreviewOpacity,
          controlnetConditioningScale: restoredControlnetConditioningScale,
          controlGuidanceStart: restoredControlGuidanceStart,
          controlGuidanceEnd: restoredControlGuidanceEnd,
        };
        setIsMaskVisualizationEnabled(restoredIsMaskVisualizationEnabled);
        setFeatherBrushSize(restoredFeatherBrushSize);
        setScribbleBrushSize(restoredScribbleBrushSize);
        setScribblePreviewOpacity(restoredScribblePreviewOpacity);
        setControlnetConditioningScale(restoredControlnetConditioningScale);
        setControlGuidanceStart(restoredControlGuidanceStart);
        setControlGuidanceEnd(restoredControlGuidanceEnd);

        if (shouldRestoreImageLayer && state?.imageDataUrl) {
          await drawDataUrlToCanvas(state.imageDataUrl, nextImageCanvas);
        } else if (sourceImageUrl) {
          const bitmap = await createBitmapFromUrl(sourceImageUrl);
          try {
            if (isCancelled) {
              return;
            }
            get2dContext(nextImageCanvas).drawImage(bitmap, 0, 0, width, height);
          } finally {
            try {
              bitmap.close();
            } catch {
              // Bitmap cleanup is best-effort.
            }
          }
        }

        if (state?.maskDataUrl) {
          await drawDataUrlToCanvas(state.maskDataUrl, nextMaskCanvas);
        }
        if (state?.scribbleDataUrl) {
          await drawDataUrlToCanvas(state.scribbleDataUrl, nextScribbleCanvas);
        }

        if (!isCancelled) {
          imageCanvasRef.current = nextImageCanvas;
          maskCanvasRef.current = nextMaskCanvas;
          scribbleCanvasRef.current = nextScribbleCanvas;
          hasLoadedOnceRef.current = true;
          setLayersReady(true);
          refreshLayerFlags();
          requestRedraw();
          publishEditorState();
        }
      } catch (error) {
        if (!isCancelled) {
          imageCanvasRef.current = createBlankImageCanvas(width, height);
          maskCanvasRef.current = createDefaultMaskCanvas(width, height);
          scribbleCanvasRef.current = createBlankScribbleCanvas(width, height);
          hasLoadedOnceRef.current = true;
          setLayersReady(true);
          refreshLayerFlags();
          requestRedraw();
          publishEditorState();
          onError?.(getErrorMessage(error));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSource(false);
        }
      }
    }

    void loadSourceImage();
    return () => {
      isCancelled = true;
    };
  }, [height, onError, publishEditorState, sourceImageUrl, width]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    void renderVersion;

    const context = get2dContext(canvas);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    if (imageCanvasRef.current) {
      context.drawImage(imageCanvasRef.current, 0, 0, width, height);
    }

    if (activeObjectRef.current) {
      drawObject(context, activeObjectRef.current);
    }

    if (isMaskVisualizationEnabled) {
      drawWhiteMaskVisualization(context, width, height, maskCanvasRef.current);
    }

    drawScribblePreview(context, scribbleCanvasRef.current, scribblePreviewOpacity);

    const scale = getViewScale(canvas);
    if (mode === 'select') {
      drawSelectionPreview(context, draftSelectionRect, draftSelectionLasso, scale);
    }

    if (mode === 'feather' && hoverPoint) {
      context.save();
      context.strokeStyle = 'rgba(255, 244, 220, 0.96)';
      context.fillStyle = 'rgba(255, 226, 186, 0.12)';
      context.lineWidth = 2 * scale;
      context.setLineDash([6 * scale, 4 * scale]);
      context.beginPath();
      context.arc(hoverPoint.x, hoverPoint.y, featherBrushSize / 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }

    if (mode === 'scribble' && hoverPoint) {
      context.save();
      context.fillStyle = 'rgba(0, 0, 0, 0.08)';
      context.strokeStyle = 'rgba(255, 244, 220, 0.96)';
      context.lineWidth = 3 * scale;
      context.beginPath();
      context.arc(hoverPoint.x, hoverPoint.y, scribbleBrushSize / 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.strokeStyle = 'rgba(0, 0, 0, 0.72)';
      context.lineWidth = 1.5 * scale;
      context.beginPath();
      context.arc(hoverPoint.x, hoverPoint.y, scribbleBrushSize / 2, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    if (mode === 'select' && activeObjectRef.current) {
      drawObjectHandles(context, activeObjectRef.current, scale);
    }
  }, [
    draftSelectionLasso,
    draftSelectionRect,
    featherBrushSize,
    height,
    hoverPoint,
    isMaskVisualizationEnabled,
    mode,
    renderVersion,
    scribbleBrushSize,
    scribblePreviewOpacity,
    width,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  async function addImageBlob(imageBlob: Blob) {
    setIsAddingImage(true);
    onError?.(null);
    try {
      mergeActiveObject();
      const bitmap = await createImageBitmap(imageBlob);
      try {
        const nextObject = createObjectFromBitmap(bitmap, width, height);
        replaceActiveObject(nextObject);
        setMode('select');
        setSelectionTool('move');
        clearDrafts();
      } finally {
        try {
          bitmap.close();
        } catch {
          // Bitmap cleanup is best-effort.
        }
      }
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setIsAddingImage(false);
    }
  }

  async function handlePaste(event: ReactClipboardEvent<HTMLElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (!file) {
      return;
    }
    event.preventDefault();
    await addImageBlob(file);
  }

  function finishSelection(selection: SelectionRegion) {
    const imageCanvas = imageCanvasRef.current;
    if (!imageCanvas) {
      return;
    }
    const nextObject = createObjectFromSelection(imageCanvas, selection);
    if (!nextObject) {
      return;
    }
    replaceActiveObject(nextObject);
    setSelectionTool('move');
  }

  function applyActiveObjectToMask(value: MaskPaintValue) {
    const object = activeObjectRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }

    pushMaskHistory(maskCanvas);
    if (object) {
      const isAllWhite = isCanvasSolidColor(maskCanvas, 255, 255, 255);
      const isAllBlack = isCanvasSolidColor(maskCanvas, 0, 0, 0);
      if (value === 'white' && isAllWhite) {
        fillWholeMask(maskCanvas, 'black');
      } else if (value === 'black' && isAllBlack) {
        fillWholeMask(maskCanvas, 'white');
      }
      fillMaskPath(maskCanvas, getObjectMaskPath(object), value);
    } else {
      fillWholeMask(maskCanvas, value);
    }
    setIsMaskVisualizationEnabled(true);
    refreshLayerFlags();
    requestRedraw();
    publishEditorState();
  }

  function setActiveObjectValue(updateObjectValue: (object: CanvasObject) => CanvasObject) {
    const object = activeObjectRef.current;
    if (!object) {
      return;
    }
    replaceActiveObject(updateObjectValue(object));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isGenerating || !isReady) {
      return;
    }

    const point = getCanvasPoint(canvas, event, width, height);
    setHoverPoint(point);
    canvas.setPointerCapture(event.pointerId);

    if (mode === 'scribble') {
      mergeActiveObject();
      const scribbleCanvas = scribbleCanvasRef.current;
      if (!scribbleCanvas) {
        return;
      }
      pushScribbleHistory(scribbleCanvas);
      drawRoundStroke(scribbleCanvas, null, point, scribbleBrushSize, '#000000');
      setHasScribbleEdits(true);
      replaceDragState({ kind: 'scribble', lastPoint: point });
      requestRedraw();
      return;
    }

    if (mode === 'feather') {
      mergeActiveObject();
      const imageCanvas = imageCanvasRef.current;
      if (!imageCanvas) {
        return;
      }
      pushImageHistory(imageCanvas);
      applyFeatherStrokeToImage(imageCanvas, null, point, featherBrushSize);
      replaceDragState({ kind: 'feather', lastPoint: point });
      requestRedraw();
      return;
    }

    const object = activeObjectRef.current;
    if (object) {
      const scale = getViewScale(canvas);
      const rotatePointValue = getRotateHandlePosition(object);
      if (Math.hypot(point.x - rotatePointValue.x, point.y - rotatePointValue.y) <= 12 * scale) {
        replaceDragState({
          kind: 'rotate',
          startAngle: Math.atan2(point.y - object.y, point.x - object.x),
          original: objectSnapshot(object),
        });
        return;
      }

      const resizeHandle = findResizeHandle(point, object, 12 * scale);
      if (resizeHandle) {
        replaceDragState({
          kind: 'resize',
          handle: resizeHandle,
          original: objectSnapshot(object),
        });
        return;
      }

      if (isPointInObject(point, object)) {
        replaceDragState({
          kind: 'move',
          start: point,
          original: objectSnapshot(object),
        });
        return;
      }

      mergeActiveObject();
    }

    if (selectionTool === 'rect') {
      replaceDraftSelectionRect(getRectFromPoints(point, point));
      replaceDraftSelectionLasso([]);
      replaceDragState({ kind: 'select-rect', start: point });
    } else if (selectionTool === 'lasso') {
      replaceDraftSelectionRect(null);
      replaceDraftSelectionLasso([point]);
      replaceDragState({ kind: 'select-lasso' });
    } else {
      replaceDragState(null);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isGenerating || !isReady) {
      return;
    }

    const point = getCanvasPoint(canvas, event, width, height);
    const currentDragState = dragStateRef.current;
    setHoverPoint(point);

    if (!currentDragState) {
      if (mode === 'select' && activeObjectRef.current) {
        setHoverResizeHandle(findResizeHandle(point, activeObjectRef.current, 12 * getViewScale(canvas)));
      } else {
        setHoverResizeHandle(null);
      }
      return;
    }

    if (currentDragState.kind === 'select-rect') {
      replaceDraftSelectionRect(getRectFromPoints(currentDragState.start, point));
      return;
    }

    if (currentDragState.kind === 'select-lasso') {
      replaceDraftSelectionLasso([...draftSelectionLassoRef.current, point]);
      return;
    }

    if (currentDragState.kind === 'scribble') {
      const scribbleCanvas = scribbleCanvasRef.current;
      if (!scribbleCanvas) {
        return;
      }
      drawRoundStroke(scribbleCanvas, currentDragState.lastPoint, point, scribbleBrushSize, '#000000');
      replaceDragState({ ...currentDragState, lastPoint: point });
      requestRedraw();
      return;
    }

    if (currentDragState.kind === 'feather') {
      const imageCanvas = imageCanvasRef.current;
      if (!imageCanvas) {
        return;
      }
      applyFeatherStrokeToImage(imageCanvas, currentDragState.lastPoint, point, featherBrushSize);
      replaceDragState({ ...currentDragState, lastPoint: point });
      requestRedraw();
      return;
    }

    if (currentDragState.kind === 'move') {
      setActiveObjectValue((object) => ({
        ...object,
        x: currentDragState.original.x + point.x - currentDragState.start.x,
        y: currentDragState.original.y + point.y - currentDragState.start.y,
        dirty: true,
      }));
      return;
    }

    if (currentDragState.kind === 'rotate') {
      const angle = Math.atan2(point.y - currentDragState.original.y, point.x - currentDragState.original.x);
      setActiveObjectValue((object) => ({
        ...object,
        rotation: currentDragState.original.rotation + angle - currentDragState.startAngle,
        dirty: true,
      }));
      return;
    }

    const localPoint = toObjectLocal(point, currentDragState.original);
    setActiveObjectValue((object) => {
      let nextWidth = currentDragState.original.width;
      let nextHeight = currentDragState.original.height;
      if (currentDragState.handle.includes('e') || currentDragState.handle.includes('w')) {
        nextWidth = Math.max(MIN_OBJECT_SIZE, Math.abs(localPoint.x) * 2);
      }
      if (currentDragState.handle.includes('n') || currentDragState.handle.includes('s')) {
        nextHeight = Math.max(MIN_OBJECT_SIZE, Math.abs(localPoint.y) * 2);
      }
      if (currentDragState.handle.length === 2) {
        const scale = Math.max(
          nextWidth / currentDragState.original.width,
          nextHeight / currentDragState.original.height,
        );
        nextWidth = Math.max(MIN_OBJECT_SIZE, currentDragState.original.width * scale);
        nextHeight = Math.max(MIN_OBJECT_SIZE, currentDragState.original.height * scale);
      }
      return {
        ...object,
        width: nextWidth,
        height: nextHeight,
        dirty: true,
      };
    });
  }

  function handlePointerLeave() {
    if (dragStateRef.current) {
      return;
    }
    setHoverPoint(null);
    setHoverResizeHandle(null);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = canvas ? getCanvasPoint(canvas, event, width, height) : null;
    const currentDragState = dragStateRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (currentDragState?.kind === 'select-rect') {
      const rect = point ? getRectFromPoints(currentDragState.start, point) : draftSelectionRectRef.current;
      if (rect && rect.width >= MIN_SELECTION_SIZE && rect.height >= MIN_SELECTION_SIZE) {
        finishSelection(rect);
      }
      replaceDraftSelectionRect(null);
    }

    if (currentDragState?.kind === 'select-lasso') {
      const points = point ? [...draftSelectionLassoRef.current, point] : draftSelectionLassoRef.current;
      if (points.length >= LASSO_MIN_POINTS) {
        finishSelection({ kind: 'lasso', points });
      }
      replaceDraftSelectionLasso([]);
    }

    if (currentDragState?.kind === 'feather') {
      publishEditorState();
    }

    if (currentDragState?.kind === 'scribble') {
      refreshLayerFlags();
      publishEditorState();
    }

    replaceDragState(null);
    setHoverResizeHandle(null);
  }

  function undoImage() {
    if (activeObjectRef.current) {
      return;
    }

    const previousCanvas = imageHistoryRef.current[imageHistoryRef.current.length - 1];
    if (!previousCanvas) {
      return;
    }
    imageHistoryRef.current = imageHistoryRef.current.slice(0, -1);
    setImageHistoryCount(imageHistoryRef.current.length);
    imageCanvasRef.current = cloneCanvas(previousCanvas);
    requestRedraw();
    publishEditorState();
  }

  function undoMask() {
    const previousCanvas = maskHistoryRef.current[maskHistoryRef.current.length - 1];
    if (!previousCanvas) {
      return;
    }
    maskHistoryRef.current = maskHistoryRef.current.slice(0, -1);
    setMaskHistoryCount(maskHistoryRef.current.length);
    maskCanvasRef.current = cloneCanvas(previousCanvas);
    setIsMaskVisualizationEnabled(true);
    refreshLayerFlags();
    requestRedraw();
    publishEditorState();
  }

  function undoScribble() {
    const previousCanvas = scribbleHistoryRef.current[scribbleHistoryRef.current.length - 1];
    if (!previousCanvas) {
      return;
    }
    scribbleHistoryRef.current = scribbleHistoryRef.current.slice(0, -1);
    setScribbleHistoryCount(scribbleHistoryRef.current.length);
    scribbleCanvasRef.current = cloneCanvas(previousCanvas);
    refreshLayerFlags();
    requestRedraw();
    publishEditorState();
  }

  function clearScribble() {
    const scribbleCanvas = scribbleCanvasRef.current;
    if (!scribbleCanvas) {
      return;
    }
    pushScribbleHistory(scribbleCanvas);
    const context = get2dContext(scribbleCanvas);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);
    setHasScribbleEdits(false);
    requestRedraw();
    publishEditorState();
  }

  function deleteActiveObject() {
    if (!activeObjectRef.current) {
      return;
    }
    replaceActiveObject(null);
    replaceDragState(null);
    setHoverResizeHandle(null);
  }

  function flipActiveObjectX() {
    if (!activeObjectRef.current) {
      return;
    }
    setActiveObjectValue((object) => ({
      ...object,
      flipX: !object.flipX,
      dirty: true,
    }));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (disabled || isGenerating) {
      return;
    }

    if (event.key === 'Delete' && activeObjectRef.current) {
      event.preventDefault();
      deleteActiveObject();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (mode === 'scribble') {
        undoScribble();
      } else {
        undoImage();
      }
    }
  }

  function updateControlGuidanceStart(value: number) {
    const nextValue = Math.max(0, Math.min(1, value));
    setControlGuidanceStart(nextValue);
    setControlGuidanceEnd((currentEnd) => Math.max(currentEnd, nextValue));
  }

  function updateControlGuidanceEnd(value: number) {
    setControlGuidanceEnd(Math.max(controlGuidanceStart, Math.min(1, value)));
  }

  useImperativeHandle(ref, () => ({
    async renderImageAndMask() {
      if (!isReady || !imageCanvasRef.current || !maskCanvasRef.current || !scribbleCanvasRef.current) {
        throw new Error('이미지 편집기가 아직 준비되지 않았습니다.');
      }

      mergeActiveObject();
      const imageCanvas = cloneCanvas(imageCanvasRef.current);
      const maskCanvas = cloneCanvas(maskCanvasRef.current);
      const scribbleCanvas = cloneCanvas(scribbleCanvasRef.current);
      const hasScribble = !isCanvasSolidColor(scribbleCanvas, 255, 255, 255);
      publishEditorState();
      return {
        image: await canvasToPngBlob(imageCanvas),
        mask: await canvasToPngBlob(maskCanvas),
        scribble: await canvasToPngBlob(scribbleCanvas),
        hasScribble,
        controlSettings: {
          controlnet_conditioning_scale: hasScribble ? controlnetConditioningScale : 0,
          control_guidance_start: controlGuidanceStart,
          control_guidance_end: controlGuidanceEnd,
        },
      };
    },
  }), [
    controlGuidanceEnd,
    controlGuidanceStart,
    controlnetConditioningScale,
    isReady,
    publishEditorState,
  ]);

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <FieldLabel>INPAINT 이미지</FieldLabel>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'select' ? 'primary' : 'default'}
            onClick={() => switchMode('select')}
            disabled={disabled || isGenerating}
            aria-label="선택 및 object 편집"
            title="선택 및 object 편집"
          >
            ✋
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'feather' ? 'primary' : 'default'}
            onClick={() => switchMode('feather')}
            disabled={disabled || isGenerating}
            aria-label="Feather 브러시"
            title="Feather 브러시"
          >
            🖌️
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'scribble' ? 'primary' : 'default'}
            onClick={() => switchMode('scribble')}
            disabled={disabled || isGenerating}
            aria-label="Scribble ControlNet"
            title="Scribble ControlNet"
          >
            ✏️
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={isMaskVisualizationEnabled ? 'primary' : 'default'}
            onClick={() => setIsMaskVisualizationEnabled((value) => !value)}
            disabled={disabled || isGenerating}
            aria-label="Mask 시각화 토글"
            title="Mask 시각화 토글"
          >
            ◐
          </Button>
        </div>
      </div>

      <div className="flex min-h-8 min-w-0 flex-wrap items-center justify-end gap-2">
        {mode === 'select' ? (
          <>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={selectionTool === 'rect' ? 'primary' : 'default'}
              onClick={() => changeSelectionTool('rect')}
              disabled={disabled || isGenerating}
              aria-label="사각형 선택"
              title="사각형 선택"
            >
              ▭
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={selectionTool === 'lasso' ? 'primary' : 'default'}
              onClick={() => changeSelectionTool('lasso')}
              disabled={disabled || isGenerating}
              aria-label="Lasso 선택"
              title="Lasso 선택"
            >
              〰
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={flipActiveObjectX}
              disabled={disabled || isGenerating || !activeObject}
              aria-label="선택 object 좌우반전"
              title="선택 object 좌우반전"
            >
              ↔
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={undoImage}
              disabled={disabled || isGenerating || Boolean(activeObject) || imageHistoryCount === 0}
              aria-label="Image undo"
              title="Image undo"
            >
              ↩
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={() => applyActiveObjectToMask('white')}
              disabled={disabled || isGenerating}
              aria-label="선택 object를 white mask로 적용"
              title="선택 object를 white mask로 적용"
            >
              ■
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={() => applyActiveObjectToMask('black')}
              disabled={disabled || isGenerating}
              aria-label="선택 object를 black mask로 적용"
              title="선택 object를 black mask로 적용"
            >
              □
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={undoMask}
              disabled={disabled || isGenerating || maskHistoryCount === 0}
              aria-label="Mask undo"
              title="Mask undo"
            >
              ↩
            </Button>
          </>
        ) : null}

        {mode === 'feather' ? (
          <>
            <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              brush
              <input
                type="range"
                min="12"
                max="180"
                step="2"
                value={featherBrushSize}
                onChange={(event) => setFeatherBrushSize(Number(event.target.value))}
                disabled={disabled || isGenerating}
                className="w-24 accent-[#ffe2ba]"
              />
              <span className="w-10 text-right">{featherBrushSize}px</span>
            </label>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={undoImage}
              disabled={disabled || isGenerating || Boolean(activeObject) || imageHistoryCount === 0}
              aria-label="Image undo"
              title="Image undo"
            >
              ↩
            </Button>
          </>
        ) : null}

        {mode === 'scribble' ? (
          <>
            <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              brush
              <input
                type="range"
                min="2"
                max="100"
                step="1"
                value={scribbleBrushSize}
                onChange={(event) => setScribbleBrushSize(Number(event.target.value))}
                disabled={disabled || isGenerating}
                className="w-20 accent-[#ffe2ba]"
              />
              <span className="w-9 text-right">{scribbleBrushSize}px</span>
            </label>
            <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              opacity
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={scribblePreviewOpacity}
                onChange={(event) => setScribblePreviewOpacity(Number(event.target.value))}
                disabled={disabled || isGenerating}
                className="w-20 accent-[#ffe2ba]"
              />
              <span className="w-10 text-right">{Math.round(scribblePreviewOpacity * 100)}%</span>
            </label>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              scale
              <input
                type="number"
                min="0"
                max="2"
                step="0.05"
                value={controlnetConditioningScale}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (Number.isFinite(nextValue)) {
                    setControlnetConditioningScale(Math.max(0, Math.min(2, nextValue)));
                  }
                }}
                disabled={disabled || isGenerating}
                className="h-8 w-16 rounded-[8px] border border-[rgba(255,218,228,0.26)] bg-[rgba(16,8,24,0.72)] px-2 text-right text-xs text-[#fff7ef] outline-none focus:border-[#ffe2ba]"
              />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              start
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={controlGuidanceStart}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (Number.isFinite(nextValue)) {
                    updateControlGuidanceStart(nextValue);
                  }
                }}
                disabled={disabled || isGenerating}
                className="h-8 w-16 rounded-[8px] border border-[rgba(255,218,228,0.26)] bg-[rgba(16,8,24,0.72)] px-2 text-right text-xs text-[#fff7ef] outline-none focus:border-[#ffe2ba]"
              />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              end
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={controlGuidanceEnd}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (Number.isFinite(nextValue)) {
                    updateControlGuidanceEnd(nextValue);
                  }
                }}
                disabled={disabled || isGenerating}
                className="h-8 w-16 rounded-[8px] border border-[rgba(255,218,228,0.26)] bg-[rgba(16,8,24,0.72)] px-2 text-right text-xs text-[#fff7ef] outline-none focus:border-[#ffe2ba]"
              />
            </label>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={undoScribble}
              disabled={disabled || isGenerating || scribbleHistoryCount === 0}
              aria-label="Scribble undo"
              title="Scribble undo"
            >
              ↩
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={clearScribble}
              disabled={disabled || isGenerating || !hasScribbleEdits}
              aria-label="Scribble 모두 지우기"
              title="Scribble 모두 지우기"
            >
              🧹
            </Button>
          </>
        ) : null}
      </div>

      <ImageFrame
        className="relative mx-auto w-[min(100%,32rem)] rounded-[8px] border border-[rgba(255,218,228,0.22)] focus-within:ring-2 focus-within:ring-[rgba(255,226,186,0.55)] max-[960px]:w-[min(100%,28rem)]"
        onPaste={handlePaste}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          aria-label={altText || 'Scene inpaint image editor'}
          className="block h-full w-full touch-none focus:outline-none"
          style={{ cursor: canvasCursor }}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />

        {(isWorking || isGenerating) ? (
          <div className="absolute inset-0 grid place-items-center gap-3 bg-[rgba(7,1,12,0.54)] text-center text-[0.95rem] font-extrabold text-[#fff7ef]">
            <Spinner aria-hidden="true" />
            <span>{isGenerating ? '이미지 생성 중' : '이미지 준비 중'}</span>
          </div>
        ) : null}
      </ImageFrame>
    </div>
  );
});
