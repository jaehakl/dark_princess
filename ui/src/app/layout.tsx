import { Link, Outlet, useMatches } from 'react-router-dom';
import { useSceneStore } from '../api/store';
import { SceneEditorModal } from './SceneEditorModal';
import { SceneExplorerModal } from './SceneExplorerModal';

type RouteHandle = {
  breadcrumb?: string;
  pageTitle?: string;
};

export function AppLayout() {
  const matches = useMatches();
  const editingScene = useSceneStore((state) => state.editingScene);
  const currentScene = useSceneStore((state) => state.currentScene);
  const isSceneEditorOpen = useSceneStore((state) => state.isSceneEditorOpen);
  const isSceneExplorerOpen = useSceneStore((state) => state.isSceneExplorerOpen);
  const openSceneEditor = useSceneStore((state) => state.openSceneEditor);
  const openSceneExplorer = useSceneStore((state) => state.openSceneExplorer);
  const closeSceneEditor = useSceneStore((state) => state.closeSceneEditor);
  const closeSceneExplorer = useSceneStore((state) => state.closeSceneExplorer);
  const handleSceneSaved = useSceneStore((state) => state.handleSceneSaved);
  const handleSceneDeleted = useSceneStore((state) => state.handleSceneDeleted);
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

  return (
    <div className="vn-shell text-[var(--app-text)]">
      <header className="vn-topbar">
        <div className="flex h-16 items-center gap-5 px-4 md:px-6">
          <Link
            to="/"
            className="vn-brand shrink-0 rounded-sm text-sm font-semibold text-[var(--app-text)]"
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
                    className={[
                      'truncate',
                      index === breadcrumbs.length - 1
                        ? 'font-semibold text-[var(--app-text)]'
                        : '',
                    ].join(' ')}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
          <button
            type="button"
            className="vn-button shrink-0 px-3 py-2 text-xs sm:px-4"
            onClick={openSceneExplorer}
          >
            Scene 탐색
          </button>
          <button
            type="button"
            className="vn-button shrink-0 px-3 py-2 text-xs sm:px-4"
            onClick={() => openSceneEditor()}
          >
            Scene 생성/편집
          </button>
          <p className="hidden shrink-0 text-sm font-semibold text-[var(--app-muted)] md:block">
            {currentPageTitle}
          </p>
        </div>
      </header>

      <main className="vn-main">
        <Outlet />
      </main>

      {isSceneEditorOpen ? (
        <SceneEditorModal
          scene={editingScene}
          onClose={closeSceneEditor}
          onSaved={handleSceneSaved}
          onDeleted={handleSceneDeleted}
        />
      ) : null}

      {isSceneExplorerOpen ? (
        <SceneExplorerModal
          currentScene={currentScene}
          onClose={closeSceneExplorer}
          onSelect={selectScene}
        />
      ) : null}
    </div>
  );
}
