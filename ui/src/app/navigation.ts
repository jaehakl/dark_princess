export type SidebarIconName = 'list';

export type AppNavigationItem = {
  path: string;
  to: string;
  label: string;
  icon: SidebarIconName;
  breadcrumb: string;
  pageTitle: string;
};

export type AppNavigationSection = {
  id: string;
  path: string;
  label: string;
  breadcrumb: string;
  children: AppNavigationItem[];
};

export const gameDataNav: AppNavigationItem = {
  path: 'list-edit',
  to: '/list-edit?table=Status',
  label: '게임 데이터',
  icon: 'list',
  breadcrumb: '게임 데이터',
  pageTitle: '게임 데이터',
};

export const dataSection: AppNavigationSection = {
  id: 'data',
  path: 'data',
  label: '데이터',
  breadcrumb: '데이터',
  children: [gameDataNav],
};

export const navigationSections: AppNavigationSection[] = [dataSection];
