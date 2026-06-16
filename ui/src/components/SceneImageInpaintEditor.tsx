import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
type MaskTool = 'freehand' | 'rect';

type CanvasObject = {
  id: string;
  bitmap: ImageBitmap;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  flipX: boolean;
  editCanvas?: HTMLCanvasElement;
};

type CanvasObjectSnapshot = Pick<CanvasObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

export type SceneImageMaskRegion =
  | {
    kind: 'freehand';
    points: Point[];
  }
  | {
    kind: 'rect';
    x: number;
    y: number;
    width: number;
    height: number;
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
    objectId: string;
    start: Point;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'resize';
    objectId: string;
    handle: ResizeHandle;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'rotate';
    objectId: string;
    startAngle: number;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'mask-freehand';
  }
  | {
    kind: 'mask-rect';
    start: Point;
  }
  | {
    kind: 'feather';
    objectId: string;
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
const MIN_OBJECT_SIZE = 24;
const ROTATE_HANDLE_OFFSET = 42;
const MASK_FREEHAND_MIN_POINTS = 3;
const MASK_RECT_MIN_SIZE = 3;
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
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2dContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas를 사용할 수 없습니다.');
  }
  return context;
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

function closeObjects(objects: CanvasObject[]) {
  for (const object of objects) {
    try {
      object.bitmap.close();
    } catch {
      // ImageBitmap.close() is best-effort cleanup; repeated closes are harmless to ignore.
    }
  }
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
  const rotated = rotatePoint(
    {
      x: point.x - object.x,
      y: point.y - object.y,
    },
    -object.rotation,
  );
  return rotated;
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

function createEditableObjectCanvas(bitmap: ImageBitmap) {
  const canvas = createRenderCanvas(bitmap.width, bitmap.height);
  const context = get2dContext(canvas);
  context.drawImage(bitmap, 0, 0);
  return canvas;
}

function getObjectBitmapPoint(point: Point, object: CanvasObject): Point | null {
  if (!isPointInObject(point, object)) {
    return null;
  }

  const localPoint = toObjectLocal(point, object);
  const normalizedX = object.flipX
    ? object.width / 2 - localPoint.x
    : localPoint.x + object.width / 2;
  return {
    x: (normalizedX / object.width) * object.bitmap.width,
    y: ((localPoint.y + object.height / 2) / object.height) * object.bitmap.height,
  };
}

function shuffleAdjacentObjectPixels(canvas: HTMLCanvasElement, point: Point, radius: number) {
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

function applyFeatherPointToObject(object: CanvasObject, point: Point, brushSize: number) {
  const bitmapPoint = getObjectBitmapPoint(point, object);
  if (!bitmapPoint) {
    return object;
  }

  const editCanvas = object.editCanvas ?? createEditableObjectCanvas(object.bitmap);
  const averageScale = (object.bitmap.width / object.width + object.bitmap.height / object.height) / 2;
  shuffleAdjacentObjectPixels(editCanvas, bitmapPoint, Math.max(1, (brushSize / 2) * averageScale));
  return { ...object, editCanvas };
}

function applyFeatherStrokeToObject(
  object: CanvasObject,
  startPoint: Point | null,
  endPoint: Point,
  brushSize: number,
) {
  const distance = startPoint ? Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) : 0;
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, brushSize / 4)));
  let nextObject = object;

  for (let step = 0; step <= steps; step += 1) {
    const progress = steps === 0 ? 1 : step / steps;
    const point = startPoint
      ? {
        x: startPoint.x + (endPoint.x - startPoint.x) * progress,
        y: startPoint.y + (endPoint.y - startPoint.y) * progress,
      }
      : endPoint;
    nextObject = applyFeatherPointToObject(nextObject, point, brushSize);
  }

  return nextObject;
}

function drawObject(context: CanvasRenderingContext2D, object: CanvasObject) {
  context.save();
  context.translate(object.x, object.y);
  context.rotate(object.rotation);
  if (object.flipX) {
    context.scale(-1, 1);
  }

  context.drawImage(
    object.editCanvas ?? object.bitmap,
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

function getMaskRectFromPoints(start: Point, end: Point): SceneImageMaskRectRegion {
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

function drawMaskRegion(
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

function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  objects: CanvasObject[],
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  for (const object of objects) {
    drawObject(context, object);
  }
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

function fitObjectSize(bitmap: ImageBitmap, width: number, height: number) {
  const scale = Math.min(1, width / bitmap.width, height / bitmap.height);
  return {
    width: Math.max(1, Math.round(bitmap.width * scale)),
    height: Math.max(1, Math.round(bitmap.height * scale)),
  };
}

function renderCompositeCanvas(width: number, height: number, objects: CanvasObject[]) {
  const canvas = createRenderCanvas(width, height);
  drawScene(get2dContext(canvas), width, height, objects);
  return canvas;
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
  maskContext.fillStyle = '#000000';

  for (const region of maskRegions) {
    drawMaskRegion(maskContext, region);
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
  const objectsRef = useRef<CanvasObject[]>([]);
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [maskRegions, setMaskRegions] = useState<SceneImageMaskRegion[]>(
    () => initialEditorState?.maskRegions ?? [],
  );
  const [draftMaskFreehand, setDraftMaskFreehand] = useState<Point[]>([]);
  const [draftMaskRect, setDraftMaskRect] = useState<SceneImageMaskRectRegion | null>(null);
  const [scribbleStrokes, setScribbleStrokes] = useState<SceneImageScribbleStroke[]>(
    () => initialEditorState?.scribbleStrokes ?? [],
  );
  const [draftScribble, setDraftScribble] = useState<SceneImageScribbleStroke | null>(null);
  const [mode, setMode] = useState<EditorMode>('select');
  const [maskTool, setMaskTool] = useState<MaskTool>('freehand');
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

  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) ?? null,
    [objects, selectedObjectId],
  );
  const isWorking = isLoadingSource || isAddingImage;
  const isReady = !isWorking && width > 0 && height > 0;
  const canvasCursor = mode === 'feather'
    ? 'none'
    : mode === 'mask' || mode === 'scribble'
      ? 'crosshair'
      : dragState?.kind === 'resize'
        ? getResizeCursor(dragState.handle)
        : dragState?.kind === 'rotate'
          ? 'grabbing'
          : dragState?.kind === 'move'
            ? 'move'
            : hoverResizeHandle
              ? getResizeCursor(hoverResizeHandle)
              : selectedObjectId
                ? 'move'
                : 'default';

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  useEffect(() => () => {
    closeObjects(objectsRef.current);
  }, []);

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  useEffect(() => {
    if (!initialEditorState) {
      return;
    }
    setMaskRegions(initialEditorState.maskRegions);
    setScribbleStrokes(initialEditorState.scribbleStrokes);
    setDraftMaskFreehand([]);
    setDraftMaskRect(null);
    setDraftScribble(null);
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

  useEffect(() => {
    let isCancelled = false;

    async function loadSourceImage() {
      setIsLoadingSource(true);
      setSelectedObjectId(null);
      setDraftMaskFreehand([]);
      setDraftMaskRect(null);
      setDraftScribble(null);
      setDragState(null);
      onError?.(null);

      try {
        if (!sourceImageUrl) {
          setObjects((current) => {
            closeObjects(current);
            return [];
          });
          return;
        }

        const bitmap = await createBitmapFromUrl(sourceImageUrl);
        if (isCancelled) {
          try {
            bitmap.close();
          } catch {
            return;
          }
          return;
        }

        const nextObject: CanvasObject = {
          id: createObjectId(),
          bitmap,
          x: width / 2,
          y: height / 2,
          width,
          height,
          rotation: 0,
          label: 'existing',
          flipX: false,
        };
        setObjects((current) => {
          closeObjects(current);
          return [nextObject];
        });
        setSelectedObjectId(nextObject.id);
      } catch (error) {
        if (!isCancelled) {
          setObjects((current) => {
            closeObjects(current);
            return [];
          });
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

    const context = get2dContext(canvas);
    drawScene(context, width, height, objects);

    context.save();
    context.fillStyle = 'rgba(0, 0, 0, 0.26)';
    context.strokeStyle = 'rgba(255, 226, 186, 0.92)';
    context.lineWidth = 2 * getViewScale(canvas);
    for (const region of maskRegions) {
      drawMaskRegion(context, region);
      context.fill();
      context.stroke();
    }
    if (draftMaskFreehand.length > 0) {
      context.setLineDash([8 * getViewScale(canvas), 5 * getViewScale(canvas)]);
      drawFreehandPath(context, draftMaskFreehand, false);
      context.stroke();
    }
    if (draftMaskRect) {
      context.setLineDash([8 * getViewScale(canvas), 5 * getViewScale(canvas)]);
      drawMaskRegion(context, draftMaskRect);
      context.stroke();
    }
    context.restore();

    context.save();
    for (const stroke of scribbleStrokes) {
      drawScribbleStroke(context, stroke, 'rgba(0, 0, 0, 0.92)');
    }
    if (draftScribble) {
      drawScribbleStroke(context, draftScribble, 'rgba(0, 0, 0, 0.92)');
    }
    context.restore();

    if (mode === 'feather' && hoverPoint) {
      const scale = getViewScale(canvas);
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

    if (!selectedObject || (mode !== 'select' && mode !== 'feather')) {
      return;
    }

    const scale = getViewScale(canvas);
    context.save();
    context.strokeStyle = 'rgba(255, 244, 220, 0.96)';
    context.lineWidth = 2 * scale;
    context.setLineDash([7 * scale, 4 * scale]);
    const corners = [
      getHandlePosition(selectedObject, 'nw'),
      getHandlePosition(selectedObject, 'ne'),
      getHandlePosition(selectedObject, 'se'),
      getHandlePosition(selectedObject, 'sw'),
    ];
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    for (const corner of corners.slice(1)) {
      context.lineTo(corner.x, corner.y);
    }
    context.closePath();
    context.stroke();
    context.setLineDash([]);

    if (mode === 'feather') {
      context.restore();
      return;
    }

    const rotateHandle = getRotateHandlePosition(selectedObject);
    const topHandle = getHandlePosition(selectedObject, 'n');
    context.beginPath();
    context.moveTo(topHandle.x, topHandle.y);
    context.lineTo(rotateHandle.x, rotateHandle.y);
    context.stroke();

    context.fillStyle = 'rgba(255, 245, 232, 0.94)';
    context.strokeStyle = 'rgba(74, 18, 54, 0.92)';
    context.lineWidth = 1.5 * scale;
    const handleSize = 9 * scale;
    for (const handle of HANDLE_DEFS) {
      const point = getHandlePosition(selectedObject, handle.key);
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
    draftMaskFreehand,
    draftMaskRect,
    draftScribble,
    featherBrushSize,
    height,
    hoverPoint,
    maskRegions,
    mode,
    objects,
    scribbleStrokes,
    selectedObject,
    width,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const addImageBlob = useCallback(async (imageBlob: Blob) => {
    setIsAddingImage(true);
    onError?.(null);
    try {
      const bitmap = await createImageBitmap(imageBlob);
      const fittedSize = fitObjectSize(bitmap, width, height);
      const nextObject: CanvasObject = {
        id: createObjectId(),
        bitmap,
        x: width / 2,
        y: height / 2,
        width: fittedSize.width,
        height: fittedSize.height,
        rotation: 0,
        label: 'clipboard',
        flipX: false,
      };
      setObjects((current) => [...current, nextObject]);
      setSelectedObjectId(nextObject.id);
      setMode('select');
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setIsAddingImage(false);
    }
  }, [height, onError, width]);

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

  function findObjectAt(point: Point) {
    for (let index = objects.length - 1; index >= 0; index -= 1) {
      const object = objects[index];
      if (isPointInObject(point, object)) {
        return object;
      }
    }
    return null;
  }

  function updateObject(objectId: string, updateObjectValue: (object: CanvasObject) => CanvasObject) {
    setObjects((current) =>
      current.map((object) => (object.id === objectId ? updateObjectValue(object) : object)),
    );
  }

  function applyFeatherStroke(
    objectId: string,
    startPoint: Point | null,
    endPoint: Point,
  ) {
    setObjects((current) =>
      current.map((object) => (
        object.id === objectId
          ? applyFeatherStrokeToObject(object, startPoint, endPoint, featherBrushSize)
          : object
      )),
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isGenerating) {
      return;
    }

    const point = getCanvasPoint(canvas, event, width, height);
    canvas.setPointerCapture(event.pointerId);

    if (mode === 'mask') {
      setSelectedObjectId(null);
      if (maskTool === 'rect') {
        setDraftMaskRect(getMaskRectFromPoints(point, point));
        setDragState({ kind: 'mask-rect', start: point });
      } else {
        setDraftMaskFreehand([point]);
        setDragState({ kind: 'mask-freehand' });
      }
      return;
    }

    if (mode === 'scribble') {
      setSelectedObjectId(null);
      setDraftScribble({ points: [point], brushSize: scribbleBrushSize });
      setDragState({ kind: 'scribble' });
      return;
    }

    if (mode === 'feather') {
      const targetObject = selectedObject && isPointInObject(point, selectedObject)
        ? selectedObject
        : findObjectAt(point);
      if (targetObject) {
        setSelectedObjectId(targetObject.id);
        applyFeatherStroke(targetObject.id, null, point);
        setDragState({
          kind: 'feather',
          objectId: targetObject.id,
          lastPoint: point,
        });
      } else {
        setDragState(null);
      }
      return;
    }

    if (selectedObject) {
      const scale = getViewScale(canvas);
      const rotatePointValue = getRotateHandlePosition(selectedObject);
      if (Math.hypot(point.x - rotatePointValue.x, point.y - rotatePointValue.y) <= 12 * scale) {
        setDragState({
          kind: 'rotate',
          objectId: selectedObject.id,
          startAngle: Math.atan2(point.y - selectedObject.y, point.x - selectedObject.x),
          original: objectSnapshot(selectedObject),
        });
        return;
      }

      const resizeHandle = findResizeHandle(point, selectedObject, 12 * scale);
      if (resizeHandle) {
        setDragState({
          kind: 'resize',
          objectId: selectedObject.id,
          handle: resizeHandle,
          original: objectSnapshot(selectedObject),
        });
        return;
      }
    }

    const object = findObjectAt(point);
    if (object) {
      setSelectedObjectId(object.id);
      setDragState({
        kind: 'move',
        objectId: object.id,
        start: point,
        original: objectSnapshot(object),
      });
    } else {
      setSelectedObjectId(null);
      setDragState(null);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isGenerating) {
      return;
    }

    const point = getCanvasPoint(canvas, event, width, height);
    setHoverPoint(point);

    if (!dragState) {
      if (mode === 'select' && selectedObject) {
        setHoverResizeHandle(findResizeHandle(point, selectedObject, 12 * getViewScale(canvas)));
      } else {
        setHoverResizeHandle(null);
      }
      return;
    }

    if (dragState.kind === 'mask-freehand') {
      setDraftMaskFreehand((current) => [...current, point]);
      return;
    }

    if (dragState.kind === 'mask-rect') {
      setDraftMaskRect(getMaskRectFromPoints(dragState.start, point));
      return;
    }

    if (dragState.kind === 'scribble') {
      setDraftScribble((current) => (
        current ? { ...current, points: [...current.points, point] } : current
      ));
      return;
    }

    if (dragState.kind === 'feather') {
      applyFeatherStroke(dragState.objectId, dragState.lastPoint, point);
      setDragState({
        ...dragState,
        lastPoint: point,
      });
      return;
    }

    if (dragState.kind === 'move') {
      updateObject(dragState.objectId, (object) => ({
        ...object,
        x: dragState.original.x + point.x - dragState.start.x,
        y: dragState.original.y + point.y - dragState.start.y,
      }));
      return;
    }

    if (dragState.kind === 'rotate') {
      const angle = Math.atan2(point.y - dragState.original.y, point.x - dragState.original.x);
      updateObject(dragState.objectId, (object) => ({
        ...object,
        rotation: dragState.original.rotation + angle - dragState.startAngle,
      }));
      return;
    }

    const localPoint = toObjectLocal(point, dragState.original);
    updateObject(dragState.objectId, (object) => {
      let nextWidth = dragState.original.width;
      let nextHeight = dragState.original.height;
      if (dragState.handle.includes('e') || dragState.handle.includes('w')) {
        nextWidth = Math.max(MIN_OBJECT_SIZE, Math.abs(localPoint.x) * 2);
      }
      if (dragState.handle.includes('n') || dragState.handle.includes('s')) {
        nextHeight = Math.max(MIN_OBJECT_SIZE, Math.abs(localPoint.y) * 2);
      }
      if (dragState.handle.length === 2) {
        const scale = Math.max(
          nextWidth / dragState.original.width,
          nextHeight / dragState.original.height,
        );
        nextWidth = Math.max(MIN_OBJECT_SIZE, dragState.original.width * scale);
        nextHeight = Math.max(MIN_OBJECT_SIZE, dragState.original.height * scale);
      }
      return {
        ...object,
        width: nextWidth,
        height: nextHeight,
      };
    });
  }

  function handlePointerLeave() {
    if (dragState) {
      return;
    }

    setHoverPoint(null);
    setHoverResizeHandle(null);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (dragState?.kind === 'mask-freehand') {
      setDraftMaskFreehand((current) => {
        if (current.length >= MASK_FREEHAND_MIN_POINTS) {
          setMaskRegions((regions) => [...regions, { kind: 'freehand', points: current }]);
        }
        return [];
      });
    }
    if (dragState?.kind === 'mask-rect') {
      setDraftMaskRect((current) => {
        if (current && current.width >= MASK_RECT_MIN_SIZE && current.height >= MASK_RECT_MIN_SIZE) {
          setMaskRegions((regions) => [...regions, current]);
        }
        return null;
      });
    }
    if (dragState?.kind === 'scribble') {
      setDraftScribble((current) => {
        if (current && current.points.length > 0) {
          setScribbleStrokes((strokes) => [...strokes, current]);
        }
        return null;
      });
    }
    setDragState(null);
    setHoverResizeHandle(null);
  }

  function deleteSelectedObject() {
    if (!selectedObjectId) {
      return;
    }

    setObjects((current) => {
      const removedObject = current.find((object) => object.id === selectedObjectId);
      if (removedObject) {
        closeObjects([removedObject]);
      }
      return current.filter((object) => object.id !== selectedObjectId);
    });
    setSelectedObjectId(null);
  }

  function resetSelectedObjectFeather() {
    if (!selectedObjectId) {
      return;
    }

    updateObject(selectedObjectId, (object) => {
      if (!object.editCanvas) {
        return object;
      }
      const nextObject = { ...object };
      delete nextObject.editCanvas;
      return nextObject;
    });
  }

  function flipSelectedObjectX() {
    if (!selectedObjectId) {
      return;
    }

    updateObject(selectedObjectId, (object) => ({
      ...object,
      flipX: !object.flipX,
    }));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (disabled || isGenerating || event.key !== 'Delete' || !selectedObjectId) {
      return;
    }

    event.preventDefault();
    deleteSelectedObject();
  }

  function clearLastMaskRegion() {
    setMaskRegions((current) => current.slice(0, -1));
  }

  function clearAllMaskRegions() {
    setMaskRegions([]);
    setDraftMaskFreehand([]);
    setDraftMaskRect(null);
  }

  function undoLastScribble() {
    setScribbleStrokes((current) => current.slice(0, -1));
    setDraftScribble(null);
  }

  function clearAllScribbles() {
    setScribbleStrokes([]);
    setDraftScribble(null);
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

      const finalScribbleStrokes = draftScribble?.points.length
        ? [...scribbleStrokes, draftScribble]
        : scribbleStrokes;
      const imageCanvas = renderCompositeCanvas(width, height, objectsRef.current);
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
            onClick={() => setMode('select')}
            disabled={disabled || isGenerating}
            aria-label="선택 및 이동"
            title="선택 및 이동"
          >
            ✋
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'mask' ? 'primary' : 'default'}
            onClick={() => setMode('mask')}
            disabled={disabled || isGenerating}
            aria-label="Mask 보존 영역"
            title="Mask 보존 영역"
          >
            ➰
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'feather' ? 'primary' : 'default'}
            onClick={() => setMode('feather')}
            disabled={disabled || isGenerating}
            aria-label="Feather 브러시"
            title="Feather 브러시"
          >
            🖌️
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'scribble' ? 'primary' : 'default'}
            onClick={() => setMode('scribble')}
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
          <Button
            className={TOOL_BUTTON_CLASS}
            onClick={flipSelectedObjectX}
            disabled={disabled || isGenerating || !selectedObject}
            aria-label="선택 object 좌우반전"
            title="선택 object 좌우반전"
          >
            ↔️
          </Button>
        ) : null}

        {mode === 'mask' ? (
          <>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={maskTool === 'freehand' ? 'primary' : 'default'}
              onClick={() => setMaskTool('freehand')}
              disabled={disabled || isGenerating}
              aria-label="Freehand mask"
              title="Freehand mask"
            >
              〰️
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
              onClick={clearLastMaskRegion}
              disabled={disabled || isGenerating || maskRegions.length === 0}
              aria-label="마지막 mask 취소"
              title="마지막 mask 취소"
            >
              ↩️
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
              onClick={resetSelectedObjectFeather}
              disabled={disabled || isGenerating || !selectedObject?.editCanvas}
              aria-label="Feather 편집 초기화"
              title="Feather 편집 초기화"
            >
              🔄
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
              onClick={undoLastScribble}
              disabled={disabled || isGenerating || scribbleStrokes.length === 0}
              aria-label="마지막 scribble 취소"
              title="마지막 scribble 취소"
            >
              ↩️
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
