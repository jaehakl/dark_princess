import type { ImageGenerationSettings, ImageRecord, PromptColumnName } from '../../api/type';

export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EditorTab = 'image' | 'mask' | 'scribble' | 'pose';
export type ImageTool = 'select' | 'object' | 'feather';
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type ImageObject = {
  id: string;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
};

export type BaseImageLayer = {
  sourceUrl: string | null;
  blob: Blob;
  canvas: HTMLCanvasElement;
};

export type PoseLayer = {
  sourceUrl: string | null;
  blob: Blob | null;
  canvas: HTMLCanvasElement | null;
  offset: Point;
  zoom: number;
  modified: boolean;
};

export type ImageLayerSnapshot = {
  baseImage: BaseImageLayer | null;
  objects: ImageObject[];
  activeObjectId: string | null;
};

export type CanvasSnapshot = HTMLCanvasElement;

export type DragState =
  | { kind: 'select'; start: Point }
  | { kind: 'move'; start: Point; object: ImageObject }
  | { kind: 'resize'; start: Point; handle: ResizeHandle; object: ImageObject }
  | { kind: 'rotate'; startAngle: number; object: ImageObject }
  | { kind: 'feather'; points: Point[] }
  | { kind: 'mask-select'; start: Point }
  | { kind: 'scribble'; lastPoint: Point }
  | { kind: 'pose'; start: Point; originalOffset: Point };

export type ImageEditorSubmitPayload = {
  parameters: ImageGenerationSettings;
  promptColumns: Record<PromptColumnName, string>;
  image: Blob | null;
  mask: Blob | null;
  scribbleImage: Blob | null;
  poseImage: Blob | null;
};

export type ImageEditorProps = {
  parameters: ImageGenerationSettings;
  promptColumns: Record<PromptColumnName, string>;
  imageId?: number | null;
  baseImageUrl?: string | null;
  scribbleImageUrl?: string | null;
  poseImageUrl?: string | null;
  disabled?: boolean;
  isSubmitting?: boolean;
  canGoPreviousImage?: boolean;
  canGoNextImage?: boolean;
  onParameterUpdated: (parameters: ImageGenerationSettings) => void;
  onSubmit: (payload: ImageEditorSubmitPayload) => Promise<void> | void;
  onPreviousImage?: () => void;
  onNextImage?: () => void;
  onSelectLineageImage?: (image: ImageRecord) => void;
};
