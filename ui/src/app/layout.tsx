import { Link, Outlet, useMatches } from 'react-router-dom';
import { dbTables } from '../api/api';
import { useSceneStore } from '../api/store';
import type { GetListRequest } from '../api/type';
import { SceneExplorerModal } from '../components/SceneExplorerModal';
import { Button, cx } from '../components/ui';

type RouteHandle = {
  breadcrumb?: string;
  pageTitle?: string;
};

const FETCH_SCENE_BY_ID_REQUEST: GetListRequest = {
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
  const currentScene = useSceneStore((state) => state.currentScene);
  const isSceneExplorerOpen = useSceneStore((state) => state.isSceneExplorerOpen);
  const openSceneExplorer = useSceneStore((state) => state.openSceneExplorer);
  const closeSceneExplorer = useSceneStore((state) => state.closeSceneExplorer);
  const selectScene = useSceneStore((state) => state.selectScene);
  let breadcrumbs: string[] = [];
  let currentPageTitle = 'Dark Princess';

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

  async function handleSceneExplorerSelect(sceneId: number) {
    try {
      const sceneResponse = await dbTables.Scene.listRows({
        ...FETCH_SCENE_BY_ID_REQUEST,
        selected_ids: [sceneId],
      });
      const scene = sceneResponse.items[0];
      if (scene) {
        selectScene(scene);
      }
    } catch (error) {
      console.error('Failed to select scene from explorer.', error);
    }
  }

  return (
    <div className="relative isolate min-h-screen text-[var(--app-text)] before:pointer-events-none before:fixed before:inset-x-0 before:bottom-0 before:-z-10 before:h-[36vh] before:bg-[linear-gradient(0deg,rgba(5,0,8,0.82),transparent)] before:content-['']">
      <header className="sticky top-0 z-20 border-b border-[rgba(255,216,228,0.24)] bg-[linear-gradient(90deg,rgba(20,7,30,0.82),rgba(58,18,54,0.5))] shadow-[0_16px_50px_rgba(7,0,12,0.38)] backdrop-blur-[18px]">
        <div className="flex h-16 items-center gap-5 px-4 md:px-6">
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
            to="/scene-wizard"
            className="shrink-0 rounded-[8px] border border-[rgba(255,216,176,0.54)] bg-[linear-gradient(135deg,rgba(255,231,180,0.24),rgba(232,90,135,0.16)),rgba(38,12,40,0.82)] px-3 py-2 text-xs font-extrabold text-[#fff5eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(10,0,18,0.3)] transition-[transform,filter,border-color] [text-shadow:0_1px_8px_rgba(0,0,0,0.5)] hover:-translate-y-px hover:border-[rgba(255,238,205,0.92)] hover:brightness-[1.06] sm:px-4"
          >
            Scene Wizard
          </Link>
          <Button
            className="shrink-0 px-3 py-2 text-xs sm:px-4"
            onClick={openSceneExplorer}
          >
            Scene 탐색
          </Button>
          <p className="hidden shrink-0 text-sm font-semibold text-[var(--app-muted)] md:block">
            {currentPageTitle}
          </p>
        </div>
      </header>

      <main className="mx-auto w-[min(1480px,100%)] p-[18px]">
        <Outlet />
      </main>

      {isSceneExplorerOpen ? (
        <SceneExplorerModal
          currentSceneId={currentScene?.id ?? null}
          onClose={closeSceneExplorer}
          onSelect={(sceneId) => void handleSceneExplorerSelect(sceneId)}
        />
      ) : null}
    </div>
  );
}
