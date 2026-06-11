import { create } from 'zustand';
import type { SceneRecord } from './type';

type SceneStore = {
  currentScene: SceneRecord | null;
  savedScene: SceneRecord | null;
  selectedScene: SceneRecord | null;
  editingScene: SceneRecord | null;
  deletedSceneId: number | null;
  isSceneEditorOpen: boolean;
  isSceneExplorerOpen: boolean;
  setCurrentScene: (scene: SceneRecord | null) => void;
  openSceneEditor: (scene?: SceneRecord | null) => void;
  closeSceneEditor: () => void;
  handleSceneSaved: (scene: SceneRecord, editedSceneId: number | null) => void;
  handleSceneDeleted: (sceneId: number) => void;
  clearDeletedScene: () => void;
  openSceneExplorer: () => void;
  closeSceneExplorer: () => void;
  selectScene: (scene: SceneRecord) => void;
};

export const useSceneStore = create<SceneStore>((set, get) => ({
  currentScene: null,
  savedScene: null,
  selectedScene: null,
  editingScene: null,
  deletedSceneId: null,
  isSceneEditorOpen: false,
  isSceneExplorerOpen: false,
  setCurrentScene: (scene) => set({ currentScene: scene, selectedScene: null }),
  openSceneEditor: (scene) =>
    set({
      editingScene: scene === undefined ? get().currentScene : scene,
      isSceneEditorOpen: true,
    }),
  closeSceneEditor: () => set({ isSceneEditorOpen: false }),
  handleSceneSaved: (scene, editedSceneId) =>
    set((state) => ({
      savedScene: scene,
      currentScene:
        editedSceneId && scene.id === state.currentScene?.id
          ? scene
          : state.currentScene,
      isSceneEditorOpen: false,
    })),
  handleSceneDeleted: (sceneId) =>
    set((state) => ({
      currentScene: state.currentScene?.id === sceneId ? null : state.currentScene,
      savedScene: state.savedScene?.id === sceneId ? null : state.savedScene,
      selectedScene: state.selectedScene?.id === sceneId ? null : state.selectedScene,
      editingScene: null,
      deletedSceneId: sceneId,
      isSceneEditorOpen: false,
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
