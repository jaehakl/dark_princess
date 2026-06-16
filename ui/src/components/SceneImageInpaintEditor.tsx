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
type EditorMode = 'select' | 'feather' | 'mask' | 'scribble';
type SelectionTool = 'move' | 'rect' | 'lasso';
type MaskTool = 'freehand' | 'rect';
type MaskPaintValue = 'white' | 'black';

type CanvasObject = {
  id: string;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  flipX: boolean;
  dirty: boolean;
  maskPath?: Point[];
};

type CanvasObjectSnapshot = Pick<CanvasObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

export type SceneImageMaskRegion =
  | {
    kind: 'freehand';
    points: Point[];
    value: MaskPaintValue;
  }
  | {
    kind: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
    value: MaskPaintValue;
  };

type SceneImageMaskRectRegion = Extract<SceneImageMaskRegion, { kind: 'rect' }>;

export type SceneImageScribbleStroke = {
  points: Point[];
  brushSize: number;
};

export type SceneImageInpaintEditorState = {
  maskRegions: SceneImageMaskRegion[];
  scribbleStrokes: SceneImageScribbleStroke[];
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
    kind: 'mask-freehand';
    value: MaskPaintValue;
  }
  | {
    kind: 'mask-rect';
    start: Point;
    value: MaskPaintValue;
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
const MASK_FREEHAND_MIN_POINTS = 3;
const MASK_RECT_MIN_SIZE = 3;
const SELECT_LASSO_MIN_POINTS = 3;
const DEFAULT_FEATHER_BRUSH_SIZE = 64;
const DEFAULT_SCRIBBLE_BRUSH_SIZE = 12;
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

function createBlankImageCanvas(width: number, height: number) {
  const canvas = createRenderCanvas(width, height);
  const context = get2dContext(canvas);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function cloneCanvas(canvas: HTMLCanvasElement) {
  const nextCanvas = createRenderCanvas(canvas.width, canvas.height);
  get2dContext(nextCanvas).drawImage(canvas, 0, 0);
  return nextCanvas;
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

function normalizeMaskRegions(maskRegions: SceneImageMaskRegion[]) {
  return maskRegions.map((region) => ({
    ...region,
    value: region.value ?? 'black',
  }));
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

function drawFreehandPath(
  context: CanvasRenderingContext2D,
  points: Point[],
  closePath: boolean,
) {
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

function drawOpenPathPreview(
  context: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
) {
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
  drawFreehandPath(context, points, false);
  context.stroke();
}

function drawMaskRegionPath(
  context: CanvasRenderingContext2D,
  region: SceneImageMaskRegion,
) {
  if (region.kind === 'rect') {
    context.beginPath();
    context.rect(region.x, region.y, region.width, region.height);
    return;
  }
  drawFreehandPath(context, region.points, true);
}

function drawScribbleStroke(
  context: CanvasRenderingContext2D,
  stroke: SceneImageScribbleStroke,
  strokeStyle = '#000000',
) {
  if (stroke.points.length === 0) {
    return;
  }

  context.save();
  context.strokeStyle = strokeStyle;
  context.fillStyle = strokeStyle;
  context.lineWidth = stroke.brushSize;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (stroke.points.length === 1) {
    context.beginPath();
    context.arc(stroke.points[0].x, stroke.points[0].y, stroke.brushSize / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.restore();
}

function getMaskRectFromPoints(
  start: Point,
  end: Point,
  value: MaskPaintValue,
): SceneImageMaskRectRegion {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    kind: 'rect',
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    value,
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

function getSelectionBounds(region: SceneImageMaskRegion) {
  if (region.kind === 'rect') {
    return {
      left: region.x,
      top: region.y,
      right: region.x + region.width,
      bottom: region.y + region.height,
    };
  }
  return getBoundsFromPoints(region.points);
}

function createObjectFromCanvas(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  dirty: boolean,
  maskPath?: Point[],
): CanvasObject {
  return {
    id: createObjectId(),
    canvas,
    x,
    y,
    width,
    height,
    rotation: 0,
    label,
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
    'clipboard',
    true,
    maskPath,
  );
}

function createObjectFromSelection(sourceCanvas: HTMLCanvasElement, region: SceneImageMaskRegion) {
  const bounds = getSelectionBounds(region);
  const left = Math.max(0, Math.floor(bounds.left));
  const top = Math.max(0, Math.floor(bounds.top));
  const right = Math.min(sourceCanvas.width, Math.ceil(bounds.right));
  const bottom = Math.min(sourceCanvas.height, Math.ceil(bounds.bottom));
  const selectionWidth = right - left;
  const selectionHeight = bottom - top;

  if (selectionWidth < MASK_RECT_MIN_SIZE || selectionHeight < MASK_RECT_MIN_SIZE) {
    return null;
  }

  const selectionCanvas = createRenderCanvas(selectionWidth, selectionHeight);
  const selectionContext = get2dContext(selectionCanvas);

  if (region.kind === 'freehand') {
    selectionContext.save();
    selectionContext.beginPath();
    selectionContext.moveTo(region.points[0].x - left, region.points[0].y - top);
    for (const point of region.points.slice(1)) {
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
  const maskPath = region.kind === 'freehand'
    ? region.points.map((point) => ({ x: point.x - centerX, y: point.y - centerY }))
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
    'selection',
    false,
    maskPath,
  );
}

function createMaskRegionFromObject(object: CanvasObject, value: MaskPaintValue): SceneImageMaskRegion {
  const localPath = object.maskPath ?? [
    { x: -object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: -object.height / 2 },
    { x: object.width / 2, y: object.height / 2 },
    { x: -object.width / 2, y: object.height / 2 },
  ];
  return {
    kind: 'freehand',
    points: localPath.map((point) => objectLocalToCanvas(
      object,
      object.flipX ? -point.x : point.x,
      point.y,
    )),
    value,
  };
}

function renderImageCanvas(
  width: number,
  height: number,
  baseImageCanvas: HTMLCanvasElement | null,
  activeObject: CanvasObject | null,
) {
  const imageCanvas = baseImageCanvas ? cloneCanvas(baseImageCanvas) : createBlankImageCanvas(width, height);
  if (activeObject?.dirty) {
    drawObject(get2dContext(imageCanvas), activeObject);
  }
  return imageCanvas;
}

function renderMaskCanvas(
  width: number,
  height: number,
  maskRegions: SceneImageMaskRegion[],
) {
  const maskCanvas = createRenderCanvas(width, height);
  const maskContext = get2dContext(maskCanvas);
  maskContext.fillStyle = '#ffffff';
  maskContext.fillRect(0, 0, width, height);

  for (const region of maskRegions) {
    maskContext.fillStyle = region.value === 'white' ? '#ffffff' : '#000000';
    drawMaskRegionPath(maskContext, region);
    maskContext.fill();
  }
  return maskCanvas;
}

function renderScribbleCanvas(
  width: number,
  height: number,
  scribbleStrokes: SceneImageScribbleStroke[],
) {
  const scribbleCanvas = createRenderCanvas(width, height);
  const scribbleContext = get2dContext(scribbleCanvas);
  scribbleContext.fillStyle = '#ffffff';
  scribbleContext.fillRect(0, 0, width, height);
  for (const stroke of scribbleStrokes) {
    drawScribbleStroke(scribbleContext, stroke, '#000000');
  }
  return scribbleCanvas;
}

function drawEditorImage(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseImageCanvas: HTMLCanvasElement | null,
  activeObject: CanvasObject | null,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  if (baseImageCanvas) {
    context.drawImage(baseImageCanvas, 0, 0, width, height);
  }
  if (activeObject) {
    drawObject(context, activeObject);
  }
}

function drawWhiteMaskVisualization(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  maskRegions: SceneImageMaskRegion[],
) {
  const overlayCanvas = createRenderCanvas(width, height);
  const overlayContext = get2dContext(overlayCanvas);
  overlayContext.fillStyle = 'rgba(255, 255, 255, 0.72)';
  overlayContext.fillRect(0, 0, width, height);

  for (const region of maskRegions) {
    overlayContext.globalCompositeOperation = region.value === 'white' ? 'source-over' : 'destination-out';
    overlayContext.fillStyle = 'rgba(255, 255, 255, 0.72)';
    drawMaskRegionPath(overlayContext, region);
    overlayContext.fill();
  }
  overlayContext.globalCompositeOperation = 'source-over';
  context.drawImage(overlayCanvas, 0, 0);
}

function drawMaskPreview(
  context: CanvasRenderingContext2D,
  region: SceneImageMaskRegion,
  scale: number,
) {
  context.save();
  context.fillStyle = region.value === 'white'
    ? 'rgba(255, 255, 255, 0.22)'
    : 'rgba(0, 0, 0, 0.26)';
  context.strokeStyle = region.value === 'white'
    ? 'rgba(255, 250, 235, 0.94)'
    : 'rgba(255, 226, 186, 0.92)';
  context.lineWidth = 2 * scale;
  drawMaskRegionPath(context, region);
  context.fill();
  context.stroke();
  context.restore();
}

function drawSelectionPreview(
  context: CanvasRenderingContext2D,
  selectionRect: SceneImageMaskRectRegion | null,
  selectionLasso: Point[],
  scale: number,
) {
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (selectionRect) {
    context.save();
    context.strokeStyle = 'rgba(255, 244, 220, 0.98)';
    context.fillStyle = 'rgba(255, 226, 186, 0.14)';
    context.lineWidth = 2 * scale;
    context.setLineDash([8 * scale, 5 * scale]);
    drawMaskRegionPath(context, selectionRect);
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
  const selectionOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeObjectRef = useRef<CanvasObject | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const draftSelectionRectRef = useRef<SceneImageMaskRectRegion | null>(null);
  const draftSelectionLassoRef = useRef<Point[]>([]);
  const imageHistoryRef = useRef<HTMLCanvasElement[]>([]);
  const [baseImageCanvas, setBaseImageCanvas] = useState<HTMLCanvasElement | null>(null);
  const [baseImageVersion, setBaseImageVersion] = useState(0);
  const [activeObject, setActiveObject] = useState<CanvasObject | null>(null);
  const [imageHistoryCount, setImageHistoryCount] = useState(0);
  const [maskRegions, setMaskRegions] = useState<SceneImageMaskRegion[]>(
    () => normalizeMaskRegions(initialEditorState?.maskRegions ?? []),
  );
  const [maskHistory, setMaskHistory] = useState<SceneImageMaskRegion[][]>([]);
  const [draftMaskFreehand, setDraftMaskFreehand] = useState<Point[]>([]);
  const [draftMaskRect, setDraftMaskRect] = useState<SceneImageMaskRectRegion | null>(null);
  const [scribbleStrokes, setScribbleStrokes] = useState<SceneImageScribbleStroke[]>(
    () => initialEditorState?.scribbleStrokes ?? [],
  );
  const [scribbleHistory, setScribbleHistory] = useState<SceneImageScribbleStroke[][]>([]);
  const [draftScribble, setDraftScribble] = useState<SceneImageScribbleStroke | null>(null);
  const [, setDraftSelectionRect] = useState<SceneImageMaskRectRegion | null>(null);
  const [, setDraftSelectionLasso] = useState<Point[]>([]);
  const [mode, setMode] = useState<EditorMode>('select');
  const [selectionTool, setSelectionTool] = useState<SelectionTool>('rect');
  const [maskTool, setMaskTool] = useState<MaskTool>('freehand');
  const [maskPaintValue, setMaskPaintValue] = useState<MaskPaintValue>('black');
  const [isMaskVisualizationEnabled, setIsMaskVisualizationEnabled] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [hoverResizeHandle, setHoverResizeHandle] = useState<ResizeHandle | null>(null);
  const [featherBrushSize, setFeatherBrushSize] = useState(DEFAULT_FEATHER_BRUSH_SIZE);
  const [scribbleBrushSize, setScribbleBrushSize] = useState(DEFAULT_SCRIBBLE_BRUSH_SIZE);
  const [controlnetConditioningScale, setControlnetConditioningScale] = useState(
    initialControlnetConditioningScale,
  );
  const [controlGuidanceStart, setControlGuidanceStart] = useState(initialControlGuidanceStart);
  const [controlGuidanceEnd, setControlGuidanceEnd] = useState(initialControlGuidanceEnd);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isAddingImage, setIsAddingImage] = useState(false);

  const isWorking = isLoadingSource || isAddingImage;
  const isReady = !isWorking && Boolean(baseImageCanvas) && width > 0 && height > 0;
  const canvasCursor = mode === 'feather'
    ? 'none'
    : mode === 'mask' || mode === 'scribble' || (mode === 'select' && selectionTool !== 'move' && !activeObject)
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

  useEffect(() => {
    baseImageCanvasRef.current = baseImageCanvas;
  }, [baseImageCanvas]);

  useEffect(() => {
    activeObjectRef.current = activeObject;
  }, [activeObject]);

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  useEffect(() => {
    if (!initialEditorState) {
      return;
    }
    setMaskRegions(normalizeMaskRegions(initialEditorState.maskRegions));
    setScribbleStrokes(initialEditorState.scribbleStrokes);
    setMaskHistory([]);
    setScribbleHistory([]);
    setDraftMaskFreehand([]);
    setDraftMaskRect(null);
    setDraftScribble(null);
    replaceDraftSelectionRect(null);
    replaceDraftSelectionLasso([]);
    setIsMaskVisualizationEnabled(false);
  }, [initialEditorState]);

  useEffect(() => {
    onEditorStateChange?.({
      maskRegions,
      scribbleStrokes,
    });
  }, [maskRegions, onEditorStateChange, scribbleStrokes]);

  useEffect(() => {
    setControlnetConditioningScale(Math.max(0, Math.min(2, initialControlnetConditioningScale)));
  }, [initialControlnetConditioningScale]);

  useEffect(() => {
    const nextStart = Math.max(0, Math.min(1, initialControlGuidanceStart));
    const nextEnd = Math.max(nextStart, Math.min(1, initialControlGuidanceEnd));
    setControlGuidanceStart(nextStart);
    setControlGuidanceEnd(nextEnd);
  }, [initialControlGuidanceEnd, initialControlGuidanceStart]);

  function replaceBaseImageCanvas(nextCanvas: HTMLCanvasElement | null) {
    baseImageCanvasRef.current = nextCanvas;
    setBaseImageCanvas(nextCanvas);
    setBaseImageVersion((version) => version + 1);
  }

  function replaceActiveObject(nextObject: CanvasObject | null) {
    activeObjectRef.current = nextObject;
    setActiveObject(nextObject);
  }

  function replaceDragState(nextDragState: DragState | null) {
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }

  function replaceDraftSelectionRect(nextRect: SceneImageMaskRectRegion | null) {
    draftSelectionRectRef.current = nextRect;
    setDraftSelectionRect(nextRect);
  }

  function replaceDraftSelectionLasso(nextPoints: Point[]) {
    draftSelectionLassoRef.current = nextPoints;
    setDraftSelectionLasso(nextPoints);
  }

  function redrawSelectionOverlay() {
    const overlayCanvas = selectionOverlayRef.current;
    if (!overlayCanvas) {
      return;
    }
    const context = get2dContext(overlayCanvas);
    drawSelectionPreview(
      context,
      draftSelectionRectRef.current,
      draftSelectionLassoRef.current,
      getViewScale(overlayCanvas),
    );
  }

  function clearSelectionOverlay() {
    const overlayCanvas = selectionOverlayRef.current;
    if (!overlayCanvas) {
      return;
    }
    get2dContext(overlayCanvas).clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  function pushImageHistory(canvas = baseImageCanvasRef.current) {
    if (!canvas) {
      return;
    }
    imageHistoryRef.current = pushCapped(imageHistoryRef.current, cloneCanvas(canvas));
    setImageHistoryCount(imageHistoryRef.current.length);
  }

  function pushMaskHistoryFrom(regions: SceneImageMaskRegion[]) {
    setMaskHistory((history) => pushCapped(history, regions.map((region) => ({ ...region }))));
  }

  function pushScribbleHistoryFrom(strokes: SceneImageScribbleStroke[]) {
    setScribbleHistory((history) => pushCapped(
      history,
      strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })),
    ));
  }

  function mergeActiveObject() {
    const object = activeObjectRef.current;
    const imageCanvas = baseImageCanvasRef.current;
    if (!object || !imageCanvas) {
      replaceActiveObject(null);
      return imageCanvas;
    }

    if (!object.dirty) {
      replaceActiveObject(null);
      return imageCanvas;
    }

    pushImageHistory(imageCanvas);
    const nextCanvas = cloneCanvas(imageCanvas);
    drawObject(get2dContext(nextCanvas), object);
    replaceBaseImageCanvas(nextCanvas);
    replaceActiveObject(null);
    return nextCanvas;
  }

  function discardActiveObject() {
    replaceActiveObject(null);
    replaceDragState(null);
    setHoverResizeHandle(null);
  }

  function setActiveObjectValue(updateObjectValue: (object: CanvasObject) => CanvasObject) {
    const object = activeObjectRef.current;
    if (!object) {
      return;
    }
    replaceActiveObject(updateObjectValue(object));
  }

  function switchMode(nextMode: EditorMode) {
    if (nextMode !== mode) {
      mergeActiveObject();
      setDraftMaskFreehand([]);
      setDraftMaskRect(null);
      replaceDraftSelectionRect(null);
      replaceDraftSelectionLasso([]);
      clearSelectionOverlay();
      setDraftScribble(null);
      replaceDragState(null);
      setHoverResizeHandle(null);
      if (nextMode === 'mask') {
        setIsMaskVisualizationEnabled(true);
      }
    }
    setMode(nextMode);
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadSourceImage() {
      setIsLoadingSource(true);
      replaceActiveObject(null);
      imageHistoryRef.current = [];
      setImageHistoryCount(0);
      setDraftMaskFreehand([]);
      setDraftMaskRect(null);
      replaceDraftSelectionRect(null);
      replaceDraftSelectionLasso([]);
      clearSelectionOverlay();
      setDraftScribble(null);
      replaceDragState(null);
      onError?.(null);

      try {
        const nextCanvas = createBlankImageCanvas(width, height);
        if (sourceImageUrl) {
          const bitmap = await createBitmapFromUrl(sourceImageUrl);
          if (isCancelled) {
            try {
              bitmap.close();
            } catch {
              return;
            }
            return;
          }
          get2dContext(nextCanvas).drawImage(bitmap, 0, 0, width, height);
          try {
            bitmap.close();
          } catch {
            // Bitmap cleanup is best-effort.
          }
        }
        if (!isCancelled) {
          replaceBaseImageCanvas(nextCanvas);
        }
      } catch (error) {
        if (!isCancelled) {
          replaceBaseImageCanvas(createBlankImageCanvas(width, height));
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
  }, [height, onError, sourceImageUrl, width]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    void baseImageVersion;
    void activeObject;

    const context = get2dContext(canvas);
    const currentBaseImageCanvas = baseImageCanvasRef.current ?? baseImageCanvas;
    const currentActiveObject = activeObjectRef.current;
    drawEditorImage(context, width, height, currentBaseImageCanvas, currentActiveObject);

    if (isMaskVisualizationEnabled) {
      drawWhiteMaskVisualization(context, width, height, maskRegions);
    }

    const scale = getViewScale(canvas);
    if (mode === 'mask') {
      for (const region of maskRegions) {
        drawMaskPreview(context, region, scale);
      }
      if (draftMaskFreehand.length > 0) {
        context.save();
        context.strokeStyle = maskPaintValue === 'white'
          ? 'rgba(255, 250, 235, 0.94)'
          : 'rgba(255, 226, 186, 0.92)';
        context.lineWidth = 2 * scale;
        context.setLineDash([8 * scale, 5 * scale]);
        drawFreehandPath(context, draftMaskFreehand, false);
        context.stroke();
        context.restore();
      }
      if (draftMaskRect) {
        context.save();
        context.strokeStyle = draftMaskRect.value === 'white'
          ? 'rgba(255, 250, 235, 0.94)'
          : 'rgba(255, 226, 186, 0.92)';
        context.lineWidth = 2 * scale;
        context.setLineDash([8 * scale, 5 * scale]);
        drawMaskRegionPath(context, draftMaskRect);
        context.stroke();
        context.restore();
      }
    }

    for (const stroke of scribbleStrokes) {
      drawScribbleStroke(context, stroke, 'rgba(0, 0, 0, 0.92)');
    }
    if (draftScribble) {
      drawScribbleStroke(context, draftScribble, 'rgba(0, 0, 0, 0.92)');
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

    if (!currentActiveObject || mode !== 'select') {
      return;
    }

    context.save();
    context.strokeStyle = 'rgba(255, 244, 220, 0.96)';
    context.lineWidth = 2 * scale;
    context.setLineDash([7 * scale, 4 * scale]);
    const corners = [
      getHandlePosition(currentActiveObject, 'nw'),
      getHandlePosition(currentActiveObject, 'ne'),
      getHandlePosition(currentActiveObject, 'se'),
      getHandlePosition(currentActiveObject, 'sw'),
    ];
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    for (const corner of corners.slice(1)) {
      context.lineTo(corner.x, corner.y);
    }
    context.closePath();
    context.stroke();
    context.setLineDash([]);

    const rotateHandle = getRotateHandlePosition(currentActiveObject);
    const topHandle = getHandlePosition(currentActiveObject, 'n');
    context.beginPath();
    context.moveTo(topHandle.x, topHandle.y);
    context.lineTo(rotateHandle.x, rotateHandle.y);
    context.stroke();

    context.fillStyle = 'rgba(255, 245, 232, 0.94)';
    context.strokeStyle = 'rgba(74, 18, 54, 0.92)';
    context.lineWidth = 1.5 * scale;
    const handleSize = 9 * scale;
    for (const handle of HANDLE_DEFS) {
      const point = getHandlePosition(currentActiveObject, handle.key);
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
  }, [
    activeObject,
    baseImageCanvas,
    baseImageVersion,
    draftMaskFreehand,
    draftMaskRect,
    draftScribble,
    featherBrushSize,
    height,
    hoverPoint,
    isMaskVisualizationEnabled,
    maskPaintValue,
    maskRegions,
    mode,
    scribbleStrokes,
    width,
  ]);

  useEffect(() => {
    redraw();
    redrawSelectionOverlay();
  }, [redraw]);

  async function addImageBlob(imageBlob: Blob) {
    setIsAddingImage(true);
    onError?.(null);
    try {
      mergeActiveObject();
      const bitmap = await createImageBitmap(imageBlob);
      const nextObject = createObjectFromBitmap(bitmap, width, height);
      try {
        bitmap.close();
      } catch {
        // Bitmap cleanup is best-effort.
      }
      replaceActiveObject(nextObject);
      setMode('select');
      setSelectionTool('move');
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setIsAddingImage(false);
    }
  }

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    if (disabled || isGenerating) {
      return;
    }

    const imageFile = Array.from(event.clipboardData.items)
      .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile()
      ?? Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'))
      ?? null;
    if (!imageFile) {
      onError?.('클립보드에 이미지가 없습니다.');
      return;
    }

    event.preventDefault();
    void addImageBlob(imageFile);
  }

  function findResizeHandle(point: Point, object: CanvasObject, hitRadius: number): ResizeHandle | null {
    for (const handle of HANDLE_DEFS) {
      const handlePoint = getHandlePosition(object, handle.key);
      if (Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y) <= hitRadius) {
        return handle.key;
      }
    }
    return null;
  }

  function finishSelection(region: SceneImageMaskRegion) {
    const imageCanvas = baseImageCanvasRef.current;
    if (!imageCanvas) {
      return;
    }
    const nextObject = createObjectFromSelection(imageCanvas, region);
    if (!nextObject) {
      return;
    }
    replaceActiveObject(nextObject);
    setSelectionTool('move');
  }

  function applyActiveObjectToMask(value: MaskPaintValue) {
    const object = activeObjectRef.current;
    if (!object) {
      return;
    }
    const nextRegion = createMaskRegionFromObject(object, value);
    setMaskRegions((current) => {
      pushMaskHistoryFrom(current);
      return [...current, nextRegion];
    });
    setIsMaskVisualizationEnabled(true);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isGenerating) {
      return;
    }

    const point = getCanvasPoint(canvas, event, width, height);
    canvas.setPointerCapture(event.pointerId);

    if (mode === 'mask') {
      mergeActiveObject();
      setIsMaskVisualizationEnabled(true);
      if (maskTool === 'rect') {
        setDraftMaskRect(getMaskRectFromPoints(point, point, maskPaintValue));
        replaceDragState({ kind: 'mask-rect', start: point, value: maskPaintValue });
      } else {
        setDraftMaskFreehand([point]);
        replaceDragState({ kind: 'mask-freehand', value: maskPaintValue });
      }
      return;
    }

    if (mode === 'scribble') {
      mergeActiveObject();
      setDraftScribble({ points: [point], brushSize: scribbleBrushSize });
      replaceDragState({ kind: 'scribble' });
      return;
    }

    if (mode === 'feather') {
      mergeActiveObject();
      const imageCanvas = baseImageCanvasRef.current;
      if (!imageCanvas) {
        return;
      }
      pushImageHistory(imageCanvas);
      applyFeatherStrokeToImage(imageCanvas, null, point, featherBrushSize);
      setBaseImageVersion((version) => version + 1);
      replaceDragState({
        kind: 'feather',
        lastPoint: point,
      });
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
      const nextRect = getMaskRectFromPoints(point, point, maskPaintValue);
      replaceDraftSelectionRect(nextRect);
      replaceDraftSelectionLasso([]);
      replaceDragState({ kind: 'select-rect', start: point });
      redrawSelectionOverlay();
    } else if (selectionTool === 'lasso') {
      replaceDraftSelectionRect(null);
      replaceDraftSelectionLasso([point]);
      replaceDragState({ kind: 'select-lasso' });
      redrawSelectionOverlay();
    } else {
      replaceDragState(null);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isGenerating) {
      return;
    }

    const point = getCanvasPoint(canvas, event, width, height);
    const currentDragState = dragStateRef.current;
    setHoverPoint(point);

    if (!currentDragState) {
      if (mode === 'select' && activeObject) {
        setHoverResizeHandle(findResizeHandle(point, activeObject, 12 * getViewScale(canvas)));
      } else {
        setHoverResizeHandle(null);
      }
      return;
    }

    if (currentDragState.kind === 'mask-freehand') {
      setDraftMaskFreehand((current) => [...current, point]);
      return;
    }

    if (currentDragState.kind === 'mask-rect') {
      setDraftMaskRect(getMaskRectFromPoints(currentDragState.start, point, currentDragState.value));
      return;
    }

    if (currentDragState.kind === 'select-rect') {
      replaceDraftSelectionRect(getMaskRectFromPoints(currentDragState.start, point, maskPaintValue));
      redrawSelectionOverlay();
      return;
    }

    if (currentDragState.kind === 'select-lasso') {
      replaceDraftSelectionLasso([...draftSelectionLassoRef.current, point]);
      redrawSelectionOverlay();
      return;
    }

    if (currentDragState.kind === 'scribble') {
      setDraftScribble((current) => (
        current ? { ...current, points: [...current.points, point] } : current
      ));
      return;
    }

    if (currentDragState.kind === 'feather') {
      const imageCanvas = baseImageCanvasRef.current;
      if (!imageCanvas) {
        return;
      }
      applyFeatherStrokeToImage(imageCanvas, currentDragState.lastPoint, point, featherBrushSize);
      setBaseImageVersion((version) => version + 1);
      replaceDragState({
        ...currentDragState,
        lastPoint: point,
      });
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

    if (currentDragState?.kind === 'mask-freehand') {
      setDraftMaskFreehand((current) => {
        const points = point ? [...current, point] : current;
        if (points.length >= MASK_FREEHAND_MIN_POINTS) {
          setMaskRegions((regions) => {
            pushMaskHistoryFrom(regions);
            return [...regions, { kind: 'freehand', points, value: currentDragState.value }];
          });
        }
        return [];
      });
    }

    if (currentDragState?.kind === 'mask-rect') {
      const nextRect = point ? getMaskRectFromPoints(currentDragState.start, point, currentDragState.value) : draftMaskRect;
      if (nextRect && nextRect.width >= MASK_RECT_MIN_SIZE && nextRect.height >= MASK_RECT_MIN_SIZE) {
        setMaskRegions((regions) => {
          pushMaskHistoryFrom(regions);
          return [...regions, nextRect];
        });
      }
      setDraftMaskRect(null);
    }

    if (currentDragState?.kind === 'select-rect') {
      const nextRect = point
        ? getMaskRectFromPoints(currentDragState.start, point, maskPaintValue)
        : draftSelectionRectRef.current;
      if (nextRect && nextRect.width >= MASK_RECT_MIN_SIZE && nextRect.height >= MASK_RECT_MIN_SIZE) {
        finishSelection(nextRect);
      }
      replaceDraftSelectionRect(null);
      clearSelectionOverlay();
    }

    if (currentDragState?.kind === 'select-lasso') {
      const points = point ? [...draftSelectionLassoRef.current, point] : draftSelectionLassoRef.current;
      if (points.length >= SELECT_LASSO_MIN_POINTS) {
        finishSelection({ kind: 'freehand', points, value: maskPaintValue });
      }
      replaceDraftSelectionLasso([]);
      clearSelectionOverlay();
    }

    if (currentDragState?.kind === 'scribble') {
      setDraftScribble((current) => {
        const stroke = current && point ? { ...current, points: [...current.points, point] } : current;
        if (stroke && stroke.points.length > 0) {
          setScribbleStrokes((strokes) => {
            pushScribbleHistoryFrom(strokes);
            return [...strokes, stroke];
          });
        }
        return null;
      });
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
    replaceBaseImageCanvas(cloneCanvas(previousCanvas));
  }

  function undoMask() {
    setMaskHistory((history) => {
      const previousRegions = history[history.length - 1];
      if (!previousRegions) {
        return history;
      }
      setMaskRegions(previousRegions.map((region) => ({ ...region })));
      setIsMaskVisualizationEnabled(true);
      return history.slice(0, -1);
    });
    setDraftMaskFreehand([]);
    setDraftMaskRect(null);
  }

  function undoScribble() {
    setScribbleHistory((history) => {
      const previousStrokes = history[history.length - 1];
      if (!previousStrokes) {
        return history;
      }
      setScribbleStrokes(previousStrokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({ ...point })),
      })));
      return history.slice(0, -1);
    });
    setDraftScribble(null);
  }

  function clearAllMaskRegions() {
    setMaskRegions((current) => {
      if (current.length > 0) {
        pushMaskHistoryFrom(current);
      }
      return [];
    });
    setDraftMaskFreehand([]);
    setDraftMaskRect(null);
    setIsMaskVisualizationEnabled(true);
  }

  function clearAllScribbles() {
    setScribbleStrokes((current) => {
      if (current.length > 0) {
        pushScribbleHistoryFrom(current);
      }
      return [];
    });
    setDraftScribble(null);
  }

  function deleteActiveObject() {
    if (!activeObjectRef.current) {
      return;
    }
    discardActiveObject();
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
      if (mode === 'mask') {
        undoMask();
      } else if (mode === 'scribble') {
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
      if (!isReady) {
        throw new Error('이미지 편집기가 아직 준비되지 않았습니다.');
      }

      const imageCanvas = renderImageCanvas(
        width,
        height,
        baseImageCanvasRef.current,
        activeObjectRef.current,
      );
      if (activeObjectRef.current) {
        if (activeObjectRef.current.dirty && baseImageCanvasRef.current) {
          pushImageHistory(baseImageCanvasRef.current);
          replaceBaseImageCanvas(cloneCanvas(imageCanvas));
        }
        replaceActiveObject(null);
      }

      const finalScribbleStrokes = draftScribble?.points.length
        ? [...scribbleStrokes, draftScribble]
        : scribbleStrokes;
      const maskCanvas = renderMaskCanvas(width, height, maskRegions);
      const scribbleCanvas = renderScribbleCanvas(width, height, finalScribbleStrokes);
      const hasScribble = finalScribbleStrokes.length > 0;
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
    draftScribble,
    height,
    isReady,
    maskRegions,
    scribbleStrokes,
    width,
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
            variant={mode === 'mask' ? 'primary' : 'default'}
            onClick={() => switchMode('mask')}
            disabled={disabled || isGenerating}
            aria-label="Mask 편집"
            title="Mask 편집"
          >
            ➰
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
        </div>
      </div>

      <div className="flex min-h-8 min-w-0 flex-wrap items-center justify-end gap-2">
        {mode === 'select' ? (
          <>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={selectionTool === 'move' ? 'primary' : 'default'}
              onClick={() => setSelectionTool('move')}
              disabled={disabled || isGenerating}
              aria-label="Object 이동"
              title="Object 이동"
            >
              ↕
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={selectionTool === 'rect' ? 'primary' : 'default'}
              onClick={() => setSelectionTool('rect')}
              disabled={disabled || isGenerating}
              aria-label="사각형 선택"
              title="사각형 선택"
            >
              ▭
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={selectionTool === 'lasso' ? 'primary' : 'default'}
              onClick={() => setSelectionTool('lasso')}
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
              onClick={() => applyActiveObjectToMask('white')}
              disabled={disabled || isGenerating || !activeObject}
              aria-label="선택 object를 white mask로 적용"
              title="선택 object를 white mask로 적용"
            >
              □
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={() => applyActiveObjectToMask('black')}
              disabled={disabled || isGenerating || !activeObject}
              aria-label="선택 object를 black mask로 적용"
              title="선택 object를 black mask로 적용"
            >
              ■
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
              onClick={deleteActiveObject}
              disabled={disabled || isGenerating || !activeObject}
              aria-label="선택 object 삭제"
              title="선택 object 삭제"
            >
              ⌫
            </Button>
          </>
        ) : null}

        {mode === 'mask' ? (
          <>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={maskPaintValue === 'white' ? 'primary' : 'default'}
              onClick={() => setMaskPaintValue('white')}
              disabled={disabled || isGenerating}
              aria-label="White mask 생성 허용"
              title="White mask 생성 허용"
            >
              □
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={maskPaintValue === 'black' ? 'primary' : 'default'}
              onClick={() => setMaskPaintValue('black')}
              disabled={disabled || isGenerating}
              aria-label="Black mask 생성 금지"
              title="Black mask 생성 금지"
            >
              ■
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={maskTool === 'freehand' ? 'primary' : 'default'}
              onClick={() => setMaskTool('freehand')}
              disabled={disabled || isGenerating}
              aria-label="Freehand mask"
              title="Freehand mask"
            >
              〰
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={maskTool === 'rect' ? 'primary' : 'default'}
              onClick={() => setMaskTool('rect')}
              disabled={disabled || isGenerating}
              aria-label="Rectangle mask"
              title="Rectangle mask"
            >
              ▭
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
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={undoMask}
              disabled={disabled || isGenerating || maskHistory.length === 0}
              aria-label="Mask undo"
              title="Mask undo"
            >
              ↩
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={clearAllMaskRegions}
              disabled={
                disabled
                || isGenerating
                || (maskRegions.length === 0 && draftMaskFreehand.length === 0 && !draftMaskRect)
              }
              aria-label="Mask 모두 지우기"
              title="Mask 모두 지우기"
            >
              🧹
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
                max="96"
                step="1"
                value={scribbleBrushSize}
                onChange={(event) => setScribbleBrushSize(Number(event.target.value))}
                disabled={disabled || isGenerating}
                className="w-20 accent-[#ffe2ba]"
              />
              <span className="w-9 text-right">{scribbleBrushSize}px</span>
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
              disabled={disabled || isGenerating || scribbleHistory.length === 0}
              aria-label="Scribble undo"
              title="Scribble undo"
            >
              ↩
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={clearAllScribbles}
              disabled={disabled || isGenerating || (scribbleStrokes.length === 0 && !draftScribble)}
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
        <canvas
          ref={selectionOverlayRef}
          width={width}
          height={height}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
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
