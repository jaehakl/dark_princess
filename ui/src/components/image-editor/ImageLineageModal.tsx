import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../../api/api';
import type { ImageRecord } from '../../api/type';
import {
  Button,
  ImageFrame,
  ModalBackdrop,
  Panel,
  PanelHeader,
  SectionBody,
  Spinner,
  cx,
} from '../ui';

type ImageLineageModalProps = {
  currentImageId: number;
  onClose: () => void;
  onSelectImage: (image: ImageRecord) => void;
};

type LineageTile = {
  id: number;
  image: ImageRecord | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '계통 목록을 불러오지 못했습니다.';
}

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

export function ImageLineageModal({
  currentImageId,
  onClose,
  onSelectImage,
}: ImageLineageModalProps) {
  const [tiles, setTiles] = useState<LineageTile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadLineage() {
      setIsLoading(true);
      setError(null);
      try {
        const lineageIds = await dbTables.Image.getLineageIds(currentImageId);
        if (lineageIds.length === 0) {
          if (!isCancelled) {
            setTiles([]);
          }
          return;
        }

        const imageResponse = await dbTables.Image.listRows({
          offset: 0,
          limit: null,
          selected_ids: lineageIds,
          search_text: null,
          text_filter: {},
          filter: {},
          sort: null,
        });
        const imagesById = new Map(
          imageResponse.items
            .filter((image): image is ImageRecord & { id: number } => typeof image.id === 'number')
            .map((image) => [image.id, image]),
        );

        if (!isCancelled) {
          setTiles(lineageIds.map((id) => ({ id, image: imagesById.get(id) ?? null })));
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(getErrorMessage(loadError));
          setTiles([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadLineage();
    return () => {
      isCancelled = true;
    };
  }, [currentImageId]);

  const tileCountLabel = useMemo(() => `${tiles.length}개`, [tiles.length]);

  function selectImage(image: ImageRecord | null) {
    if (!image) {
      setError('이미지 정보를 찾을 수 없습니다.');
      return;
    }
    if (!image.image_object_key) {
      setError(`Image #${image.id ?? '-'}에 이미지 URL이 없습니다.`);
      return;
    }
    onSelectImage(image);
    onClose();
  }

  return (
    <ModalBackdrop nested topAligned>
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-lineage-title"
        className="w-[min(58rem,calc(100vw-2rem))] overflow-visible"
      >
        <PanelHeader>
          <div className="min-w-0">
            <h2 id="image-lineage-title" className="text-base font-extrabold text-[#fff5eb]">
              계통목록
            </h2>
            <p className="mt-1 text-xs font-semibold text-[var(--app-muted)]">
              현재 Image #{currentImageId} · {tileCountLabel}
            </p>
          </div>
          <Button className="h-8 px-3 py-0 text-xs" onClick={onClose}>
            닫기
          </Button>
        </PanelHeader>

        <SectionBody className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--app-muted)]">
              <Spinner aria-hidden="true" />
              <span>계통 이미지를 불러오는 중</span>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm font-semibold text-[#ff9ab8]">{error}</p>
          ) : null}

          {!isLoading && tiles.length === 0 ? (
            <div className="grid min-h-48 place-items-center rounded-[8px] border border-[rgba(255,218,228,0.22)] bg-[rgba(15,5,20,0.72)] p-6 text-sm font-semibold text-[var(--app-muted)]">
              표시할 계통 이미지가 없습니다.
            </div>
          ) : null}

          {tiles.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {tiles.map(({ id, image }) => {
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
                      isCurrent && 'border-[rgba(255,226,186,0.95)]',
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
                        <span className="text-xs font-semibold text-[var(--app-muted)]">
                          이미지 없음
                        </span>
                      )}
                    </ImageFrame>

                    <span className="pointer-events-none absolute left-2 top-2 rounded-full border border-[rgba(255,226,186,0.62)] bg-[rgba(9,3,14,0.82)] px-2 py-0.5 text-[0.68rem] font-extrabold text-[#fff5eb]">
                      #{id}
                    </span>
                    {isCurrent ? (
                      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[rgba(244,191,103,0.92)] px-2 py-0.5 text-[0.68rem] font-extrabold text-[#25101e]">
                        현재
                      </span>
                    ) : null}

                    {image ? (
                      <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 translate-y-1 rounded-[6px] border border-[rgba(255,218,228,0.28)] bg-[rgba(8,2,13,0.92)] p-2 text-[0.68rem] font-semibold leading-4 text-[#fff5eb] opacity-0 shadow-[0_18px_36px_rgba(0,0,0,0.32)] transition-[opacity,transform] group-hover:translate-y-0 group-hover:opacity-100">
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
        </SectionBody>
      </Panel>
    </ModalBackdrop>
  );
}
