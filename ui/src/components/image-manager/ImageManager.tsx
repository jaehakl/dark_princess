import { useEffect, useMemo, useState } from 'react';
import { dbTables } from '../../api/api';
import type { GetListRequest, ImageRecord } from '../../api/type';
import {
  Button,
  Panel,
  PanelHeader,
  SectionBody,
} from '../ui';
import { CameraSampleChips } from './CameraSampleChips';
import { ImageDetailModal } from './ImageDetailModal';
import { ImageManagerToolbar } from './ImageManagerToolbar';
import { ImageTileGrid } from './ImageTileGrid';
import {
  DEFAULT_IMAGE_SORT_VALUE,
  FAMILY_SORT,
  IMAGE_MANAGER_PAGE_SIZE,
  IMAGE_SORT_OPTIONS,
  type ImageSortValue,
} from './constants';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

function parsePromptTerms(value: string) {
  return value
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function getImageId(image: ImageRecord) {
  return typeof image.id === 'number' ? image.id : null;
}

function getSortRequest(sortValue: ImageSortValue): GetListRequest['sort'] {
  return (
    IMAGE_SORT_OPTIONS.find((option) => option.value === sortValue)?.sort ??
    IMAGE_SORT_OPTIONS[0].sort
  );
}

function buildListRequest(
  page: number,
  sortValue: ImageSortValue,
  isFamilyMode: boolean,
  searchTerms: string[],
): GetListRequest {
  return {
    offset: (page - 1) * IMAGE_MANAGER_PAGE_SIZE,
    limit: IMAGE_MANAGER_PAGE_SIZE,
    selected_ids: [],
    search_text: null,
    text_filter: searchTerms.length > 0 ? { positive_prompt: searchTerms } : {},
    filter: {},
    sort: isFamilyMode ? FAMILY_SORT : getSortRequest(sortValue),
  };
}

function selectedSceneCount(images: ImageRecord[], selectedIds: Set<number>) {
  return images.reduce((total, image) => {
    const imageId = getImageId(image);
    if (imageId === null || !selectedIds.has(imageId)) {
      return total;
    }
    return total + (image.scene_count ?? 0);
  }, 0);
}

export function ImageManager() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [cameraSamples, setCameraSamples] = useState<Record<string, string[]>>({});
  const [searchText, setSearchText] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [sortValue, setSortValue] = useState<ImageSortValue>(DEFAULT_IMAGE_SORT_VALUE);
  const [isFamilyMode, setIsFamilyMode] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [lastSelectedImageId, setLastSelectedImageId] = useState<number | null>(null);
  const [detailImage, setDetailImage] = useState<ImageRecord | null>(null);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalRows / IMAGE_MANAGER_PAGE_SIZE)),
    [totalRows],
  );
  const currentSelectedSceneCount = useMemo(
    () => selectedSceneCount(images, selectedIds),
    [images, selectedIds],
  );

  useEffect(() => {
    let isActive = true;

    async function loadImages() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await dbTables.Image.listRows(
          buildListRequest(page, sortValue, isFamilyMode, searchTerms),
        );
        if (!isActive) {
          return;
        }
        setImages(response.items);
        setTotalRows(response.total);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setImages([]);
        setTotalRows(0);
        setError(getErrorMessage(loadError));
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadImages();
    return () => {
      isActive = false;
    };
  }, [isFamilyMode, page, reloadKey, searchTerms, sortValue]);

  useEffect(() => {
    let isActive = true;

    async function loadCameraSamples() {
      try {
        const defaults = await dbTables.ImageUtil.getImageSettingsDefaults();
        if (isActive) {
          setCameraSamples(defaults.camera_samples ?? {});
        }
      } catch (loadError) {
        console.error('Failed to load camera samples.', loadError);
      }
    }

    void loadCameraSamples();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (page <= totalPages) {
      return;
    }
    setPage(totalPages);
  }, [page, totalPages]);

  function clearSelection() {
    setSelectedIds(new Set());
    setLastSelectedImageId(null);
  }

  function reloadImages() {
    setReloadKey((current) => current + 1);
  }

  function searchImages() {
    setSearchTerms(parsePromptTerms(searchText));
    setPage(1);
    clearSelection();
  }

  function searchCameraSample(sample: string) {
    setSearchText(sample);
    setSearchTerms([sample]);
    setPage(1);
    clearSelection();
  }

  function changeSort(value: ImageSortValue) {
    setSortValue(value);
    setPage(1);
    clearSelection();
  }

  function changeFamilyMode(value: boolean) {
    setIsFamilyMode(value);
    setPage(1);
    clearSelection();
  }

  function changeSelectionMode(value: boolean) {
    setIsSelectionMode(value);
    if (!value) {
      clearSelection();
    }
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    clearSelection();
  }

  function toggleImageSelection(imageId: number) {
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
    const pageImageIds = images
      .map(getImageId)
      .filter((id): id is number => id !== null);
    const startIndex = lastSelectedImageId === null ? -1 : pageImageIds.indexOf(lastSelectedImageId);
    const endIndex = pageImageIds.indexOf(imageId);

    if (startIndex === -1 || endIndex === -1) {
      toggleImageSelection(imageId);
      return;
    }

    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    const rangeIds = pageImageIds.slice(minIndex, maxIndex + 1);
    setSelectedIds((current) => {
      const next = new Set(current);
      rangeIds.forEach((rangeId) => next.add(rangeId));
      return next;
    });
    setLastSelectedImageId(imageId);
  }

  function handleTileClick(image: ImageRecord, isRangeSelection: boolean) {
    const imageId = getImageId(image);
    if (imageId === null) {
      return;
    }
    if (!isSelectionMode) {
      setDetailImage(image);
      return;
    }
    if (isRangeSelection) {
      selectImageRange(imageId);
      return;
    }
    toggleImageSelection(imageId);
  }

  async function deleteImages(targetImages: ImageRecord[]) {
    const ids = targetImages
      .map(getImageId)
      .filter((id): id is number => id !== null);
    if (!ids.length || isDeleting) {
      return;
    }

    const sceneCount = targetImages.reduce((total, image) => total + (image.scene_count ?? 0), 0);
    const confirmed = window.confirm(
      `Image ${ids.length}개를 삭제할까요?\n연결된 Scene ${sceneCount}개의 image_id가 비워집니다.`,
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      await dbTables.Image.deleteRows(ids);
      setDetailImage(null);
      clearSelection();
      reloadImages();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  function deleteSelectedImages() {
    const targetImages = images.filter((image) => {
      const imageId = getImageId(image);
      return imageId !== null && selectedIds.has(imageId);
    });
    void deleteImages(targetImages);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 px-1">
        <p className="text-[0.85rem] tracking-[0.16em] text-[var(--app-muted)] uppercase">
          Image archive
        </p>
        <h1 className="text-[clamp(1.25rem,2vw,2.2rem)] leading-[1.05] font-extrabold tracking-[0.02em] text-[#fff7ef] [text-shadow:0_0_22px_rgba(255,194,211,0.42),0_2px_12px_rgba(0,0,0,0.58)]">
          Image 관리
        </h1>
      </div>

      <Panel>
        <PanelHeader className="flex-col items-stretch">
          <ImageManagerToolbar
            searchText={searchText}
            sortValue={sortValue}
            isFamilyMode={isFamilyMode}
            isSelectionMode={isSelectionMode}
            selectedCount={selectedIds.size}
            selectedSceneCount={currentSelectedSceneCount}
            totalRows={totalRows}
            isLoading={isLoading}
            isDeleting={isDeleting}
            onSearchTextChange={setSearchText}
            onSearch={searchImages}
            onSortChange={changeSort}
            onFamilyModeChange={changeFamilyMode}
            onSelectionModeChange={changeSelectionMode}
            onDeleteSelected={deleteSelectedImages}
          />
          <CameraSampleChips
            cameraSamples={cameraSamples}
            onSelectSample={searchCameraSample}
          />
        </PanelHeader>

        <SectionBody className="space-y-4">
          <ImageTileGrid
            images={images}
            selectedIds={selectedIds}
            isSelectionMode={isSelectionMode}
            isLoading={isLoading}
            error={error}
            onTileClick={handleTileClick}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-4">
            <span className="text-xs font-semibold text-[var(--app-muted)]">
              {page} / {totalPages} · {images.length} / {totalRows}
            </span>
            <div className="flex gap-2">
              <Button
                className="px-4 py-2 text-xs"
                onClick={() => changePage(Math.max(1, page - 1))}
                disabled={page <= 1 || isLoading || isDeleting}
              >
                이전
              </Button>
              <Button
                className="px-4 py-2 text-xs"
                onClick={() => changePage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || isLoading || isDeleting}
              >
                다음
              </Button>
            </div>
          </div>
        </SectionBody>
      </Panel>

      {detailImage ? (
        <ImageDetailModal
          image={detailImage}
          isDeleting={isDeleting}
          onClose={() => setDetailImage(null)}
          onDelete={(image) => void deleteImages([image])}
        />
      ) : null}
    </div>
  );
}
