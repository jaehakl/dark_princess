import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { Button, Spinner } from '../ui';
import {
  DEFAULT_FEATHER_BRUSH_SIZE,
  DEFAULT_MASK_OPACITY,
  DEFAULT_SCRIBBLE_BRUSH_SIZE,
  DEFAULT_SCRIBBLE_OPACITY,
  MIN_OBJECT_SIZE,
} from './constants';
import {
  canvasToPngBlob,
  cloneCanvas,
  createCanvasFromBlob,
  createFilledCanvas,
  fetchImageBlob,
  get2dContext,
  getErrorMessage,
  isCanvasSolidColor,
  scaleCanvasTo,
} from './canvas';
import { createHistory, pushHistory, redoHistory, undoHistory } from './history';
import { ImageEditorStage } from './ImageEditorStage';
import { ImageLineageModal } from './ImageLineageModal';
import { ImageSearchModal } from './ImageSearchModal';
import { ImageEditorToolbar } from './ImageEditorToolbar';
import {
  clampCoverOffset,
  cloneImageSnapshot,
  createFeatherObject,
  createImageSnapshot,
  createObjectFromCanvas,
  createObjectFromSelection,
  drawMaskOverlay,
  drawObjectHandles,
  drawRoundStroke,
  drawScribbleOverlay,
  fillCanvas,
  fillRect,
  findResizeHandle,
  getCanvasPoint,
  getCenteredCoverOffset,
  getRectFromPoints,
  getResizeCursor,
  getRotateHandlePosition,
  getViewScale,
  isPointInObject,
  objectLocalPoint,
  renderBaseOnlyMask,
  renderImageLayer,
  renderPoseCanvas,
  replacePoseCanvas,
  resizeImageObjects,
  updatePoseZoom,
} from './layers';
import type {
  BaseImageLayer,
  CanvasSnapshot,
  DragState,
  EditorTab,
  ImageEditorProps,
  ImageLayerSnapshot,
  ImageObject,
  ImageTool,
  Point,
  PoseLayer,
  Rect,
  ResizeHandle,
} from './types';

const EMPTY_POSE: PoseLayer = {
  sourceUrl: null,
  blob: null,
  canvas: null,
  offset: { x: 0, y: 0 },
  zoom: 1,
  modified: false,
};

export function ImageEditor({
  parameters,
  promptColumns,
  imageId,
  baseImageUrl,
  scribbleImageUrl,
  poseImageUrl,
  disabled = false,
  isSubmitting = false,
  canGoPreviousImage = false,
  canGoNextImage = false,
  onParameterUpdated,
  onSubmit,
  onPreviousImage,
  onNextImage,
  onSelectLineageImage,
}: ImageEditorProps) {
  const width = parameters.width;
  const height = parameters.height;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<BaseImageLayer | null>(null);
  const objectsRef = useRef<ImageObject[]>([]);
  const activeObjectIdRef = useRef<string | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scribbleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceScribbleBlobRef = useRef<Blob | null>(null);
  const poseRef = useRef<PoseLayer>({ ...EMPTY_POSE });
  const dragStateRef = useRef<DragState | null>(null);
  const imageHistoryRef = useRef(createHistory<ImageLayerSnapshot>());
  const maskHistoryRef = useRef(createHistory<CanvasSnapshot>());
  const scribbleHistoryRef = useRef(createHistory<CanvasSnapshot>());
  const previousSizeRef = useRef({ width, height });

  const [tab, setTab] = useState<EditorTab>('image');
  const [tool, setTool] = useState<ImageTool>('select');
  const [renderVersion, setRenderVersion] = useState(0);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [maskSelectionRect, setMaskSelectionRect] = useState<Rect | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [hoverHandle, setHoverHandle] = useState<ResizeHandle | null>(null);
  const [maskOverlap, setMaskOverlap] = useState(false);
  const [scribbleOverlap, setScribbleOverlap] = useState(false);
  const [maskOpacity, setMaskOpacity] = useState(DEFAULT_MASK_OPACITY);
  const [scribbleOpacity, setScribbleOpacity] = useState(DEFAULT_SCRIBBLE_OPACITY);
  const [featherBrushSize, setFeatherBrushSize] = useState(DEFAULT_FEATHER_BRUSH_SIZE);
  const [scribbleBrushSize, setScribbleBrushSize] = useState(DEFAULT_SCRIBBLE_BRUSH_SIZE);
  const [scribbleModified, setScribbleModified] = useState(false);
  const [isLineageOpen, setIsLineageOpen] = useState(false);
  const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = disabled || isSubmitting || isLoadingSource;
  const activeObject = objectsRef.current.find((object) => object.id === activeObjectIdRef.current) ?? null;
  const hasImage = Boolean(baseImageRef.current || objectsRef.current.length > 0);
  const hasScribble = Boolean(scribbleCanvasRef.current && !isCanvasSolidColor(scribbleCanvasRef.current, 255, 255, 255));
  const hasPose = Boolean(poseRef.current.canvas);
  const canvasCursor = tab === 'pose' && hasPose
    ? dragStateRef.current?.kind === 'pose' ? 'grabbing' : 'grab'
    : tab === 'scribble' || (tab === 'image' && tool === 'feather')
      ? 'none'
      : tab === 'image' && tool === 'select'
        ? 'crosshair'
        : hoverHandle
          ? getResizeCursor(hoverHandle)
          : activeObject
            ? 'move'
            : 'default';

  const requestRender = useCallback(() => {
    setRenderVersion((version) => version + 1);
  }, []);

  const replaceBaseImage = useCallback((nextBaseImage: BaseImageLayer | null) => {
    baseImageRef.current = nextBaseImage;
    requestRender();
  }, [requestRender]);

  const replaceObjects = useCallback((nextObjects: ImageObject[], nextActiveObjectId = activeObjectIdRef.current) => {
    objectsRef.current = nextObjects;
    activeObjectIdRef.current = nextObjects.some((object) => object.id === nextActiveObjectId)
      ? nextActiveObjectId
      : null;
    requestRender();
  }, [requestRender]);

  const replacePose = useCallback((nextPose: PoseLayer) => {
    poseRef.current = nextPose;
    requestRender();
  }, [requestRender]);

  function currentImageSnapshot() {
    return createImageSnapshot(baseImageRef.current, objectsRef.current, activeObjectIdRef.current);
  }

  function restoreImageSnapshot(snapshot: ImageLayerSnapshot) {
    const nextSnapshot = cloneImageSnapshot(snapshot);
    baseImageRef.current = nextSnapshot.baseImage;
    objectsRef.current = nextSnapshot.objects;
    activeObjectIdRef.current = nextSnapshot.activeObjectId;
    setSelectionRect(null);
    requestRender();
  }

  function pushImageHistory() {
    pushHistory(imageHistoryRef.current, currentImageSnapshot());
  }

  function pushMaskHistorySnapshot() {
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      pushHistory(maskHistoryRef.current, cloneCanvas(maskCanvas));
    }
  }

  function pushScribbleHistorySnapshot() {
    const scribbleCanvas = scribbleCanvasRef.current;
    if (scribbleCanvas) {
      pushHistory(scribbleHistoryRef.current, cloneCanvas(scribbleCanvas));
    }
  }

  function updateParameters(patch: Partial<typeof parameters>) {
    onParameterUpdated({ ...parameters, ...patch });
  }

  useEffect(() => {
    if (!maskCanvasRef.current) {
      maskCanvasRef.current = createFilledCanvas(width, height, '#ffffff');
    }
    if (!scribbleCanvasRef.current) {
      scribbleCanvasRef.current = createFilledCanvas(width, height, '#ffffff');
    }
  }, [height, width]);

  useEffect(() => {
    const previousSize = previousSizeRef.current;
    if (previousSize.width === width && previousSize.height === height) {
      return;
    }
    const scaleX = width / previousSize.width;
    const scaleY = height / previousSize.height;
    if (maskCanvasRef.current) {
      maskCanvasRef.current = scaleCanvasTo(maskCanvasRef.current, width, height, '#ffffff');
    }
    if (scribbleCanvasRef.current) {
      scribbleCanvasRef.current = scaleCanvasTo(scribbleCanvasRef.current, width, height, '#ffffff');
    }
    objectsRef.current = resizeImageObjects(objectsRef.current, scaleX, scaleY);
    if (poseRef.current.canvas) {
      poseRef.current = {
        ...poseRef.current,
        offset: getCenteredCoverOffset(poseRef.current.canvas, width, height, poseRef.current.zoom),
      };
    }
    previousSizeRef.current = { width, height };
    requestRender();
  }, [height, requestRender, width]);

  useEffect(() => {
    let isCancelled = false;

    async function loadBaseImage() {
      if ((baseImageRef.current?.sourceUrl ?? null) === (baseImageUrl ?? null)) {
        return;
      }
      setIsLoadingSource(true);
      setError(null);
      try {
        if (!baseImageUrl) {
          if (!isCancelled) {
            replaceBaseImage(null);
            replaceObjects([], null);
          }
          return;
        }
        const blob = await fetchImageBlob(baseImageUrl);
        const canvas = await createCanvasFromBlob(blob);
        if (!isCancelled) {
          replaceBaseImage({ sourceUrl: baseImageUrl, blob, canvas });
          replaceObjects([], null);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSource(false);
        }
      }
    }

    void loadBaseImage();
    return () => {
      isCancelled = true;
    };
  }, [baseImageUrl, replaceBaseImage, replaceObjects]);

  useEffect(() => {
    let isCancelled = false;

    async function loadScribbleImage() {
      setIsLoadingSource(true);
      setError(null);
      try {
        if (!scribbleImageUrl) {
          sourceScribbleBlobRef.current = null;
          if (!isCancelled) {
            scribbleCanvasRef.current = createFilledCanvas(width, height, '#ffffff');
            setScribbleModified(false);
            requestRender();
          }
          return;
        }
        const blob = await fetchImageBlob(scribbleImageUrl);
        const sourceCanvas = await createCanvasFromBlob(blob);
        if (!isCancelled) {
          sourceScribbleBlobRef.current = blob;
          scribbleCanvasRef.current = createFilledCanvas(width, height, '#ffffff');
          get2dContext(scribbleCanvasRef.current).drawImage(sourceCanvas, 0, 0, width, height);
          setScribbleModified(false);
          requestRender();
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSource(false);
        }
      }
    }

    void loadScribbleImage();
    return () => {
      isCancelled = true;
    };
  }, [height, requestRender, scribbleImageUrl, width]);

  useEffect(() => {
    let isCancelled = false;

    async function loadPoseImage() {
      setIsLoadingSource(true);
      setError(null);
      try {
        if (!poseImageUrl) {
          if (!isCancelled) {
            replacePose({ ...EMPTY_POSE });
          }
          return;
        }
        const blob = await fetchImageBlob(poseImageUrl);
        const canvas = await createCanvasFromBlob(blob);
        if (!isCancelled) {
          replacePose(replacePoseCanvas(poseRef.current, canvas, blob, poseImageUrl, width, height));
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSource(false);
        }
      }
    }

    void loadPoseImage();
    return () => {
      isCancelled = true;
    };
  }, [height, poseImageUrl, replacePose, width]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    void renderVersion;
    const context = get2dContext(canvas);
    context.clearRect(0, 0, width, height);

    if (tab === 'pose') {
      const poseCanvas = renderPoseCanvas(poseRef.current, width, height);
      if (poseCanvas) {
        context.drawImage(poseCanvas, 0, 0);
      } else {
        context.fillStyle = '#000000';
        context.fillRect(0, 0, width, height);
      }
      return;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    const imageCanvas = renderImageLayer(width, height, baseImageRef.current, objectsRef.current);
    context.drawImage(imageCanvas, 0, 0);

    if ((tab === 'image' && maskOverlap) || tab === 'mask') {
      drawMaskOverlay(context, maskCanvasRef.current, maskOpacity);
    }
    if ((tab === 'image' && scribbleOverlap) || tab === 'scribble') {
      drawScribbleOverlay(context, scribbleCanvasRef.current, scribbleOpacity);
    }

    const viewScale = getViewScale(canvas, width, height);
    const selection = draftRect ?? (tab === 'mask' ? maskSelectionRect : selectionRect);
    if ((tab === 'image' && tool === 'select') || tab === 'mask') {
      if (selection) {
        context.save();
        context.strokeStyle = 'rgba(255,244,220,0.98)';
        context.fillStyle = 'rgba(255,226,186,0.16)';
        context.lineWidth = 2 * viewScale;
        context.setLineDash([8 * viewScale, 5 * viewScale]);
        context.strokeRect(selection.x, selection.y, selection.width, selection.height);
        context.fillRect(selection.x, selection.y, selection.width, selection.height);
        context.restore();
      }
    }

    if (tab === 'image' && activeObject && tool === 'object') {
      drawObjectHandles(context, activeObject, viewScale);
    }
    if (hoverPoint && tab === 'scribble') {
      context.save();
      context.strokeStyle = 'rgba(255,244,220,0.96)';
      context.fillStyle = 'rgba(0,0,0,0.08)';
      context.lineWidth = 2 * viewScale;
      context.beginPath();
      context.arc(hoverPoint.x, hoverPoint.y, scribbleBrushSize / 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }
    if (hoverPoint && tab === 'image' && tool === 'feather') {
      context.save();
      context.strokeStyle = 'rgba(255,244,220,0.96)';
      context.fillStyle = 'rgba(255,226,186,0.12)';
      context.lineWidth = 2 * viewScale;
      context.beginPath();
      context.arc(hoverPoint.x, hoverPoint.y, featherBrushSize / 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }
  }, [
    activeObject,
    draftRect,
    featherBrushSize,
    height,
    hoverPoint,
    maskOpacity,
    maskOverlap,
    maskSelectionRect,
    renderVersion,
    scribbleBrushSize,
    scribbleOpacity,
    scribbleOverlap,
    selectionRect,
    tab,
    tool,
    width,
  ]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  async function addImageObject(blob: Blob) {
    pushImageHistory();
    const canvas = await createCanvasFromBlob(blob);
    const nextObject = createObjectFromCanvas(canvas, width, height);
    replaceObjects([...objectsRef.current, nextObject], nextObject.id);
    setTab('image');
    setTool('object');
    setSelectionRect(null);
  }

  async function replacePoseFromBlob(blob: Blob) {
    const canvas = await createCanvasFromBlob(blob);
    replacePose({
      ...replacePoseCanvas(poseRef.current, canvas, blob, null, width, height),
      modified: true,
    });
  }

  async function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    const item = Array.from(event.clipboardData.items).find((clipboardItem) => clipboardItem.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file || isDisabled) {
      return;
    }
    event.preventDefault();
    try {
      setError(null);
      if (tab === 'pose') {
        await replacePoseFromBlob(file);
      } else {
        await addImageObject(file);
      }
    } catch (pasteError) {
      setError(getErrorMessage(pasteError));
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || isDisabled) {
      return;
    }
    const point = getCanvasPoint(canvas, event, width, height);
    setHoverPoint(point);
    canvas.setPointerCapture(event.pointerId);

    if (tab === 'pose') {
      if (poseRef.current.canvas) {
        dragStateRef.current = { kind: 'pose', start: point, originalOffset: poseRef.current.offset };
      }
      return;
    }

    if (tab === 'scribble') {
      const scribbleCanvas = scribbleCanvasRef.current;
      if (!scribbleCanvas) {
        return;
      }
      pushScribbleHistorySnapshot();
      drawRoundStroke(scribbleCanvas, null, point, scribbleBrushSize, '#000000');
      setScribbleModified(true);
      dragStateRef.current = { kind: 'scribble', lastPoint: point };
      requestRender();
      return;
    }

    if (tab === 'mask') {
      setDraftRect(getRectFromPoints(point, point));
      dragStateRef.current = { kind: 'mask-select', start: point };
      return;
    }

    if (tool === 'feather') {
      pushImageHistory();
      dragStateRef.current = { kind: 'feather', points: [point] };
      requestRender();
      return;
    }

    if (tool === 'select') {
      setDraftRect(getRectFromPoints(point, point));
      dragStateRef.current = { kind: 'select', start: point };
      return;
    }

    const viewScale = getViewScale(canvas, width, height);
    const clickedObject = [...objectsRef.current].reverse().find((object) => isPointInObject(point, object));
    if (!clickedObject) {
      activeObjectIdRef.current = null;
      setHoverHandle(null);
      requestRender();
      return;
    }
    activeObjectIdRef.current = clickedObject.id;
    pushImageHistory();
    const rotateHandle = getRotateHandlePosition(clickedObject);
    const resizeHandle = findResizeHandle(point, clickedObject, 12 * viewScale);
    if (Math.hypot(point.x - rotateHandle.x, point.y - rotateHandle.y) <= 12 * viewScale) {
      dragStateRef.current = {
        kind: 'rotate',
        startAngle: Math.atan2(point.y - clickedObject.y, point.x - clickedObject.x),
        object: { ...clickedObject, canvas: cloneCanvas(clickedObject.canvas) },
      };
    } else if (resizeHandle) {
      dragStateRef.current = {
        kind: 'resize',
        start: point,
        handle: resizeHandle,
        object: { ...clickedObject, canvas: cloneCanvas(clickedObject.canvas) },
      };
    } else {
      dragStateRef.current = {
        kind: 'move',
        start: point,
        object: { ...clickedObject, canvas: cloneCanvas(clickedObject.canvas) },
      };
    }
    requestRender();
  }

  function updateActiveObject(update: (object: ImageObject) => ImageObject) {
    const activeId = activeObjectIdRef.current;
    if (!activeId) {
      return;
    }
    replaceObjects(objectsRef.current.map((object) => (
      object.id === activeId ? update(object) : object
    )), activeId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || isDisabled) {
      return;
    }
    const point = getCanvasPoint(canvas, event, width, height);
    setHoverPoint(point);
    const dragState = dragStateRef.current;
    if (!dragState) {
      if (tab === 'image' && tool === 'object' && activeObject) {
        setHoverHandle(findResizeHandle(point, activeObject, 12 * getViewScale(canvas, width, height)));
      }
      return;
    }

    if (dragState.kind === 'select' || dragState.kind === 'mask-select') {
      setDraftRect(getRectFromPoints(dragState.start, point));
      return;
    }

    if (dragState.kind === 'scribble') {
      const scribbleCanvas = scribbleCanvasRef.current;
      if (!scribbleCanvas) {
        return;
      }
      drawRoundStroke(scribbleCanvas, dragState.lastPoint, point, scribbleBrushSize, '#000000');
      dragStateRef.current = { ...dragState, lastPoint: point };
      requestRender();
      return;
    }

    if (dragState.kind === 'feather') {
      dragStateRef.current = { ...dragState, points: [...dragState.points, point] };
      requestRender();
      return;
    }

    if (dragState.kind === 'pose') {
      const pose = poseRef.current;
      if (!pose.canvas) {
        return;
      }
      replacePose({
        ...pose,
        offset: clampCoverOffset(
          {
            x: dragState.originalOffset.x + point.x - dragState.start.x,
            y: dragState.originalOffset.y + point.y - dragState.start.y,
          },
          pose.canvas,
          width,
          height,
          pose.zoom,
        ),
        modified: true,
      });
      return;
    }

    if (dragState.kind === 'move') {
      updateActiveObject((object) => ({
        ...object,
        x: dragState.object.x + point.x - dragState.start.x,
        y: dragState.object.y + point.y - dragState.start.y,
      }));
      return;
    }

    if (dragState.kind === 'rotate') {
      updateActiveObject((object) => ({
        ...object,
        rotation: dragState.object.rotation
          + Math.atan2(point.y - dragState.object.y, point.x - dragState.object.x)
          - dragState.startAngle,
      }));
      return;
    }

    const localPoint = objectLocalPoint(point, dragState.object);
    updateActiveObject((object) => {
      let nextWidth = dragState.object.width;
      let nextHeight = dragState.object.height;
      if (dragState.handle.includes('e') || dragState.handle.includes('w')) {
        nextWidth = Math.max(MIN_OBJECT_SIZE, Math.abs(localPoint.x) * 2);
      }
      if (dragState.handle.includes('n') || dragState.handle.includes('s')) {
        nextHeight = Math.max(MIN_OBJECT_SIZE, Math.abs(localPoint.y) * 2);
      }
      if (dragState.handle.length === 2) {
        const scale = Math.max(nextWidth / dragState.object.width, nextHeight / dragState.object.height);
        nextWidth = Math.max(MIN_OBJECT_SIZE, dragState.object.width * scale);
        nextHeight = Math.max(MIN_OBJECT_SIZE, dragState.object.height * scale);
      }
      return { ...object, width: nextWidth, height: nextHeight };
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    const dragState = dragStateRef.current;
    if (dragState?.kind === 'select' && draftRect) {
      setSelectionRect(draftRect);
    }
    if (dragState?.kind === 'mask-select' && draftRect) {
      setMaskSelectionRect(draftRect);
    }
    if (dragState?.kind === 'feather') {
      const imageCanvas = renderImageLayer(width, height, baseImageRef.current, objectsRef.current);
      const featherObject = createFeatherObject(imageCanvas, dragState.points, featherBrushSize);
      if (featherObject) {
        replaceObjects([...objectsRef.current, featherObject], featherObject.id);
        setTool('object');
      }
    }
    dragStateRef.current = null;
    setDraftRect(null);
    setHoverHandle(null);
    requestRender();
  }

  function handlePointerLeave() {
    if (!dragStateRef.current) {
      setHoverPoint(null);
      setHoverHandle(null);
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    if (tab !== 'pose' || isDisabled) {
      return;
    }
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const point = getCanvasPoint(canvas, event, width, height);
    replacePose(updatePoseZoom(poseRef.current, point, event.deltaY, width, height));
  }

  async function copyCanvasToClipboard(canvas: HTMLCanvasElement) {
    const blob = await canvasToPngBlob(canvas);
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
  }

  async function copySelectionOrObject() {
    if (activeObject && tab === 'image' && tool === 'object') {
      await copyCanvasToClipboard(activeObject.canvas);
      return;
    }
    if (selectionRect) {
      const imageCanvas = renderImageLayer(width, height, baseImageRef.current, objectsRef.current);
      const selectedObject = createObjectFromSelection(imageCanvas, selectionRect);
      if (selectedObject) {
        await copyCanvasToClipboard(selectedObject.canvas);
      }
    }
  }

  function deleteActiveObject() {
    const activeId = activeObjectIdRef.current;
    if (!activeId) {
      return;
    }
    pushImageHistory();
    replaceObjects(objectsRef.current.filter((object) => object.id !== activeId), null);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (isDisabled) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void copySelectionOrObject().catch((copyError) => setError(getErrorMessage(copyError)));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redoActiveTab();
      } else {
        undoActiveTab();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redoActiveTab();
      return;
    }
    if (event.key === 'Delete' && tab === 'image' && activeObject) {
      event.preventDefault();
      deleteActiveObject();
      return;
    }
    if (event.key === 'Delete' && tab === 'mask' && maskSelectionRect) {
      event.preventDefault();
      applyMaskSelection('black');
      return;
    }
    if (event.key === 'Enter' && tab === 'mask' && maskSelectionRect) {
      event.preventDefault();
      applyMaskSelection('white');
      return;
    }
    if (event.key === 'Delete' && tab === 'pose' && hasPose) {
      event.preventDefault();
      clearPose();
    }
  }

  function undoActiveTab() {
    if (tab === 'image') {
      const previous = undoHistory(imageHistoryRef.current, currentImageSnapshot());
      if (previous) {
        restoreImageSnapshot(previous);
      }
      return;
    }
    if (tab === 'mask' && maskCanvasRef.current) {
      const previous = undoHistory(maskHistoryRef.current, cloneCanvas(maskCanvasRef.current));
      if (previous) {
        maskCanvasRef.current = cloneCanvas(previous);
        requestRender();
      }
      return;
    }
    if (tab === 'scribble' && scribbleCanvasRef.current) {
      const previous = undoHistory(scribbleHistoryRef.current, cloneCanvas(scribbleCanvasRef.current));
      if (previous) {
        scribbleCanvasRef.current = cloneCanvas(previous);
        setScribbleModified(true);
        requestRender();
      }
    }
  }

  function redoActiveTab() {
    if (tab === 'image') {
      const next = redoHistory(imageHistoryRef.current, currentImageSnapshot());
      if (next) {
        restoreImageSnapshot(next);
      }
      return;
    }
    if (tab === 'mask' && maskCanvasRef.current) {
      const next = redoHistory(maskHistoryRef.current, cloneCanvas(maskCanvasRef.current));
      if (next) {
        maskCanvasRef.current = cloneCanvas(next);
        requestRender();
      }
      return;
    }
    if (tab === 'scribble' && scribbleCanvasRef.current) {
      const next = redoHistory(scribbleHistoryRef.current, cloneCanvas(scribbleCanvasRef.current));
      if (next) {
        scribbleCanvasRef.current = cloneCanvas(next);
        setScribbleModified(true);
        requestRender();
      }
    }
  }

  function clearImage() {
    pushImageHistory();
    replaceBaseImage(null);
    replaceObjects([], null);
  }

  function flipActiveObject() {
    if (!activeObject) {
      return;
    }
    pushImageHistory();
    updateActiveObject((object) => ({ ...object, flipX: !object.flipX }));
  }

  function replaceMask(nextCanvas: HTMLCanvasElement) {
    maskCanvasRef.current = nextCanvas;
    requestRender();
  }

  function applyMaskSelection(color: 'black' | 'white') {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }
    pushMaskHistorySnapshot();
    fillRect(maskCanvas, maskSelectionRect ?? { x: 0, y: 0, width, height }, color === 'black' ? '#000000' : '#ffffff');
    requestRender();
  }

  function applyMaskAll(color: 'black' | 'white') {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) {
      return;
    }
    pushMaskHistorySnapshot();
    fillCanvas(maskCanvas, color === 'black' ? '#000000' : '#ffffff');
    requestRender();
  }

  function applyBaseOnlyMask() {
    pushMaskHistorySnapshot();
    replaceMask(renderBaseOnlyMask(width, height, baseImageRef.current));
  }

  function clearScribble() {
    const scribbleCanvas = scribbleCanvasRef.current;
    if (!scribbleCanvas) {
      return;
    }
    pushScribbleHistorySnapshot();
    fillCanvas(scribbleCanvas, '#ffffff');
    setScribbleModified(true);
    requestRender();
  }

  function clearPose() {
    replacePose({ ...EMPTY_POSE, modified: true });
  }

  async function createSubmitPayload() {
    const imageCanvas = hasImage
      ? renderImageLayer(width, height, baseImageRef.current, objectsRef.current)
      : null;
    const maskCanvas = maskCanvasRef.current;
    const scribbleCanvas = scribbleCanvasRef.current;
    const poseCanvas = renderPoseCanvas(poseRef.current, width, height);
    const imageBlob = imageCanvas ? await canvasToPngBlob(imageCanvas) : null;
    const maskBlob = maskCanvas && !isCanvasSolidColor(maskCanvas, 255, 255, 255)
      ? await canvasToPngBlob(maskCanvas)
      : null;

    if (!imageBlob && maskBlob) {
      throw new Error('mask를 사용하려면 image가 필요합니다.');
    }

    const scribbleBlob = scribbleCanvas && !isCanvasSolidColor(scribbleCanvas, 255, 255, 255)
      ? scribbleModified || !sourceScribbleBlobRef.current
        ? await canvasToPngBlob(scribbleCanvas)
        : sourceScribbleBlobRef.current
      : null;
    const poseBlob = poseCanvas && !isCanvasSolidColor(poseCanvas, 0, 0, 0)
      ? poseRef.current.modified || !poseRef.current.blob
        ? await canvasToPngBlob(poseCanvas)
        : poseRef.current.blob
      : null;

    return {
      parameters,
      promptColumns,
      image: imageBlob,
      mask: maskBlob,
      scribbleImage: scribbleBlob,
      poseImage: poseBlob,
    };
  }

  async function submit() {
    if (isDisabled) {
      return;
    }
    setError(null);
    try {
      await onSubmit(await createSubmitPayload());
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  }

  return (
    <div className="space-y-3">
      <ImageEditorToolbar
        tab={tab}
        tool={tool}
        disabled={isDisabled}
        canUndo={
          tab === 'image'
            ? imageHistoryRef.current.past.length > 0
            : tab === 'mask'
              ? maskHistoryRef.current.past.length > 0
              : scribbleHistoryRef.current.past.length > 0
        }
        canRedo={
          tab === 'image'
            ? imageHistoryRef.current.future.length > 0
            : tab === 'mask'
              ? maskHistoryRef.current.future.length > 0
              : scribbleHistoryRef.current.future.length > 0
        }
        imageId={imageId}
        canGoPreviousImage={canGoPreviousImage}
        canGoNextImage={canGoNextImage}
        canOpenLineage={Boolean(imageId && onSelectLineageImage)}
        canOpenImageSearch={Boolean(onSelectLineageImage)}
        hasActiveObject={Boolean(activeObject)}
        hasBaseImage={hasImage}
        hasScribble={hasScribble}
        hasPose={hasPose}
        maskOpacity={maskOpacity}
        scribbleOpacity={scribbleOpacity}
        featherBrushSize={featherBrushSize}
        scribbleBrushSize={scribbleBrushSize}
        scribbleScale={parameters.scribble_scale}
        scribbleGuidanceStart={parameters.scribble_guidance_start}
        scribbleGuidanceEnd={parameters.scribble_guidance_end}
        poseScale={parameters.pose_scale}
        poseGuidanceStart={parameters.pose_guidance_start}
        poseGuidanceEnd={parameters.pose_guidance_end}
        maskOverlap={maskOverlap}
        scribbleOverlap={scribbleOverlap}
        width={width}
        height={height}
        onResolutionChange={(nextWidth, nextHeight) => updateParameters({ width: nextWidth, height: nextHeight })}
        onTabChange={setTab}
        onToolChange={setTool}
        onUndo={undoActiveTab}
        onRedo={redoActiveTab}
        onPreviousImage={() => onPreviousImage?.()}
        onNextImage={() => onNextImage?.()}
        onOpenLineage={() => setIsLineageOpen(true)}
        onOpenImageSearch={() => setIsImageSearchOpen(true)}
        onFlip={flipActiveObject}
        onClearImage={clearImage}
        onToggleMaskOverlap={() => setMaskOverlap((current) => !current)}
        onToggleScribbleOverlap={() => setScribbleOverlap((current) => !current)}
        onMaskOpacityChange={setMaskOpacity}
        onMaskBaseBlack={applyBaseOnlyMask}
        onMaskSelection={applyMaskSelection}
        onMaskAll={applyMaskAll}
        onScribbleOpacityChange={setScribbleOpacity}
        onFeatherBrushSizeChange={setFeatherBrushSize}
        onScribbleBrushSizeChange={setScribbleBrushSize}
        onScribbleScaleChange={(value) => updateParameters({ scribble_scale: value })}
        onScribbleGuidanceStartChange={(value) => updateParameters({
          scribble_guidance_start: value,
          scribble_guidance_end: Math.max(value, parameters.scribble_guidance_end),
        })}
        onScribbleGuidanceEndChange={(value) => updateParameters({
          scribble_guidance_end: Math.max(parameters.scribble_guidance_start, value),
        })}
        onClearScribble={clearScribble}
        onPoseScaleChange={(value) => updateParameters({ pose_scale: value })}
        onPoseGuidanceStartChange={(value) => updateParameters({
          pose_guidance_start: value,
          pose_guidance_end: Math.max(value, parameters.pose_guidance_end),
        })}
        onPoseGuidanceEndChange={(value) => updateParameters({
          pose_guidance_end: Math.max(parameters.pose_guidance_start, value),
        })}
        onClearPose={clearPose}
      />

      <ImageEditorStage
        width={width}
        height={height}
        canvasRef={canvasRef}
        cursor={canvasCursor}
        label="Image generator canvas"
        onPaste={handlePaste}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
      />

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {isLoadingSource ? (
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
              <Spinner aria-hidden="true" />
              이미지 레이어를 불러오는 중
            </span>
          ) : null}
          {error ? <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p> : null}
        </div>
        <Button
          variant="primary"
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm"
          onClick={() => void submit()}
          disabled={isDisabled}
        >
          {isSubmitting ? <Spinner aria-hidden="true" /> : null}
          이미지 생성 저장
        </Button>
      </div>

      {isLineageOpen && imageId && onSelectLineageImage ? (
        <ImageLineageModal
          currentImageId={imageId}
          onClose={() => setIsLineageOpen(false)}
          onSelectImage={onSelectLineageImage}
        />
      ) : null}

      {isImageSearchOpen && onSelectLineageImage ? (
        <ImageSearchModal
          currentImageId={imageId}
          onClose={() => setIsImageSearchOpen(false)}
          onSelectImage={onSelectLineageImage}
        />
      ) : null}
    </div>
  );
}
