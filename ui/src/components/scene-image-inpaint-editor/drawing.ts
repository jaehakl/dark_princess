import { HANDLE_DEFS, MASK_MIN_POINTS } from './constants';
import { createRenderCanvas, get2dContext } from './canvas';
import { getHandlePosition, getRotateHandlePosition } from './geometry';
import type { CanvasObject, MaskPaintValue, Point, RectSelection, SelectionRegion } from './types';

export function drawObject(context: CanvasRenderingContext2D, object: CanvasObject) {
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

export function drawPointPath(context: CanvasRenderingContext2D, points: Point[], closePath: boolean) {
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

export function drawSelectionPath(context: CanvasRenderingContext2D, selection: SelectionRegion) {
  if (selection.kind === 'rect') {
    context.beginPath();
    context.rect(selection.x, selection.y, selection.width, selection.height);
    return;
  }
  drawPointPath(context, selection.points, true);
}

export function drawOpenPathPreview(context: CanvasRenderingContext2D, points: Point[], scale: number) {
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

export function drawSelectionPreview(
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

export function drawWhiteMaskVisualization(
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

export function drawScribblePreview(
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

export function drawObjectHandles(
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

export function fillMaskPath(
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

export function fillWholeMask(maskCanvas: HTMLCanvasElement, value: MaskPaintValue) {
  const context = get2dContext(maskCanvas);
  context.fillStyle = value === 'white' ? '#ffffff' : '#000000';
  context.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
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

export function shuffleAdjacentPixels(canvas: HTMLCanvasElement, point: Point, radius: number) {
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

export function applyFeatherStrokeToImage(
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

export function isCanvasSolidColor(canvas: HTMLCanvasElement, red: number, green: number, blue: number) {
  const { data } = get2dContext(canvas).getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] !== red || data[index + 1] !== green || data[index + 2] !== blue) {
      return false;
    }
  }
  return true;
}
