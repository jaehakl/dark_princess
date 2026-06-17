import { HANDLE_DEFS, MIN_SELECTION_SIZE } from './constants';
import { createRenderCanvas, get2dContext } from './canvas';
import { fitObjectSize, getHandlePosition, objectLocalToCanvas } from './geometry';
import type { CanvasObject, CanvasObjectSnapshot, Point, RectSelection, ResizeHandle, SelectionRegion } from './types';

export function createObjectId() {
  return `image-object-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getObjectMaskPath(object: CanvasObject) {
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

export function getRectFromPoints(start: Point, end: Point): RectSelection {
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

export function getBoundsFromPoints(points: Point[]) {
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

export function getSelectionBounds(selection: SelectionRegion) {
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

export function createObjectFromCanvas(
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

export function createObjectFromBitmap(bitmap: ImageBitmap, width: number, height: number) {
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

export function createObjectFromSelection(sourceCanvas: HTMLCanvasElement, selection: SelectionRegion) {
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

export function objectSnapshot(object: CanvasObject): CanvasObjectSnapshot {
  return {
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
  };
}

export function findResizeHandle(point: Point, object: CanvasObject, threshold: number) {
  for (const handle of HANDLE_DEFS) {
    const handlePoint = getHandlePosition(object, handle.key);
    if (Math.abs(point.x - handlePoint.x) <= threshold && Math.abs(point.y - handlePoint.y) <= threshold) {
      return handle.key;
    }
  }
  return null;
}
