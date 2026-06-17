export type Point = {
  x: number;
  y: number;
};

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type EditorMode = 'select' | 'feather' | 'scribble' | 'openpose';
export type SelectionTool = 'move' | 'rect' | 'lasso';
export type MaskPaintValue = 'white' | 'black';

export type RectSelection = {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LassoSelection = {
  kind: 'lasso';
  points: Point[];
};

export type SelectionRegion = RectSelection | LassoSelection;

export type CanvasObject = {
  id: string;
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  dirty: boolean;
  maskPath: Point[];
};

export type CanvasObjectSnapshot = Pick<CanvasObject, 'x' | 'y' | 'width' | 'height' | 'rotation'>;

export type SceneImageInpaintEditorState = {
  imageDataUrl: string | null;
  maskDataUrl: string | null;
  scribbleDataUrl: string | null;
  poseImageDataUrl: string | null;
  poseOffsetX: number | null;
  poseOffsetY: number | null;
  poseZoom: number | null;
  isMaskVisualizationEnabled: boolean | null;
  featherBrushSize: number | null;
  scribbleBrushSize: number | null;
  scribblePreviewOpacity: number | null;
  scribbleScale: number | null;
  scribbleGuidanceStart: number | null;
  scribbleGuidanceEnd: number | null;
  poseScale: number | null;
  poseGuidanceStart: number | null;
  poseGuidanceEnd: number | null;
};

export type ControlNetEditorSettings = {
  scribble_scale: number;
  scribble_guidance_start: number;
  scribble_guidance_end: number;
  pose_scale: number;
  pose_guidance_start: number;
  pose_guidance_end: number;
};

export type DragState =
  | {
    kind: 'move';
    start: Point;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'resize';
    handle: ResizeHandle;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'rotate';
    startAngle: number;
    original: CanvasObjectSnapshot;
  }
  | {
    kind: 'select-rect';
    start: Point;
  }
  | {
    kind: 'select-lasso';
  }
  | {
    kind: 'feather';
    lastPoint: Point;
  }
  | {
    kind: 'scribble';
    lastPoint: Point;
  }
  | {
    kind: 'pose';
    start: Point;
    originalOffset: Point;
  };

export type SceneImageInpaintEditorHandle = {
  renderImageAndMask: () => Promise<{
    image: Blob;
    mask: Blob;
    scribble: Blob;
    pose: Blob | null;
    hasScribble: boolean;
    hasPose: boolean;
    controlSettings: ControlNetEditorSettings;
  }>;
};

export type SceneImageInpaintEditorProps = {
  width: number;
  height: number;
  sourceImageUrl?: string | null;
  sourceScribbleUrl?: string | null;
  sourcePoseUrl?: string | null;
  disabled?: boolean;
  isGenerating?: boolean;
  altText?: string;
  scribbleScale?: number;
  scribbleGuidanceStart?: number;
  scribbleGuidanceEnd?: number;
  poseScale?: number;
  poseGuidanceStart?: number;
  poseGuidanceEnd?: number;
  initialEditorState?: SceneImageInpaintEditorState;
  onEditorStateChange?: (state: SceneImageInpaintEditorState) => void;
  onError?: (message: string | null) => void;
  onReadyChange?: (isReady: boolean) => void;
};
