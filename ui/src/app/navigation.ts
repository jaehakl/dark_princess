export type SidebarIconName = 'list' | 'settings';

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

export const playEditNav: AppNavigationItem = {
  path: 'play-edit',
  to: '/play-edit',
  label: 'Play+Edit',
  icon: 'list',
  breadcrumb: 'Play+Edit',
  pageTitle: 'Play+Edit',
};

export const sceneEditNav: AppNavigationItem = {
  path: 'scene-edit',
  to: '/scene-edit',
  label: '장면 편집',
  icon: 'list',
  breadcrumb: '장면 편집',
  pageTitle: '장면 편집',
};

export const dataSection: AppNavigationSection = {
  id: 'data',
  path: 'data',
  label: '데이터',
  breadcrumb: '데이터',
  children: [playEditNav, sceneEditNav, gameDataNav],
};

export const settingsNav: AppNavigationItem = {
  path: 'settings',
  to: '/settings',
  label: '환경설정',
  icon: 'settings',
  breadcrumb: '환경설정',
  pageTitle: '환경설정',
};

export const settingsSection: AppNavigationSection = {
  id: 'settings',
  path: 'settings',
  label: '설정',
  breadcrumb: '설정',
  children: [settingsNav],
};

export const navigationSections: AppNavigationSection[] = [
  dataSection,
  settingsSection,
];
