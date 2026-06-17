import type {
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { cx } from '../ui';

type ImageEditorStageProps = {
  width: number;
  height: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cursor: string;
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
  label,
  onPaste,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onWheel,
  onKeyDown,
}: ImageEditorStageProps) {
  const canvasBoxStyle: CSSProperties = height > width
    ? { height: '100%', width: `${(width / height) * 100}%` }
    : width > height
      ? { height: `${(height / width) * 100}%`, width: '100%' }
      : { height: '100%', width: '100%' };

  return (
    <div
      className={cx(
        'relative mx-auto grid w-full max-w-[34rem] place-items-center overflow-hidden rounded-[8px] border border-[rgba(255,218,228,0.22)] bg-black focus-within:ring-2 focus-within:ring-[rgba(255,226,186,0.55)]',
        'aspect-square',
      )}
      onPaste={onPaste}
    >
      <div className="bg-white" style={canvasBoxStyle}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          aria-label={label}
          className="block h-full w-full touch-none bg-white focus:outline-none"
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
    </div>
  );
}
