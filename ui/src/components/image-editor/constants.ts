export const QUICK_IMAGE_RESOLUTIONS = [
  { width: 768, height: 1024, label: '768x1024' },
  { width: 1024, height: 1024, label: '1024x1024' },
  { width: 1024, height: 768, label: '1024x768' },
] as const;

export const HISTORY_LIMIT = 20;
export const MIN_SELECTION_SIZE = 4;
export const MIN_OBJECT_SIZE = 24;
export const ROTATE_HANDLE_OFFSET = 42;
export const MIN_POSE_ZOOM = 0.25;
export const MAX_POSE_ZOOM = 4;

export const DEFAULT_MASK_OPACITY = 0.42;
export const DEFAULT_SCRIBBLE_OPACITY = 0.5;
export const DEFAULT_FEATHER_BRUSH_SIZE = 64;
export const DEFAULT_SCRIBBLE_BRUSH_SIZE = 48;

export const CONTROL_SCALE_MIN = 0;
export const CONTROL_SCALE_MAX = 2;
export const CONTROL_GUIDANCE_MIN = 0;
export const CONTROL_GUIDANCE_MAX = 1;

export const TOOL_BUTTON_CLASS = 'grid h-8 w-8 place-items-center px-0 py-0 text-sm leading-none';
export const NUMBER_INPUT_CLASS = 'h-8 w-16 px-2 text-right text-xs';
