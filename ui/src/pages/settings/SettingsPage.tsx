import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { settings } from '../../api/api';
import type {
  ImageGenerationSettings,
  StableDiffusionModelPathSettings,
} from '../../api/type';
import type { LayoutOutletContext } from '../../app/layout';
import {
  DEFAULT_IMAGE_GENERATION_SETTINGS,
  getImageGenerationSettingsError,
  readImageGenerationSettings,
  writeImageGenerationSettings,
} from '../../utils/imageGenerationSettings';

const EMPTY_CONFIG: StableDiffusionModelPathSettings = {
  value: '',
  directory: '',
  files: [],
};

export function SettingsPage() {
  const { setPageChrome, setQuickAddAction } =
    useOutletContext<LayoutOutletContext>();
  const [config, setConfig] =
    useState<StableDiffusionModelPathSettings>(EMPTY_CONFIG);
  const [draftValue, setDraftValue] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [imageGenerationBase, setImageGenerationBase] = useState(
    readImageGenerationSettings
  );
  const [imageGenerationDraft, setImageGenerationDraft] =
    useState<ImageGenerationSettings>(imageGenerationBase);
  const [imageGenerationStatusText, setImageGenerationStatusText] =
    useState('');
  const [imageGenerationErrorText, setImageGenerationErrorText] =
    useState('');

  const trimmedDraftValue = draftValue.trim();
  const canSave =
    Boolean(trimmedDraftValue) &&
    trimmedDraftValue !== config.value &&
    !isLoading &&
    !isSaving;
  const hasFiles = config.files.length > 0;
  const imageGenerationSettingsError =
    getImageGenerationSettingsError(imageGenerationDraft);
  const canSaveImageGenerationSettings =
    !imageGenerationSettingsError &&
    JSON.stringify(imageGenerationDraft) !== JSON.stringify(imageGenerationBase);

  const selectedFileValue = useMemo(() => {
    const draftFileName = getFileName(draftValue);
    return config.files.includes(draftFileName) ? draftFileName : selectedFile;
  }, [config.files, draftValue, selectedFile]);

  useEffect(() => {
    setPageChrome(null);
    setQuickAddAction(null);

    return () => {
      setPageChrome(null);
      setQuickAddAction(null);
    };
  }, [setPageChrome, setQuickAddAction]);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setIsLoading(true);
    setErrorText('');
    setStatusText('');

    try {
      const nextConfig = await settings.getStableDiffusionModelPath();
      applyConfig(nextConfig);
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings() {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setErrorText('');
    setStatusText('');

    try {
      await settings.updateStableDiffusionModelPath(trimmedDraftValue);
      const nextConfig = await settings.getStableDiffusionModelPath();
      applyConfig(nextConfig);
      setStatusText('저장했습니다.');
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function applyConfig(nextConfig: StableDiffusionModelPathSettings) {
    setConfig(nextConfig);
    setDraftValue(nextConfig.value);
    setSelectedFile(getFileName(nextConfig.value));
  }

  function handleFileSelect(fileName: string) {
    setSelectedFile(fileName);
    if (!fileName) {
      return;
    }

    setDraftValue(replaceFileName(draftValue || config.value, fileName));
    setStatusText('');
    setErrorText('');
  }

  function saveImageGenerationSettings() {
    const validationError = getImageGenerationSettingsError(
      imageGenerationDraft
    );
    if (validationError) {
      setImageGenerationErrorText(validationError);
      setImageGenerationStatusText('');
      return;
    }

    try {
      writeImageGenerationSettings(imageGenerationDraft);
      setImageGenerationBase(imageGenerationDraft);
      setImageGenerationStatusText('저장했습니다.');
      setImageGenerationErrorText('');
    } catch (error) {
      setImageGenerationStatusText('');
      setImageGenerationErrorText(getErrorMessage(error));
    }
  }

  function resetImageGenerationSettings() {
    setImageGenerationDraft(DEFAULT_IMAGE_GENERATION_SETTINGS);
    setImageGenerationStatusText('');
    setImageGenerationErrorText('');
  }

  function updateImageGenerationText(
    key: 'positive_prompt' | 'negative_prompt',
    value: string
  ) {
    setImageGenerationDraft((current) => ({ ...current, [key]: value }));
    setImageGenerationStatusText('');
    setImageGenerationErrorText('');
  }

  function updateImageGenerationNumber(
    key: 'steps' | 'cfg' | 'height' | 'width' | 'seed_min' | 'seed_max',
    value: string
  ) {
    setImageGenerationDraft((current) => ({
      ...current,
      [key]: Number(value),
    }));
    setImageGenerationStatusText('');
    setImageGenerationErrorText('');
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <section className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm">
        <div className="border-b border-[var(--app-border)] px-5 py-4">
          <h1 className="text-lg font-semibold text-[var(--app-text)]">
            Stable Diffusion 모델
          </h1>
        </div>

        <div className="space-y-5 px-5 py-5">
          <label className="block space-y-2">
            <span className="block text-sm font-semibold text-[var(--app-text)]">
              모델 경로
            </span>
            <input
              value={draftValue}
              onChange={(event) => {
                setDraftValue(event.target.value);
                setStatusText('');
                setErrorText('');
              }}
              disabled={isLoading || isSaving}
              className="h-11 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)] disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </label>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--app-text)]">
                현재 디렉토리
              </p>
              <div className="min-h-11 rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm leading-6 text-[var(--app-muted)]">
                {config.directory || '읽을 수 있는 디렉토리가 없습니다.'}
              </div>
            </div>

            <label className="block space-y-2">
              <span className="block text-sm font-semibold text-[var(--app-text)]">
                파일 목록
              </span>
              <select
                value={selectedFileValue}
                onChange={(event) => handleFileSelect(event.target.value)}
                disabled={isLoading || isSaving || !hasFiles}
                className="h-11 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)] disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  {hasFiles ? '파일 선택' : '파일 없음'}
                </option>
                {config.files.map((fileName) => (
                  <option key={fileName} value={fileName}>
                    {fileName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={!canSave}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-100"
            >
              {isSaving ? '저장 중' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => void loadSettings()}
              disabled={isLoading || isSaving}
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--app-border)] bg-white px-4 text-sm font-semibold text-[var(--app-text)] transition hover:border-[var(--app-border-strong)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-[var(--app-muted)]"
            >
              다시 불러오기
            </button>
            <span className="min-h-5 text-sm text-[var(--app-muted)]">
              {isLoading ? '불러오는 중' : statusText}
            </span>
          </div>

          {errorText ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorText}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm">
        <div className="border-b border-[var(--app-border)] px-5 py-4">
          <h1 className="text-lg font-semibold text-[var(--app-text)]">
            이미지 생성 기본값
          </h1>
        </div>

        <div className="space-y-5 px-5 py-5">
          <label className="block space-y-2">
            <span className="block text-sm font-semibold text-[var(--app-text)]">
              기본 Positive Prompt
            </span>
            <textarea
              value={imageGenerationDraft.positive_prompt}
              onChange={(event) =>
                updateImageGenerationText(
                  'positive_prompt',
                  event.target.value
                )
              }
              rows={3}
              className="min-h-24 w-full resize-y rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm leading-6 text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="block text-sm font-semibold text-[var(--app-text)]">
              Negative Prompt
            </span>
            <textarea
              value={imageGenerationDraft.negative_prompt}
              onChange={(event) =>
                updateImageGenerationText(
                  'negative_prompt',
                  event.target.value
                )
              }
              rows={4}
              className="min-h-28 w-full resize-y rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm leading-6 text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberSettingInput
              label="Steps"
              value={imageGenerationDraft.steps}
              min={1}
              step={1}
              onChange={(value) => updateImageGenerationNumber('steps', value)}
            />
            <NumberSettingInput
              label="CFG"
              value={imageGenerationDraft.cfg}
              min={0.1}
              step={0.1}
              onChange={(value) => updateImageGenerationNumber('cfg', value)}
            />
            <NumberSettingInput
              label="Width"
              value={imageGenerationDraft.width}
              min={1}
              step={1}
              onChange={(value) => updateImageGenerationNumber('width', value)}
            />
            <NumberSettingInput
              label="Height"
              value={imageGenerationDraft.height}
              min={1}
              step={1}
              onChange={(value) => updateImageGenerationNumber('height', value)}
            />
            <NumberSettingInput
              label="Seed Min"
              value={imageGenerationDraft.seed_min}
              min={0}
              step={1}
              onChange={(value) =>
                updateImageGenerationNumber('seed_min', value)
              }
            />
            <NumberSettingInput
              label="Seed Max"
              value={imageGenerationDraft.seed_max}
              min={0}
              step={1}
              onChange={(value) =>
                updateImageGenerationNumber('seed_max', value)
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveImageGenerationSettings}
              disabled={!canSaveImageGenerationSettings}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--app-accent)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-100"
            >
              저장
            </button>
            <button
              type="button"
              onClick={resetImageGenerationSettings}
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--app-border)] bg-white px-4 text-sm font-semibold text-[var(--app-text)] transition hover:border-[var(--app-border-strong)]"
            >
              기본값
            </button>
            <span className="min-h-5 text-sm text-[var(--app-muted)]">
              {imageGenerationStatusText}
            </span>
          </div>

          {imageGenerationSettingsError || imageGenerationErrorText ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {imageGenerationSettingsError || imageGenerationErrorText}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function NumberSettingInput({
  label,
  value,
  min,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  step: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-semibold text-[var(--app-text)]">
        {label}
      </span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-[var(--app-border)] bg-white px-3 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"
      />
    </label>
  );
}

function replaceFileName(pathValue: string, fileName: string) {
  const separatorIndex = Math.max(
    pathValue.lastIndexOf('/'),
    pathValue.lastIndexOf('\\')
  );

  if (separatorIndex < 0) {
    return fileName;
  }

  return `${pathValue.slice(0, separatorIndex + 1)}${fileName}`;
}

function getFileName(pathValue: string) {
  const separatorIndex = Math.max(
    pathValue.lastIndexOf('/'),
    pathValue.lastIndexOf('\\')
  );

  return separatorIndex < 0 ? pathValue : pathValue.slice(separatorIndex + 1);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return '요청을 처리하지 못했습니다.';
}
