import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { advanceTurn, chooseOption, selectTarget } from './actions';
import { getSnapshot } from './snapshot';
import type { PlaySnapshot } from './types';

type PlayEngineContextValue = {
  snapshot: PlaySnapshot | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectTarget: (targetStatusId: number) => Promise<void>;
  chooseOption: (sceneHistoryId: number, optionId: number) => Promise<void>;
  advanceTurn: (sceneHistoryId: number) => Promise<void>;
};

const PlayEngineContext = createContext<PlayEngineContextValue | null>(null);

export function PlayEngineProvider({
  statusId,
  children,
}: {
  statusId: number;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getSnapshot(statusId));
    } catch (caughtError) {
      setSnapshot(null);
      setError(errorMessage(caughtError, '플레이 정보를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [statusId]);

  const runAction = useCallback(
    async (action: () => Promise<PlaySnapshot>, fallbackMessage: string) => {
      setBusy(true);
      setError(null);
      try {
        setSnapshot(await action());
      } catch (caughtError) {
        setError(errorMessage(caughtError, fallbackMessage));
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const value = useMemo<PlayEngineContextValue>(
    () => ({
      snapshot,
      loading,
      busy,
      error,
      refresh,
      selectTarget: (targetStatusId: number) =>
        runAction(
          () => selectTarget(statusId, targetStatusId),
          '방문처를 선택하지 못했습니다.',
        ),
      chooseOption: (sceneHistoryId: number, optionId: number) =>
        runAction(
          () => chooseOption(statusId, sceneHistoryId, optionId),
          '선택지를 적용하지 못했습니다.',
        ),
      advanceTurn: (sceneHistoryId: number) =>
        runAction(
          () => advanceTurn(statusId, sceneHistoryId),
          '다음 턴으로 진행하지 못했습니다.',
        ),
    }),
    [busy, error, loading, refresh, runAction, snapshot, statusId],
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return <PlayEngineContext.Provider value={value}>{children}</PlayEngineContext.Provider>;
}

export function usePlayEngine() {
  const value = useContext(PlayEngineContext);
  if (!value) {
    throw new Error('usePlayEngine must be used within PlayEngineProvider');
  }
  return value;
}

function errorMessage(caughtError: unknown, fallback: string) {
  return caughtError instanceof Error ? caughtError.message : fallback;
}
