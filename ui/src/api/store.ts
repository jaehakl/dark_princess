import { create } from 'zustand';
import type { SceneRecord } from './type';

type SceneStore = {
  currentScene: SceneRecord | null;
  selectedScene: SceneRecord | null;
  deletedSceneId: number | null;
  isSceneExplorerOpen: boolean;
  setCurrentScene: (scene: SceneRecord | null) => void;
  handleSceneDeleted: (sceneId: number) => void;
  clearDeletedScene: () => void;
  openSceneExplorer: () => void;
  closeSceneExplorer: () => void;
  selectScene: (scene: SceneRecord) => void;
};

export const useSceneStore = create<SceneStore>((set) => ({
  currentScene: null,
  selectedScene: null,
  deletedSceneId: null,
  isSceneExplorerOpen: false,
  setCurrentScene: (scene) => set({ currentScene: scene, selectedScene: null }),
  handleSceneDeleted: (sceneId) =>
    set((state) => ({
      currentScene: state.currentScene?.id === sceneId ? null : state.currentScene,
      selectedScene: state.selectedScene?.id === sceneId ? null : state.selectedScene,
      deletedSceneId: sceneId,
    })),
  clearDeletedScene: () => set({ deletedSceneId: null }),
  openSceneExplorer: () => set({ isSceneExplorerOpen: true }),
  closeSceneExplorer: () => set({ isSceneExplorerOpen: false }),
  selectScene: (scene) =>
    set({
      currentScene: scene,
      selectedScene: scene,
      isSceneExplorerOpen: false,
    }),
}));
