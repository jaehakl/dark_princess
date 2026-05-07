import { useEffect, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useMatches,
  useNavigate,
} from 'react-router-dom';
import {
  navigationSections,
  type AppNavigationItem,
  type AppNavigationSection,
} from './navigation';
import {
  CloseIcon,
  MenuIcon,
  PanelCollapseIcon,
  PanelExpandIcon,
  PlusIcon,
  SidebarMenuIcon,
} from './icons';
import type { UserData } from '../api/api';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

type QuickAddAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type PageChrome = {
  breadcrumbSuffix?: string;
  pageTitleSuffix?: string;
};

export type LayoutOutletContext = {
  setQuickAddAction: (action: QuickAddAction | null) => void;
  setPageChrome: (chrome: PageChrome | null) => void;
};

type RouteHandle = {
  breadcrumb?: string;
  pageTitle?: string;
};

type SidebarProps = {
  collapsed: boolean;
  mobile?: boolean;
  onCollapseToggle?: () => void;
  onClose?: () => void;
};

type TopBarProps = {
  breadcrumbs: string[];
  currentPageTitle: string;
  quickAddAction: QuickAddAction | null;
  onMobileMenuClick: () => void;
};

export function AppLayout() {
  const location = useLocation();
  const matches = useMatches();
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const isMobileSidebarOpen = useUiStore((state) => state.isMobileSidebarOpen);
  const toggleSidebarOpen = useUiStore((state) => state.toggleSidebarOpen);
  const setMobileSidebarOpen = useUiStore(
    (state) => state.setMobileSidebarOpen
  );
  const [quickAddAction, setQuickAddAction] = useState<QuickAddAction | null>(
    null
  );
  const [pageChrome, setPageChrome] = useState<PageChrome | null>(null);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname, location.search, setMobileSidebarOpen]);

  useEffect(() => {
    const desktopMediaQuery = window.matchMedia('(min-width: 1024px)');

    if (desktopMediaQuery.matches) {
      setMobileSidebarOpen(false);
    }

    const handleDesktopChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileSidebarOpen(false);
      }
    };

    desktopMediaQuery.addEventListener('change', handleDesktopChange);

    return () => {
      desktopMediaQuery.removeEventListener('change', handleDesktopChange);
    };
  }, [setMobileSidebarOpen]);

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
    breadcrumbs.push(currentPageTitle);
  }

  if (pageChrome?.breadcrumbSuffix) {
    breadcrumbs = [...breadcrumbs, pageChrome.breadcrumbSuffix];
  }

  if (pageChrome?.pageTitleSuffix) {
    currentPageTitle = `${currentPageTitle} / ${pageChrome.pageTitleSuffix}`;
  }

  return (
    <div className="h-screen overflow-hidden bg-[var(--app-canvas)] text-[var(--app-text)]">
      <div className="flex h-screen">
        <div className="sticky top-0 z-30 hidden h-screen self-start overflow-visible lg:block">
          <Sidebar
            collapsed={isSidebarCollapsed}
            onCollapseToggle={toggleSidebarOpen}
          />
        </div>

        <div className="relative flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
          <TopBar
            breadcrumbs={breadcrumbs}
            currentPageTitle={currentPageTitle}
            quickAddAction={quickAddAction}
            onMobileMenuClick={() => setMobileSidebarOpen(true)}
          />

          <main className="flex-1 overflow-x-hidden bg-[var(--app-panel)] px-2 py-2 md:bg-transparent md:px-3 md:py-3 lg:px-4 lg:py-4">
            <div className="w-full">
              <Outlet context={{ setPageChrome, setQuickAddAction }} />
            </div>
          </main>
        </div>
      </div>

      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="사이드바 닫기"
            className="modal-backdrop absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative h-full w-[18.75rem] max-w-[86vw] shadow-[var(--app-shadow)]">
            <Sidebar
              collapsed={false}
              mobile
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Sidebar({
  collapsed,
  mobile = false,
  onCollapseToggle,
  onClose,
}: SidebarProps) {
  const user = useAuthStore((state) => state.user);
  const toggleLabel = mobile
    ? '사이드바 닫기'
    : collapsed
      ? '사이드바 펼치기'
      : '사이드바 접기';

  return (
    <aside
      className={[
        'relative z-10 flex h-full flex-col overflow-visible border-r border-[var(--app-border)] bg-[var(--app-sidebar)]',
        mobile ? 'w-full' : collapsed ? 'w-[5.5rem]' : 'w-72',
        'transition-[width] duration-200 ease-out',
      ].join(' ')}
    >
      <div className="border-b border-[var(--app-border)] px-3 py-4">
        <div className="flex items-start gap-3 px-3">
          <button
            type="button"
            aria-label={toggleLabel}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition"
            onClick={mobile ? onClose : onCollapseToggle}
          >
            {mobile ? (
              <CloseIcon />
            ) : collapsed ? (
              <PanelExpandIcon />
            ) : (
              <PanelCollapseIcon />
            )}
          </button>

          {collapsed && !mobile ? null : (
            <div className="min-w-0 flex-1">
              <Link
                to="/"
                className="block min-w-0 rounded-md pt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
              >
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[var(--app-muted)]">
                  Dark Princess
                </p>
                <p className="truncate text-sm font-semibold text-[var(--app-text)]">
                  게임 데이터 관리
                </p>
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <nav className="space-y-5 overflow-visible">
          {navigationSections.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              collapsed={collapsed}
              mobile={mobile}
            />
          ))}
        </nav>
      </div>

      {user ? (
        <SidebarUserMenu user={user} collapsed={collapsed} mobile={mobile} />
      ) : null}
    </aside>
  );
}

function SidebarUserMenu({
  user,
  collapsed,
  mobile,
}: {
  user: UserData;
  collapsed: boolean;
  mobile: boolean;
}) {
  const logoutUser = useAuthStore((state) => state.logoutUser);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const displayName = user.display_name?.trim() || user.email || '사용자';
  const email = user.email ?? '';
  const initial = (displayName || email).trim().charAt(0).toUpperCase() || 'U';
  const compact = collapsed && !mobile;

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isMenuOpen]);

  const handleLogoutClick = () => {
    setIsLoggingOut(true);
    void logoutUser().catch((error) => {
      console.error('로그아웃 중 오류가 발생했습니다.', error);
    });
  };

  return (
    <div
      ref={menuRef}
      className="relative border-t border-[var(--app-border)] px-3 py-3"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        title={compact ? `${displayName}${email ? ` ${email}` : ''}` : undefined}
        className={[
          'group flex min-w-0 items-center rounded-md transition',
          compact ? 'mx-auto h-11 w-11 justify-center' : 'h-12 w-full gap-2 px-2',
        ].join(' ')}
        onClick={() => setIsMenuOpen((value) => !value)}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--app-border)] bg-[var(--app-accent-soft)]">
          {user.picture_url ? (
            <img
              src={user.picture_url}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
        </span>

        {compact ? null : (
          <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden text-left">
            <span className="truncate">
              {displayName}
            </span>
            {email ? (
              <span className="truncate">
                {email}
              </span>
            ) : null}
          </span>
        )}
      </button>

      {isMenuOpen ? (
        <div
          role="menu"
          className={[
            'absolute z-50 rounded-md border border-[var(--app-border)] bg-white p-1 shadow-[var(--app-shadow)]',
            compact
              ? 'bottom-3 left-full ml-2 w-40'
              : 'bottom-full left-3 right-3 mb-2',
          ].join(' ')}
        >
          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center rounded-md px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoggingOut}
            onClick={handleLogoutClick}
          >
            {isLoggingOut ? '로그아웃 중' : '로그아웃'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SidebarSection({
  section,
  collapsed,
  mobile,
}: {
  section: AppNavigationSection;
  collapsed: boolean;
  mobile: boolean;
}) {
  return (
    <div className="space-y-3">
      <SectionLabel
        label={section.label}
        collapsed={collapsed}
        mobile={mobile}
      />
      <div className={collapsed && !mobile ? 'space-y-2' : 'space-y-2'}>
        {section.children.map((child) => (
          <SidebarItem
            key={child.to}
            item={child}
            collapsed={collapsed}
            mobile={mobile}
          />
        ))}
      </div>
    </div>
  );
}

function SectionLabel({
  label,
  collapsed,
  mobile,
}: {
  label: string;
  collapsed: boolean;
  mobile: boolean;
}) {
  if (collapsed && !mobile) {
    return (
      <div className="flex justify-center px-2 py-1" aria-hidden="true">
        <span className="block h-px w-8 rounded-full bg-[var(--app-border-strong)]" />
      </div>
    );
  }

  return (
    <div className="px-2">
      <p className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-[var(--app-muted)]">
        {label}
      </p>
    </div>
  );
}

function SidebarItem({
  item,
  collapsed,
  mobile,
}: {
  item: AppNavigationItem;
  collapsed: boolean;
  mobile: boolean;
}) {
  const baseClassName =
    'group flex rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-sidebar)]';

  if (collapsed && !mobile) {
    return (
      <NavLink
        to={item.to}
        end
        title={item.label}
        className={({ isActive }) =>
          [
            baseClassName,
            'items-center justify-center px-2 py-2.5',
            isActive
              ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)] shadow-sm'
              : 'border-transparent text-[var(--app-muted)] hover:border-[var(--app-border)] hover:bg-[var(--app-panel)] hover:text-[var(--app-text)]',
          ].join(' ')
        }
      >
        <span
          className={[
            'flex h-10 w-10 items-center justify-center rounded-xl border',
            'border-[var(--app-border)] bg-[var(--app-panel)] group-hover:border-[var(--app-border-strong)]',
          ].join(' ')}
        >
          <SidebarMenuIcon icon={item.icon} />
        </span>
      </NavLink>
    );
  }

  return (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) =>
        [
          baseClassName,
          'items-center gap-3 px-3 py-3',
          isActive
            ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)] shadow-sm'
            : 'border-transparent text-[var(--app-muted)] hover:border-[var(--app-border)] hover:bg-[var(--app-panel)] hover:text-[var(--app-text)]',
        ].join(' ')
      }
    >
      <span
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
          'border-[var(--app-border)] bg-[var(--app-panel)] group-hover:border-[var(--app-border-strong)]',
        ].join(' ')}
      >
        <SidebarMenuIcon icon={item.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-5">
          {item.label}
        </span>
      </span>
    </NavLink>
  );
}

function TopBar({
  breadcrumbs,
  currentPageTitle,
  quickAddAction,
  onMobileMenuClick,
}: TopBarProps) {
  const navigate = useNavigate();
  const mobileBreadcrumb = breadcrumbs[breadcrumbs.length - 2] ?? 'Dark Princess';
  const quickAddLabel = quickAddAction?.label ?? '새 항목 등록';
  const isQuickAddDisabled = !quickAddAction || quickAddAction.disabled === true;

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--app-border)] bg-[rgba(247,250,252,0.92)] backdrop-blur">
      <div className="hidden h-[4.75rem] items-center gap-6 px-6 py-4 lg:flex">
        <div className="min-w-0 flex-1">
          <nav aria-label="브레드크럼">
            <ol className="flex items-center gap-2 overflow-hidden text-sm">
              <li className="flex shrink-0 items-center gap-2">
                <Link
                  to="/"
                  aria-label="홈으로 이동"
                  className="truncate rounded-sm text-[var(--app-muted)] transition hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                >
                  Dark Princess
                </Link>
              </li>
              {breadcrumbs.map((item, index) => {
                const isCurrent = index === breadcrumbs.length - 1;

                return (
                  <li
                    key={`${item}-${index}`}
                    className="flex min-w-0 items-center gap-2"
                  >
                    <span className="text-[var(--app-border-strong)]">/</span>
                    <span
                      className={[
                        'truncate',
                        isCurrent
                          ? 'font-semibold text-[var(--app-text)]'
                          : 'text-[var(--app-muted)]',
                      ].join(' ')}
                    >
                      {item}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>

        {isQuickAddDisabled ? null : (
          <div className="flex items-center gap-3">
            <QuickAddButton action={quickAddAction} label={quickAddLabel} />
          </div>
        )}
      </div>

      <div className="flex h-[4.25rem] items-center gap-3 px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label="사이드바 열기"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
          onClick={onMobileMenuClick}
        >
          <MenuIcon />
        </button>

        <div className="min-w-0 flex-1" onClick={() => navigate('/')}>
          <p className="truncate text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--app-muted)]">
            {mobileBreadcrumb}
          </p>
          <p className="truncate text-base font-semibold text-[var(--app-text)]">
            {currentPageTitle}
          </p>
        </div>

        {isQuickAddDisabled ? null : (
          <QuickAddButton
            action={quickAddAction}
            compact
            label={quickAddLabel}
          />
        )}
      </div>
    </header>
  );
}

function QuickAddButton({
  action,
  compact = false,
  label,
}: {
  action: QuickAddAction | null;
  compact?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => action?.onClick()}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md px-4 transition',
        compact ? 'h-11 max-w-[9rem]' : 'h-11',
      ].join(' ')}
    >
      <PlusIcon />
      <span className="truncate">{label}</span>
    </button>
  );
}

