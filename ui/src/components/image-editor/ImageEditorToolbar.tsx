import { Button, FieldLabel, FormControl } from '../ui';
import {
  CONTROL_GUIDANCE_MAX,
  CONTROL_GUIDANCE_MIN,
  CONTROL_SCALE_MAX,
  CONTROL_SCALE_MIN,
  DEFAULT_FEATHER_BRUSH_SIZE,
  DEFAULT_SCRIBBLE_BRUSH_SIZE,
  NUMBER_INPUT_CLASS,
  QUICK_IMAGE_RESOLUTIONS,
  TOOL_BUTTON_CLASS,
} from './constants';
import type { EditorTab, ImageTool } from './types';

type ImageEditorToolbarProps = {
  tab: EditorTab;
  tool: ImageTool;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  imageId?: number | null;
  canGoPreviousImage: boolean;
  canGoNextImage: boolean;
  canOpenLineage: boolean;
  canOpenImageSearch: boolean;
  canOpenPostprocess: boolean;
  canOpenObjectGenerate: boolean;
  canOpenObjectEdit: boolean;
  hasActiveObject: boolean;
  hasBaseImage: boolean;
  hasScribble: boolean;
  hasPose: boolean;
  maskOpacity: number;
  scribbleOpacity: number;
  featherBrushSize: number;
  scribbleBrushSize: number;
  scribbleMode: 'draw' | 'erase';
  scribbleScale: number;
  scribbleGuidanceStart: number;
  scribbleGuidanceEnd: number;
  poseScale: number;
  poseGuidanceStart: number;
  poseGuidanceEnd: number;
  maskOverlap: boolean;
  scribbleOverlap: boolean;
  width: number;
  height: number;
  onResolutionChange: (width: number, height: number) => void;
  onTabChange: (tab: EditorTab) => void;
  onToolChange: (tool: ImageTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPreviousImage: () => void;
  onNextImage: () => void;
  onOpenLineage: () => void;
  onOpenImageSearch: () => void;
  onOpenPostprocess: () => void;
  onOpenObjectGenerate: () => void;
  onOpenObjectEdit: () => void;
  onFlip: () => void;
  onClearImage: () => void;
  onToggleMaskOverlap: () => void;
  onToggleScribbleOverlap: () => void;
  onMaskOpacityChange: (value: number) => void;
  onMaskBaseBlack: () => void;
  onMaskSelection: (color: 'black' | 'white') => void;
  onMaskAll: (color: 'black' | 'white') => void;
  onScribbleOpacityChange: (value: number) => void;
  onFeatherBrushSizeChange: (value: number) => void;
  onScribbleBrushSizeChange: (value: number) => void;
  onScribbleModeChange: (mode: 'draw' | 'erase') => void;
  onScribbleScaleChange: (value: number) => void;
  onScribbleGuidanceStartChange: (value: number) => void;
  onScribbleGuidanceEndChange: (value: number) => void;
  onClearScribble: () => void;
  onPoseScaleChange: (value: number) => void;
  onPoseGuidanceStartChange: (value: number) => void;
  onPoseGuidanceEndChange: (value: number) => void;
  onClearPose: () => void;
};

const TAB_LABELS: Record<EditorTab, string> = {
  image: 'image',
  mask: 'mask',
  scribble: 'scribble',
  pose: 'pose',
};

function readNumber(value: string) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function ControlNumber({
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <FormControl
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => {
        const nextValue = readNumber(event.target.value);
        if (nextValue !== null) {
          onChange(clamp(nextValue, min, max));
        }
      }}
      className={NUMBER_INPUT_CLASS}
      disabled={disabled}
    />
  );
}

export function ImageEditorToolbar({
  tab,
  tool,
  disabled,
  canUndo,
  canRedo,
  imageId,
  canGoPreviousImage,
  canGoNextImage,
  canOpenLineage,
  canOpenImageSearch,
  canOpenPostprocess,
  canOpenObjectGenerate,
  canOpenObjectEdit,
  hasActiveObject,
  hasBaseImage,
  hasScribble,
  hasPose,
  maskOpacity,
  scribbleOpacity,
  featherBrushSize,
  scribbleBrushSize,
  scribbleMode,
  scribbleScale,
  scribbleGuidanceStart,
  scribbleGuidanceEnd,
  poseScale,
  poseGuidanceStart,
  poseGuidanceEnd,
  maskOverlap,
  scribbleOverlap,
  width,
  height,
  onResolutionChange,
  onTabChange,
  onToolChange,
  onUndo,
  onRedo,
  onPreviousImage,
  onNextImage,
  onOpenLineage,
  onOpenImageSearch,
  onOpenPostprocess,
  onOpenObjectGenerate,
  onOpenObjectEdit,
  onFlip,
  onClearImage,
  onToggleMaskOverlap,
  onToggleScribbleOverlap,
  onMaskOpacityChange,
  onMaskBaseBlack,
  onMaskSelection,
  onMaskAll,
  onScribbleOpacityChange,
  onFeatherBrushSizeChange,
  onScribbleBrushSizeChange,
  onScribbleModeChange,
  onScribbleScaleChange,
  onScribbleGuidanceStartChange,
  onScribbleGuidanceEndChange,
  onClearScribble,
  onPoseScaleChange,
  onPoseGuidanceStartChange,
  onPoseGuidanceEndChange,
  onClearPose,
}: ImageEditorToolbarProps) {
  const tabStatus: Record<EditorTab, boolean> = {
    image: hasBaseImage,
    mask: true,
    scribble: hasScribble,
    pose: hasPose,
  };

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FieldLabel className="mr-auto">Image generator</FieldLabel>
        <Button className={TOOL_BUTTON_CLASS} onClick={onPreviousImage} disabled={disabled || !canGoPreviousImage} title="이전 그림">‹</Button>
        <span className="min-w-14 text-center text-xs font-semibold text-[var(--app-muted)]">
          {imageId ? `#${imageId}` : '-'}
        </span>
        <Button className={TOOL_BUTTON_CLASS} onClick={onNextImage} disabled={disabled || !canGoNextImage} title="다음 그림">›</Button>
        <Button className="h-7 px-2.5 py-0 text-xs" onClick={onOpenLineage} disabled={disabled || !canOpenLineage}>
          계통목록
        </Button>
        <Button className="h-7 px-2.5 py-0 text-xs" onClick={onOpenImageSearch} disabled={disabled || !canOpenImageSearch}>
          이미지 찾기
        </Button>
        {QUICK_IMAGE_RESOLUTIONS.map((resolution) => (
          <Button
            key={resolution.label}
            className="h-7 px-2.5 py-0 text-xs"
            variant={width === resolution.width && height === resolution.height ? 'primary' : 'default'}
            onClick={() => onResolutionChange(resolution.width, resolution.height)}
            disabled={disabled}
          >
            {resolution.label}
          </Button>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap gap-1.5">
        {(Object.keys(TAB_LABELS) as EditorTab[]).map((item) => (
          <Button
            key={item}
            className="h-8 px-3 py-0 text-xs"
            variant={tab === item ? 'primary' : 'default'}
            onClick={() => onTabChange(item)}
            disabled={disabled}
            title={tabStatus[item] ? `${TAB_LABELS[item]} 있음` : `${TAB_LABELS[item]} 없음`}
          >
            {TAB_LABELS[item]}
            <span className="ml-1 opacity-80">{tabStatus[item] ? '●' : '○'}</span>
          </Button>
        ))}
      </div>

      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-2">
        {tab === 'image' ? (
          <>
            <Button className={TOOL_BUTTON_CLASS} variant={tool === 'select' ? 'primary' : 'default'} onClick={() => onToolChange('select')} disabled={disabled} title="사각형 select">▭</Button>
            <Button className={TOOL_BUTTON_CLASS} variant={tool === 'object' ? 'primary' : 'default'} onClick={() => onToolChange('object')} disabled={disabled} title="object 선택">✋</Button>
            <Button className={TOOL_BUTTON_CLASS} variant={tool === 'feather' ? 'primary' : 'default'} onClick={() => onToolChange('feather')} disabled={disabled} title="Feather 브러시">F</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onOpenObjectGenerate} disabled={disabled || !canOpenObjectGenerate} title="object 생성">G</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onOpenObjectEdit} disabled={disabled || !canOpenObjectEdit} title="선택 object 편집">E</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onOpenPostprocess} disabled={disabled || !canOpenPostprocess} title="이미지 후처리">FX</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onUndo} disabled={disabled || !canUndo} title="undo">↩</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onRedo} disabled={disabled || !canRedo} title="redo">↪</Button>
            <Button className={TOOL_BUTTON_CLASS} variant={maskOverlap ? 'primary' : 'default'} onClick={onToggleMaskOverlap} disabled={disabled} title="mask overlap">M</Button>
            <Button className={TOOL_BUTTON_CLASS} variant={scribbleOverlap ? 'primary' : 'default'} onClick={onToggleScribbleOverlap} disabled={disabled} title="scribble overlap">S</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onFlip} disabled={disabled || !hasActiveObject} title="선택 object 좌우반전">↔</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onClearImage} disabled={disabled} title="image 초기화">×</Button>
            {tool === 'feather' ? (
              <label className="flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
                brush
                <input
                  type="range"
                  min={8}
                  max={192}
                  step={2}
                  value={featherBrushSize || DEFAULT_FEATHER_BRUSH_SIZE}
                  onChange={(event) => onFeatherBrushSizeChange(Number(event.target.value))}
                  className="w-24 accent-[#ffe2ba]"
                  disabled={disabled}
                />
                <span className="w-10 text-right">{featherBrushSize}px</span>
              </label>
            ) : null}
          </>
        ) : null}

        {tab === 'mask' ? (
          <>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              opacity
              <input type="range" min={0} max={1} step={0.05} value={maskOpacity} onChange={(event) => onMaskOpacityChange(Number(event.target.value))} className="w-24 accent-[#ffe2ba]" disabled={disabled} />
              <span className="w-10 text-right">{Math.round(maskOpacity * 100)}%</span>
            </label>
            <Button className={TOOL_BUTTON_CLASS} onClick={onUndo} disabled={disabled || !canUndo} title="undo">↩</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onRedo} disabled={disabled || !canRedo} title="redo">↪</Button>
            <Button className="h-8 px-2 text-xs" onClick={onMaskBaseBlack} disabled={disabled} title="base image만 black">base</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={() => onMaskSelection('black')} disabled={disabled} title="선택 영역 black">■</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={() => onMaskSelection('white')} disabled={disabled} title="선택 영역 white">□</Button>
            <Button className="h-8 px-2 text-xs" onClick={() => onMaskAll('black')} disabled={disabled}>all black</Button>
            <Button className="h-8 px-2 text-xs" onClick={() => onMaskAll('white')} disabled={disabled}>all white</Button>
          </>
        ) : null}

        {tab === 'scribble' ? (
          <>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              opacity
              <input type="range" min={0} max={1} step={0.05} value={scribbleOpacity} onChange={(event) => onScribbleOpacityChange(Number(event.target.value))} className="w-20 accent-[#ffe2ba]" disabled={disabled} />
              <span className="w-10 text-right">{Math.round(scribbleOpacity * 100)}%</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              brush
              <input type="range" min={2} max={120} step={1} value={scribbleBrushSize || DEFAULT_SCRIBBLE_BRUSH_SIZE} onChange={(event) => onScribbleBrushSizeChange(Number(event.target.value))} className="w-20 accent-[#ffe2ba]" disabled={disabled} />
              <span className="w-9 text-right">{scribbleBrushSize}px</span>
            </label>
            <Button className={TOOL_BUTTON_CLASS} variant={scribbleMode === 'draw' ? 'primary' : 'default'} onClick={() => onScribbleModeChange('draw')} disabled={disabled} title="그리기">B</Button>
            <Button className={TOOL_BUTTON_CLASS} variant={scribbleMode === 'erase' ? 'primary' : 'default'} onClick={() => onScribbleModeChange('erase')} disabled={disabled} title="지우개">E</Button>
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">scale <ControlNumber value={scribbleScale} min={CONTROL_SCALE_MIN} max={CONTROL_SCALE_MAX} step={0.05} disabled={disabled} onChange={onScribbleScaleChange} /></span>
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">start <ControlNumber value={scribbleGuidanceStart} min={CONTROL_GUIDANCE_MIN} max={CONTROL_GUIDANCE_MAX} step={0.05} disabled={disabled} onChange={onScribbleGuidanceStartChange} /></span>
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">end <ControlNumber value={scribbleGuidanceEnd} min={CONTROL_GUIDANCE_MIN} max={CONTROL_GUIDANCE_MAX} step={0.05} disabled={disabled} onChange={onScribbleGuidanceEndChange} /></span>
            <Button className={TOOL_BUTTON_CLASS} onClick={onUndo} disabled={disabled || !canUndo} title="undo">↩</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onRedo} disabled={disabled || !canRedo} title="redo">↪</Button>
            <Button className={TOOL_BUTTON_CLASS} onClick={onClearScribble} disabled={disabled} title="초기화">×</Button>
          </>
        ) : null}

        {tab === 'pose' ? (
          <>
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">scale <ControlNumber value={poseScale} min={CONTROL_SCALE_MIN} max={CONTROL_SCALE_MAX} step={0.05} disabled={disabled} onChange={onPoseScaleChange} /></span>
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">start <ControlNumber value={poseGuidanceStart} min={CONTROL_GUIDANCE_MIN} max={CONTROL_GUIDANCE_MAX} step={0.05} disabled={disabled} onChange={onPoseGuidanceStartChange} /></span>
            <span className="flex items-center gap-1 text-xs font-semibold text-[var(--app-muted)]">end <ControlNumber value={poseGuidanceEnd} min={CONTROL_GUIDANCE_MIN} max={CONTROL_GUIDANCE_MAX} step={0.05} disabled={disabled} onChange={onPoseGuidanceEndChange} /></span>
            <Button className={TOOL_BUTTON_CLASS} onClick={onClearPose} disabled={disabled || !hasPose} title="초기화">×</Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
