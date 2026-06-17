import { API_URL } from '../api/api';
import type { ImageGenerationSettings } from '../api/type';

const NOISE_CHANNEL_SAMPLE_COUNT = 4;

export const IMAGE_SETTINGS_SESSION_KEY = 'dark_princess.scene.image_settings';
export const IMAGE_SAMPLER_OPTIONS = ['', 'euler', 'euler_a', 'dpmpp_2m', 'unipc'] as const;
export const IMAGE_SCHEDULER_OPTIONS = ['', 'karras'] as const;

export type SeedImageSource = 'existing' | 'noise' | 'clipboard';

export type SeedImageState = {
  blob: Blob;
  previewUrl: string;
  source: SeedImageSource;
};

export type ImageGenerationSettingsDraft = {
  model_filename: string;
  positive_base: string;
  negative_prompt: string;
  steps: string;
  cfg: string;
  strength: string;
  sampler: string;
  scheduler: string;
  clip_skip: string;
  height: string;
  width: string;
  scribble_scale: string;
  scribble_guidance_start: string;
  scribble_guidance_end: string;
  pose_scale: string;
  pose_guidance_start: string;
  pose_guidance_end: string;
};

export function imageSettingsToDraft(settings: ImageGenerationSettings): ImageGenerationSettingsDraft {
  return {
    model_filename: settings.model_filename,
    positive_base: settings.positive_base,
    negative_prompt: settings.negative_prompt,
    steps: String(settings.steps),
    cfg: String(settings.cfg),
    strength: String(settings.strength),
    sampler: settings.sampler,
    scheduler: settings.scheduler,
    clip_skip: settings.clip_skip === null ? '' : String(settings.clip_skip),
    height: String(settings.height),
    width: String(settings.width),
    scribble_scale: String(settings.scribble_scale),
    scribble_guidance_start: String(settings.scribble_guidance_start),
    scribble_guidance_end: String(settings.scribble_guidance_end),
    pose_scale: String(settings.pose_scale),
    pose_guidance_start: String(settings.pose_guidance_start),
    pose_guidance_end: String(settings.pose_guidance_end),
  };
}

export function readSessionImageSettings(defaults: ImageGenerationSettings): ImageGenerationSettings {
  const rawSettings = sessionStorage.getItem(IMAGE_SETTINGS_SESSION_KEY);
  if (!rawSettings) {
    return defaults;
  }

  try {
    const parsedSettings = JSON.parse(rawSettings) as Partial<ImageGenerationSettings> & {
      controlnet_conditioning_scale?: number;
      control_guidance_start?: number;
      control_guidance_end?: number;
    };
    const legacyScale = parsedSettings.controlnet_conditioning_scale;
    const legacyGuidanceStart = parsedSettings.control_guidance_start;
    const legacyGuidanceEnd = parsedSettings.control_guidance_end;
    const modelFilenames = defaults.model_filenames;
    const parsedModelFilename = parsedSettings.model_filename ?? defaults.model_filename;
    const modelFilename = modelFilenames.includes(parsedModelFilename)
      ? parsedModelFilename
      : defaults.model_filename;
    return {
      model_filename: modelFilename,
      model_filenames: modelFilenames,
      positive_base: parsedSettings.positive_base ?? defaults.positive_base,
      negative_prompt: parsedSettings.negative_prompt ?? defaults.negative_prompt,
      steps: parsedSettings.steps ?? defaults.steps,
      cfg: parsedSettings.cfg ?? defaults.cfg,
      strength: parsedSettings.strength ?? defaults.strength,
      sampler: parsedSettings.sampler ?? defaults.sampler,
      scheduler: parsedSettings.scheduler ?? defaults.scheduler,
      clip_skip: parsedSettings.clip_skip ?? defaults.clip_skip,
      height: parsedSettings.height ?? defaults.height,
      width: parsedSettings.width ?? defaults.width,
      scribble_scale: parsedSettings.scribble_scale ?? legacyScale ?? defaults.scribble_scale,
      scribble_guidance_start: (
        parsedSettings.scribble_guidance_start ?? legacyGuidanceStart ?? defaults.scribble_guidance_start
      ),
      scribble_guidance_end: (
        parsedSettings.scribble_guidance_end ?? legacyGuidanceEnd ?? defaults.scribble_guidance_end
      ),
      pose_scale: parsedSettings.pose_scale ?? legacyScale ?? defaults.pose_scale,
      pose_guidance_start: parsedSettings.pose_guidance_start ?? legacyGuidanceStart ?? defaults.pose_guidance_start,
      pose_guidance_end: parsedSettings.pose_guidance_end ?? legacyGuidanceEnd ?? defaults.pose_guidance_end,
    };
  } catch {
    sessionStorage.removeItem(IMAGE_SETTINGS_SESSION_KEY);
    return defaults;
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('seed image를 생성하지 못했습니다.'));
      }
    }, 'image/png');
  });
}

export async function createNoiseSeedImage(width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas를 사용할 수 없습니다.');
  }

  const imageData = context.createImageData(width, height);
  const randomValues = new Uint8Array(width * height * 3 * NOISE_CHANNEL_SAMPLE_COUNT);
  for (let offset = 0; offset < randomValues.length; offset += 65536) {
    crypto.getRandomValues(randomValues.subarray(offset, Math.min(offset + 65536, randomValues.length)));
  }

  let randomIndex = 0;
  for (let index = 0; index < imageData.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      let sum = 0;
      for (let sample = 0; sample < NOISE_CHANNEL_SAMPLE_COUNT; sample += 1) {
        sum += randomValues[randomIndex];
        randomIndex += 1;
      }
      imageData.data[index + channel] = Math.round(sum / NOISE_CHANNEL_SAMPLE_COUNT);
    }
    imageData.data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return await canvasToPngBlob(canvas);
}

export async function createSeedImageFromUrl(
  imageUrl: string,
  width: number,
  height: number,
): Promise<Blob> {
  let fetchUrl = imageUrl;
  try {
    const parsedImageUrl = new URL(imageUrl, window.location.href);
    const parsedApiUrl = new URL(API_URL, window.location.href);
    if (parsedImageUrl.origin === parsedApiUrl.origin && parsedImageUrl.pathname.startsWith('/uploads/')) {
      fetchUrl = `${parsedImageUrl.pathname}${parsedImageUrl.search}`;
    }
  } catch {
    fetchUrl = imageUrl;
  }

  const response = await fetch(fetchUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('기존 이미지를 불러오지 못했습니다.');
  }

  return await createSeedImageFromBlob(await response.blob(), width, height);
}

export async function createSeedImageFromBlob(
  imageBlob: Blob,
  width: number,
  height: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(imageBlob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('canvas를 사용할 수 없습니다.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const drawWidth = Math.round(bitmap.width * scale);
    const drawHeight = Math.round(bitmap.height * scale);
    context.drawImage(
      bitmap,
      Math.floor((width - drawWidth) / 2),
      Math.floor((height - drawHeight) / 2),
      drawWidth,
      drawHeight,
    );
    return await canvasToPngBlob(canvas);
  } finally {
    bitmap.close();
  }
}
