/*
 * 이 파일은 Zustand 관련 상태 저장소입니다.
 * - 화면이 아직 없어도 이후 UI 전역 상태를 붙일 수 있도록 최소 store 를 준비합니다.
 */

import { create } from 'zustand';

type UiStore = {
  isSidebarCollapsed: boolean;
  isMobileSidebarOpen: boolean;
  toggleSidebarOpen: () => void;
  setMobileSidebarOpen: (isOpen: boolean) => void;
};

export const useUiStore = create<UiStore>((set) => ({
  isSidebarCollapsed: true,
  isMobileSidebarOpen: false,
  toggleSidebarOpen: () =>
    set((state) => ({
      isSidebarCollapsed: !state.isSidebarCollapsed,
    })),
  setMobileSidebarOpen: (isOpen) => set({ isMobileSidebarOpen: isOpen }),
}));
