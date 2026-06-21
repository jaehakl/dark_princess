import { create } from 'zustand';
import { dbTables } from './api';
import type { ImageGenerationSettings, CutRecord } from './type';
import {
  IMAGE_SAMPLER_OPTIONS,
  IMAGE_SCHEDULER_OPTIONS,
  IMAGE_SETTINGS_SESSION_KEY,
  imageSettingsToDraft,
  readSessionImageSettings,
} from '../lib/cut-image';
import type { ImageGenerationSettingsDraft } from '../lib/cut-image';

type CutStore = {
  currentCut: CutRecord | null;
  selectedCut: CutRecord | null;
  deletedCutId: number | null;
  isCutExplorerOpen: boolean;
  setCurrentCut: (cut: CutRecord | null) => void;
  handleCutDeleted: (cutId: number) => void;
  clearDeletedCut: () => void;
  openCutExplorer: () => void;
  closeCutExplorer: () => void;
  selectCut: (cut: CutRecord) => void;
};

export const useCutStore = create<CutStore>((set) => ({
  currentCut: null,
  selectedCut: null,
  deletedCutId: null,
  isCutExplorerOpen: false,
  setCurrentCut: (cut) => set({ currentCut: cut, selectedCut: null }),
  handleCutDeleted: (cutId) =>
    set((state) => ({
      currentCut: state.currentCut?.id === cutId ? null : state.currentCut,
      selectedCut: state.selectedCut?.id === cutId ? null : state.selectedCut,
      deletedCutId: cutId,
    })),
  clearDeletedCut: () => set({ deletedCutId: null }),
  openCutExplorer: () => set({ isCutExplorerOpen: true }),
  closeCutExplorer: () => set({ isCutExplorerOpen: false }),
  selectCut: (cut) =>
    set({
      currentCut: cut,
      selectedCut: cut,
      isCutExplorerOpen: false,
    }),
}));

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return '요청에 실패했습니다.';
}

type ImageSettingsStore = {
  defaults: ImageGenerationSettings | null;
  settings: ImageGenerationSettings | null;
  draft: ImageGenerationSettingsDraft | null;
  error: string | null;
  isOpen: boolean;
  isLoading: boolean;
  loadDefaults: () => Promise<void>;
  openDialog: () => void;
  closeDialog: () => void;
  updateDraft: (field: keyof ImageGenerationSettingsDraft, value: string) => void;
  resetDefaults: () => void;
  applyDraft: () => void;
  updateSettings: (settings: ImageGenerationSettings) => void;
};

function persistImageSettings(settings: ImageGenerationSettings) {
  sessionStorage.setItem(IMAGE_SETTINGS_SESSION_KEY, JSON.stringify(settings));
}

export const useImageSettingsStore = create<ImageSettingsStore>((set, get) => ({
  defaults: null,
  settings: null,
  draft: null,
  error: null,
  isOpen: false,
  isLoading: false,
  loadDefaults: async () => {
    if (get().isLoading) {
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const defaults = await dbTables.ImageUtil.getImageSettingsDefaults();
      const settingsFromSession = readSessionImageSettings(defaults);
      set({
        defaults,
        settings: settingsFromSession,
        draft: imageSettingsToDraft(settingsFromSession),
        error: null,
      });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    } finally {
      set({ isLoading: false });
    }
  },
  openDialog: () => {
    const { settings } = get();
    if (!settings) {
      set({ error: '이미지 설정 기본값을 불러오는 중입니다.' });
      return;
    }

    set({
      draft: imageSettingsToDraft(settings),
      error: null,
      isOpen: true,
    });
  },
  closeDialog: () => set({ isOpen: false }),
  updateDraft: (field, value) =>
    set((state) => ({
      draft: state.draft ? { ...state.draft, [field]: value } : state.draft,
    })),
  resetDefaults: () => {
    const { defaults } = get();
    if (!defaults) {
      set({ error: '이미지 설정 기본값을 불러오지 못했습니다.' });
      return;
    }

    persistImageSettings(defaults);
    set({
      settings: defaults,
      draft: imageSettingsToDraft(defaults),
      error: null,
    });
  },
  applyDraft: () => {
    const {
      defaults,
      settings,
      draft,
    } = get();
    if (!draft) {
      return;
    }

    const imageModelFilenameOptions = settings?.model_filenames ?? defaults?.model_filenames ?? [];
    const cameraSamples = defaults?.camera_samples ?? settings?.camera_samples ?? {};
    const steps = Number(draft.steps);
    const cfg = Number(draft.cfg);
    const strength = Number(draft.strength);
    const height = Number(draft.height);
    const width = Number(draft.width);
    const scribbleScale = Number(draft.scribble_scale);
    const scribbleGuidanceStart = Number(draft.scribble_guidance_start);
    const scribbleGuidanceEnd = Number(draft.scribble_guidance_end);
    const poseScale = Number(draft.pose_scale);
    const poseGuidanceStart = Number(draft.pose_guidance_start);
    const poseGuidanceEnd = Number(draft.pose_guidance_end);
    const clipSkip = draft.clip_skip.trim() === ''
      ? null
      : Number(draft.clip_skip);
    const sampler = draft.sampler.trim().toLowerCase();
    const scheduler = draft.scheduler.trim().toLowerCase();
    const modelFilename = draft.model_filename.trim();

    if (!Number.isInteger(steps) || steps < 1) {
      set({ error: 'steps는 1 이상의 정수로 입력해 주세요.' });
      return;
    }
    if (!Number.isFinite(cfg) || cfg <= 0) {
      set({ error: 'cfg는 0보다 큰 숫자로 입력해 주세요.' });
      return;
    }
    if (!Number.isFinite(strength) || strength <= 0 || strength > 1) {
      set({ error: 'strength는 0보다 크고 1 이하인 숫자로 입력해 주세요.' });
      return;
    }
    if (!Number.isInteger(height) || height <= 0 || height % 8 !== 0) {
      set({ error: 'height는 8의 배수인 양의 정수로 입력해 주세요.' });
      return;
    }
    if (!Number.isInteger(width) || width <= 0 || width % 8 !== 0) {
      set({ error: 'width는 8의 배수인 양의 정수로 입력해 주세요.' });
      return;
    }
    if (!Number.isFinite(scribbleScale) || scribbleScale < 0 || scribbleScale > 2) {
      set({ error: 'Scribble scale은 0 이상 2 이하인 숫자로 입력해 주세요.' });
      return;
    }
    if (!Number.isFinite(scribbleGuidanceStart) || scribbleGuidanceStart < 0 || scribbleGuidanceStart > 1) {
      set({ error: 'Scribble start는 0 이상 1 이하인 숫자로 입력해 주세요.' });
      return;
    }
    if (!Number.isFinite(scribbleGuidanceEnd) || scribbleGuidanceEnd < 0 || scribbleGuidanceEnd > 1) {
      set({ error: 'Scribble end는 0 이상 1 이하인 숫자로 입력해 주세요.' });
      return;
    }
    if (scribbleGuidanceEnd < scribbleGuidanceStart) {
      set({ error: 'Scribble end는 start 이상이어야 합니다.' });
      return;
    }
    if (!Number.isFinite(poseScale) || poseScale < 0 || poseScale > 2) {
      set({ error: 'Pose scale은 0 이상 2 이하인 숫자로 입력해 주세요.' });
      return;
    }
    if (!Number.isFinite(poseGuidanceStart) || poseGuidanceStart < 0 || poseGuidanceStart > 1) {
      set({ error: 'Pose start는 0 이상 1 이하인 숫자로 입력해 주세요.' });
      return;
    }
    if (!Number.isFinite(poseGuidanceEnd) || poseGuidanceEnd < 0 || poseGuidanceEnd > 1) {
      set({ error: 'Pose end는 0 이상 1 이하인 숫자로 입력해 주세요.' });
      return;
    }
    if (poseGuidanceEnd < poseGuidanceStart) {
      set({ error: 'Pose end는 start 이상이어야 합니다.' });
      return;
    }
    if (clipSkip !== null && (!Number.isInteger(clipSkip) || clipSkip < 1)) {
      set({ error: 'clip skip은 비우거나 1 이상의 정수로 입력해 주세요.' });
      return;
    }
    if (!IMAGE_SAMPLER_OPTIONS.includes(sampler as (typeof IMAGE_SAMPLER_OPTIONS)[number])) {
      set({ error: '지원하지 않는 sampler입니다.' });
      return;
    }
    if (!IMAGE_SCHEDULER_OPTIONS.includes(scheduler as (typeof IMAGE_SCHEDULER_OPTIONS)[number])) {
      set({ error: '지원하지 않는 scheduler입니다.' });
      return;
    }
    if (!imageModelFilenameOptions.includes(modelFilename)) {
      set({ error: 'Unsupported model file.' });
      return;
    }

    const nextImageSettings: ImageGenerationSettings = {
      model_filename: modelFilename,
      model_filenames: imageModelFilenameOptions,
      available_gpu_ids: defaults?.available_gpu_ids ?? settings?.available_gpu_ids ?? [],
      camera_samples: cameraSamples,
      prompt_default_positive: draft.prompt_default_positive.trim(),
      prompt_default_negative: draft.prompt_default_negative.trim(),
      steps,
      cfg,
      strength,
      sampler,
      scheduler,
      clip_skip: clipSkip,
      height,
      width,
      scribble_scale: scribbleScale,
      scribble_guidance_start: scribbleGuidanceStart,
      scribble_guidance_end: scribbleGuidanceEnd,
      pose_scale: poseScale,
      pose_guidance_start: poseGuidanceStart,
      pose_guidance_end: poseGuidanceEnd,
    };

    persistImageSettings(nextImageSettings);
    set({
      settings: nextImageSettings,
      draft: imageSettingsToDraft(nextImageSettings),
      error: null,
      isOpen: false,
    });
  },
  updateSettings: (settings) => {
    persistImageSettings(settings);
    set({
      settings,
      draft: imageSettingsToDraft(settings),
      error: null,
    });
  },
}));
