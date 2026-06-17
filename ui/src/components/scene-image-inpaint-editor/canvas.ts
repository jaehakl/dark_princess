import { API_URL } from '../../api/api';
import { HISTORY_LIMIT } from './constants';

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '이미지 편집 요청에 실패했습니다.';
}

export function createRenderCanvas(width: number, height: number) {
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
  const canvas = createRenderCanvas(width, height);
  const context = get2dContext(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

export function createBlankImageCanvas(width: number, height: number) {
  return createFilledCanvas(width, height, '#ffffff');
}

export function createDefaultMaskCanvas(width: number, height: number) {
  return createFilledCanvas(width, height, '#ffffff');
}

export function createBlankScribbleCanvas(width: number, height: number) {
  return createFilledCanvas(width, height, '#ffffff');
}

export function cloneCanvas(canvas: HTMLCanvasElement) {
  const nextCanvas = createRenderCanvas(canvas.width, canvas.height);
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

export function canvasToDataUrl(canvas: HTMLCanvasElement | null) {
  return canvas ? canvas.toDataURL('image/png') : null;
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

export async function createBitmapFromUrl(imageUrl: string) {
  const response = await fetch(resolveImageFetchUrl(imageUrl), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('기존 이미지를 불러오지 못했습니다.');
  }
  return await createImageBitmap(await response.blob());
}

export async function createBitmapFromDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error('편집 레이어를 불러오지 못했습니다.');
  }
  return await createImageBitmap(await response.blob());
}

export async function drawDataUrlToCanvas(dataUrl: string | null | undefined, canvas: HTMLCanvasElement) {
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

export function getContainedDrawRect(sourceWidth: number, sourceHeight: number, canvas: HTMLCanvasElement) {
  const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  return {
    x: Math.floor((canvas.width - width) / 2),
    y: Math.floor((canvas.height - height) / 2),
    width,
    height,
  };
}

export function drawContainedBitmapToCanvas(bitmap: ImageBitmap, canvas: HTMLCanvasElement) {
  const context = get2dContext(canvas);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const drawRect = getContainedDrawRect(bitmap.width, bitmap.height, canvas);
  context.drawImage(
    bitmap,
    drawRect.x,
    drawRect.y,
    drawRect.width,
    drawRect.height,
  );
  return drawRect;
}

export function hasDifferentAspectRatio(bitmap: ImageBitmap, width: number, height: number) {
  return bitmap.height / bitmap.width !== height / width;
}

export function createCanvasFromBitmap(bitmap: ImageBitmap) {
  const canvas = createRenderCanvas(bitmap.width, bitmap.height);
  get2dContext(canvas).drawImage(bitmap, 0, 0);
  return canvas;
}

export function pushCapped<T>(items: T[], item: T) {
  return [...items.slice(-(HISTORY_LIMIT - 1)), item];
}
