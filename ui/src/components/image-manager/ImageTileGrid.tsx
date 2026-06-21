import type { MouseEvent } from 'react';
import type { ImageRecord } from '../../api/type';
import {
  ImageFrame,
  Spinner,
  cx,
} from '../ui';

type ImageTileGridProps = {
  images: ImageRecord[];
  selectedIds: Set<number>;
  isSelectionMode: boolean;
  isLoading: boolean;
  error: string | null;
  onTileClick: (image: ImageRecord, isRangeSelection: boolean) => void;
};

function getImageId(image: ImageRecord) {
  return typeof image.id === 'number' ? image.id : null;
}

export function ImageTileGrid({
  images,
  selectedIds,
  isSelectionMode,
  isLoading,
  error,
  onTileClick,
}: ImageTileGridProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-3 text-sm font-semibold text-[var(--app-muted)]">
        <Spinner aria-hidden="true" />
        <span>이미지를 불러오는 중</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-80 place-items-center text-sm font-semibold text-[#ff9ab8]">
        {error}
      </div>
    );
  }

  if (!images.length) {
    return (
      <div className="grid min-h-80 place-items-center text-sm font-semibold text-[var(--app-muted)]">
        Image 없음
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {images.map((image, index) => {
        const imageId = getImageId(image);
        const isSelected = imageId !== null && selectedIds.has(imageId);
        return (
          <button
            key={imageId ?? `image-${index}`}
            type="button"
            className={cx(
              'group relative min-w-0 rounded-[8px] border bg-[rgba(11,4,16,0.72)] p-1 transition-[border-color,filter,transform,box-shadow]',
              'hover:-translate-y-px hover:border-[rgba(255,226,186,0.82)] hover:brightness-[1.06]',
              isSelected
                ? 'border-[rgba(255,226,186,0.95)] shadow-[0_0_24px_rgba(240,179,95,0.22)]'
                : 'border-[rgba(255,218,228,0.22)]',
              imageId === null && 'cursor-not-allowed opacity-60 hover:translate-y-0',
            )}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              if (imageId === null) {
                return;
              }
              onTileClick(image, event.shiftKey);
            }}
            disabled={imageId === null}
            aria-label={`Image ${imageId ?? '-'}`}
            aria-pressed={isSelectionMode ? isSelected : undefined}
          >
            <ImageFrame className="relative h-full w-full rounded-[6px] border border-[rgba(255,218,228,0.14)]">
              {image.image_object_key ? (
                <img
                  src={image.image_object_key}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable={false}
                />
              ) : null}
            </ImageFrame>

            {isSelectionMode ? (
              <span
                aria-hidden="true"
                className={cx(
                  'absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-[6px] border bg-[rgba(8,2,13,0.82)] shadow-[0_8px_18px_rgba(0,0,0,0.34)] after:block after:h-2.5 after:w-2.5 after:rounded-[3px]',
                  isSelected
                    ? 'border-[rgba(255,226,186,0.95)] after:bg-[#fff5eb]'
                  : 'border-[rgba(255,218,228,0.42)] after:bg-transparent',
                )}
              />
            ) : null}

            <span
              className={cx(
                'pointer-events-none absolute bottom-2 right-2 rounded-full border px-1.5 py-0.5 text-[0.62rem] font-extrabold leading-none shadow-[0_8px_18px_rgba(0,0,0,0.28)]',
                (image.cut_count ?? 0) === 0
                  ? 'border-[rgba(180,180,190,0.4)] bg-[rgba(40,40,48,0.72)] text-[rgba(230,230,236,0.72)]'
                  : (image.cut_count ?? 0) >= 2
                    ? 'border-[rgba(255,226,121,0.7)] bg-[rgba(128,91,18,0.82)] text-[#fff4c7]'
                    : 'border-[rgba(121,255,177,0.58)] bg-[rgba(16,85,48,0.78)] text-[#dcffe9]',
              )}
            >
              {image.cut_count ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
