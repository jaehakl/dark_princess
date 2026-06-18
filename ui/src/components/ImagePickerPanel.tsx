import { useState } from 'react';
import type { ImageRecord } from '../api/type';
import {
  Button,
  ImageFrame,
  SectionBody,
  Spinner,
  cx,
} from './ui';

export type ImagePickerItem = {
  id: number;
  image: ImageRecord | null;
};

type ImagePickerPanelProps = {
  items: ImagePickerItem[];
  currentImageId?: number | null;
  isLoading: boolean;
  error: string | null;
  emptyMessage: string;
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onSelectImage: (image: ImageRecord) => void;
};

function summarizeParameters(parameters: Record<string, unknown> | null | undefined) {
  if (!parameters) {
    return '-';
  }
  const text = JSON.stringify(parameters);
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function imageMetaLines(image: ImageRecord) {
  return [
    `ID: ${image.id ?? '-'}`,
    `Seed: ${image.seed_image_id ?? '-'}`,
    `Positive: ${image.positive_prompt?.trim() || '-'}`,
    `Negative: ${image.negative_prompt?.trim() || '-'}`,
    `Params: ${summarizeParameters(image.model_parameters)}`,
  ];
}

export function ImagePickerPanel({
  items,
  currentImageId,
  isLoading,
  error,
  emptyMessage,
  page,
  totalPages,
  totalRows,
  onPageChange,
  onSelectImage,
}: ImagePickerPanelProps) {
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const visibleError = selectionError ?? error;

  function selectImage(image: ImageRecord | null) {
    if (!image) {
      setSelectionError('이미지 정보를 찾을 수 없습니다.');
      return;
    }
    if (!image.image_object_key) {
      setSelectionError(`Image #${image.id ?? '-'}에 이미지 URL이 없습니다.`);
      return;
    }
    setSelectionError(null);
    onSelectImage(image);
  }

  return (
    <SectionBody className="space-y-3">
      {isLoading ? (
        <div className="flex min-h-44 items-center justify-center gap-2 text-sm font-semibold text-[var(--app-muted)]">
          <Spinner aria-hidden="true" />
          <span>이미지를 불러오는 중</span>
        </div>
      ) : null}

      {visibleError ? (
        <p className="text-sm font-semibold text-[#ff9ab8]">{visibleError}</p>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <div className="grid min-h-44 place-items-center rounded-[8px] border border-[rgba(255,218,228,0.22)] bg-[rgba(15,5,20,0.72)] p-6 text-sm font-semibold text-[var(--app-muted)]">
          {emptyMessage}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {items.map(({ id, image }) => {
            const imageUrl = image?.image_object_key ?? null;
            const isCurrent = id === currentImageId;
            return (
              <button
                key={id}
                type="button"
                className={cx(
                  'group relative min-w-0 rounded-[8px] border bg-[rgba(11,4,16,0.78)] p-1 text-left transition-[border-color,filter,transform]',
                  imageUrl
                    ? 'border-[rgba(255,218,228,0.22)] hover:-translate-y-px hover:border-[rgba(255,226,186,0.84)] hover:brightness-[1.08]'
                    : 'cursor-not-allowed border-[rgba(188,144,158,0.22)] opacity-60',
                  isCurrent && 'border-[rgba(255,226,186,0.95)] shadow-[0_0_22px_rgba(240,179,95,0.14)]',
                )}
                onClick={() => selectImage(image)}
                aria-disabled={!imageUrl}
              >
                <ImageFrame className="rounded-[6px]">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-[0.68rem] font-semibold text-[var(--app-muted)]">
                      이미지 없음
                    </span>
                  )}
                </ImageFrame>

                <span className="pointer-events-none absolute left-2 top-2 rounded-full border border-[rgba(255,226,186,0.62)] bg-[rgba(9,3,14,0.82)] px-2 py-0.5 text-[0.65rem] font-extrabold text-[#fff5eb]">
                  #{id}
                </span>
                {isCurrent ? (
                  <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[rgba(244,191,103,0.92)] px-2 py-0.5 text-[0.65rem] font-extrabold text-[#25101e]">
                    현재
                  </span>
                ) : null}

                {image ? (
                  <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 translate-y-1 rounded-[6px] border border-[rgba(255,218,228,0.28)] bg-[rgba(8,2,13,0.94)] p-2 text-[0.66rem] font-semibold leading-4 text-[#fff5eb] opacity-0 shadow-[0_18px_36px_rgba(0,0,0,0.32)] transition-[opacity,transform] group-hover:translate-y-0 group-hover:opacity-100">
                    {imageMetaLines(image).map((line) => (
                      <div key={line} className="line-clamp-2 break-words">
                        {line}
                      </div>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-3">
        <span className="text-xs font-semibold text-[var(--app-muted)]">
          {page} / {totalPages} · {items.length} / {totalRows}
        </span>
        <div className="flex gap-2">
          <Button
            className="px-4 py-2 text-xs"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || isLoading}
          >
            이전
          </Button>
          <Button
            className="px-4 py-2 text-xs"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || isLoading}
          >
            다음
          </Button>
        </div>
      </div>
    </SectionBody>
  );
}
