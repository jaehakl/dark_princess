import type { ReactNode } from 'react';

export type DetailMode = 'view' | 'create';

export type ListPanelProps<TId extends string = string> = {
  selectedId: TId | null;
  onSelectItem: (id: TId) => void;
  onCreateNew: () => void;
};

export type MasterDetailLayoutProps = {
  list: ReactNode;
  detail: ReactNode;
  emptyDetail: ReactNode;
  isDetailOpen: boolean;
  onDetailClose: () => void;
  detailTitle: string;
};
