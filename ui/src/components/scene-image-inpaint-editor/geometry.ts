import { HANDLE_DEFS, ROTATE_HANDLE_OFFSET } from './constants';
import { createFilledCanvas, get2dContext } from './canvas';
import type { CanvasObject, CanvasObjectSnapshot, Point, ResizeHandle } from './types';

export function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function coerceNullableNumber(
  value: number | null | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  return Number.isFinite(value) ? clampNumber(Number(value), min, max) : fallback;
}

export function rotatePoint(point: Point, rotation: number): Point {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function toObjectLocal(point: Point, object: CanvasObject | CanvasObjectSnapshot): Point {
  return rotatePoint(
    {
      x: point.x - object.x,
      y: point.y - object.y,
    },
    -object.rotation,
  );
}

export function objectLocalToCanvas(object: CanvasObject | CanvasObjectSnapshot, localX: number, localY: number): Point {
  const rotated = rotatePoint({ x: localX, y: localY }, object.rotation);
  return {
    x: object.x + rotated.x,
    y: object.y + rotated.y,
  };
}

export function isPointInObject(point: Point, object: CanvasObject) {
  const local = toObjectLocal(point, object);
  return Math.abs(local.x) <= object.width / 2 && Math.abs(local.y) <= object.height / 2;
}

export function getHandlePosition(object: CanvasObject | CanvasObjectSnapshot, handle: ResizeHandle) {
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

export function getRotateHandlePosition(object: CanvasObject | CanvasObjectSnapshot) {
  return objectLocalToCanvas(object, 0, -object.height / 2 - ROTATE_HANDLE_OFFSET);
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

export function fitObjectSize(canvas: HTMLCanvasElement, width: number, height: number) {
  const scale = Math.min(1, width / canvas.width, height / canvas.height);
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}

export function getCoverDrawSize(canvas: HTMLCanvasElement, width: number, height: number, zoom = 1) {
  const scale = Math.max(width / canvas.width, height / canvas.height) * zoom;
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}

export function getCenteredCoverOffset(canvas: HTMLCanvasElement, width: number, height: number, zoom = 1): Point {
  const drawSize = getCoverDrawSize(canvas, width, height, zoom);
  return {
    x: Math.round((width - drawSize.width) / 2),
    y: Math.round((height - drawSize.height) / 2),
  };
}

export function clampCoverAxisOffset(offset: number, drawLength: number, canvasLength: number) {
  if (drawLength <= canvasLength) {
    return clampNumber(offset, 0, canvasLength - drawLength);
  }
  return clampNumber(offset, canvasLength - drawLength, 0);
}

export function clampCoverOffset(offset: Point, canvas: HTMLCanvasElement, width: number, height: number, zoom = 1): Point {
  const drawSize = getCoverDrawSize(canvas, width, height, zoom);
  return {
    x: clampCoverAxisOffset(offset.x, drawSize.width, width),
    y: clampCoverAxisOffset(offset.y, drawSize.height, height),
  };
}

export function drawCoverImage(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  offset: Point,
  width: number,
  height: number,
  zoom = 1,
) {
  const drawSize = getCoverDrawSize(canvas, width, height, zoom);
  context.drawImage(canvas, offset.x, offset.y, drawSize.width, drawSize.height);
}

export function renderPoseConditionCanvas(
  sourceCanvas: HTMLCanvasElement | null,
  offset: Point,
  zoom: number,
  width: number,
  height: number,
) {
  if (!sourceCanvas) {
    return null;
  }
  const poseCanvas = createFilledCanvas(width, height, '#000000');
  drawCoverImage(get2dContext(poseCanvas), sourceCanvas, offset, width, height, zoom);
  return poseCanvas;
}

export function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: { clientX: number; clientY: number },
  width: number,
  height: number,
): Point {
  const rect = getCanvasObjectFitRect(canvas);
  return {
    x: clampNumber(((event.clientX - rect.left) / rect.width) * width, 0, width),
    y: clampNumber(((event.clientY - rect.top) / rect.height) * height, 0, height),
  };
}

export function getCanvasWheelPoint(
  canvas: HTMLCanvasElement,
  event: { clientX: number; clientY: number },
  width: number,
  height: number,
): Point {
  const rect = getCanvasObjectFitRect(canvas);
  return {
    x: clampNumber(((event.clientX - rect.left) / rect.width) * width, 0, width),
    y: clampNumber(((event.clientY - rect.top) / rect.height) * height, 0, height),
  };
}

export function getCanvasObjectFitRect(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

export function getViewScale(canvas: HTMLCanvasElement) {
  const rect = getCanvasObjectFitRect(canvas);
  return rect.width > 0 ? canvas.width / rect.width : 1;
}
