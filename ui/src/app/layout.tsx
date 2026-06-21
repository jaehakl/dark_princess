import { useEffect } from 'react';
import { Link, Outlet, useMatches } from 'react-router-dom';
import { dbTables } from '../api/api';
import { useImageSettingsStore, useCutStore } from '../api/store';
import type { GetListRequest } from '../api/type';
import { ImageSettingsDialog } from '../components/image-settings/ImageSettingsDialog';
import { CutExplorerModal } from '../components/CutExplorerModal';
import { Button, cx } from '../components/ui';

type RouteHandle = {
  breadcrumb?: string;
  pageTitle?: string;
};

const FETCH_CUT_BY_ID_REQUEST: GetListRequest = {
  offset: 0,
  limit: 1,
  selected_ids: [],
  search_text: null,
  text_filter: {},
  filter: {},
  sort: null,
};

export function AppLayout() {
  const matches = useMatches();
  const currentCut = useCutStore((state) => state.currentCut);
  const isCutExplorerOpen = useCutStore((state) => state.isCutExplorerOpen);
  const openCutExplorer = useCutStore((state) => state.openCutExplorer);
  const closeCutExplorer = useCutStore((state) => state.closeCutExplorer);
  const selectCut = useCutStore((state) => state.selectCut);
  const imageSettings = useImageSettingsStore((state) => state.settings);
  const imageSettingsDraft = useImageSettingsStore((state) => state.draft);
  const imageSettingsError = useImageSettingsStore((state) => state.error);
  const isImageSettingsOpen = useImageSettingsStore((state) => state.isOpen);
  const loadImageSettingsDefaults = useImageSettingsStore((state) => state.loadDefaults);
  const openImageSettings = useImageSettingsStore((state) => state.openDialog);
  const closeImageSettings = useImageSettingsStore((state) => state.closeDialog);
  const updateImageSettingsDraft = useImageSettingsStore((state) => state.updateDraft);
  const resetImageSettingsToDefaults = useImageSettingsStore((state) => state.resetDefaults);
  const applyImageSettings = useImageSettingsStore((state) => state.applyDraft);
  const imageModelFilenameOptions = imageSettings?.model_filenames ?? [];
  let breadcrumbs: string[] = [];
  let currentPageTitle = 'Dark Princess';

  useEffect(() => {
    void loadImageSettingsDefaults();
  }, [loadImageSettingsDefaults]);

  for (const match of matches) {
    const handle = match.handle as RouteHandle | undefined;

    if (handle?.breadcrumb) {
      breadcrumbs.push(handle.breadcrumb);
    }

    if (handle?.pageTitle) {
      currentPageTitle = handle.pageTitle;
    }
  }

  if (!breadcrumbs.length) {
    breadcrumbs = [currentPageTitle];
  }

  async function handleCutExplorerSelect(cutId: number) {
    try {
      const cutResponse = await dbTables.Cut.listRows({
        ...FETCH_CUT_BY_ID_REQUEST,
        selected_ids: [cutId],
      });
      const cut = cutResponse.items[0];
      if (cut) {
        selectCut(cut);
      }
    } catch (error) {
      console.error('Failed to select cut from explorer.', error);
    }
  }

  return (
    <div className="relative isolate min-h-screen text-[var(--app-text)] before:pointer-events-none before:fixed before:inset-x-0 before:bottom-0 before:-z-10 before:h-[36vh] before:bg-[linear-gradient(0deg,rgba(5,0,8,0.82),transparent)] before:content-['']">
      <header className="sticky top-0 z-20 border-b border-[rgba(255,216,228,0.24)] bg-[linear-gradient(90deg,rgba(20,7,30,0.82),rgba(58,18,54,0.5))] shadow-[0_16px_50px_rgba(7,0,12,0.38)] backdrop-blur-[18px]">
        <div className="flex h-16 items-center gap-5 overflow-x-auto px-4 md:px-6">
          <Link
            to="/"
            className="shrink-0 rounded-sm text-sm font-semibold tracking-[0.18em] text-[var(--app-text)] uppercase [text-shadow:0_0_18px_rgba(255,211,179,0.58)]"
          >
            Dark Princess
          </Link>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-2 overflow-hidden text-sm text-[var(--app-muted)]">
              {breadcrumbs.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="flex min-w-0 items-center gap-2"
                >
                  {index > 0 ? (
                    <span className="text-[var(--app-border-strong)]">/</span>
                  ) : null}
                  <span
                    className={cx(
                      'truncate',
                      index === breadcrumbs.length - 1
                        ? 'font-semibold text-[var(--app-text)]'
                        : '',
                    )}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
          <Link
            to="/scenes"
            className="shrink-0 rounded-[8px] border border-[rgba(255,216,176,0.54)] bg-[linear-gradient(135deg,rgba(255,231,180,0.22),rgba(232,90,135,0.15)),rgba(38,12,40,0.8)] px-3 py-2 text-xs font-extrabold text-[#fff5eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_12px_28px_rgba(10,0,18,0.28)] transition-[transform,filter,border-color] [text-shadow:0_1px_8px_rgba(0,0,0,0.5)] hover:-translate-y-px hover:border-[rgba(255,238,205,0.92)] hover:brightness-[1.06] sm:px-4"
          >
            Scene
          </Link>
          <Link
            to="/cut-wizard"
            className="shrink-0 rounded-[8px] border border-[rgba(255,216,176,0.54)] bg-[linear-gradient(135deg,rgba(255,231,180,0.24),rgba(232,90,135,0.16)),rgba(38,12,40,0.82)] px-3 py-2 text-xs font-extrabold text-[#fff5eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(10,0,18,0.3)] transition-[transform,filter,border-color] [text-shadow:0_1px_8px_rgba(0,0,0,0.5)] hover:-translate-y-px hover:border-[rgba(255,238,205,0.92)] hover:brightness-[1.06] sm:px-4"
          >
            Cut Wizard
          </Link>
          <Link
            to="/image-manager"
            className="shrink-0 rounded-[8px] border border-[rgba(255,216,176,0.54)] bg-[linear-gradient(135deg,rgba(255,231,180,0.2),rgba(232,90,135,0.14)),rgba(38,12,40,0.78)] px-3 py-2 text-xs font-extrabold text-[#fff5eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_12px_28px_rgba(10,0,18,0.26)] transition-[transform,filter,border-color] [text-shadow:0_1px_8px_rgba(0,0,0,0.5)] hover:-translate-y-px hover:border-[rgba(255,238,205,0.92)] hover:brightness-[1.06] sm:px-4"
          >
            Image 관리
          </Link>
          <Button
            className="shrink-0 px-3 py-2 text-xs sm:px-4"
            disabled={!imageSettings}
            onClick={openImageSettings}
          >
            이미지 설정
          </Button>
          <Button
            className="shrink-0 px-3 py-2 text-xs sm:px-4"
            onClick={openCutExplorer}
          >
            Cut 탐색
          </Button>
          <p className="hidden shrink-0 text-sm font-semibold text-[var(--app-muted)] md:block">
            {currentPageTitle}
          </p>
        </div>
      </header>

      <main className="mx-auto w-[min(1480px,100%)] p-[18px]">
        <Outlet />
      </main>

      {isCutExplorerOpen ? (
        <CutExplorerModal
          currentCutId={currentCut?.id ?? null}
          onClose={closeCutExplorer}
          onSelect={(cutId) => void handleCutExplorerSelect(cutId)}
        />
      ) : null}

      {isImageSettingsOpen && imageSettingsDraft ? (
        <ImageSettingsDialog
          modalLayout={false}
          imageSettingsDraft={imageSettingsDraft}
          imageModelFilenameOptions={imageModelFilenameOptions}
          imageSettingsError={imageSettingsError}
          onUpdateDraft={updateImageSettingsDraft}
          onResetDefaults={resetImageSettingsToDefaults}
          onApply={applyImageSettings}
          onClose={closeImageSettings}
        />
      ) : null}
    </div>
  );
}
