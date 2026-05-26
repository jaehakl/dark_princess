import type { ImageGenerationSettings } from '../api/type';

export const IMAGE_GENERATION_SETTINGS_STORAGE_KEY =
  'dark-princess:image-generation-settings:v1';

export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  positive_prompt: '',
  negative_prompt:
    'blurry, low quality, bad anatomy, disfigured, deformed, bad hands, missing fingers, extra fingers, worst quality, jpeg artifacts, signature, watermark, text, bad eyes, grotesque, sketchy, logo, rough, incomplete, disgusting, distorted, deformed face, poorly drawn, bad quality',
  steps: 30,
  cfg: 10.0,
  height: 1216,
  width: 832,
  seed_min: 0,
  seed_max: 1000000,
};

export function readImageGenerationSettings(): ImageGenerationSettings {
  try {
    const rawValue = window.localStorage.getItem(
      IMAGE_GENERATION_SETTINGS_STORAGE_KEY
    );
    if (!rawValue) {
      return DEFAULT_IMAGE_GENERATION_SETTINGS;
    }

    return normalizeImageGenerationSettings(JSON.parse(rawValue));
  } catch {
    return DEFAULT_IMAGE_GENERATION_SETTINGS;
  }
}

export function writeImageGenerationSettings(
  settings: ImageGenerationSettings
) {
  window.localStorage.setItem(
    IMAGE_GENERATION_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeImageGenerationSettings(settings))
  );
}

export function getImageGenerationSettingsError(
  settings: ImageGenerationSettings
) {
  const numericValues = [
    settings.steps,
    settings.cfg,
    settings.height,
    settings.width,
    settings.seed_min,
    settings.seed_max,
  ];
  if (numericValues.some((value) => !Number.isFinite(value))) {
    return '숫자 설정값을 확인해 주세요.';
  }
  if (settings.steps <= 0) {
    return 'Steps는 0보다 커야 합니다.';
  }
  if (settings.cfg <= 0) {
    return 'CFG는 0보다 커야 합니다.';
  }
  if (settings.height <= 0 || settings.width <= 0) {
    return '가로와 세로는 0보다 커야 합니다.';
  }
  if (settings.seed_min < 0) {
    return 'Seed 최소값은 0 이상이어야 합니다.';
  }
  if (settings.seed_max < settings.seed_min) {
    return 'Seed 최대값은 최소값 이상이어야 합니다.';
  }

  return null;
}

export function normalizeImageGenerationSettings(
  value: unknown
): ImageGenerationSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_IMAGE_GENERATION_SETTINGS;
  }

  const data = value as Partial<Record<keyof ImageGenerationSettings, unknown>>;

  return {
    positive_prompt: readText(data.positive_prompt, ''),
    negative_prompt: readText(
      data.negative_prompt,
      DEFAULT_IMAGE_GENERATION_SETTINGS.negative_prompt
    ),
    steps: readNumber(data.steps, DEFAULT_IMAGE_GENERATION_SETTINGS.steps),
    cfg: readNumber(data.cfg, DEFAULT_IMAGE_GENERATION_SETTINGS.cfg),
    height: readNumber(data.height, DEFAULT_IMAGE_GENERATION_SETTINGS.height),
    width: readNumber(data.width, DEFAULT_IMAGE_GENERATION_SETTINGS.width),
    seed_min: readNumber(
      data.seed_min,
      DEFAULT_IMAGE_GENERATION_SETTINGS.seed_min
    ),
    seed_max: readNumber(
      data.seed_max,
      DEFAULT_IMAGE_GENERATION_SETTINGS.seed_max
    ),
  };
}

function readText(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  if (value === null || value === '') {
    return fallback;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}
