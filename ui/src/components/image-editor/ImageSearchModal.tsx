import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../../api/api';
import type { GetListRequest, ImageRecord } from '../../api/type';
import { ImagePickerPanel } from '../ImagePickerPanel';
import type { ImagePickerItem } from '../ImagePickerPanel';
import {
  Button,
  ModalBackdrop,
  Panel,
  PanelHeader,
} from '../ui';

const PAGE_SIZE = 24;

type ImageSearchModalProps = {
  currentImageId?: number | null;
  onClose: () => void;
  onSelectImage: (image: ImageRecord) => void;
};

const IMAGE_LIST_REQUEST: GetListRequest = {
  offset: 0,
  limit: PAGE_SIZE,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: ['id', 'desc'],
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '이미지를 불러오지 못했습니다.';
}

export function ImageSearchModal({
  currentImageId,
  onClose,
  onSelectImage,
}: ImageSearchModalProps) {
  const [items, setItems] = useState<ImagePickerItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedImageId, setLastSelectedImageId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadImages() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await dbTables.Image.listRows({
          ...IMAGE_LIST_REQUEST,
          offset: (page - 1) * PAGE_SIZE,
        });
        if (!isCancelled) {
          const nextTotalPages = Math.max(1, Math.ceil(response.total / PAGE_SIZE));
          if (page > nextTotalPages) {
            setPage(nextTotalPages);
            return;
          }
          setItems(response.items.map((image, index) => ({ id: image.id ?? -(index + 1), image })));
          setTotalRows(response.total);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setItems([]);
          setTotalRows(0);
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadImages();
    return () => {
      isCancelled = true;
    };
  }, [page, reloadKey]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalRows / PAGE_SIZE)), [totalRows]);

  const selectedImages = useMemo(
    () => items
      .map((item) => item.image)
      .filter((image): image is ImageRecord & { id: number } => (
        typeof image?.id === 'number' &&
        image.id !== currentImageId &&
        Boolean(image.image_object_key) &&
        (image.scene_count ?? 0) === 0 &&
        selectedIds.has(image.id)
      )),
    [currentImageId, items, selectedIds],
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
    const selectableIds = items
      .map((item) => item.image)
      .filter((image): image is ImageRecord & { id: number } => (
        typeof image?.id === 'number' &&
        image.id !== currentImageId &&
        Boolean(image.image_object_key) &&
        (image.scene_count ?? 0) === 0
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
        aria-labelledby="image-search-title"
        className="w-[min(58rem,calc(100vw-2rem))] overflow-visible"
      >
        <PanelHeader>
          <div className="min-w-0">
            <h2 id="image-search-title" className="text-base font-extrabold text-[#fff5eb]">
              이미지 찾기
            </h2>
            <p className="mt-1 text-xs font-semibold text-[var(--app-muted)]">
              전체 이미지 · {totalRows}개
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
          items={items}
          currentImageId={currentImageId}
          isSelectionMode={isSelectionMode}
          selectedIds={selectedIds}
          isDeleting={isDeleting}
          isLoading={isLoading}
          error={error}
          emptyMessage="표시할 이미지가 없습니다."
          page={page}
          totalPages={totalPages}
          totalRows={totalRows}
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
