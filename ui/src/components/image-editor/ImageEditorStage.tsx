import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { cx } from '../ui';

type ImageEditorStageProps = {
  width: number;
  height: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursor: string;
  poseFrame?: boolean;
  label: string;
  onPaste: (event: ReactClipboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onWheel: (event: ReactWheelEvent<HTMLCanvasElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLCanvasElement>) => void;
};

export function ImageEditorStage({
  width,
  height,
  canvasRef,
  cursor,
  poseFrame = false,
  label,
  onPaste,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onWheel,
  onKeyDown,
}: ImageEditorStageProps) {
  return (
    <div
      className={cx(
        'relative mx-auto grid w-full max-w-[34rem] place-items-center overflow-hidden rounded-[8px] border border-[rgba(255,218,228,0.22)] bg-black focus-within:ring-2 focus-within:ring-[rgba(255,226,186,0.55)]',
        poseFrame ? 'aspect-[var(--image-editor-aspect)]' : 'aspect-square',
      )}
      style={poseFrame ? { '--image-editor-aspect': `${width} / ${height}` } as React.CSSProperties : undefined}
      onPaste={onPaste}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        aria-label={label}
        className="h-full w-full touch-none object-contain focus:outline-none"
        style={{ cursor }}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
