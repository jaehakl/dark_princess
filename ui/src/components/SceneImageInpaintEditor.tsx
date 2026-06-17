import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { ImageFrame, Spinner } from './ui';
import {
  CONTROL_GUIDANCE_MAX,
  CONTROL_GUIDANCE_MIN,
  CONTROL_SCALE_MAX,
  CONTROL_SCALE_MIN,
  DEFAULT_FEATHER_BRUSH_SIZE,
  DEFAULT_POSE_GUIDANCE_END,
  DEFAULT_POSE_GUIDANCE_START,
  DEFAULT_POSE_SCALE,
  DEFAULT_SCRIBBLE_BRUSH_SIZE,
  DEFAULT_SCRIBBLE_GUIDANCE_END,
  DEFAULT_SCRIBBLE_GUIDANCE_START,
  DEFAULT_SCRIBBLE_PREVIEW_OPACITY,
  DEFAULT_SCRIBBLE_SCALE,
  FEATHER_BRUSH_MAX,
  FEATHER_BRUSH_MIN,
  LASSO_MIN_POINTS,
  MAX_POSE_ZOOM,
  MIN_OBJECT_SIZE,
  MIN_POSE_ZOOM,
  MIN_SELECTION_SIZE,
  SCRIBBLE_BRUSH_MAX,
  SCRIBBLE_BRUSH_MIN,
  SCRIBBLE_PREVIEW_OPACITY_MAX,
  SCRIBBLE_PREVIEW_OPACITY_MIN,
} from './scene-image-inpaint-editor/constants';
import {
  canvasToDataUrl,
  canvasToPngBlob,
  cloneCanvas,
  createBitmapFromDataUrl,
  createBitmapFromUrl,
  createBlankImageCanvas,
  createBlankScribbleCanvas,
  createCanvasFromBitmap,
  createDefaultMaskCanvas,
  drawContainedBitmapToCanvas,
  drawDataUrlToCanvas,
  get2dContext,
  getErrorMessage,
  hasDifferentAspectRatio,
  pushCapped,
} from './scene-image-inpaint-editor/canvas';
import {
  applyFeatherStrokeToImage,
  drawObject,
  drawObjectHandles,
  drawRoundStroke,
  drawScribblePreview,
  drawSelectionPreview,
  drawWhiteMaskVisualization,
  fillMaskPath,
  fillWholeMask,
  isCanvasSolidColor,
} from './scene-image-inpaint-editor/drawing';
import {
  clampCoverOffset,
  clampNumber,
  coerceNullableNumber,
  getCanvasPoint,
  getCanvasWheelPoint,
  getCenteredCoverOffset,
  getCoverDrawSize,
  getResizeCursor,
  getRotateHandlePosition,
  getViewScale,
  isPointInObject,
  renderPoseConditionCanvas,
  toObjectLocal,
} from './scene-image-inpaint-editor/geometry';
import {
  createObjectFromBitmap,
  createObjectFromSelection,
  findResizeHandle,
  getObjectMaskPath,
  getRectFromPoints,
  objectSnapshot,
} from './scene-image-inpaint-editor/objects';
import { SceneImageInpaintToolbar } from './scene-image-inpaint-editor/SceneImageInpaintToolbar';
import type {
  CanvasObject,
  DragState,
  EditorMode,
  MaskPaintValue,
  Point,
  RectSelection,
  ResizeHandle,
  SceneImageInpaintEditorHandle,
  SceneImageInpaintEditorProps,
  SceneImageInpaintEditorState,
  SelectionRegion,
  SelectionTool,
} from './scene-image-inpaint-editor/types';

export type { SceneImageInpaintEditorHandle, SceneImageInpaintEditorState } from './scene-image-inpaint-editor/types';

export const SceneImageInpaintEditor = forwardRef<
  SceneImageInpaintEditorHandle,
  SceneImageInpaintEditorProps
>(function SceneImageInpaintEditor({
  width,
  height,
  sourceImageUrl,
  sourceScribbleUrl,
  sourcePoseUrl,
  disabled = false,
  isGenerating = false,
  altText,
  scribbleScale: initialScribbleScale = DEFAULT_SCRIBBLE_SCALE,
  scribbleGuidanceStart: initialScribbleGuidanceStart = DEFAULT_SCRIBBLE_GUIDANCE_START,
  scribbleGuidanceEnd: initialScribbleGuidanceEnd = DEFAULT_SCRIBBLE_GUIDANCE_END,
  poseScale: initialPoseScale = DEFAULT_POSE_SCALE,
  poseGuidanceStart: initialPoseGuidanceStart = DEFAULT_POSE_GUIDANCE_START,
  poseGuidanceEnd: initialPoseGuidanceEnd = DEFAULT_POSE_GUIDANCE_END,
  initialEditorState,
  onEditorStateChange,
  onError,
  onReadyChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scribbleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const poseOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const poseZoomRef = useRef(1);
  const activeObjectRef = useRef<CanvasObject | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const imageHistoryRef = useRef<HTMLCanvasElement[]>([]);
  const maskHistoryRef = useRef<HTMLCanvasElement[]>([]);
  const scribbleHistoryRef = useRef<HTMLCanvasElement[]>([]);
  const draftSelectionRectRef = useRef<RectSelection | null>(null);
  const draftSelectionLassoRef = useRef<Point[]>([]);
  const initialEditorStateRef = useRef<SceneImageInpaintEditorState | undefined>(initialEditorState);
  const onErrorRef = useRef<SceneImageInpaintEditorProps['onError']>(onError);
  const publishEditorStateRef = useRef<() => void>(() => {});

  const [layersReady, setLayersReady] = useState(false);
  const [renderVersion, setRenderVersion] = useState(0);
  const [activeObject, setActiveObject] = useState<CanvasObject | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [mode, setMode] = useState<EditorMode>('select');
  const [selectionTool, setSelectionTool] = useState<SelectionTool>('rect');
  const [isMaskVisualizationEnabled, setIsMaskVisualizationEnabled] = useState(false);
  const [draftSelectionRect, setDraftSelectionRect] = useState<RectSelection | null>(null);
  const [draftSelectionLasso, setDraftSelectionLasso] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [hoverResizeHandle, setHoverResizeHandle] = useState<ResizeHandle | null>(null);
  const [imageHistoryCount, setImageHistoryCount] = useState(0);
  const [maskHistoryCount, setMaskHistoryCount] = useState(0);
  const [scribbleHistoryCount, setScribbleHistoryCount] = useState(0);
  const [hasScribbleEdits, setHasScribbleEdits] = useState(false);
  const [hasPoseImage, setHasPoseImage] = useState(false);
  const [poseOffset, setPoseOffset] = useState<Point>({ x: 0, y: 0 });
  const [poseZoom, setPoseZoom] = useState(1);
  const [featherBrushSize, setFeatherBrushSize] = useState(DEFAULT_FEATHER_BRUSH_SIZE);
  const [scribbleBrushSize, setScribbleBrushSize] = useState(DEFAULT_SCRIBBLE_BRUSH_SIZE);
  const [scribblePreviewOpacity, setScribblePreviewOpacity] = useState(DEFAULT_SCRIBBLE_PREVIEW_OPACITY);
  const [scribbleScale, setScribbleScale] = useState(initialScribbleScale);
  const [scribbleGuidanceStart, setScribbleGuidanceStart] = useState(initialScribbleGuidanceStart);
  const [scribbleGuidanceEnd, setScribbleGuidanceEnd] = useState(initialScribbleGuidanceEnd);
  const [poseScale, setPoseScale] = useState(initialPoseScale);
  const [poseGuidanceStart, setPoseGuidanceStart] = useState(initialPoseGuidanceStart);
  const [poseGuidanceEnd, setPoseGuidanceEnd] = useState(initialPoseGuidanceEnd);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [isAddingPoseImage, setIsAddingPoseImage] = useState(false);
  const editorSettingsRef = useRef({
    isMaskVisualizationEnabled: false,
    featherBrushSize: DEFAULT_FEATHER_BRUSH_SIZE,
    scribbleBrushSize: DEFAULT_SCRIBBLE_BRUSH_SIZE,
    scribblePreviewOpacity: DEFAULT_SCRIBBLE_PREVIEW_OPACITY,
    scribbleScale: initialScribbleScale,
    scribbleGuidanceStart: initialScribbleGuidanceStart,
    scribbleGuidanceEnd: initialScribbleGuidanceEnd,
    poseScale: initialPoseScale,
    poseGuidanceStart: initialPoseGuidanceStart,
    poseGuidanceEnd: initialPoseGuidanceEnd,
  });

  const isWorking = isLoadingSource || isAddingImage || isAddingPoseImage;
  const isReady = !isWorking && layersReady && width > 0 && height > 0;
  const canvasCursor = mode === 'openpose' && hasPoseImage
    ? dragState?.kind === 'pose'
      ? 'grabbing'
      : 'grab'
    : mode === 'feather' || mode === 'scribble'
    ? 'none'
    : mode === 'select' && selectionTool !== 'move' && !activeObject
      ? 'crosshair'
      : dragState?.kind === 'resize'
        ? getResizeCursor(dragState.handle)
        : dragState?.kind === 'rotate'
          ? 'grabbing'
          : dragState?.kind === 'move'
            ? 'move'
            : hoverResizeHandle
              ? getResizeCursor(hoverResizeHandle)
              : activeObject
                ? 'move'
                : 'default';

  const publishEditorState = useCallback(() => {
    const editorSettings = editorSettingsRef.current;
    onEditorStateChange?.({
      imageDataUrl: canvasToDataUrl(imageCanvasRef.current),
      maskDataUrl: canvasToDataUrl(maskCanvasRef.current),
      scribbleDataUrl: canvasToDataUrl(scribbleCanvasRef.current),
      poseImageDataUrl: canvasToDataUrl(poseSourceCanvasRef.current),
      poseOffsetX: poseSourceCanvasRef.current ? poseOffsetRef.current.x : null,
      poseOffsetY: poseSourceCanvasRef.current ? poseOffsetRef.current.y : null,
      poseZoom: poseSourceCanvasRef.current ? poseZoomRef.current : null,
      isMaskVisualizationEnabled: editorSettings.isMaskVisualizationEnabled,
      featherBrushSize: editorSettings.featherBrushSize,
      scribbleBrushSize: editorSettings.scribbleBrushSize,
      scribblePreviewOpacity: editorSettings.scribblePreviewOpacity,
      scribbleScale: editorSettings.scribbleScale,
      scribbleGuidanceStart: editorSettings.scribbleGuidanceStart,
      scribbleGuidanceEnd: editorSettings.scribbleGuidanceEnd,
      poseScale: editorSettings.poseScale,
      poseGuidanceStart: editorSettings.poseGuidanceStart,
      poseGuidanceEnd: editorSettings.poseGuidanceEnd,
    });
  }, [onEditorStateChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    publishEditorStateRef.current = publishEditorState;
  }, [publishEditorState]);

  function requestRedraw() {
    setRenderVersion((version) => version + 1);
  }

  function replaceActiveObject(nextObject: CanvasObject | null) {
    activeObjectRef.current = nextObject;
    setActiveObject(nextObject);
  }

  function replaceDragState(nextDragState: DragState | null) {
    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }

  function replaceDraftSelectionRect(nextRect: RectSelection | null) {
    draftSelectionRectRef.current = nextRect;
    setDraftSelectionRect(nextRect);
  }

  function replaceDraftSelectionLasso(nextPoints: Point[]) {
    draftSelectionLassoRef.current = nextPoints;
    setDraftSelectionLasso(nextPoints);
  }

  function replacePoseLayer(nextCanvas: HTMLCanvasElement | null, nextOffset: Point = { x: 0, y: 0 }, nextZoom = 1) {
    poseSourceCanvasRef.current = nextCanvas;
    const clampedZoom = clampNumber(nextZoom, MIN_POSE_ZOOM, MAX_POSE_ZOOM);
    const clampedOffset = nextCanvas
      ? clampCoverOffset(nextOffset, nextCanvas, width, height, clampedZoom)
      : { x: 0, y: 0 };
    poseOffsetRef.current = clampedOffset;
    poseZoomRef.current = nextCanvas ? clampedZoom : 1;
    setPoseOffset(clampedOffset);
    setPoseZoom(poseZoomRef.current);
    setHasPoseImage(Boolean(nextCanvas));
  }

  function pushImageHistory(canvas = imageCanvasRef.current) {
    if (!canvas) {
      return;
    }
    imageHistoryRef.current = pushCapped(imageHistoryRef.current, cloneCanvas(canvas));
    setImageHistoryCount(imageHistoryRef.current.length);
  }

  function pushMaskHistory(canvas = maskCanvasRef.current) {
    if (!canvas) {
      return;
    }
    maskHistoryRef.current = pushCapped(maskHistoryRef.current, cloneCanvas(canvas));
    setMaskHistoryCount(maskHistoryRef.current.length);
  }

  function pushScribbleHistory(canvas = scribbleCanvasRef.current) {
    if (!canvas) {
      return;
    }
    scribbleHistoryRef.current = pushCapped(scribbleHistoryRef.current, cloneCanvas(canvas));
    setScribbleHistoryCount(scribbleHistoryRef.current.length);
  }

  function refreshLayerFlags() {
    if (scribbleCanvasRef.current) {
      setHasScribbleEdits(!isCanvasSolidColor(scribbleCanvasRef.current, 255, 255, 255));
    }
  }

  function mergeActiveObject() {
    const object = activeObjectRef.current;
    const imageCanvas = imageCanvasRef.current;
    if (!object || !imageCanvas) {
      replaceActiveObject(null);
      return;
    }

    if (object.dirty) {
      pushImageHistory(imageCanvas);
      drawObject(get2dContext(imageCanvas), object);
      publishEditorState();
    }
    replaceActiveObject(null);
  }

  function clearDrafts() {
    replaceDraftSelectionRect(null);
    replaceDraftSelectionLasso([]);
  }

  function switchMode(nextMode: EditorMode) {
    if (nextMode !== mode) {
      mergeActiveObject();
      clearDrafts();
      replaceDragState(null);
      setHoverResizeHandle(null);
    }
    setMode(nextMode);
  }

  function changeSelectionTool(nextTool: SelectionTool) {
    if (nextTool !== selectionTool) {
      mergeActiveObject();
      replaceDraftSelectionRect(null);
      replaceDraftSelectionLasso([]);
      replaceDragState(null);
      setHoverResizeHandle(null);
    }
    setSelectionTool(nextTool);
  }

  useEffect(() => {
    initialEditorStateRef.current = initialEditorState;
  }, [initialEditorState]);

  useEffect(() => {
    onReadyChange?.(isReady);
  }, [isReady, onReadyChange]);

  useEffect(() => {
    editorSettingsRef.current = {
      isMaskVisualizationEnabled,
      featherBrushSize,
      scribbleBrushSize,
      scribblePreviewOpacity,
      scribbleScale,
      scribbleGuidanceStart,
      scribbleGuidanceEnd,
      poseScale,
      poseGuidanceStart,
      poseGuidanceEnd,
    };
    if (layersReady) {
      publishEditorState();
    }
  }, [
    featherBrushSize,
    isMaskVisualizationEnabled,
    layersReady,
    poseGuidanceEnd,
    poseGuidanceStart,
    poseScale,
    publishEditorState,
    scribbleBrushSize,
    scribbleGuidanceEnd,
    scribbleGuidanceStart,
    scribblePreviewOpacity,
    scribbleScale,
  ]);

  useEffect(() => {
    setScribbleScale(clampNumber(initialScribbleScale, CONTROL_SCALE_MIN, CONTROL_SCALE_MAX));
  }, [initialScribbleScale]);

  useEffect(() => {
    const nextStart = clampNumber(initialScribbleGuidanceStart, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX);
    const nextEnd = Math.max(nextStart, clampNumber(initialScribbleGuidanceEnd, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX));
    setScribbleGuidanceStart(nextStart);
    setScribbleGuidanceEnd(nextEnd);
  }, [initialScribbleGuidanceEnd, initialScribbleGuidanceStart]);

  useEffect(() => {
    setPoseScale(clampNumber(initialPoseScale, CONTROL_SCALE_MIN, CONTROL_SCALE_MAX));
  }, [initialPoseScale]);

  useEffect(() => {
    const nextStart = clampNumber(initialPoseGuidanceStart, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX);
    const nextEnd = Math.max(nextStart, clampNumber(initialPoseGuidanceEnd, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX));
    setPoseGuidanceStart(nextStart);
    setPoseGuidanceEnd(nextEnd);
  }, [initialPoseGuidanceEnd, initialPoseGuidanceStart]);

  useEffect(() => {
    let isCancelled = false;

    async function loadSourceImage() {
      setIsLoadingSource(true);
      setLayersReady(false);
      replaceActiveObject(null);
      replaceDragState(null);
      clearDrafts();
      setHoverPoint(null);
      setHoverResizeHandle(null);
      imageHistoryRef.current = [];
      maskHistoryRef.current = [];
      scribbleHistoryRef.current = [];
      replacePoseLayer(null);
      setImageHistoryCount(0);
      setMaskHistoryCount(0);
      setScribbleHistoryCount(0);
      onErrorRef.current?.(null);

      try {
        const nextImageCanvas = createBlankImageCanvas(width, height);
        const nextMaskCanvas = createDefaultMaskCanvas(width, height);
        const nextScribbleCanvas = createBlankScribbleCanvas(width, height);
        let nextPoseSourceCanvas: HTMLCanvasElement | null = null;
        let nextPoseOffset: Point = { x: 0, y: 0 };
        let nextPoseZoom = 1;
        const state = initialEditorStateRef.current;
        const hasExistingLayers = Boolean(
          imageCanvasRef.current
            && maskCanvasRef.current
            && scribbleCanvasRef.current,
        );
        const hasSavedMask = Boolean(state?.maskDataUrl);
        const shouldRestoreImageFromSnapshot = Boolean(
          state?.imageDataUrl && (!sourceImageUrl || !hasExistingLayers),
        );
        let autoMaskRect: ReturnType<typeof drawContainedBitmapToCanvas> | null = null;
        const restoredIsMaskVisualizationEnabled = state?.isMaskVisualizationEnabled ?? false;
        const restoredFeatherBrushSize = coerceNullableNumber(
          state?.featherBrushSize,
          DEFAULT_FEATHER_BRUSH_SIZE,
          FEATHER_BRUSH_MIN,
          FEATHER_BRUSH_MAX,
        );
        const restoredScribbleBrushSize = coerceNullableNumber(
          state?.scribbleBrushSize,
          DEFAULT_SCRIBBLE_BRUSH_SIZE,
          SCRIBBLE_BRUSH_MIN,
          SCRIBBLE_BRUSH_MAX,
        );
        const restoredScribblePreviewOpacity = coerceNullableNumber(
          state?.scribblePreviewOpacity,
          DEFAULT_SCRIBBLE_PREVIEW_OPACITY,
          SCRIBBLE_PREVIEW_OPACITY_MIN,
          SCRIBBLE_PREVIEW_OPACITY_MAX,
        );
        const restoredScribbleScale = coerceNullableNumber(
          state?.scribbleScale,
          initialScribbleScale,
          CONTROL_SCALE_MIN,
          CONTROL_SCALE_MAX,
        );
        const restoredScribbleGuidanceStart = coerceNullableNumber(
          state?.scribbleGuidanceStart,
          initialScribbleGuidanceStart,
          CONTROL_GUIDANCE_MIN,
          CONTROL_GUIDANCE_MAX,
        );
        const restoredScribbleGuidanceEnd = Math.max(
          restoredScribbleGuidanceStart,
          coerceNullableNumber(state?.scribbleGuidanceEnd, initialScribbleGuidanceEnd, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX),
        );
        const restoredPoseScale = coerceNullableNumber(
          state?.poseScale,
          initialPoseScale,
          CONTROL_SCALE_MIN,
          CONTROL_SCALE_MAX,
        );
        const restoredPoseGuidanceStart = coerceNullableNumber(
          state?.poseGuidanceStart,
          initialPoseGuidanceStart,
          CONTROL_GUIDANCE_MIN,
          CONTROL_GUIDANCE_MAX,
        );
        const restoredPoseGuidanceEnd = Math.max(
          restoredPoseGuidanceStart,
          coerceNullableNumber(state?.poseGuidanceEnd, initialPoseGuidanceEnd, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX),
        );

        editorSettingsRef.current = {
          isMaskVisualizationEnabled: restoredIsMaskVisualizationEnabled,
          featherBrushSize: restoredFeatherBrushSize,
          scribbleBrushSize: restoredScribbleBrushSize,
          scribblePreviewOpacity: restoredScribblePreviewOpacity,
          scribbleScale: restoredScribbleScale,
          scribbleGuidanceStart: restoredScribbleGuidanceStart,
          scribbleGuidanceEnd: restoredScribbleGuidanceEnd,
          poseScale: restoredPoseScale,
          poseGuidanceStart: restoredPoseGuidanceStart,
          poseGuidanceEnd: restoredPoseGuidanceEnd,
        };
        setIsMaskVisualizationEnabled(restoredIsMaskVisualizationEnabled);
        setFeatherBrushSize(restoredFeatherBrushSize);
        setScribbleBrushSize(restoredScribbleBrushSize);
        setScribblePreviewOpacity(restoredScribblePreviewOpacity);
        setScribbleScale(restoredScribbleScale);
        setScribbleGuidanceStart(restoredScribbleGuidanceStart);
        setScribbleGuidanceEnd(restoredScribbleGuidanceEnd);
        setPoseScale(restoredPoseScale);
        setPoseGuidanceStart(restoredPoseGuidanceStart);
        setPoseGuidanceEnd(restoredPoseGuidanceEnd);

        if (shouldRestoreImageFromSnapshot && state?.imageDataUrl) {
          await drawDataUrlToCanvas(state.imageDataUrl, nextImageCanvas);
        } else if (sourceImageUrl) {
          const bitmap = await createBitmapFromUrl(sourceImageUrl);
          try {
            if (isCancelled) {
              return;
            }
            const drawRect = drawContainedBitmapToCanvas(bitmap, nextImageCanvas);
            if (!hasSavedMask && hasDifferentAspectRatio(bitmap, width, height)) {
              autoMaskRect = drawRect;
            }
          } finally {
            try {
              bitmap.close();
            } catch {
              // Bitmap cleanup is best-effort.
            }
          }
        }

        // Saved mask state always wins; auto mask is only an initialization fallback.
        if (state?.maskDataUrl) {
          await drawDataUrlToCanvas(state.maskDataUrl, nextMaskCanvas);
        } else if (autoMaskRect) {
          const maskContext = get2dContext(nextMaskCanvas);
          maskContext.fillStyle = '#000000';
          maskContext.fillRect(
            autoMaskRect.x,
            autoMaskRect.y,
            autoMaskRect.width,
            autoMaskRect.height,
          );
        }
        if (state?.scribbleDataUrl) {
          await drawDataUrlToCanvas(state.scribbleDataUrl, nextScribbleCanvas);
        } else if (sourceScribbleUrl) {
          const scribbleBitmap = await createBitmapFromUrl(sourceScribbleUrl);
          try {
            if (isCancelled) {
              return;
            }
            get2dContext(nextScribbleCanvas).drawImage(
              scribbleBitmap,
              0,
              0,
              nextScribbleCanvas.width,
              nextScribbleCanvas.height,
            );
          } finally {
            try {
              scribbleBitmap.close();
            } catch {
              // Bitmap cleanup is best-effort.
            }
          }
        }
        if (state?.poseImageDataUrl) {
          const poseBitmap = await createBitmapFromDataUrl(state.poseImageDataUrl);
          try {
            const poseSourceCanvas = createCanvasFromBitmap(poseBitmap);
            nextPoseZoom = coerceNullableNumber(state?.poseZoom, 1, MIN_POSE_ZOOM, MAX_POSE_ZOOM);
            const centeredPoseOffset = getCenteredCoverOffset(poseSourceCanvas, width, height, nextPoseZoom);
            nextPoseSourceCanvas = poseSourceCanvas;
            nextPoseOffset = {
              x: state.poseOffsetX ?? centeredPoseOffset.x,
              y: state.poseOffsetY ?? centeredPoseOffset.y,
            };
          } finally {
            try {
              poseBitmap.close();
            } catch {
              // Bitmap cleanup is best-effort.
            }
          }
        } else if (sourcePoseUrl) {
          const poseBitmap = await createBitmapFromUrl(sourcePoseUrl);
          try {
            if (isCancelled) {
              return;
            }
            const poseSourceCanvas = createCanvasFromBitmap(poseBitmap);
            nextPoseSourceCanvas = poseSourceCanvas;
            nextPoseZoom = 1;
            nextPoseOffset = getCenteredCoverOffset(poseSourceCanvas, width, height, nextPoseZoom);
          } finally {
            try {
              poseBitmap.close();
            } catch {
              // Bitmap cleanup is best-effort.
            }
          }
        }

        if (!isCancelled) {
          imageCanvasRef.current = nextImageCanvas;
          maskCanvasRef.current = nextMaskCanvas;
          scribbleCanvasRef.current = nextScribbleCanvas;
          replacePoseLayer(nextPoseSourceCanvas, nextPoseOffset, nextPoseZoom);
          setLayersReady(true);
          refreshLayerFlags();
          requestRedraw();
          publishEditorStateRef.current();
        }
      } catch (error) {
        if (!isCancelled) {
          imageCanvasRef.current = createBlankImageCanvas(width, height);
          maskCanvasRef.current = createDefaultMaskCanvas(width, height);
          scribbleCanvasRef.current = createBlankScribbleCanvas(width, height);
          replacePoseLayer(null);
          setLayersReady(true);
          refreshLayerFlags();
          requestRedraw();
          publishEditorStateRef.current();
          onErrorRef.current?.(getErrorMessage(error));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSource(false);
        }
      }
    }

    void loadSourceImage();
    return () => {
      isCancelled = true;
    };
  }, [sourceImageUrl, sourcePoseUrl, sourceScribbleUrl, width, height]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    void renderVersion;

    const context = get2dContext(canvas);
    context.clearRect(0, 0, width, height);

    if (mode === 'openpose') {
      const poseCanvas = renderPoseConditionCanvas(poseSourceCanvasRef.current, poseOffset, poseZoom, width, height);
      if (poseCanvas) {
        context.drawImage(poseCanvas, 0, 0, width, height);
      } else {
        context.fillStyle = '#000000';
        context.fillRect(0, 0, width, height);
      }
      return;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    if (imageCanvasRef.current) {
      context.drawImage(imageCanvasRef.current, 0, 0, width, height);
    }

    if (activeObjectRef.current) {
      drawObject(context, activeObjectRef.current);
    }

    if (isMaskVisualizationEnabled) {
      drawWhiteMaskVisualization(context, width, height, maskCanvasRef.current);
    }

    drawScribblePreview(context, scribbleCanvasRef.current, scribblePreviewOpacity);

    const scale = getViewScale(canvas);
    if (mode === 'select') {
      drawSelectionPreview(context, draftSelectionRect, draftSelectionLasso, scale);
    }

    if (mode === 'feather' && hoverPoint) {
      context.save();
      context.strokeStyle = 'rgba(255, 244, 220, 0.96)';
      context.fillStyle = 'rgba(255, 226, 186, 0.12)';
      context.lineWidth = 2 * scale;
      context.setLineDash([6 * scale, 4 * scale]);
      context.beginPath();
      context.arc(hoverPoint.x, hoverPoint.y, featherBrushSize / 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }

    if (mode === 'scribble' && hoverPoint) {
      context.save();
      context.fillStyle = 'rgba(0, 0, 0, 0.08)';
      context.strokeStyle = 'rgba(255, 244, 220, 0.96)';
      context.lineWidth = 3 * scale;
      context.beginPath();
      context.arc(hoverPoint.x, hoverPoint.y, scribbleBrushSize / 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.strokeStyle = 'rgba(0, 0, 0, 0.72)';
      context.lineWidth = 1.5 * scale;
      context.beginPath();
      context.arc(hoverPoint.x, hoverPoint.y, scribbleBrushSize / 2, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    if (mode === 'select' && activeObjectRef.current) {
      drawObjectHandles(context, activeObjectRef.current, scale);
    }
  }, [
    draftSelectionLasso,
    draftSelectionRect,
    featherBrushSize,
    height,
    hoverPoint,
    isMaskVisualizationEnabled,
    mode,
    poseOffset,
    poseZoom,
    renderVersion,
    scribbleBrushSize,
    scribblePreviewOpacity,
    width,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  async function addImageBlob(imageBlob: Blob) {
    setIsAddingImage(true);
    onError?.(null);
    try {
      mergeActiveObject();
      const bitmap = await createImageBitmap(imageBlob);
      try {
        const nextObject = createObjectFromBitmap(bitmap, width, height);
        replaceActiveObject(nextObject);
        setMode('select');
        setSelectionTool('move');
        clearDrafts();
      } finally {
        try {
          bitmap.close();
        } catch {
          // Bitmap cleanup is best-effort.
        }
      }
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setIsAddingImage(false);
    }
  }

  async function addPoseImageBlob(imageBlob: Blob) {
    setIsAddingPoseImage(true);
    onError?.(null);
    try {
      mergeActiveObject();
      const bitmap = await createImageBitmap(imageBlob);
      try {
        const poseSourceCanvas = createCanvasFromBitmap(bitmap);
        replacePoseLayer(poseSourceCanvas, getCenteredCoverOffset(poseSourceCanvas, width, height, 1), 1);
        clearDrafts();
        requestRedraw();
        publishEditorState();
      } finally {
        try {
          bitmap.close();
        } catch {
          // Bitmap cleanup is best-effort.
        }
      }
    } catch (error) {
      onError?.(getErrorMessage(error));
    } finally {
      setIsAddingPoseImage(false);
    }
  }

  async function handlePaste(event: ReactClipboardEvent<HTMLElement>) {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (!file) {
      return;
    }
    event.preventDefault();
    if (mode === 'openpose') {
      await addPoseImageBlob(file);
      return;
    }
    await addImageBlob(file);
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    if (mode !== 'openpose') {
      return;
    }
    event.preventDefault();
    if (disabled || isGenerating || !isReady) {
      return;
    }

    const canvas = canvasRef.current;
    const poseCanvas = poseSourceCanvasRef.current;
    if (!canvas || !poseCanvas) {
      return;
    }

    const currentZoom = poseZoomRef.current;
    const nextZoom = clampNumber(
      currentZoom * Math.exp(-event.deltaY * 0.001),
      MIN_POSE_ZOOM,
      MAX_POSE_ZOOM,
    );
    if (nextZoom === currentZoom) {
      return;
    }

    const point = getCanvasWheelPoint(canvas, event, width, height);
    const currentOffset = poseOffsetRef.current;
    const currentSize = getCoverDrawSize(poseCanvas, width, height, currentZoom);
    const nextSize = getCoverDrawSize(poseCanvas, width, height, nextZoom);
    const sourceX = (point.x - currentOffset.x) / currentSize.width;
    const sourceY = (point.y - currentOffset.y) / currentSize.height;
    const nextOffset = clampCoverOffset(
      {
        x: point.x - sourceX * nextSize.width,
        y: point.y - sourceY * nextSize.height,
      },
      poseCanvas,
      width,
      height,
      nextZoom,
    );
    poseZoomRef.current = nextZoom;
    poseOffsetRef.current = nextOffset;
    setPoseZoom(nextZoom);
    setPoseOffset(nextOffset);
    requestRedraw();
    publishEditorState();
  }

  function finishSelection(selection: SelectionRegion) {
    const imageCanvas = imageCanvasRef.current;
    if (!imageCanvas) {
      return;
    }
    const nextObject = createObjectFromSelection(imageCanvas, selection);
    if (!nextObject) {
      return;
    }
    replaceActiveObject(nextObject);
    setSelectionTool('move');
  }

  function applyActiveObjectToMask(value: MaskPaintValue) {
    const object = activeObjectRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }

    pushMaskHistory(maskCanvas);
    if (object) {
      const isAllWhite = isCanvasSolidColor(maskCanvas, 255, 255, 255);
      const isAllBlack = isCanvasSolidColor(maskCanvas, 0, 0, 0);
      if (value === 'white' && isAllWhite) {
        fillWholeMask(maskCanvas, 'black');
      } else if (value === 'black' && isAllBlack) {
        fillWholeMask(maskCanvas, 'white');
      }
      fillMaskPath(maskCanvas, getObjectMaskPath(object), value);
    } else {
      fillWholeMask(maskCanvas, value);
    }
    setIsMaskVisualizationEnabled(true);
    refreshLayerFlags();
    requestRedraw();
    publishEditorState();
  }

  function setActiveObjectValue(updateObjectValue: (object: CanvasObject) => CanvasObject) {
    const object = activeObjectRef.current;
    if (!object) {
      return;
    }
    replaceActiveObject(updateObjectValue(object));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isGenerating || !isReady) {
      return;
    }

    const point = getCanvasPoint(canvas, event, width, height);
    setHoverPoint(point);
    canvas.setPointerCapture(event.pointerId);

    if (mode === 'openpose') {
      mergeActiveObject();
      if (poseSourceCanvasRef.current) {
        replaceDragState({
          kind: 'pose',
          start: point,
          originalOffset: poseOffsetRef.current,
        });
      }
      return;
    }

    if (mode === 'scribble') {
      mergeActiveObject();
      const scribbleCanvas = scribbleCanvasRef.current;
      if (!scribbleCanvas) {
        return;
      }
      pushScribbleHistory(scribbleCanvas);
      drawRoundStroke(scribbleCanvas, null, point, scribbleBrushSize, '#000000');
      setHasScribbleEdits(true);
      replaceDragState({ kind: 'scribble', lastPoint: point });
      requestRedraw();
      return;
    }

    if (mode === 'feather') {
      mergeActiveObject();
      const imageCanvas = imageCanvasRef.current;
      if (!imageCanvas) {
        return;
      }
      pushImageHistory(imageCanvas);
      applyFeatherStrokeToImage(imageCanvas, null, point, featherBrushSize);
      replaceDragState({ kind: 'feather', lastPoint: point });
      requestRedraw();
      return;
    }

    const object = activeObjectRef.current;
    if (object) {
      const scale = getViewScale(canvas);
      const rotatePointValue = getRotateHandlePosition(object);
      if (Math.hypot(point.x - rotatePointValue.x, point.y - rotatePointValue.y) <= 12 * scale) {
        replaceDragState({
          kind: 'rotate',
          startAngle: Math.atan2(point.y - object.y, point.x - object.x),
          original: objectSnapshot(object),
        });
        return;
      }

      const resizeHandle = findResizeHandle(point, object, 12 * scale);
      if (resizeHandle) {
        replaceDragState({
          kind: 'resize',
          handle: resizeHandle,
          original: objectSnapshot(object),
        });
        return;
      }

      if (isPointInObject(point, object)) {
        replaceDragState({
          kind: 'move',
          start: point,
          original: objectSnapshot(object),
        });
        return;
      }

      mergeActiveObject();
    }

    if (selectionTool === 'rect') {
      replaceDraftSelectionRect(getRectFromPoints(point, point));
      replaceDraftSelectionLasso([]);
      replaceDragState({ kind: 'select-rect', start: point });
    } else if (selectionTool === 'lasso') {
      replaceDraftSelectionRect(null);
      replaceDraftSelectionLasso([point]);
      replaceDragState({ kind: 'select-lasso' });
    } else {
      replaceDragState(null);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || disabled || isGenerating || !isReady) {
      return;
    }

    const point = getCanvasPoint(canvas, event, width, height);
    const currentDragState = dragStateRef.current;
    setHoverPoint(point);

    if (!currentDragState) {
      if (mode === 'select' && activeObjectRef.current) {
        setHoverResizeHandle(findResizeHandle(point, activeObjectRef.current, 12 * getViewScale(canvas)));
      } else {
        setHoverResizeHandle(null);
      }
      return;
    }

    if (currentDragState.kind === 'pose') {
      const poseCanvas = poseSourceCanvasRef.current;
      if (!poseCanvas) {
        return;
      }
      const nextOffset = clampCoverOffset(
        {
          x: currentDragState.originalOffset.x + point.x - currentDragState.start.x,
          y: currentDragState.originalOffset.y + point.y - currentDragState.start.y,
        },
        poseCanvas,
        width,
        height,
        poseZoomRef.current,
      );
      poseOffsetRef.current = nextOffset;
      setPoseOffset(nextOffset);
      requestRedraw();
      return;
    }

    if (currentDragState.kind === 'select-rect') {
      replaceDraftSelectionRect(getRectFromPoints(currentDragState.start, point));
      return;
    }

    if (currentDragState.kind === 'select-lasso') {
      replaceDraftSelectionLasso([...draftSelectionLassoRef.current, point]);
      return;
    }

    if (currentDragState.kind === 'scribble') {
      const scribbleCanvas = scribbleCanvasRef.current;
      if (!scribbleCanvas) {
        return;
      }
      drawRoundStroke(scribbleCanvas, currentDragState.lastPoint, point, scribbleBrushSize, '#000000');
      replaceDragState({ ...currentDragState, lastPoint: point });
      requestRedraw();
      return;
    }

    if (currentDragState.kind === 'feather') {
      const imageCanvas = imageCanvasRef.current;
      if (!imageCanvas) {
        return;
      }
      applyFeatherStrokeToImage(imageCanvas, currentDragState.lastPoint, point, featherBrushSize);
      replaceDragState({ ...currentDragState, lastPoint: point });
      requestRedraw();
      return;
    }

    if (currentDragState.kind === 'move') {
      setActiveObjectValue((object) => ({
        ...object,
        x: currentDragState.original.x + point.x - currentDragState.start.x,
        y: currentDragState.original.y + point.y - currentDragState.start.y,
        dirty: true,
      }));
      return;
    }

    if (currentDragState.kind === 'rotate') {
      const angle = Math.atan2(point.y - currentDragState.original.y, point.x - currentDragState.original.x);
      setActiveObjectValue((object) => ({
        ...object,
        rotation: currentDragState.original.rotation + angle - currentDragState.startAngle,
        dirty: true,
      }));
      return;
    }

    const localPoint = toObjectLocal(point, currentDragState.original);
    setActiveObjectValue((object) => {
      let nextWidth = currentDragState.original.width;
      let nextHeight = currentDragState.original.height;
      if (currentDragState.handle.includes('e') || currentDragState.handle.includes('w')) {
        nextWidth = Math.max(MIN_OBJECT_SIZE, Math.abs(localPoint.x) * 2);
      }
      if (currentDragState.handle.includes('n') || currentDragState.handle.includes('s')) {
        nextHeight = Math.max(MIN_OBJECT_SIZE, Math.abs(localPoint.y) * 2);
      }
      if (currentDragState.handle.length === 2) {
        const scale = Math.max(
          nextWidth / currentDragState.original.width,
          nextHeight / currentDragState.original.height,
        );
        nextWidth = Math.max(MIN_OBJECT_SIZE, currentDragState.original.width * scale);
        nextHeight = Math.max(MIN_OBJECT_SIZE, currentDragState.original.height * scale);
      }
      return {
        ...object,
        width: nextWidth,
        height: nextHeight,
        dirty: true,
      };
    });
  }

  function handlePointerLeave() {
    if (dragStateRef.current) {
      return;
    }
    setHoverPoint(null);
    setHoverResizeHandle(null);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const point = canvas ? getCanvasPoint(canvas, event, width, height) : null;
    const currentDragState = dragStateRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (currentDragState?.kind === 'select-rect') {
      const rect = point ? getRectFromPoints(currentDragState.start, point) : draftSelectionRectRef.current;
      if (rect && rect.width >= MIN_SELECTION_SIZE && rect.height >= MIN_SELECTION_SIZE) {
        finishSelection(rect);
      }
      replaceDraftSelectionRect(null);
    }

    if (currentDragState?.kind === 'select-lasso') {
      const points = point ? [...draftSelectionLassoRef.current, point] : draftSelectionLassoRef.current;
      if (points.length >= LASSO_MIN_POINTS) {
        finishSelection({ kind: 'lasso', points });
      }
      replaceDraftSelectionLasso([]);
    }

    if (currentDragState?.kind === 'feather') {
      publishEditorState();
    }

    if (currentDragState?.kind === 'scribble') {
      refreshLayerFlags();
      publishEditorState();
    }

    if (currentDragState?.kind === 'pose') {
      publishEditorState();
    }

    replaceDragState(null);
    setHoverResizeHandle(null);
  }

  function undoImage() {
    if (activeObjectRef.current) {
      return;
    }

    const previousCanvas = imageHistoryRef.current[imageHistoryRef.current.length - 1];
    if (!previousCanvas) {
      return;
    }
    imageHistoryRef.current = imageHistoryRef.current.slice(0, -1);
    setImageHistoryCount(imageHistoryRef.current.length);
    imageCanvasRef.current = cloneCanvas(previousCanvas);
    requestRedraw();
    publishEditorState();
  }

  function undoMask() {
    const previousCanvas = maskHistoryRef.current[maskHistoryRef.current.length - 1];
    if (!previousCanvas) {
      return;
    }
    maskHistoryRef.current = maskHistoryRef.current.slice(0, -1);
    setMaskHistoryCount(maskHistoryRef.current.length);
    maskCanvasRef.current = cloneCanvas(previousCanvas);
    setIsMaskVisualizationEnabled(true);
    refreshLayerFlags();
    requestRedraw();
    publishEditorState();
  }

  function undoScribble() {
    const previousCanvas = scribbleHistoryRef.current[scribbleHistoryRef.current.length - 1];
    if (!previousCanvas) {
      return;
    }
    scribbleHistoryRef.current = scribbleHistoryRef.current.slice(0, -1);
    setScribbleHistoryCount(scribbleHistoryRef.current.length);
    scribbleCanvasRef.current = cloneCanvas(previousCanvas);
    refreshLayerFlags();
    requestRedraw();
    publishEditorState();
  }

  function clearScribble() {
    const scribbleCanvas = scribbleCanvasRef.current;
    if (!scribbleCanvas) {
      return;
    }
    pushScribbleHistory(scribbleCanvas);
    const context = get2dContext(scribbleCanvas);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, scribbleCanvas.width, scribbleCanvas.height);
    setHasScribbleEdits(false);
    requestRedraw();
    publishEditorState();
  }

  function clearPoseImage() {
    replacePoseLayer(null);
    requestRedraw();
    publishEditorState();
  }

  function deleteActiveObject() {
    if (!activeObjectRef.current) {
      return;
    }
    replaceActiveObject(null);
    replaceDragState(null);
    setHoverResizeHandle(null);
  }

  function flipActiveObjectX() {
    if (!activeObjectRef.current) {
      return;
    }
    setActiveObjectValue((object) => ({
      ...object,
      flipX: !object.flipX,
      dirty: true,
    }));
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (disabled || isGenerating) {
      return;
    }

    if (event.key === 'Delete' && activeObjectRef.current) {
      event.preventDefault();
      deleteActiveObject();
      return;
    }

    if (event.key === 'Delete' && mode === 'openpose' && hasPoseImage) {
      event.preventDefault();
      clearPoseImage();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (mode === 'scribble') {
        undoScribble();
      } else {
        undoImage();
      }
    }
  }

  function updateScribbleGuidanceStart(value: number) {
    const nextValue = clampNumber(value, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX);
    setScribbleGuidanceStart(nextValue);
    setScribbleGuidanceEnd((currentEnd) => Math.max(currentEnd, nextValue));
  }

  function updateScribbleGuidanceEnd(value: number) {
    setScribbleGuidanceEnd(Math.max(scribbleGuidanceStart, clampNumber(value, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX)));
  }

  function updatePoseGuidanceStart(value: number) {
    const nextValue = clampNumber(value, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX);
    setPoseGuidanceStart(nextValue);
    setPoseGuidanceEnd((currentEnd) => Math.max(currentEnd, nextValue));
  }

  function updatePoseGuidanceEnd(value: number) {
    setPoseGuidanceEnd(Math.max(poseGuidanceStart, clampNumber(value, CONTROL_GUIDANCE_MIN, CONTROL_GUIDANCE_MAX)));
  }

  useImperativeHandle(ref, () => ({
    async renderImageAndMask() {
      if (!isReady || !imageCanvasRef.current || !maskCanvasRef.current || !scribbleCanvasRef.current) {
        throw new Error('이미지 편집기가 아직 준비되지 않았습니다.');
      }

      mergeActiveObject();
      const imageCanvas = cloneCanvas(imageCanvasRef.current);
      const maskCanvas = cloneCanvas(maskCanvasRef.current);
      const scribbleCanvas = cloneCanvas(scribbleCanvasRef.current);
      const poseCanvas = renderPoseConditionCanvas(
        poseSourceCanvasRef.current,
        poseOffsetRef.current,
        poseZoomRef.current,
        width,
        height,
      );
      const hasScribble = !isCanvasSolidColor(scribbleCanvas, 255, 255, 255);
      const hasPose = Boolean(poseCanvas);
      publishEditorState();
      return {
        image: await canvasToPngBlob(imageCanvas),
        mask: await canvasToPngBlob(maskCanvas),
        scribble: await canvasToPngBlob(scribbleCanvas),
        pose: poseCanvas ? await canvasToPngBlob(poseCanvas) : null,
        hasScribble,
        hasPose,
        controlSettings: {
          scribble_scale: scribbleScale,
          scribble_guidance_start: scribbleGuidanceStart,
          scribble_guidance_end: scribbleGuidanceEnd,
          pose_scale: poseScale,
          pose_guidance_start: poseGuidanceStart,
          pose_guidance_end: poseGuidanceEnd,
        },
      };
    },
  }), [
    height,
    isReady,
    poseGuidanceEnd,
    poseGuidanceStart,
    poseScale,
    publishEditorState,
    scribbleGuidanceEnd,
    scribbleGuidanceStart,
    scribbleScale,
    width,
  ]);

  return (
    <div className="space-y-2">
      <SceneImageInpaintToolbar
        mode={mode}
        selectionTool={selectionTool}
        disabled={disabled}
        isGenerating={isGenerating}
        isMaskVisualizationEnabled={isMaskVisualizationEnabled}
        hasActiveObject={Boolean(activeObject)}
        imageHistoryCount={imageHistoryCount}
        maskHistoryCount={maskHistoryCount}
        featherBrushSize={featherBrushSize}
        scribbleBrushSize={scribbleBrushSize}
        scribblePreviewOpacity={scribblePreviewOpacity}
        scribbleScale={scribbleScale}
        scribbleGuidanceStart={scribbleGuidanceStart}
        scribbleGuidanceEnd={scribbleGuidanceEnd}
        scribbleHistoryCount={scribbleHistoryCount}
        hasScribbleEdits={hasScribbleEdits}
        poseScale={poseScale}
        poseGuidanceStart={poseGuidanceStart}
        poseGuidanceEnd={poseGuidanceEnd}
        hasPoseImage={hasPoseImage}
        onModeChange={switchMode}
        onSelectionToolChange={changeSelectionTool}
        onToggleMaskVisualization={() => setIsMaskVisualizationEnabled((value) => !value)}
        onFlipActiveObjectX={flipActiveObjectX}
        onUndoImage={undoImage}
        onApplyActiveObjectToMask={applyActiveObjectToMask}
        onUndoMask={undoMask}
        onFeatherBrushSizeChange={setFeatherBrushSize}
        onScribbleBrushSizeChange={setScribbleBrushSize}
        onScribblePreviewOpacityChange={setScribblePreviewOpacity}
        onScribbleScaleChange={setScribbleScale}
        onScribbleGuidanceStartChange={updateScribbleGuidanceStart}
        onScribbleGuidanceEndChange={updateScribbleGuidanceEnd}
        onUndoScribble={undoScribble}
        onClearScribble={clearScribble}
        onPoseScaleChange={setPoseScale}
        onPoseGuidanceStartChange={updatePoseGuidanceStart}
        onPoseGuidanceEndChange={updatePoseGuidanceEnd}
        onClearPoseImage={clearPoseImage}
      />

      <ImageFrame
        className="relative mx-auto w-[min(100%,32rem)] rounded-[8px] border border-[rgba(255,218,228,0.22)] focus-within:ring-2 focus-within:ring-[rgba(255,226,186,0.55)] max-[960px]:w-[min(100%,28rem)]"
        onPaste={handlePaste}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          aria-label={altText || 'Scene inpaint image editor'}
          className="absolute inset-0 h-full w-full touch-none object-contain focus:outline-none"
          style={{ cursor: canvasCursor }}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onWheel={handleWheel}
        />

        {(isWorking || isGenerating) ? (
          <div className="absolute inset-0 grid place-items-center gap-3 bg-[rgba(7,1,12,0.54)] text-center text-[0.95rem] font-extrabold text-[#fff7ef]">
            <Spinner aria-hidden="true" />
            <span>{isGenerating ? '이미지 생성 중' : '이미지 준비 중'}</span>
          </div>
        ) : null}
      </ImageFrame>
    </div>
  );
});
