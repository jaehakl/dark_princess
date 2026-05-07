import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetailMode } from './types';

type UseMasterDetailStateOptions<TId extends string> = {
  initialMode?: DetailMode;
  initialSelectedId?: TId | null;
};

export function useMasterDetailState<TId extends string = string>(
  options: UseMasterDetailStateOptions<TId> = {}
) {
  const initialSelectedId = options.initialSelectedId ?? null;
  const initialMode =
    initialSelectedId !== null ? 'view' : options.initialMode ?? 'view';
  const [selectedId, setSelectedId] = useState<TId | null>(initialSelectedId);
  const [mode, setMode] = useState<DetailMode>(initialMode);
  const [isDetailOpen, setIsDetailOpen] = useState(
    initialMode === 'create' || initialSelectedId !== null
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    window.matchMedia('(max-width: 767px)').matches
  );
  const mobileHistoryActiveRef = useRef(false);
  const closeByBackRef = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');

    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (!isMobileViewport || !isDetailOpen || mobileHistoryActiveRef.current) {
      return;
    }

    window.history.pushState({ __appMasterDetail: true }, '');
    mobileHistoryActiveRef.current = true;
  }, [isDetailOpen, isMobileViewport]);

  useEffect(() => {
    const handlePopState = () => {
      if (!mobileHistoryActiveRef.current && !closeByBackRef.current) {
        return;
      }

      mobileHistoryActiveRef.current = false;
      closeByBackRef.current = false;
      setIsDetailOpen(false);
      setMode('view');
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const openDetailById = useCallback((id: TId) => {
    setSelectedId(id);
    setMode('view');
    setIsDetailOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    setSelectedId(null);
    setMode('create');
    setIsDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    if (isMobileViewport && mobileHistoryActiveRef.current) {
      closeByBackRef.current = true;
      window.history.back();
      return;
    }

    setIsDetailOpen(false);
    setMode('view');
  }, [isMobileViewport]);

  return {
    selectedId,
    mode,
    isDetailOpen,
    openDetailById,
    openCreate,
    closeDetail,
  };
}
