import type { GetListRequest } from '../../api/type';

export const IMAGE_MANAGER_PAGE_SIZE = 80;

export type ImageSortValue =
  | 'id-desc'
  | 'id-asc'
  | 'cut-count-desc'
  | 'cut-count-asc';

export const IMAGE_SORT_OPTIONS: Array<{
  value: ImageSortValue;
  label: string;
  sort: GetListRequest['sort'];
}> = [
  { value: 'id-desc', label: 'ID 최신순', sort: ['id', 'desc'] },
  { value: 'id-asc', label: 'ID 오래된순', sort: ['id', 'asc'] },
  { value: 'cut-count-desc', label: 'Cut 참조 많은순', sort: ['cut_count', 'desc'] },
  { value: 'cut-count-asc', label: 'Cut 참조 적은순', sort: ['cut_count', 'asc'] },
];

export const FAMILY_SORT: GetListRequest['sort'] = ['family_root_image_id', 'desc'];

export const DEFAULT_IMAGE_SORT_VALUE: ImageSortValue = 'id-desc';
