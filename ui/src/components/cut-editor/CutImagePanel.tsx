import type { Dispatch, SetStateAction } from 'react';
import type {
  ImageGenerationSettings,
  ImageRecord,
  PromptColumnName,
} from '../../api/type';
import { ImageEditor } from '../image-editor';
import type { ImageEditorSubmitPayload } from '../image-editor';
import { Button, FieldLabel, FormControl } from '../ui';
import {
  QUICK_IMAGE_STRENGTHS,
  STATUS_CHANGE_FIELDS,
} from './constants';
import type {
  SaveMode,
  StatusChangeValues,
} from './types';

type CutImagePanelProps = {
  imageId: number | null;
  baseImageUrl: string | null;
  scribbleImageUrl: string | null;
  poseImageUrl: string | null;
  imageSettings: ImageGenerationSettings | null;
  promptDraft: Record<PromptColumnName, string>;
  strengthControlValue: string;
  statusChangeValues: StatusChangeValues;
  canSaveData: boolean;
  isLoadingCut: boolean;
  isLoadingHistoryImage: boolean;
  savingMode: SaveMode | null;
  canGoPreviousImage: boolean;
  canGoNextImage: boolean;
  setStatusChangeValues: Dispatch<SetStateAction<StatusChangeValues>>;
  onImageStrengthChange: (value: string) => void;
  onImageParametersUpdated: (settings: ImageGenerationSettings) => void;
  onSubmitImage: (payload: ImageEditorSubmitPayload) => void | Promise<void>;
  onPreviousImage: () => void;
  onNextImage: () => void;
  onSelectLineageImage: (image: ImageRecord) => void;
};

export function CutImagePanel({
  imageId,
  baseImageUrl,
  scribbleImageUrl,
  poseImageUrl,
  imageSettings,
  promptDraft,
  strengthControlValue,
  statusChangeValues,
  canSaveData,
  isLoadingCut,
  isLoadingHistoryImage,
  savingMode,
  canGoPreviousImage,
  canGoNextImage,
  setStatusChangeValues,
  onImageStrengthChange,
  onImageParametersUpdated,
  onSubmitImage,
  onPreviousImage,
  onNextImage,
  onSelectLineageImage,
}: CutImagePanelProps) {
  return (
    <aside className="min-w-0 space-y-3">
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              <span>strength</span>
              <FormControl
                type="number"
                min="0.01"
                max="1"
                step="0.01"
                value={strengthControlValue}
                onChange={(event) => onImageStrengthChange(event.target.value)}
                className="h-8 w-24 px-2 text-right text-xs"
                disabled={isLoadingCut || Boolean(savingMode) || !imageSettings}
              />
            </label>
            {QUICK_IMAGE_STRENGTHS.map((strength) => (
              <Button
                key={strength}
                className="h-7 px-2.5 py-0 text-xs"
                variant={imageSettings?.strength === strength ? 'primary' : 'default'}
                onClick={() => onImageStrengthChange(String(strength))}
                disabled={isLoadingCut || Boolean(savingMode) || !imageSettings}
              >
                {strength === 1 ? '1.0' : String(strength)}
              </Button>
            ))}
          </div>

          {imageSettings ? (
            <ImageEditor
              parameters={imageSettings}
              promptColumns={promptDraft}
              imageId={imageId}
              baseImageUrl={baseImageUrl}
              scribbleImageUrl={scribbleImageUrl}
              poseImageUrl={poseImageUrl}
              disabled={!canSaveData || isLoadingCut || isLoadingHistoryImage}
              isSubmitting={savingMode === 'image'}
              canGoPreviousImage={canGoPreviousImage}
              canGoNextImage={canGoNextImage}
              onParameterUpdated={onImageParametersUpdated}
              onSubmit={onSubmitImage}
              onPreviousImage={onPreviousImage}
              onNextImage={onNextImage}
              onSelectLineageImage={onSelectLineageImage}
            />
          ) : (
            <div className="grid aspect-square min-h-72 w-full place-items-center rounded-[8px] border border-[rgba(255,218,228,0.22)] bg-[rgba(15,5,20,0.78)] p-6 text-center text-[0.95rem] text-[var(--app-muted)]">
              이미지 설정을 불러오는 중
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel>상태 변화</FieldLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
          {STATUS_CHANGE_FIELDS.map((field) => (
            <label
              key={field.key}
              className="grid min-w-0 gap-1 text-xs font-semibold text-[#fff1f5]"
            >
              <span className="truncate">{field.label}</span>
              <FormControl
                type="number"
                step="1"
                value={statusChangeValues[field.key]}
                onChange={(event) =>
                  setStatusChangeValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                className="h-9 w-full px-2 text-right text-sm"
                disabled={isLoadingCut || Boolean(savingMode)}
              />
            </label>
          ))}
        </div>
      </div>
    </aside>
  );
}
