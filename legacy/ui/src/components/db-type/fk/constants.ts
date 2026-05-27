import type { LinkType, LinkTypeCapabilities } from './types';

export const SEARCH_DEBOUNCE_MS = 200;
export const SEARCH_RESULT_LIMIT = 100;
export const EMPTY_SEARCH_RESULT_LIMIT = 100;
export const SEARCH_DROPDOWN_MAX_HEIGHT = 352;
export const FK_EDITOR_BACKGROUND_CLASS = 'bg-transparent';

export const LINK_TYPE_CAPABILITY_MATRIX: Record<
  LinkType,
  LinkTypeCapabilities
> = {
  secondary: {
    canSearchSelect: true,
    canCreateTarget: true,
    canRemoveSecondaryRelation: true,
    canDeleteTarget: false,
    canEditTargetRequiredFields: true,
    usesLinkedSurface: false,
  },
  children: {
    canSearchSelect: false,
    canCreateTarget: true,
    canRemoveSecondaryRelation: false,
    canDeleteTarget: true,
    canEditTargetRequiredFields: true,
    usesLinkedSurface: true,
  },
  computed: {
    canSearchSelect: false,
    canCreateTarget: false,
    canRemoveSecondaryRelation: false,
    canDeleteTarget: false,
    canEditTargetRequiredFields: true,
    usesLinkedSurface: true,
  },
};
