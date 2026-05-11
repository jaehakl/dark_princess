import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  choosePlayOption,
  getPlaySnapshot,
  selectPlayTarget,
  type PlaySnapshot,
} from '../../api/api';
import type { LayoutOutletContext } from '../../app/layout';
import { OPTION_COLUMNS, STATUS_COLUMNS } from './columns';
import { InlineEditor } from './InlineEditor';
import { RowEditModal } from './RowEditModal';
import { SceneEditModal } from './SceneEditModal';
import { ScenePlayPanel } from './ScenePlayPanel';
import { StatusStart } from './StatusStart';
import { SceneHistoryPanel, TargetStatusPanel } from './StatusPanels';
import { TargetEditModal } from './TargetEditModal';
import type { PlayEditTab } from './types';

export function PlayEditPage() {
  const { setPageChrome, setQuickAddAction } =
    useOutletContext<LayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusId = Number(searchParams.get('status_id'));
  const resolvedStatusId = Number.isSafeInteger(statusId) && statusId > 0 ? statusId : null;
  const [snapshot, setSnapshot] = useState<PlaySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PlayEditTab>('status');
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [sceneModalMode, setSceneModalMode] = useState<'new' | 'edit' | null>(null);
  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [newOptionKey, setNewOptionKey] = useState('option_new');

  const refresh = useCallback(async () => {
    if (resolvedStatusId === null) {
      setSnapshot(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setSnapshot(await getPlaySnapshot(resolvedStatusId));
    } catch (caughtError) {
      setSnapshot(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : '플레이 정보를 불러오지 못했습니다.'
      );
    } finally {
      setLoading(false);
    }
  }, [resolvedStatusId]);

  useEffect(() => {
    setPageChrome({
      breadcrumbSuffix: 'Play+Edit',
      pageTitleSuffix: 'Play+Edit',
    });
    setQuickAddAction(null);

    return () => {
      setPageChrome(null);
      setQuickAddAction(null);
    };
  }, [setPageChrome, setQuickAddAction]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (resolvedStatusId === null) {
    return (
      <StatusStart
        onStatusSelected={(nextStatusId) => {
          const nextSearchParams = new URLSearchParams(searchParams);
          nextSearchParams.set('status_id', String(nextStatusId));
          setSearchParams(nextSearchParams);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-2 shadow-sm">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition"
          onClick={() => setTargetModalOpen(true)}
        >
          방문처 추가
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition"
          onClick={() => setSceneModalMode('new')}
        >
          새 장면 추가
        </button>
        <button
          type="button"
          disabled={!snapshot?.scene}
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => setSceneModalMode('edit')}
        >
          현재 장면 편집
        </button>
        <button
          type="button"
          disabled={!snapshot?.scene}
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => {
            setNewOptionKey(`option_${Date.now()}`);
            setOptionModalOpen(true);
          }}
        >
          선택지 추가
        </button>
        <button
          type="button"
          className="ml-auto inline-flex h-10 items-center justify-center rounded-md px-3 transition"
          onClick={() => void refresh()}
        >
          새로고침
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.85fr)]">
        <section className="min-h-[32rem] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm">
          <ScenePlayPanel
            snapshot={snapshot}
            loading={loading}
            busy={busy}
            onSelectTarget={async (targetStatusId) => {
              setBusy(true);
              setError(null);
              try {
                setSnapshot(await selectPlayTarget(resolvedStatusId, targetStatusId));
              } catch (caughtError) {
                setError(
                  caughtError instanceof Error
                    ? caughtError.message
                    : '방문처를 선택하지 못했습니다.'
                );
              } finally {
                setBusy(false);
              }
            }}
            onChooseOption={async (optionId) => {
              const historyId = snapshot?.scene_history?.id;
              if (typeof historyId !== 'number') {
                return;
              }

              setBusy(true);
              setError(null);
              try {
                setSnapshot(await choosePlayOption(resolvedStatusId, historyId, optionId));
              } catch (caughtError) {
                setError(
                  caughtError instanceof Error
                    ? caughtError.message
                    : '선택지를 적용하지 못했습니다.'
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </section>

        <section className="min-h-[32rem] rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm">
          <div className="flex border-b border-[var(--app-border)]">
            {[
              ['status', 'Status'],
              ['target', 'TargetStatus'],
              ['history', 'SceneHistory'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={[
                  'h-11 flex-1 border-b-2 px-3 transition',
                  activeTab === key
                    ? 'border-[var(--app-accent)] text-[var(--app-accent)]'
                    : 'border-transparent text-[var(--app-muted)]',
                ].join(' ')}
                onClick={() => setActiveTab(key as PlayEditTab)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-3">
            {activeTab === 'status' ? (
              <InlineEditor
                tableName="Status"
                row={snapshot?.status ?? null}
                columns={STATUS_COLUMNS}
                emptyText="Status를 불러오는 중입니다."
                onChanged={refresh}
              />
            ) : activeTab === 'target' ? (
              <TargetStatusPanel
                statusId={resolvedStatusId}
                snapshot={snapshot}
                onChanged={refresh}
              />
            ) : (
              <SceneHistoryPanel statusId={resolvedStatusId} onChanged={refresh} />
            )}
          </div>
        </section>
      </div>

      {targetModalOpen ? (
        <TargetEditModal
          statusId={resolvedStatusId}
          snapshot={snapshot}
          onClose={() => setTargetModalOpen(false)}
          onChanged={async () => {
            await refresh();
          }}
        />
      ) : null}

      {sceneModalMode ? (
        <SceneEditModal
          mode={sceneModalMode}
          snapshot={snapshot}
          onClose={() => setSceneModalMode(null)}
          onChanged={async () => {
            await refresh();
            setSceneModalMode(null);
          }}
        />
      ) : null}

      {optionModalOpen && snapshot?.scene ? (
        <RowEditModal
          title="선택지 편집"
          tableName="SceneOption"
          columns={OPTION_COLUMNS}
          listFilter={{ scene_id: [snapshot.scene.id, snapshot.scene.id] }}
          newRow={{
            scene_id: snapshot.scene.id,
            option_key: newOptionKey,
            label: '새 선택지',
            sort_order: 0,
            is_active: true,
          }}
          onClose={() => setOptionModalOpen(false)}
          onSaved={async () => {
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}
