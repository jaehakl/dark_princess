import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { LayoutOutletContext } from '../../app/layout';
import { PlayEngineProvider, usePlayEngine } from '../../engine';
import { openFocusedWindow } from '../../utils/openFocusedWindow';
import { STATUS_COLUMNS } from './columns';
import { InlineEditor } from './InlineEditor';
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

  useEffect(() => {
    setPageChrome(null);
    setQuickAddAction(null);

    return () => {
      setPageChrome(null);
      setQuickAddAction(null);
    };
  }, [setPageChrome, setQuickAddAction]);

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
    <PlayEngineProvider statusId={resolvedStatusId}>
      <PlayEditWorkspace statusId={resolvedStatusId} />
    </PlayEngineProvider>
  );
}

function PlayEditWorkspace({ statusId }: { statusId: number }) {
  const {
    snapshot,
    loading,
    busy,
    error,
    refresh,
    selectTarget,
    chooseOption,
    advanceTurn,
  } = usePlayEngine();
  const [activeTab, setActiveTab] = useState<PlayEditTab>('status');
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const currentSceneId =
    typeof snapshot?.scene?.id === 'number' ? snapshot.scene.id : null;
  const currentTargetId =
    typeof snapshot?.target_status?.target_id === 'number'
      ? snapshot.target_status.target_id
      : null;

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
          onClick={() => {
            const nextSearchParams = new URLSearchParams();
            if (currentTargetId !== null) {
              nextSearchParams.set('target_id', String(currentTargetId));
            }
            openFocusedWindow(buildSceneEditorPath(nextSearchParams));
          }}
        >
          새 장면 추가
        </button>
        <button
          type="button"
          disabled={currentSceneId === null}
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => {
            if (currentSceneId !== null) {
              openFocusedWindow(`/scene-edit?scene_id=${encodeURIComponent(String(currentSceneId))}`);
            }
          }}
        >
          현재 장면 편집
        </button>
        <button
          type="button"
          disabled={currentSceneId === null}
          className="inline-flex h-10 items-center justify-center rounded-md px-3 transition disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => {
            if (currentSceneId !== null) {
              openFocusedWindow(`/scene-edit?scene_id=${encodeURIComponent(String(currentSceneId))}`);
            }
          }}
        >
          선택지 편집
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
              await selectTarget(targetStatusId);
            }}
            onChooseOption={async (optionId) => {
              const historyId = snapshot?.scene_history?.id;
              if (typeof historyId !== 'number') {
                return;
              }

              await chooseOption(historyId, optionId);
            }}
            onAdvanceTurn={async () => {
              const historyId = snapshot?.scene_history?.id;
              if (typeof historyId !== 'number') {
                return;
              }

              await advanceTurn(historyId);
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
                statusId={statusId}
                snapshot={snapshot}
                onChanged={refresh}
              />
            ) : (
              <SceneHistoryPanel statusId={statusId} onChanged={refresh} />
            )}
          </div>
        </section>
      </div>

      {targetModalOpen ? (
        <TargetEditModal
          statusId={statusId}
          snapshot={snapshot}
          onClose={() => setTargetModalOpen(false)}
          onChanged={async () => {
            await refresh();
          }}
        />
      ) : null}

    </div>
  );
}

function buildSceneEditorPath(searchParams: URLSearchParams) {
  const queryString = searchParams.toString();
  return queryString ? `/scene-edit?${queryString}` : '/scene-edit';
}
