import { Button, FieldLabel } from '../ui';
import {
  CONTROL_GUIDANCE_MAX,
  CONTROL_GUIDANCE_MIN,
  CONTROL_GUIDANCE_STEP,
  CONTROL_SCALE_MAX,
  CONTROL_SCALE_MIN,
  CONTROL_SCALE_STEP,
  FEATHER_BRUSH_MAX,
  FEATHER_BRUSH_MIN,
  FEATHER_BRUSH_STEP,
  SCRIBBLE_BRUSH_MAX,
  SCRIBBLE_BRUSH_MIN,
  SCRIBBLE_BRUSH_STEP,
  SCRIBBLE_PREVIEW_OPACITY_MAX,
  SCRIBBLE_PREVIEW_OPACITY_MIN,
  SCRIBBLE_PREVIEW_OPACITY_STEP,
  TOOL_BUTTON_CLASS,
} from './constants';
import { clampNumber } from './geometry';
import type { EditorMode, MaskPaintValue, SelectionTool } from './types';

type SceneImageInpaintToolbarProps = {
  mode: EditorMode;
  selectionTool: SelectionTool;
  disabled: boolean;
  isGenerating: boolean;
  isMaskVisualizationEnabled: boolean;
  hasActiveObject: boolean;
  imageHistoryCount: number;
  maskHistoryCount: number;
  featherBrushSize: number;
  scribbleBrushSize: number;
  scribblePreviewOpacity: number;
  scribbleScale: number;
  scribbleGuidanceStart: number;
  scribbleGuidanceEnd: number;
  scribbleHistoryCount: number;
  hasScribbleEdits: boolean;
  poseScale: number;
  poseGuidanceStart: number;
  poseGuidanceEnd: number;
  hasPoseImage: boolean;
  onModeChange: (mode: EditorMode) => void;
  onSelectionToolChange: (tool: SelectionTool) => void;
  onToggleMaskVisualization: () => void;
  onFlipActiveObjectX: () => void;
  onUndoImage: () => void;
  onApplyActiveObjectToMask: (value: MaskPaintValue) => void;
  onUndoMask: () => void;
  onFeatherBrushSizeChange: (value: number) => void;
  onScribbleBrushSizeChange: (value: number) => void;
  onScribblePreviewOpacityChange: (value: number) => void;
  onScribbleScaleChange: (value: number) => void;
  onScribbleGuidanceStartChange: (value: number) => void;
  onScribbleGuidanceEndChange: (value: number) => void;
  onUndoScribble: () => void;
  onClearScribble: () => void;
  onPoseScaleChange: (value: number) => void;
  onPoseGuidanceStartChange: (value: number) => void;
  onPoseGuidanceEndChange: (value: number) => void;
  onClearPoseImage: () => void;
};

const NUMBER_INPUT_CLASS = 'h-8 w-16 rounded-[8px] border border-[rgba(255,218,228,0.26)] bg-[rgba(16,8,24,0.72)] px-2 text-right text-xs text-[#fff7ef] outline-none focus:border-[#ffe2ba]';

function readFiniteNumber(value: string) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

export function SceneImageInpaintToolbar({
  mode,
  selectionTool,
  disabled,
  isGenerating,
  isMaskVisualizationEnabled,
  hasActiveObject,
  imageHistoryCount,
  maskHistoryCount,
  featherBrushSize,
  scribbleBrushSize,
  scribblePreviewOpacity,
  scribbleScale,
  scribbleGuidanceStart,
  scribbleGuidanceEnd,
  scribbleHistoryCount,
  hasScribbleEdits,
  poseScale,
  poseGuidanceStart,
  poseGuidanceEnd,
  hasPoseImage,
  onModeChange,
  onSelectionToolChange,
  onToggleMaskVisualization,
  onFlipActiveObjectX,
  onUndoImage,
  onApplyActiveObjectToMask,
  onUndoMask,
  onFeatherBrushSizeChange,
  onScribbleBrushSizeChange,
  onScribblePreviewOpacityChange,
  onScribbleScaleChange,
  onScribbleGuidanceStartChange,
  onScribbleGuidanceEndChange,
  onUndoScribble,
  onClearScribble,
  onPoseScaleChange,
  onPoseGuidanceStartChange,
  onPoseGuidanceEndChange,
  onClearPoseImage,
}: SceneImageInpaintToolbarProps) {
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <FieldLabel>INPAINT 이미지</FieldLabel>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'select' ? 'primary' : 'default'}
            onClick={() => onModeChange('select')}
            disabled={disabled || isGenerating}
            aria-label="선택 및 object 편집"
            title="선택 및 object 편집"
          >
            ✋
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'feather' ? 'primary' : 'default'}
            onClick={() => onModeChange('feather')}
            disabled={disabled || isGenerating}
            aria-label="Feather 브러시"
            title="Feather 브러시"
          >
            🖌️
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'scribble' ? 'primary' : 'default'}
            onClick={() => onModeChange('scribble')}
            disabled={disabled || isGenerating}
            aria-label="Scribble ControlNet"
            title="Scribble ControlNet"
          >
            ✏️
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={mode === 'openpose' ? 'primary' : 'default'}
            onClick={() => onModeChange('openpose')}
            disabled={disabled || isGenerating}
            aria-label="OpenPose ControlNet"
            title="OpenPose ControlNet"
          >
            OP
          </Button>
          <Button
            className={TOOL_BUTTON_CLASS}
            variant={isMaskVisualizationEnabled ? 'primary' : 'default'}
            onClick={onToggleMaskVisualization}
            disabled={disabled || isGenerating}
            aria-label="Mask 시각화 토글"
            title="Mask 시각화 토글"
          >
            ◐
          </Button>
        </div>
      </div>

      <div className="flex min-h-8 min-w-0 flex-wrap items-center justify-end gap-2">
        {mode === 'select' ? (
          <>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={selectionTool === 'rect' ? 'primary' : 'default'}
              onClick={() => onSelectionToolChange('rect')}
              disabled={disabled || isGenerating}
              aria-label="사각형 선택"
              title="사각형 선택"
            >
              ▭
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              variant={selectionTool === 'lasso' ? 'primary' : 'default'}
              onClick={() => onSelectionToolChange('lasso')}
              disabled={disabled || isGenerating}
              aria-label="Lasso 선택"
              title="Lasso 선택"
            >
              〰
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={onFlipActiveObjectX}
              disabled={disabled || isGenerating || !hasActiveObject}
              aria-label="선택 object 좌우반전"
              title="선택 object 좌우반전"
            >
              ↔
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={onUndoImage}
              disabled={disabled || isGenerating || hasActiveObject || imageHistoryCount === 0}
              aria-label="Image undo"
              title="Image undo"
            >
              ↩
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={() => onApplyActiveObjectToMask('white')}
              disabled={disabled || isGenerating}
              aria-label="선택 object를 white mask로 적용"
              title="선택 object를 white mask로 적용"
            >
              ■
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={() => onApplyActiveObjectToMask('black')}
              disabled={disabled || isGenerating}
              aria-label="선택 object를 black mask로 적용"
              title="선택 object를 black mask로 적용"
            >
              □
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={onUndoMask}
              disabled={disabled || isGenerating || maskHistoryCount === 0}
              aria-label="Mask undo"
              title="Mask undo"
            >
              ↩
            </Button>
          </>
        ) : null}

        {mode === 'feather' ? (
          <>
            <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              brush
              <input
                type="range"
                min={FEATHER_BRUSH_MIN}
                max={FEATHER_BRUSH_MAX}
                step={FEATHER_BRUSH_STEP}
                value={featherBrushSize}
                onChange={(event) => onFeatherBrushSizeChange(Number(event.target.value))}
                disabled={disabled || isGenerating}
                className="w-24 accent-[#ffe2ba]"
              />
              <span className="w-10 text-right">{featherBrushSize}px</span>
            </label>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={onUndoImage}
              disabled={disabled || isGenerating || hasActiveObject || imageHistoryCount === 0}
              aria-label="Image undo"
              title="Image undo"
            >
              ↩
            </Button>
          </>
        ) : null}

        {mode === 'scribble' ? (
          <>
            <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              brush
              <input
                type="range"
                min={SCRIBBLE_BRUSH_MIN}
                max={SCRIBBLE_BRUSH_MAX}
                step={SCRIBBLE_BRUSH_STEP}
                value={scribbleBrushSize}
                onChange={(event) => onScribbleBrushSizeChange(Number(event.target.value))}
                disabled={disabled || isGenerating}
                className="w-20 accent-[#ffe2ba]"
              />
              <span className="w-9 text-right">{scribbleBrushSize}px</span>
            </label>
            <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              opacity
              <input
                type="range"
                min={SCRIBBLE_PREVIEW_OPACITY_MIN}
                max={SCRIBBLE_PREVIEW_OPACITY_MAX}
                step={SCRIBBLE_PREVIEW_OPACITY_STEP}
                value={scribblePreviewOpacity}
                onChange={(event) => onScribblePreviewOpacityChange(Number(event.target.value))}
                disabled={disabled || isGenerating}
                className="w-20 accent-[#ffe2ba]"
              />
              <span className="w-10 text-right">{Math.round(scribblePreviewOpacity * 100)}%</span>
            </label>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              scale
              <input
                type="number"
                min={CONTROL_SCALE_MIN}
                max={CONTROL_SCALE_MAX}
                step={CONTROL_SCALE_STEP}
                value={scribbleScale}
                onChange={(event) => {
                  const nextValue = readFiniteNumber(event.target.value);
                  if (nextValue !== null) {
                    onScribbleScaleChange(clampNumber(nextValue, CONTROL_SCALE_MIN, CONTROL_SCALE_MAX));
                  }
                }}
                disabled={disabled || isGenerating}
                className={NUMBER_INPUT_CLASS}
              />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              start
              <input
                type="number"
                min={CONTROL_GUIDANCE_MIN}
                max={CONTROL_GUIDANCE_MAX}
                step={CONTROL_GUIDANCE_STEP}
                value={scribbleGuidanceStart}
                onChange={(event) => {
                  const nextValue = readFiniteNumber(event.target.value);
                  if (nextValue !== null) {
                    onScribbleGuidanceStartChange(nextValue);
                  }
                }}
                disabled={disabled || isGenerating}
                className={NUMBER_INPUT_CLASS}
              />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              end
              <input
                type="number"
                min={CONTROL_GUIDANCE_MIN}
                max={CONTROL_GUIDANCE_MAX}
                step={CONTROL_GUIDANCE_STEP}
                value={scribbleGuidanceEnd}
                onChange={(event) => {
                  const nextValue = readFiniteNumber(event.target.value);
                  if (nextValue !== null) {
                    onScribbleGuidanceEndChange(nextValue);
                  }
                }}
                disabled={disabled || isGenerating}
                className={NUMBER_INPUT_CLASS}
              />
            </label>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={onUndoScribble}
              disabled={disabled || isGenerating || scribbleHistoryCount === 0}
              aria-label="Scribble undo"
              title="Scribble undo"
            >
              ↩
            </Button>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={onClearScribble}
              disabled={disabled || isGenerating || !hasScribbleEdits}
              aria-label="Scribble 모두 지우기"
              title="Scribble 모두 지우기"
            >
              🧹
            </Button>
          </>
        ) : null}

        {mode === 'openpose' ? (
          <>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              scale
              <input
                type="number"
                min={CONTROL_SCALE_MIN}
                max={CONTROL_SCALE_MAX}
                step={CONTROL_SCALE_STEP}
                value={poseScale}
                onChange={(event) => {
                  const nextValue = readFiniteNumber(event.target.value);
                  if (nextValue !== null) {
                    onPoseScaleChange(clampNumber(nextValue, CONTROL_SCALE_MIN, CONTROL_SCALE_MAX));
                  }
                }}
                disabled={disabled || isGenerating}
                className={NUMBER_INPUT_CLASS}
              />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              start
              <input
                type="number"
                min={CONTROL_GUIDANCE_MIN}
                max={CONTROL_GUIDANCE_MAX}
                step={CONTROL_GUIDANCE_STEP}
                value={poseGuidanceStart}
                onChange={(event) => {
                  const nextValue = readFiniteNumber(event.target.value);
                  if (nextValue !== null) {
                    onPoseGuidanceStartChange(nextValue);
                  }
                }}
                disabled={disabled || isGenerating}
                className={NUMBER_INPUT_CLASS}
              />
            </label>
            <label className="flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">
              end
              <input
                type="number"
                min={CONTROL_GUIDANCE_MIN}
                max={CONTROL_GUIDANCE_MAX}
                step={CONTROL_GUIDANCE_STEP}
                value={poseGuidanceEnd}
                onChange={(event) => {
                  const nextValue = readFiniteNumber(event.target.value);
                  if (nextValue !== null) {
                    onPoseGuidanceEndChange(nextValue);
                  }
                }}
                disabled={disabled || isGenerating}
                className={NUMBER_INPUT_CLASS}
              />
            </label>
            <Button
              className={TOOL_BUTTON_CLASS}
              onClick={onClearPoseImage}
              disabled={disabled || isGenerating || !hasPoseImage}
              aria-label="OpenPose 이미지 지우기"
              title="OpenPose 이미지 지우기"
            >
              ×
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}
