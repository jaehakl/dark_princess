import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../../api/api';
import type { ImageRecord } from '../../api/type';
import { ImagePickerPanel } from '../ImagePickerPanel';
import type { ImagePickerItem } from '../ImagePickerPanel';
import {
  Button,
  ModalBackdrop,
  Panel,
  PanelHeader,
} from '../ui';

const PAGE_SIZE = 24;

type ImageLineageModalProps = {
  currentImageId: number;
  onClose: () => void;
  onSelectImage: (image: ImageRecord) => void;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '계통 목록을 불러오지 못했습니다.';
}

export function ImageLineageModal({
  currentImageId,
  onClose,
  onSelectImage,
}: ImageLineageModalProps) {
  const [lineageItems, setLineageItems] = useState<ImagePickerItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedImageId, setLastSelectedImageId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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
            setLineageItems([]);
            setPage(1);
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
          setLineageItems(lineageIds.map((id) => ({ id, image: imagesById.get(id) ?? null })));
          setPage(1);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(getErrorMessage(loadError));
          setLineageItems([]);
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
  }, [currentImageId, reloadKey]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(lineageItems.length / PAGE_SIZE)),
    [lineageItems.length],
  );
  const visibleItems = useMemo(
    () => lineageItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [lineageItems, page],
  );

  const selectedImages = useMemo(
    () => lineageItems
      .map((item) => item.image)
      .filter((image): image is ImageRecord & { id: number } => (
        typeof image?.id === 'number' &&
        image.id !== currentImageId &&
        Boolean(image.image_object_key) &&
        (image.cut_count ?? 0) === 0 &&
        selectedIds.has(image.id)
      )),
    [currentImageId, lineageItems, selectedIds],
  );

  function toggleSelectionMode() {
    setError(null);
    setSelectedIds(new Set());
    setLastSelectedImageId(null);
    setIsSelectionMode((current) => !current);
  }

  function toggleSelection(imageId: number) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
    setLastSelectedImageId(imageId);
  }

  function selectImageRange(imageId: number) {
    const selectableIds = visibleItems
      .map((item) => item.image)
      .filter((image): image is ImageRecord & { id: number } => (
        typeof image?.id === 'number' &&
        image.id !== currentImageId &&
        Boolean(image.image_object_key) &&
        (image.cut_count ?? 0) === 0
      ))
      .map((image) => image.id);
    const startIndex = lastSelectedImageId === null ? -1 : selectableIds.indexOf(lastSelectedImageId);
    const endIndex = selectableIds.indexOf(imageId);

    if (startIndex === -1 || endIndex === -1) {
      toggleSelection(imageId);
      return;
    }

    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    const rangeIds = selectableIds.slice(minIndex, maxIndex + 1);
    setSelectedIds((current) => {
      const next = new Set(current);
      rangeIds.forEach((rangeId) => next.add(rangeId));
      return next;
    });
    setLastSelectedImageId(imageId);
  }

  function handleToggleSelection(imageId: number, isRangeSelection: boolean) {
    if (isRangeSelection) {
      selectImageRange(imageId);
      return;
    }
    toggleSelection(imageId);
  }

  function changePage(nextPage: number) {
    setSelectedIds(new Set());
    setLastSelectedImageId(null);
    setPage(nextPage);
  }

  async function deleteSelectedImages() {
    const ids = selectedImages.map((image) => image.id);
    if (!ids.length || isDeleting) {
      return;
    }

    const confirmed = window.confirm(`Image ${ids.length}개를 삭제할까요?`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await dbTables.Image.deleteRows(ids);
      setSelectedIds(new Set());
      setLastSelectedImageId(null);
      setReloadKey((current) => current + 1);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
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
              현재 Image #{currentImageId} · {lineageItems.length}개
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              className="h-8 px-3 py-0 text-xs"
              onClick={toggleSelectionMode}
              disabled={isLoading || isDeleting}
              aria-pressed={isSelectionMode}
            >
              {isSelectionMode ? '선택 종료' : '선택'}
            </Button>
            <Button
              variant="danger"
              className="h-8 px-3 py-0 text-xs"
              onClick={() => void deleteSelectedImages()}
              disabled={!isSelectionMode || selectedImages.length === 0 || isDeleting}
            >
              {isDeleting ? '삭제 중' : `삭제 ${selectedImages.length}`}
            </Button>
            <Button className="h-8 px-3 py-0 text-xs" onClick={onClose} disabled={isDeleting}>
              닫기
            </Button>
          </div>
        </PanelHeader>

        <ImagePickerPanel
          items={visibleItems}
          currentImageId={currentImageId}
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          isDeleting={isDeleting}
          isLoading={isLoading}
          error={error}
          emptyMessage="표시할 계통 이미지가 없습니다."
          page={page}
          totalPages={totalPages}
          totalRows={lineageItems.length}
          onPageChange={changePage}
          onSelectImage={(image) => {
            onSelectImage(image);
            onClose();
          }}
          onToggleSelection={handleToggleSelection}
        />
      </Panel>
    </ModalBackdrop>
  );
}
