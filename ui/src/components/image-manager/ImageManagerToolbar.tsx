import { Button, FieldLabel, FormControl, Spinner } from '../ui';
import {
  IMAGE_SORT_OPTIONS,
  type ImageSortValue,
} from './constants';

type ImageManagerToolbarProps = {
  searchText: string;
  sortValue: ImageSortValue;
  isFamilyMode: boolean;
  isSelectionMode: boolean;
  selectedCount: number;
  selectedSceneCount: number;
  totalRows: number;
  isLoading: boolean;
  isDeleting: boolean;
  onSearchTextChange: (value: string) => void;
  onSearch: () => void;
  onSortChange: (value: ImageSortValue) => void;
  onFamilyModeChange: (value: boolean) => void;
  onSelectionModeChange: (value: boolean) => void;
  onDeleteSelected: () => void;
};

export function ImageManagerToolbar({
  searchText,
  sortValue,
  isFamilyMode,
  isSelectionMode,
  selectedCount,
  selectedSceneCount,
  totalRows,
  isLoading,
  isDeleting,
  onSearchTextChange,
  onSearch,
  onSortChange,
  onFamilyModeChange,
  onSelectionModeChange,
  onDeleteSelected,
}: ImageManagerToolbarProps) {
  return (
    <form
      className="grid gap-3 lg:grid-cols-[minmax(20rem,1fr)_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <label className="block min-w-0 space-y-1">
        <FieldLabel>Positive prompt</FieldLabel>
        <FormControl
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          className="h-11 w-full px-3 text-sm"
          placeholder="positive prompt 검색어, 콤마로 AND"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[10rem] space-y-1">
          <FieldLabel>정렬</FieldLabel>
          <FormControl
            as="select"
            value={sortValue}
            onChange={(event) => onSortChange(event.target.value as ImageSortValue)}
            className="h-11 w-full px-3 text-sm"
            disabled={isFamilyMode || isLoading}
          >
            {IMAGE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FormControl>
        </label>

        <Button
          type="submit"
          variant="primary"
          className="inline-flex h-11 items-center gap-2 px-4 py-0 text-xs"
          disabled={isLoading}
        >
          {isLoading ? <Spinner aria-hidden="true" /> : null}
          검색
        </Button>

        <Button
          className="h-11 px-4 py-0 text-xs"
          onClick={() => onFamilyModeChange(!isFamilyMode)}
          disabled={isLoading}
          aria-pressed={isFamilyMode}
        >
          {isFamilyMode ? 'Family 해제' : 'Family 모아보기'}
        </Button>

        <Button
          variant={isSelectionMode ? 'primary' : 'default'}
          className="h-11 px-4 py-0 text-xs"
          onClick={() => onSelectionModeChange(!isSelectionMode)}
          disabled={isLoading || isDeleting}
          aria-pressed={isSelectionMode}
        >
          {isSelectionMode ? '선택 종료' : '선택'}
        </Button>

        <Button
          variant="danger"
          className="h-11 px-4 py-0 text-xs"
          onClick={onDeleteSelected}
          disabled={!isSelectionMode || selectedCount === 0 || isDeleting}
        >
          {isDeleting ? '삭제 중' : `삭제 ${selectedCount}`}
        </Button>

        <span className="pb-3 text-xs font-semibold text-[var(--app-muted)]">
          {selectedCount > 0
            ? `선택 ${selectedCount} · Scene ${selectedSceneCount}`
            : `전체 ${totalRows}`}
        </span>
      </div>
    </form>
  );
}
