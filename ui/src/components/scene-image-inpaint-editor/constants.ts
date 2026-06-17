import type { ResizeHandle } from './types';

export const HANDLE_DEFS: Array<{ key: ResizeHandle; x: number; y: number }> = [
  { key: 'nw', x: -0.5, y: -0.5 },
  { key: 'n', x: 0, y: -0.5 },
  { key: 'ne', x: 0.5, y: -0.5 },
  { key: 'e', x: 0.5, y: 0 },
  { key: 'se', x: 0.5, y: 0.5 },
  { key: 's', x: 0, y: 0.5 },
  { key: 'sw', x: -0.5, y: 0.5 },
  { key: 'w', x: -0.5, y: 0 },
];
export const HISTORY_LIMIT = 10;
export const MIN_OBJECT_SIZE = 24;
export const ROTATE_HANDLE_OFFSET = 42;
export const MIN_SELECTION_SIZE = 3;
export const LASSO_MIN_POINTS = 3;
export const MASK_MIN_POINTS = 3;
export const DEFAULT_FEATHER_BRUSH_SIZE = 64;
export const DEFAULT_SCRIBBLE_BRUSH_SIZE = 80;
export const DEFAULT_SCRIBBLE_PREVIEW_OPACITY = 0.5;
export const DEFAULT_SCRIBBLE_SCALE = 1;
export const DEFAULT_SCRIBBLE_GUIDANCE_START = 0;
export const DEFAULT_SCRIBBLE_GUIDANCE_END = 1;
export const DEFAULT_POSE_SCALE = 1;
export const DEFAULT_POSE_GUIDANCE_START = 0;
export const DEFAULT_POSE_GUIDANCE_END = 1;
export const MIN_POSE_ZOOM = 0.25;
export const MAX_POSE_ZOOM = 4;
export const TOOL_BUTTON_CLASS = 'grid h-8 w-8 place-items-center px-0 py-0 text-base leading-none';

export const FEATHER_BRUSH_MIN = 12;
export const FEATHER_BRUSH_MAX = 180;
export const FEATHER_BRUSH_STEP = 2;
export const SCRIBBLE_BRUSH_MIN = 2;
export const SCRIBBLE_BRUSH_MAX = 100;
export const SCRIBBLE_BRUSH_STEP = 1;
export const SCRIBBLE_PREVIEW_OPACITY_MIN = 0;
export const SCRIBBLE_PREVIEW_OPACITY_MAX = 1;
export const SCRIBBLE_PREVIEW_OPACITY_STEP = 0.05;
export const CONTROL_SCALE_MIN = 0;
export const CONTROL_SCALE_MAX = 2;
export const CONTROL_SCALE_STEP = 0.05;
export const CONTROL_GUIDANCE_MIN = 0;
export const CONTROL_GUIDANCE_MAX = 1;
export const CONTROL_GUIDANCE_STEP = 0.05;
