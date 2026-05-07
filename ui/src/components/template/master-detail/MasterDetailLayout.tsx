import { useEffect, useState } from 'react';
import type { MasterDetailLayoutProps } from './types';

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

const shellClass =
  'rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm';
const solidShellClass =
  'rounded-lg border border-[var(--app-border)] bg-white shadow-sm';
const mobileFlatShellClass = '-mx-2 bg-[var(--app-panel)] px-2';

export function MasterDetailLayout({
  list,
  detail,
  emptyDetail,
  isDetailOpen,
  onDetailClose,
  detailTitle,
}: MasterDetailLayoutProps) {
  const viewportMode = useViewportMode();
  const isDesktop = viewportMode === 'desktop';
  const isTablet = viewportMode === 'tablet';
  const rootClassName = isDesktop
    ? 'grid items-start gap-2 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(24rem,1.1fr)]'
    : 'relative';
  const listClassName = isDesktop || isTablet ? shellClass : mobileFlatShellClass;
  const detailClassName = isDesktop
    ? shellClass
    : [
        isTablet ? shellClass : solidShellClass,
        isDetailOpen ? 'fixed z-40 overflow-y-auto' : 'hidden',
        isTablet
          ? 'top-0 right-0 bottom-0 w-[min(42rem,94vw)] rounded-none rounded-l-lg border-y-0 border-r-0'
          : 'inset-0 rounded-none border-0',
      ].join(' ');

  useEffect(() => {
    if (isDesktop || !isDetailOpen) {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isDesktop, isDetailOpen]);

  return (
    <div className={rootClassName}>
      <section className={listClassName}>{list}</section>

      <section className={detailClassName}>
        {isDetailOpen ? (
          <div className="space-y-3 p-3 lg:p-4">
            <DetailHeader title={detailTitle} onClose={onDetailClose} />
            {detail}
          </div>
        ) : isDesktop ? (
          emptyDetail
        ) : null}
      </section>

      {isTablet && isDetailOpen ? (
        <button
          type="button"
          aria-label="편집 패널 닫기"
          className="modal-backdrop fixed inset-0 z-30 bg-slate-950/22 backdrop-blur-[1px]"
          onClick={onDetailClose}
        />
      ) : null}
    </div>
  );
}

function DetailHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] pb-3">
      <div className="min-w-0">
        <h2 className="mt-1 truncate text-sm font-semibold text-[var(--app-text)] md:text-base xl:text-lg">
          {title}
        </h2>
      </div>

      <button
        type="button"
        className="inline-flex h-10 min-w-16 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 transition"
        onClick={onClose}
      >
        닫기
      </button>
    </div>
  );
}

function useViewportMode() {
  const [viewportMode, setViewportMode] = useState<ViewportMode>(() =>
    getViewportMode()
  );

  useEffect(() => {
    const tabletQuery = window.matchMedia('(min-width: 768px)');
    const desktopQuery = window.matchMedia('(min-width: 1280px)');

    const syncViewport = () => {
      if (desktopQuery.matches) {
        setViewportMode('desktop');
        return;
      }

      if (tabletQuery.matches) {
        setViewportMode('tablet');
        return;
      }

      setViewportMode('mobile');
    };

    syncViewport();
    tabletQuery.addEventListener('change', syncViewport);
    desktopQuery.addEventListener('change', syncViewport);

    return () => {
      tabletQuery.removeEventListener('change', syncViewport);
      desktopQuery.removeEventListener('change', syncViewport);
    };
  }, []);

  return viewportMode;
}

function getViewportMode(): ViewportMode {
  if (window.matchMedia('(min-width: 1280px)').matches) {
    return 'desktop';
  }

  if (window.matchMedia('(min-width: 768px)').matches) {
    return 'tablet';
  }

  return 'mobile';
}
