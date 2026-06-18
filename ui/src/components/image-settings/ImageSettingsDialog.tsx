import type { ImageGenerationSettingsDraft } from '../../lib/scene-image';
import {
  Button,
  FieldLabel,
  FormControl,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
} from '../ui';

type ImageSettingsDialogProps = {
  modalLayout: boolean;
  imageSettingsDraft: ImageGenerationSettingsDraft;
  imageModelFilenameOptions: string[];
  imageSettingsError: string | null;
  onUpdateDraft: (field: keyof ImageGenerationSettingsDraft, value: string) => void;
  onResetDefaults: () => void;
  onApply: () => void;
  onClose: () => void;
};

export function ImageSettingsDialog({
  modalLayout,
  imageSettingsDraft,
  imageModelFilenameOptions,
  imageSettingsError,
  onUpdateDraft,
  onResetDefaults,
  onApply,
  onClose,
}: ImageSettingsDialogProps) {
  return (
    <ModalBackdrop nested={modalLayout} role="presentation">
      <Panel
        className="max-h-[min(46rem,calc(100dvh-3rem))] w-[min(48rem,100%)] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-image-settings-title"
      >
        <PanelHeader>
          <div className="min-w-0">
            <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">Image generation</p>
            <h3
              id="wizard-image-settings-title"
              className="truncate text-base font-semibold text-[#fff7ef]"
            >
              이미지 설정
            </h3>
          </div>
          <Button
            variant="danger"
            className="px-3 py-2 text-xs"
            onClick={onClose}
          >
            닫기
          </Button>
        </PanelHeader>

        <SectionBody className="flex flex-col gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <FieldLabel>model</FieldLabel>
            <FormControl
              as="select"
              value={imageSettingsDraft.model_filename}
              onChange={(event) => onUpdateDraft('model_filename', event.target.value)}
              className="h-10 w-full px-3 text-sm"
            >
              {imageModelFilenameOptions.map((modelFilename) => (
                <option key={modelFilename} value={modelFilename}>{modelFilename}</option>
              ))}
            </FormControl>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <FieldLabel>prompt default positive</FieldLabel>
            <FormControl
              as="textarea"
              value={imageSettingsDraft.prompt_default_positive}
              onChange={(event) => onUpdateDraft('prompt_default_positive', event.target.value)}
              className="min-h-20 w-full resize-y px-3 py-2 text-sm"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <FieldLabel>prompt default negative</FieldLabel>
            <FormControl
              as="textarea"
              value={imageSettingsDraft.prompt_default_negative}
              onChange={(event) => onUpdateDraft('prompt_default_negative', event.target.value)}
              className="min-h-24 w-full resize-y px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 max-[960px]:grid-cols-2 max-[640px]:grid-cols-1">
            <ImageSettingsInput label="steps" value={imageSettingsDraft.steps} onChange={(value) => onUpdateDraft('steps', value)} min="1" step="1" />
            <ImageSettingsInput label="cfg" value={imageSettingsDraft.cfg} onChange={(value) => onUpdateDraft('cfg', value)} min="0.1" step="0.1" />
            <div className="flex min-w-0 flex-col gap-1">
              <FieldLabel>sampler</FieldLabel>
              <FormControl
                as="select"
                value={imageSettingsDraft.sampler}
                onChange={(event) => onUpdateDraft('sampler', event.target.value)}
                className="h-10 w-full px-3 text-sm"
              >
                <option value="">default</option>
                <option value="euler">euler</option>
                <option value="euler_a">euler_a</option>
                <option value="dpmpp_2m">dpmpp_2m</option>
                <option value="unipc">unipc</option>
              </FormControl>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <FieldLabel>scheduler</FieldLabel>
              <FormControl
                as="select"
                value={imageSettingsDraft.scheduler}
                onChange={(event) => onUpdateDraft('scheduler', event.target.value)}
                className="h-10 w-full px-3 text-sm"
              >
                <option value="">default</option>
                <option value="karras">karras</option>
              </FormControl>
            </div>
            <ImageSettingsInput label="clip skip" value={imageSettingsDraft.clip_skip} onChange={(value) => onUpdateDraft('clip_skip', value)} min="1" step="1" />
            <ImageSettingsInput label="height" value={imageSettingsDraft.height} onChange={(value) => onUpdateDraft('height', value)} min="8" step="8" />
            <ImageSettingsInput label="width" value={imageSettingsDraft.width} onChange={(value) => onUpdateDraft('width', value)} min="8" step="8" />
            <ImageSettingsInput label="scribble scale" value={imageSettingsDraft.scribble_scale} onChange={(value) => onUpdateDraft('scribble_scale', value)} min="0" step="0.05" />
            <ImageSettingsInput label="scribble start" value={imageSettingsDraft.scribble_guidance_start} onChange={(value) => onUpdateDraft('scribble_guidance_start', value)} min="0" step="0.05" />
            <ImageSettingsInput label="scribble end" value={imageSettingsDraft.scribble_guidance_end} onChange={(value) => onUpdateDraft('scribble_guidance_end', value)} min="0" step="0.05" />
            <ImageSettingsInput label="pose scale" value={imageSettingsDraft.pose_scale} onChange={(value) => onUpdateDraft('pose_scale', value)} min="0" step="0.05" />
            <ImageSettingsInput label="pose start" value={imageSettingsDraft.pose_guidance_start} onChange={(value) => onUpdateDraft('pose_guidance_start', value)} min="0" step="0.05" />
            <ImageSettingsInput label="pose end" value={imageSettingsDraft.pose_guidance_end} onChange={(value) => onUpdateDraft('pose_guidance_end', value)} min="0" step="0.05" />
          </div>

          {imageSettingsError ? (
            <p className="text-sm font-semibold text-[#ff9ab8]">{imageSettingsError}</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
            <Button
              className="px-4 py-2 text-sm"
              onClick={onResetDefaults}
            >
              기본값으로 초기화
            </Button>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <Button
                className="px-4 py-2 text-sm"
                onClick={onClose}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="px-4 py-2 text-sm"
                onClick={onApply}
              >
                적용
              </Button>
            </div>
          </div>
        </SectionBody>
      </Panel>
    </ModalBackdrop>
  );
}

function ImageSettingsInput({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: string;
  step: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <FormControl
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full px-3 text-right text-sm"
      />
    </div>
  );
}
