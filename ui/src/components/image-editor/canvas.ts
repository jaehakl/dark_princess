import { API_URL } from '../../api/api';
import type { Rect } from './types';

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '이미지 편집 요청에 실패했습니다.';
}

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function get2dContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas를 사용할 수 없습니다.');
  }
  return context;
}

export function createFilledCanvas(width: number, height: number, color: string) {
  const canvas = createCanvas(width, height);
  const context = get2dContext(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

export function cloneCanvas(canvas: HTMLCanvasElement) {
  const nextCanvas = createCanvas(canvas.width, canvas.height);
  get2dContext(nextCanvas).drawImage(canvas, 0, 0);
  return nextCanvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
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

export function resolveImageFetchUrl(imageUrl: string) {
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

export async function fetchImageBlob(imageUrl: string) {
  const response = await fetch(resolveImageFetchUrl(imageUrl), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('기존 이미지를 불러오지 못했습니다.');
  }
  return await response.blob();
}

export async function createCanvasFromBlob(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = createCanvas(bitmap.width, bitmap.height);
    get2dContext(canvas).drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export function getContainedRect(sourceWidth: number, sourceHeight: number, width: number, height: number): Rect {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = Math.round(sourceWidth * scale);
  const drawHeight = Math.round(sourceHeight * scale);
  return {
    x: Math.floor((width - drawWidth) / 2),
    y: Math.floor((height - drawHeight) / 2),
    width: drawWidth,
    height: drawHeight,
  };
}

export function drawContainedCanvas(
  context: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const rect = getContainedRect(sourceCanvas.width, sourceCanvas.height, width, height);
  context.drawImage(sourceCanvas, rect.x, rect.y, rect.width, rect.height);
  return rect;
}

export function isCanvasSolidColor(canvas: HTMLCanvasElement, red: number, green: number, blue: number) {
  const data = get2dContext(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] !== red || data[index + 1] !== green || data[index + 2] !== blue) {
      return false;
    }
  }
  return true;
}

export function copyCanvasRegion(sourceCanvas: HTMLCanvasElement, rect: Rect) {
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(sourceCanvas.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(sourceCanvas.height, Math.ceil(rect.y + rect.height));
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const canvas = createCanvas(width, height);
  get2dContext(canvas).drawImage(sourceCanvas, left, top, width, height, 0, 0, width, height);
  return canvas;
}

export function scaleCanvasTo(canvas: HTMLCanvasElement, width: number, height: number, fill: string) {
  const nextCanvas = createFilledCanvas(width, height, fill);
  get2dContext(nextCanvas).drawImage(canvas, 0, 0, width, height);
  return nextCanvas;
}
