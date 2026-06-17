import {
  MAX_POSE_ZOOM,
  MIN_OBJECT_SIZE,
  MIN_POSE_ZOOM,
  MIN_SELECTION_SIZE,
  ROTATE_HANDLE_OFFSET,
} from './constants';
import {
  cloneCanvas,
  copyCanvasRegion,
  createCanvas,
  createFilledCanvas,
  getContainedRect,
  drawContainedCanvas,
  get2dContext,
} from './canvas';
import type {
  BaseImageLayer,
  ImageLayerSnapshot,
  ImageObject,
  Point,
  PoseLayer,
  Rect,
  ResizeHandle,
} from './types';

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

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function createObjectId() {
  return `image-object-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function cloneImageObject(object: ImageObject): ImageObject {
  return {
    ...object,
    canvas: cloneCanvas(object.canvas),
  };
}

export function cloneBaseImage(baseImage: BaseImageLayer | null): BaseImageLayer | null {
  return baseImage
    ? {
      ...baseImage,
      canvas: cloneCanvas(baseImage.canvas),
    }
    : null;
}

export function cloneImageSnapshot(snapshot: ImageLayerSnapshot): ImageLayerSnapshot {
  return {
    baseImage: cloneBaseImage(snapshot.baseImage),
    objects: snapshot.objects.map(cloneImageObject),
    activeObjectId: snapshot.activeObjectId,
  };
}

export function createImageSnapshot(
  baseImage: BaseImageLayer | null,
  objects: ImageObject[],
  activeObjectId: string | null,
): ImageLayerSnapshot {
  return cloneImageSnapshot({ baseImage, objects, activeObjectId });
}

export function createObjectFromCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  x = width / 2,
  y = height / 2,
): ImageObject {
  const scale = Math.min(1, width / canvas.width, height / canvas.height);
  return {
    id: createObjectId(),
    canvas,
    x,
    y,
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
    rotation: 0,
    flipX: false,
  };
}

export function drawImageObject(context: CanvasRenderingContext2D, object: ImageObject) {
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

export function renderImageLayer(
  width: number,
  height: number,
  baseImage: BaseImageLayer | null,
  objects: ImageObject[],
) {
  const canvas = createFilledCanvas(width, height, '#ffffff');
  const context = get2dContext(canvas);
  if (baseImage) {
    drawContainedCanvas(context, baseImage.canvas, width, height);
  }
  for (const object of objects) {
    drawImageObject(context, object);
  }
  return canvas;
}

export function renderBaseOnlyMask(width: number, height: number, baseImage: BaseImageLayer | null) {
  const canvas = createFilledCanvas(width, height, '#ffffff');
  if (!baseImage) {
    return canvas;
  }
  const baseRect = getContainedRect(baseImage.canvas.width, baseImage.canvas.height, width, height);
  const context = get2dContext(canvas);
  context.fillStyle = '#000000';
  context.fillRect(baseRect.x, baseRect.y, baseRect.width-5, baseRect.height-5);
  return canvas;
}

export function drawMaskOverlay(
  context: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement | null,
  opacity: number,
  color = [255, 230, 64],
) {
  if (!maskCanvas) {
    return;
  }
  const sampleContext = get2dContext(maskCanvas);
  const sampleData = sampleContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  const overlayCanvas = createCanvas(maskCanvas.width, maskCanvas.height);
  const overlayContext = get2dContext(overlayCanvas);
  const overlayData = overlayContext.createImageData(maskCanvas.width, maskCanvas.height);
  for (let index = 0; index < sampleData.data.length; index += 4) {
    const brightness = (sampleData.data[index] + sampleData.data[index + 1] + sampleData.data[index + 2]) / 3;
    overlayData.data[index] = color[0];
    overlayData.data[index + 1] = color[1];
    overlayData.data[index + 2] = color[2];
    overlayData.data[index + 3] = Math.round((brightness / 255) * 255 * opacity);
  }
  overlayContext.putImageData(overlayData, 0, 0);
  context.drawImage(overlayCanvas, 0, 0);
}

export function drawScribbleOverlay(
  context: CanvasRenderingContext2D,
  scribbleCanvas: HTMLCanvasElement | null,
  opacity: number,
) {
  if (!scribbleCanvas) {
    return;
  }
  context.save();
  context.globalAlpha = opacity;
  context.globalCompositeOperation = 'multiply';
  context.drawImage(scribbleCanvas, 0, 0);
  context.restore();
}

export function fillCanvas(canvas: HTMLCanvasElement, color: string) {
  const context = get2dContext(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

export function fillRect(canvas: HTMLCanvasElement, rect: Rect, color: string) {
  const context = get2dContext(canvas);
  context.fillStyle = color;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
}

export function drawRoundStroke(
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
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = brushSize;
  if (startPoint) {
    context.beginPath();
    context.moveTo(startPoint.x, startPoint.y);
    context.lineTo(endPoint.x, endPoint.y);
    context.stroke();
  } else {
    context.beginPath();
    context.arc(endPoint.x, endPoint.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function getRectFromPoints(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function normalizeRect(rect: Rect) {
  return getRectFromPoints(
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  );
}

export function createObjectFromSelection(sourceCanvas: HTMLCanvasElement, rect: Rect) {
  const normalizedRect = normalizeRect(rect);
  if (normalizedRect.width < MIN_SELECTION_SIZE || normalizedRect.height < MIN_SELECTION_SIZE) {
    return null;
  }
  const canvas = copyCanvasRegion(sourceCanvas, normalizedRect);
  if (!canvas) {
    return null;
  }
  return createObjectFromCanvas(
    canvas,
    sourceCanvas.width,
    sourceCanvas.height,
    normalizedRect.x + normalizedRect.width / 2,
    normalizedRect.y + normalizedRect.height / 2,
  );
}

export function createFeatherObject(
  sourceCanvas: HTMLCanvasElement,
  points: Point[],
  brushSize: number,
) {
  if (points.length === 0) {
    return null;
  }
  const bounds = points.reduce(
    (current, point) => ({
      left: Math.min(current.left, point.x - brushSize),
      top: Math.min(current.top, point.y - brushSize),
      right: Math.max(current.right, point.x + brushSize),
      bottom: Math.max(current.bottom, point.y + brushSize),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
  const rect = normalizeRect({
    x: clamp(bounds.left, 0, sourceCanvas.width),
    y: clamp(bounds.top, 0, sourceCanvas.height),
    width: clamp(bounds.right, 0, sourceCanvas.width) - clamp(bounds.left, 0, sourceCanvas.width),
    height: clamp(bounds.bottom, 0, sourceCanvas.height) - clamp(bounds.top, 0, sourceCanvas.height),
  });
  if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
    return null;
  }

  const blurredCanvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const blurredContext = get2dContext(blurredCanvas);
  blurredContext.filter = `blur(${Math.max(1, Math.round(brushSize / 6))}px)`;
  blurredContext.drawImage(sourceCanvas, 0, 0);

  const patchCanvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const patchContext = get2dContext(patchCanvas);
  patchContext.save();
  patchContext.beginPath();
  patchContext.lineCap = 'round';
  patchContext.lineJoin = 'round';
  patchContext.lineWidth = brushSize;
  patchContext.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    patchContext.lineTo(point.x, point.y);
  }
  if (points.length === 1) {
    patchContext.arc(points[0].x, points[0].y, brushSize / 2, 0, Math.PI * 2);
  }
  patchContext.stroke();
  patchContext.clip();
  patchContext.drawImage(blurredCanvas, 0, 0);
  patchContext.restore();

  const croppedCanvas = copyCanvasRegion(patchCanvas, rect);
  if (!croppedCanvas) {
    return null;
  }
  return createObjectFromCanvas(
    croppedCanvas,
    sourceCanvas.width,
    sourceCanvas.height,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
  );
}

function rotatePoint(point: Point, rotation: number): Point {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function objectLocalPoint(point: Point, object: Pick<ImageObject, 'x' | 'y' | 'rotation'>) {
  return rotatePoint({ x: point.x - object.x, y: point.y - object.y }, -object.rotation);
}

export function canvasPointFromObject(object: Pick<ImageObject, 'x' | 'y' | 'rotation'>, localX: number, localY: number) {
  const point = rotatePoint({ x: localX, y: localY }, object.rotation);
  return { x: object.x + point.x, y: object.y + point.y };
}

export function isPointInObject(point: Point, object: ImageObject) {
  const local = objectLocalPoint(point, object);
  return Math.abs(local.x) <= object.width / 2 && Math.abs(local.y) <= object.height / 2;
}

export function getHandlePosition(object: ImageObject, handle: ResizeHandle) {
  const definition = HANDLE_DEFS.find((item) => item.key === handle);
  if (!definition) {
    return { x: object.x, y: object.y };
  }
  return canvasPointFromObject(object, object.width * definition.x, object.height * definition.y);
}

export function getRotateHandlePosition(object: ImageObject) {
  return canvasPointFromObject(object, 0, -object.height / 2 - ROTATE_HANDLE_OFFSET);
}

export function getResizeCursor(handle: ResizeHandle) {
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

export function findResizeHandle(point: Point, object: ImageObject, threshold: number) {
  for (const definition of HANDLE_DEFS) {
    const handlePoint = getHandlePosition(object, definition.key);
    if (Math.abs(point.x - handlePoint.x) <= threshold && Math.abs(point.y - handlePoint.y) <= threshold) {
      return definition.key;
    }
  }
  return null;
}

export function drawObjectHandles(context: CanvasRenderingContext2D, object: ImageObject, scale: number) {
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
  for (const definition of HANDLE_DEFS) {
    const point = getHandlePosition(object, definition.key);
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

export function getCanvasObjectFitRect(canvas: HTMLCanvasElement, width: number, height: number) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / width, rect.height / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;
  return {
    left: rect.left + (rect.width - fittedWidth) / 2,
    top: rect.top + (rect.height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

export function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: { clientX: number; clientY: number },
  width: number,
  height: number,
): Point {
  const rect = getCanvasObjectFitRect(canvas, width, height);
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * width, 0, width),
    y: clamp(((event.clientY - rect.top) / rect.height) * height, 0, height),
  };
}

export function getViewScale(canvas: HTMLCanvasElement, width: number, height: number) {
  const rect = getCanvasObjectFitRect(canvas, width, height);
  return rect.width > 0 ? width / rect.width : 1;
}

export function getCoverDrawSize(canvas: HTMLCanvasElement, width: number, height: number, zoom: number) {
  const scale = Math.max(width / canvas.width, height / canvas.height) * zoom;
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}

export function getCenteredCoverOffset(canvas: HTMLCanvasElement, width: number, height: number, zoom = 1): Point {
  const size = getCoverDrawSize(canvas, width, height, zoom);
  return {
    x: Math.round((width - size.width) / 2),
    y: Math.round((height - size.height) / 2),
  };
}

function clampCoverAxisOffset(offset: number, drawLength: number, canvasLength: number) {
  if (drawLength <= canvasLength) {
    return clamp(offset, 0, canvasLength - drawLength);
  }
  return clamp(offset, canvasLength - drawLength, 0);
}

export function clampCoverOffset(offset: Point, canvas: HTMLCanvasElement, width: number, height: number, zoom: number) {
  const size = getCoverDrawSize(canvas, width, height, zoom);
  return {
    x: clampCoverAxisOffset(offset.x, size.width, width),
    y: clampCoverAxisOffset(offset.y, size.height, height),
  };
}

export function renderPoseCanvas(pose: PoseLayer, width: number, height: number) {
  if (!pose.canvas) {
    return null;
  }
  const canvas = createFilledCanvas(width, height, '#000000');
  const context = get2dContext(canvas);
  const size = getCoverDrawSize(pose.canvas, width, height, pose.zoom);
  context.drawImage(pose.canvas, pose.offset.x, pose.offset.y, size.width, size.height);
  return canvas;
}

export function replacePoseCanvas(pose: PoseLayer, canvas: HTMLCanvasElement | null, blob: Blob | null, sourceUrl: string | null, width: number, height: number) {
  const zoom = 1;
  const offset = canvas ? getCenteredCoverOffset(canvas, width, height, zoom) : { x: 0, y: 0 };
  return {
    ...pose,
    sourceUrl,
    blob,
    canvas,
    offset,
    zoom,
    modified: false,
  };
}

export function updatePoseZoom(pose: PoseLayer, point: Point, deltaY: number, width: number, height: number) {
  if (!pose.canvas) {
    return pose;
  }
  const nextZoom = clamp(pose.zoom * Math.exp(-deltaY * 0.001), MIN_POSE_ZOOM, MAX_POSE_ZOOM);
  const currentSize = getCoverDrawSize(pose.canvas, width, height, pose.zoom);
  const nextSize = getCoverDrawSize(pose.canvas, width, height, nextZoom);
  const sourceX = (point.x - pose.offset.x) / currentSize.width;
  const sourceY = (point.y - pose.offset.y) / currentSize.height;
  return {
    ...pose,
    zoom: nextZoom,
    offset: clampCoverOffset(
      {
        x: point.x - sourceX * nextSize.width,
        y: point.y - sourceY * nextSize.height,
      },
      pose.canvas,
      width,
      height,
      nextZoom,
    ),
    modified: true,
  };
}

export function resizeImageObjects(objects: ImageObject[], scaleX: number, scaleY: number) {
  const scale = Math.min(scaleX, scaleY);
  return objects.map((object) => ({
    ...object,
    x: object.x * scaleX,
    y: object.y * scaleY,
    width: Math.max(MIN_OBJECT_SIZE, object.width * scale),
    height: Math.max(MIN_OBJECT_SIZE, object.height * scale),
  }));
}
